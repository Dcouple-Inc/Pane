import { existsSync } from 'fs';
import { stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { glob } from 'glob';
import chokidar from 'chokidar';
import { databaseService } from '../database';
import { UsageRepository } from './usageRepository';
import { UsageAggregator, resolveReportRange } from './usageAggregator';
import { isFileUnchanged, resolveStartOffset, scanJsonlFile } from './jsonlScanner';
import { getPricingSource } from './modelPricing';
import { OpenRouterPriceProvider } from './openRouterPriceProvider';
import { getAppDirectory } from '../../utils/appDirectory';
import {
  DEFAULT_USAGE_RANGE_DAYS,
  USAGE_PARSER_VERSION,
  USAGE_RETENTION_DAYS,
  type UsageIndexStatus,
  type UsageByPaneReport,
  type UsageProvider,
  type UsageRateLimitSample,
  type UsageReport,
  type UsageReportRequest,
  type UsageTotals,
} from '../../../../shared/types/usage';

interface TranscriptRoot {
  provider: UsageProvider;
  path: string;
}

interface UsageWatcher {
  on(event: 'add' | 'change', listener: (path: string) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  close(): Promise<void>;
}

interface PaneCostsReport {
  fromMs: number;
  toMs: number;
  pricingAsOf: string;
  byPane: UsageByPaneReport;
  totals: UsageTotals;
}

type UsageWatchFactory = (
  path: string,
  options: NonNullable<Parameters<typeof chokidar.watch>[1]>,
) => UsageWatcher;

/**
 * Transcript roots are watched one level deep, not six.
 *
 * chokidar 5 carries no fsevents dependency (`readdirp` is its only one), so on
 * every platform it registers one `fs.watch` handle per directory. The
 * transcripts this indexer needs are the `.jsonl` files sitting directly inside
 * each project directory — `~/.claude/projects/<project>/<session>.jsonl`.
 * Everything nested below that is per-session scratch (`<uuid>/`, and
 * `<uuid>/tool-results/`) that holds no transcript.
 *
 * At depth 6 the walk registers a handle for all of that scratch too. On the
 * machine that motivated this fix, 63 project directories expanded to 5,194
 * handles and exhausted the process handle table roughly ten seconds after
 * launch. The resulting EMFILE is not contained to this watcher: it starves
 * every descriptor the app opens afterwards (SQLite, node-pty, the daemon
 * socket), so the visible failure is a crash on the next interaction rather
 * than a fault reported here.
 *
 * Depth 1 reaches the same transcripts for the cost of the project directories
 * plus the transcript files themselves — measured on that machine at 2,437
 * handles against 4,632-and-climbing at depth 6, and it reaches `ready` where
 * depth 6 never does. That is a reduction, not a constant: a large enough
 * transcript corpus can still reach the ceiling, which is why the exhaustion
 * path below degrades instead of assuming this bound always holds.
 */
const TRANSCRIPT_WATCH_DEPTH = 1;

/** Handle-exhaustion codes that make native watching unrecoverable. */
const HANDLE_EXHAUSTION_CODES = new Set(['EMFILE', 'ENFILE', 'ENOSPC']);

export function createTranscriptWatchers(
  roots: readonly TranscriptRoot[],
  createWatcher: UsageWatchFactory,
  queueFile: (path: string, provider: UsageProvider) => void,
  onHandleExhaustion: (root: TranscriptRoot, error: Error) => void = () => {},
): UsageWatcher[] {
  return roots.map(root => {
    // Missing paths are intentional. Chokidar watches the nearest existing
    // parent and begins reporting once a CLI creates its transcript root.
    const watcher = createWatcher(root.path, {
      ignoreInitial: true,
      depth: TRANSCRIPT_WATCH_DEPTH,
      awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 300 },
    });

    const queue = (path: string) => {
      if (path.endsWith('.jsonl')) queueFile(path, root.provider);
    };
    watcher.on('add', queue);
    watcher.on('change', queue);

    // Storm guard FIRST, mirroring the gitFileWatcher fix for #309: while the
    // handle table is exhausted chokidar emits one error per failed directory
    // registration and keeps emitting until the fire-and-forget close() lands.
    // Unguarded, this handler wrote ~17,000 EMFILE lines in a single session
    // and kept the table pinned. Degrade once, then stay silent.
    let degraded = false;
    watcher.on('error', error => {
      // SAFETY: Node filesystem failures may carry the optional errno code.
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== undefined && HANDLE_EXHAUSTION_CODES.has(code)) {
        if (degraded) return;
        degraded = true;
        void watcher.close();
        onHandleExhaustion(root, error);
        return;
      }
      console.warn('[Usage] Watcher error:', error);
    });
    return watcher;
  });
}

/** Yield to the event loop every N files so a first scan never blocks the UI. */
const YIELD_EVERY_FILES = 25;
/** Coalesce watcher events — an active agent appends constantly. */
const WATCH_DEBOUNCE_MS = 3000;
/** Re-scan cadence once native watching has been given up. */
const USAGE_POLL_INTERVAL_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function transcriptRoots(): TranscriptRoot[] {
  const home = homedir();
  return [
    { provider: 'claude', path: join(home, '.claude', 'projects') },
    { provider: 'codex', path: join(home, '.codex', 'sessions') },
  ];
}

/**
 * Indexes agent CLI transcripts so the usage page can report tokens, cost and
 * rolling-window utilisation.
 *
 * Read-only by construction: it never writes to, creates or deletes anything
 * under `~/.claude` or `~/.codex`.
 *
 * Known limitation: only the Electron host's home directory is scanned. On
 * Windows with WSL-based projects the agents write inside the distro's home,
 * which this does not reach.
 */
class UsageManager {
  // Resolved on first use, not in the constructor: this module is imported at
  // load time and the database handle is only guaranteed after initialisation.
  private repositoryRef: UsageRepository | null = null;
  private aggregatorRef: UsageAggregator | null = null;
  private priceProvider: OpenRouterPriceProvider | null = null;
  private watchers: UsageWatcher[] = [];
  private pendingFiles = new Map<string, UsageProvider>();
  private debounceTimer: NodeJS.Timeout | undefined;
  private pollingTimer: NodeJS.Timeout | undefined;
  private watchMode: 'native' | 'polling' = 'native';
  private scanning = false;
  private started = false;

  private status: UsageIndexStatus = {
    lastScanStartedMs: null,
    lastScanFinishedMs: null,
    filesTracked: 0,
    eventsIndexed: 0,
    missingRoots: [],
    scanning: false,
    filesScanned: 0,
    filesTotal: 0,
    lastError: null,
  };

  private get repository(): UsageRepository {
    if (!this.repositoryRef) this.repositoryRef = new UsageRepository(databaseService.getDb());
    return this.repositoryRef;
  }

  private get aggregator(): UsageAggregator {
    if (!this.aggregatorRef) this.aggregatorRef = new UsageAggregator(databaseService.getDb());
    return this.aggregatorRef;
  }

  /** Call after `app.whenReady()` — never at module load. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.priceProvider = new OpenRouterPriceProvider(getAppDirectory());
    this.priceProvider.start();

    try {
      this.repository.pruneOlderThan(Date.now() - USAGE_RETENTION_DAYS * DAY_MS);
    } catch (error) {
      console.error('[Usage] Retention sweep failed:', error);
    }

    void this.runFullScan();
    this.startWatching();
  }

  stop(): void {
    this.started = false;
    this.priceProvider?.stop();
    this.priceProvider = null;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = undefined;
    this.watchMode = 'native';
    for (const watcher of this.watchers) void watcher.close();
    this.watchers = [];
  }

  getStatus(): UsageIndexStatus {
    return {
      ...this.status,
      filesTracked: this.safeCount(() => this.repository.countFiles()),
      eventsIndexed: this.safeCount(() => this.repository.countEvents()),
    };
  }

  /** Force a full re-scan; used by the page's refresh action. */
  async rescan(): Promise<UsageIndexStatus> {
    await this.runFullScan();
    return this.getStatus();
  }

  getReport(request?: UsageReportRequest): UsageReport {
    const nowMs = Date.now();
    const { fromMs, toMs, bucket } = resolveReportRange(request, nowMs, DEFAULT_USAGE_RANGE_DAYS);
    const providers = request?.providers;

    return {
      totals: this.aggregator.getTotals(fromMs, toMs, providers),
      series: this.aggregator.getSeries(fromMs, toMs, bucket, providers),
      byModel: this.aggregator.getByModel(fromMs, toMs, providers),
      byProject: this.aggregator.getByProject(fromMs, toMs, providers),
      byPane: this.aggregator.getByPane(fromMs, toMs, providers),
      rateLimits: this.safeRateLimits(nowMs, providers),
      index: this.getStatus(),
      pricingAsOf: getPricingSource(),
    };
  }

  getPaneCosts(request?: UsageReportRequest): PaneCostsReport {
    const { fromMs, toMs } = resolveReportRange(request, Date.now(), DEFAULT_USAGE_RANGE_DAYS);
    const providers = request?.providers;
    return {
      fromMs,
      toMs,
      pricingAsOf: getPricingSource(),
      byPane: this.aggregator.getByPane(fromMs, toMs, providers),
      totals: this.aggregator.getTotals(fromMs, toMs, providers),
    };
  }

  /** Quota state, narrowed to the providers the page is showing. */
  private safeRateLimits(nowMs: number, providers?: UsageProvider[]): UsageRateLimitSample[] {
    try {
      const samples = this.repository.getRateLimits(nowMs);
      if (!providers || providers.length === 0) return samples;
      return samples.filter(sample => providers.includes(sample.provider));
    } catch {
      return [];
    }
  }

  private safeCount(read: () => number): number {
    try {
      return read();
    } catch {
      return 0;
    }
  }

  private async runFullScan(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    this.status = { ...this.status, scanning: true, lastScanStartedMs: Date.now(), lastError: null, filesScanned: 0 };

    try {
      const roots = transcriptRoots();
      this.status.missingRoots = roots.filter(root => !existsSync(root.path)).map(root => root.path);

      const files: Array<{ path: string; provider: UsageProvider }> = [];
      for (const root of roots) {
        if (!existsSync(root.path)) continue;
        const matches = await glob('**/*.jsonl', { cwd: root.path, absolute: true, nodir: true });
        for (const path of matches) files.push({ path, provider: root.provider });
      }

      this.status.filesTotal = files.length;

      let processed = 0;
      for (const file of files) {
        await this.scanOne(file.path, file.provider);
        processed += 1;
        this.status.filesScanned = processed;
        if (processed % YIELD_EVERY_FILES === 0) {
          await new Promise<void>(resolve => setImmediate(resolve));
        }
      }
    } catch (error) {
      this.status.lastError = error instanceof Error ? error.message : String(error);
      console.error('[Usage] Scan failed:', error);
    } finally {
      this.scanning = false;
      this.status = { ...this.status, scanning: false, lastScanFinishedMs: Date.now() };
    }
  }

  /**
   * Index one transcript, resuming from its stored cursor. Files whose size
   * and mtime are unchanged are skipped without being opened, which is what
   * makes subsequent launches fast.
   */
  private async scanOne(path: string, provider: UsageProvider): Promise<void> {
    try {
      const stats = await stat(path);
      let recorded = this.repository.getFileCursor(path);

      // A parser fix must reach transcripts that were already indexed, so a
      // version mismatch discards this file's rows and re-reads it in full.
      if (recorded && recorded.parserVersion !== USAGE_PARSER_VERSION) {
        this.repository.forgetFile(path);
        recorded = null;
      }

      if (isFileUnchanged(recorded, stats)) return;

      const startOffset = resolveStartOffset(recorded, stats.size);
      // A file being re-read from the top states its own attribution again, and
      // a stored context would describe bytes that are no longer there — this is
      // the rotation and truncation case.
      const seedContext = startOffset > 0 ? recorded?.parseContext ?? null : null;
      const scanned = await scanJsonlFile(path, provider, startOffset, stats.mtimeMs, seedContext);

      this.repository.commitFile(
        {
          path,
          provider,
          sizeBytes: stats.size,
          mtimeMs: stats.mtimeMs,
          offsetBytes: scanned.nextOffsetBytes,
          lastScannedMs: Date.now(),
          parserVersion: USAGE_PARSER_VERSION,
          parseContext: scanned.context,
        },
        scanned.events,
        Date.now()
      );

      this.repository.recordRateLimits(scanned.rateLimits);
    } catch (error) {
      // A single unreadable transcript must not abort the pass.
      // SAFETY: Node filesystem failures may carry the optional errno code.
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') {
        this.repository.forgetFile(path);
        return;
      }
      console.warn(`[Usage] Skipped ${path}:`, error instanceof Error ? error.message : error);
    }
  }

  private startWatching(): void {
    this.watchers = createTranscriptWatchers(
      transcriptRoots(),
      (path, options) => chokidar.watch(path, options),
      (path, provider) => {
        this.pendingFiles.set(path, provider);
        this.scheduleFlush();
      },
      (root, error) => this.degradeToPolling(root, error),
    );
  }

  /**
   * Last-resort fallback when a transcript root cannot be watched natively.
   *
   * Depth 1 lowers the handle cost but does not bound it — it still scales with
   * the number of transcripts — so a large enough corpus, or pressure from
   * elsewhere in the process, can exhaust the table anyway. Usage indexing is a
   * reporting feature, not a critical path: it gives up its handles and re-reads
   * on a timer rather than compete for descriptors that terminals, the database
   * and the daemon socket need in order to keep the app alive.
   *
   * Degradation is process-lifetime: nothing here reclaims native watching,
   * because retrying is what produced the original storm. `stop()` resets it.
   */
  private degradeToPolling(root: TranscriptRoot, error: Error): void {
    console.warn(
      `[Usage] Handle exhaustion watching ${root.path} — falling back to a ` +
        `${USAGE_POLL_INTERVAL_MS / 60000}min polling scan:`,
      error.message,
    );
    this.status.lastError = `Live usage updates unavailable (${error.message}). Refreshing every ${USAGE_POLL_INTERVAL_MS / 60000}min.`;
    if (this.watchMode === 'polling') return;
    this.watchMode = 'polling';

    this.pollingTimer = setInterval(() => {
      void this.runFullScan();
    }, USAGE_POLL_INTERVAL_MS);
    this.pollingTimer.unref?.();
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const batch = [...this.pendingFiles.entries()];
      this.pendingFiles.clear();
      void (async () => {
        for (const [path, provider] of batch) {
          await this.scanOne(path, provider);
        }
      })();
    }, WATCH_DEBOUNCE_MS);
    this.debounceTimer.unref?.();
  }
}

export const usageManager = new UsageManager();
