import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { createTranscriptWatchers } from './usageManager';

class TestWatcher extends EventEmitter {
  closeCount = 0;
  async close(): Promise<void> {
    this.closeCount += 1;
  }
}

function errno(code: string): Error {
  return Object.assign(new Error(`${code}: too many open files, watch`), { code });
}

describe('createTranscriptWatchers', () => {
  it('watches roots before they exist and queues only JSONL files', () => {
    const createdPaths: string[] = [];
    const watchers: TestWatcher[] = [];
    const queueFile = vi.fn();

    createTranscriptWatchers(
      [
        { provider: 'claude', path: '/missing/.claude/projects' },
        { provider: 'codex', path: '/missing/.codex/sessions' },
      ],
      path => {
        createdPaths.push(path);
        const watcher = new TestWatcher();
        watchers.push(watcher);
        return watcher;
      },
      queueFile,
    );

    expect(createdPaths).toEqual([
      '/missing/.claude/projects',
      '/missing/.codex/sessions',
    ]);

    watchers[0].emit('add', '/missing/.claude/projects/session.jsonl');
    watchers[1].emit('change', '/missing/.codex/sessions/readme.txt');

    expect(queueFile).toHaveBeenCalledOnce();
    expect(queueFile).toHaveBeenCalledWith('/missing/.claude/projects/session.jsonl', 'claude');
  });
});

describe('createTranscriptWatchers handle budget', () => {
  it('watches one level deep so nested session scratch costs no handles', () => {
    let watchedDepth: number | undefined;

    createTranscriptWatchers(
      [{ provider: 'claude', path: '/home/.claude/projects' }],
      (_path, options) => {
        watchedDepth = options.depth;
        return new TestWatcher();
      },
      vi.fn(),
    );

    // depth 6 registered an fs.watch handle for every <project>/<uuid>/ and
    // <project>/<uuid>/tool-results/ directory, none of which hold transcripts.
    expect(watchedDepth).toBe(1);
  });

  it('degrades once on handle exhaustion and stays silent afterwards', async () => {
    const watchers: TestWatcher[] = [];
    const onHandleExhaustion = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    createTranscriptWatchers(
      [{ provider: 'claude', path: '/home/.claude/projects' }],
      () => {
        const watcher = new TestWatcher();
        watchers.push(watcher);
        return watcher;
      },
      vi.fn(),
      onHandleExhaustion,
    );

    // chokidar emits one error per failed directory registration and keeps
    // emitting until close() lands — the guard must collapse the storm.
    for (let i = 0; i < 500; i += 1) watchers[0].emit('error', errno('EMFILE'));

    expect(onHandleExhaustion).toHaveBeenCalledOnce();
    expect(watchers[0].closeCount).toBe(1);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('logs other watcher errors without giving up native watching', () => {
    const watchers: TestWatcher[] = [];
    const onHandleExhaustion = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    createTranscriptWatchers(
      [{ provider: 'claude', path: '/home/.claude/projects' }],
      () => {
        const watcher = new TestWatcher();
        watchers.push(watcher);
        return watcher;
      },
      vi.fn(),
      onHandleExhaustion,
    );

    watchers[0].emit('error', errno('EPERM'));

    expect(onHandleExhaustion).not.toHaveBeenCalled();
    expect(watchers[0].closeCount).toBe(0);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
