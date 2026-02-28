import { EventEmitter } from 'events';
import { execSync } from 'child_process';
import * as os from 'os';
import type { App, ProcessMetric } from 'electron';
import type {
  ElectronProcessInfo,
  ChildProcessInfo,
  SessionResourceInfo,
  ResourceSnapshot,
} from '../../../shared/types/resourceMonitor';

interface ProcessStats {
  name: string;
  cpuPercent: number;
  memoryMB: number;
}

interface WindowsBatchItem {
  Id: number;
  Name: string;
  CpuPercent: number;
  MemoryMB: number;
}

export class ResourceMonitorService extends EventEmitter {
  private app: App | null = null;
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private activeTimer: ReturnType<typeof setInterval> | null = null;
  private isActivePolling = false;

  initialize(app: App): void {
    this.app = app;
  }

  private getElectronMetrics(): ElectronProcessInfo[] {
    if (!this.app) return [];
    const metrics: ProcessMetric[] = this.app.getAppMetrics();
    if (!metrics || metrics.length === 0) return [];
    return metrics.map(m => ({
      pid: m.pid,
      type: m.type,
      label: m.type === 'Browser' ? 'Main' : m.type === 'Tab' ? 'Renderer' : m.type,
      cpuPercent: m.cpu.percentCPUUsage,
      memoryMB: Math.round((m.memory.workingSetSize / 1024) * 100) / 100, // KB → MB
    }));
  }

  private getChildPids(parentPid: number): number[] {
    try {
      if (os.platform() === 'win32') {
        const output = execSync(
          `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'ParentProcessId=${parentPid}' | Select-Object -ExpandProperty ProcessId"`,
          { encoding: 'utf8', timeout: 5000 }
        );
        return output.split('\n').map(l => parseInt(l.trim(), 10)).filter(n => !isNaN(n));
      } else if (os.platform() === 'darwin') {
        const output = execSync(`pgrep -P ${parentPid}`, { encoding: 'utf8', timeout: 5000 });
        return output.split('\n').map(l => parseInt(l.trim(), 10)).filter(n => !isNaN(n));
      } else {
        const output = execSync(`ps -o pid= --ppid ${parentPid}`, { encoding: 'utf8', timeout: 5000 });
        return output.split('\n').map(l => parseInt(l.trim(), 10)).filter(n => !isNaN(n));
      }
    } catch {
      return [];
    }
  }

  private getAllDescendantPids(parentPid: number): number[] {
    const children = this.getChildPids(parentPid);
    const all: number[] = [...children];
    for (const child of children) {
      all.push(...this.getAllDescendantPids(child));
    }
    return all;
  }

  private getUnixProcessStats(pid: number): ProcessStats {
    try {
      const output = execSync(`ps -o comm=,%cpu=,rss= -p ${pid}`, { encoding: 'utf8', timeout: 5000 });
      const line = output.trim();
      if (!line) return { name: 'unknown', cpuPercent: 0, memoryMB: 0 };
      const parts = line.split(/\s+/);
      const rss = parseInt(parts[parts.length - 1], 10) || 0;
      const cpu = parseFloat(parts[parts.length - 2]) || 0;
      const name = parts.slice(0, -2).join(' ') || 'unknown';
      return { name, cpuPercent: cpu, memoryMB: rss / 1024 };
    } catch {
      return { name: 'unknown', cpuPercent: 0, memoryMB: 0 };
    }
  }

  private getWindowsBatchStats(pids: number[]): Map<number, ProcessStats> {
    const result = new Map<number, ProcessStats>();
    if (pids.length === 0) return result;
    try {
      const pidList = pids.join(',');
      const psCmd = `Get-Process -Id @(${pidList}) -ErrorAction SilentlyContinue | ForEach-Object { $elapsed = ((Get-Date) - $_.StartTime).TotalSeconds; $cpuPct = if ($elapsed -gt 0) { ($_.CPU / $elapsed) * 100 } else { 0 }; [PSCustomObject]@{ Id=$_.Id; Name=$_.ProcessName; CpuPercent=[math]::Round($cpuPct,1); MemoryMB=[math]::Round($_.WorkingSet64/1MB,1) } } | ConvertTo-Json -Compress`;
      const output = execSync(
        `powershell -NoProfile -Command "${psCmd}"`,
        { encoding: 'utf8', timeout: 10000 }
      );
      const parsed: unknown = JSON.parse(output);
      const items: WindowsBatchItem[] = Array.isArray(parsed) ? parsed as WindowsBatchItem[] : [parsed as WindowsBatchItem];
      for (const item of items) {
        if (item && typeof item.Id === 'number') {
          result.set(item.Id, {
            name: item.Name || 'unknown',
            cpuPercent: item.CpuPercent || 0,
            memoryMB: item.MemoryMB || 0,
          });
        }
      }
    } catch {
      // PowerShell call failed — return empty results
    }
    return result;
  }

  private getSessionMetrics(): SessionResourceInfo[] {
    // Lazy imports to avoid circular dependency at module load time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { terminalPanelManager } = require('./terminalPanelManager') as { terminalPanelManager: { getSessionPids(): Map<string, number[]> } };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { sessionManager } = require('../index') as { sessionManager: { getSession(id: string): { name?: string; initial_prompt?: string } | undefined } | null };

    const sessionPids: Map<string, number[]> = terminalPanelManager.getSessionPids();
    const sessions: SessionResourceInfo[] = [];

    for (const [sessionId, ptyPids] of sessionPids) {
      const session = sessionManager?.getSession?.(sessionId);
      const sessionName = session?.name || session?.initial_prompt?.slice(0, 30) || sessionId;

      const allPids: number[] = [];
      for (const ptyPid of ptyPids) {
        allPids.push(ptyPid);
        allPids.push(...this.getAllDescendantPids(ptyPid));
      }

      let children: ChildProcessInfo[];
      if (os.platform() === 'win32') {
        const batchStats = this.getWindowsBatchStats(allPids);
        children = allPids
          .map(pid => {
            const stats = batchStats.get(pid) || { name: 'unknown', cpuPercent: 0, memoryMB: 0 };
            return { pid, ...stats };
          })
          .filter(c => c.cpuPercent > 0 || c.memoryMB > 0.1);
      } else {
        children = allPids
          .map(pid => {
            const stats = this.getUnixProcessStats(pid);
            return { pid, ...stats };
          })
          .filter(c => c.cpuPercent > 0 || c.memoryMB > 0.1);
      }

      const totalCpu = children.reduce((sum, c) => sum + c.cpuPercent, 0);
      const totalMem = children.reduce((sum, c) => sum + c.memoryMB, 0);

      sessions.push({
        sessionId,
        sessionName,
        totalCpuPercent: Math.round(totalCpu * 10) / 10,
        totalMemoryMB: Math.round(totalMem * 10) / 10,
        children,
      });
    }

    return sessions;
  }

  getSnapshot(): ResourceSnapshot {
    const electronProcesses = this.getElectronMetrics();
    const sessions = this.getSessionMetrics();

    const electronTotal = electronProcesses.reduce(
      (acc, p) => ({ cpu: acc.cpu + p.cpuPercent, mem: acc.mem + p.memoryMB }),
      { cpu: 0, mem: 0 }
    );
    const sessionTotal = sessions.reduce(
      (acc, s) => ({ cpu: acc.cpu + s.totalCpuPercent, mem: acc.mem + s.totalMemoryMB }),
      { cpu: 0, mem: 0 }
    );

    return {
      timestamp: Date.now(),
      totalCpuPercent: Math.round((electronTotal.cpu + sessionTotal.cpu) * 10) / 10,
      totalMemoryMB: Math.round((electronTotal.mem + sessionTotal.mem) * 10) / 10,
      electronProcesses,
      sessions,
    };
  }

  startIdlePolling(): void {
    this.stopAllPolling();
    const poll = (): void => {
      try {
        const snapshot = this.getSnapshot();
        this.emit('resource-update', snapshot);
      } catch (error) {
        console.error('[ResourceMonitor] Poll error:', error);
      }
    };
    poll();
    this.idleTimer = setInterval(poll, 30_000);
  }

  startActivePolling(): void {
    this.stopAllPolling();
    this.isActivePolling = true;
    const poll = (): void => {
      try {
        const snapshot = this.getSnapshot();
        this.emit('resource-update', snapshot);
      } catch (error) {
        console.error('[ResourceMonitor] Poll error:', error);
      }
    };
    poll();
    this.activeTimer = setInterval(poll, 2_000);
  }

  stopActivePolling(): void {
    if (this.isActivePolling) {
      this.isActivePolling = false;
      this.startIdlePolling();
    }
  }

  private stopAllPolling(): void {
    if (this.idleTimer) { clearInterval(this.idleTimer); this.idleTimer = null; }
    if (this.activeTimer) { clearInterval(this.activeTimer); this.activeTimer = null; }
  }

  stop(): void {
    this.stopAllPolling();
  }
}

export const resourceMonitorService = new ResourceMonitorService();
