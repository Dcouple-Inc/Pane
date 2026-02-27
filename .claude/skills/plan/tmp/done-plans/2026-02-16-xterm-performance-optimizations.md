## Goal

Adopt VSCode's xterm.js performance optimizations: WebGL GPU-accelerated rendering with automatic fallback, PTY-to-xterm flow control with backpressure, IPC output batching, reduced scrollback, resize throttling, and removal of unused addons. This makes foozol handle high-throughput output (4,000-6,700 scroll events/sec from Claude Code) without lag.

## Why

- Claude Code's React-based TUI produces extremely high scroll event rates that overwhelm DOM-based terminal rendering
- foozol currently uses only the default DOM renderer — the slowest option (5-45x slower than WebGL)
- No flow control means PTY output can overflow xterm.js's internal 50MB write buffer, causing data loss
- Every PTY data chunk fires a separate IPC message — thousands per second — overwhelming IPC
- 50,000-line scrollback per terminal consumes ~340MB each — unsustainable with multiple sessions
- No resize throttling causes excessive `fit()` calls during window resize
- Two installed addons (SearchAddon, WebLinksAddon) are never imported or used

## What

After implementation:
1. Terminals use WebGL2 renderer by default, with automatic fallback to DOM on failure/context loss
2. PTY output is batched (16ms / 4KB) before sending over IPC to renderer
3. PTY is flow-controlled with watermark-based backpressure (pause/resume)
4. Renderer batches ack messages back to main process (every 10KB)
5. Scrollback reduced from 50,000 to 10,000 lines (aligns frontend with existing backend `MAX_SCROLLBACK_LINES`)
6. ResizeObserver calls are throttled (100ms)
7. Unused addon dependencies removed from package.json

### Success Criteria

- [ ] `@xterm/addon-webgl` loaded successfully, visible in console log
- [ ] Context loss triggers automatic fallback to DOM renderer
- [ ] High-throughput output (e.g., `seq 1 100000`) doesn't freeze the UI
- [ ] Terminal resize doesn't cause excessive reflows
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes

## All Needed Context

### Documentation & References

```yaml
- url: https://xtermjs.org/docs/guides/flowcontrol/
  why: Flow control patterns with watermarks, write callbacks

- url: https://www.npmjs.com/package/@xterm/addon-webgl
  why: WebGL addon API, version compatibility with xterm 5.5.0

- file: frontend/src/components/panels/TerminalPanel.tsx
  why: Primary file to modify — terminal creation, output handling, resize

- file: main/src/services/terminalPanelManager.ts
  why: Backend PTY management — add flow control and output batching

- file: main/src/ipc/panels.ts
  why: IPC handler registration — add terminal:ack handler (all handlers use ipcMain.handle)

- file: frontend/src/utils/performanceUtils.ts
  why: Existing throttle utility to reuse for resize
```

### Current Codebase Tree (files to modify)

```
frontend/
  src/
    components/
      panels/
        TerminalPanel.tsx          # MODIFY: WebGL addon, resize throttle, write callback + ack batching
    utils/
      performanceUtils.ts          # READ: reuse existing throttle utility
  package.json                     # MODIFY: add webgl addon, remove unused addons

main/
  src/
    services/
      terminalPanelManager.ts      # MODIFY: add output batching + flow control
    ipc/
      panels.ts                    # MODIFY: add terminal:ack IPC handler
```

### Known Gotchas & Library Quirks

```typescript
// CRITICAL: WebGL addon MUST be loaded AFTER terminal.open(element)
// Loading before open() will throw because there's no canvas element yet
terminal.open(element);
terminal.loadAddon(new WebglAddon()); // Must be after open()

// CRITICAL: WebGL context loss can happen on system sleep/wake, OOM, GPU driver crash
// Must handle onContextLoss to fall back gracefully

// CRITICAL: node-pty pause/resume operates on the underlying OS pseudoterminal
// HIGH watermark should NOT exceed 500KB or keystroke responsiveness degrades

// CRITICAL: @lydell/node-pty (foozol's fork) has the same pause/resume API as node-pty

// CRITICAL: term.write(data, callback) — callback fires when data is PARSED, not rendered
// For small writes, callback may fire synchronously — batch acks to reduce IPC overhead

// CRITICAL: Flow control must happen in the MAIN process (where PTY lives),
// not the renderer. The renderer just receives IPC messages.

// CRITICAL: All IPC in this codebase uses ipcMain.handle / window.electronAPI.invoke
// There is NO send method on window.electronAPI — always use invoke/handle pattern

// CRITICAL: When scrollback is reduced from 50K to 10K, users with existing sessions
// will see a one-time truncation of older scrollback on upgrade. This is expected.
```

## Implementation Blueprint

### Task 1: Install WebGL addon, remove unused addons

```yaml
MODIFY frontend/package.json:
  - ADD dependency: "@xterm/addon-webgl": "^0.19.0"
  - REMOVE dependency: "@xterm/addon-search" (never imported — verify with grep first)
  - REMOVE dependency: "@xterm/addon-web-links" (never imported — verify with grep first)
```

Then run:
```bash
cd frontend && pnpm install
```

### Task 2: Add WebGL renderer with fallback in TerminalPanel.tsx

```yaml
MODIFY frontend/src/components/panels/TerminalPanel.tsx:
  - ADD a useRef for WebGL addon: useRef<WebglAddon | null>(null)
    (Import the WebglAddon TYPE with: import type { WebglAddon } from '@xterm/addon-webgl')
  - AFTER terminal.open(element) and fitAddon.fit(), attempt to load WebGL addon
  - HANDLE WebGL initialization failure with try/catch (fall back to DOM — just log warning)
  - HANDLE context loss via addon.onContextLoss (dispose addon, log warning with panel.id)
  - Store addon ref for cleanup
  - ADD cleanup: dispose WebGL addon in the cleanup return function
```

Pseudocode:
```typescript
// Add ref at top of component (alongside xtermRef and fitAddonRef):
import type { WebglAddon } from '@xterm/addon-webgl';
const webglAddonRef = useRef<WebglAddon | null>(null);

// After terminal.open(terminalRef.current) and fitAddon.fit()...
// Try loading WebGL renderer (dynamic import for lazy loading)
try {
  const { WebglAddon } = await import('@xterm/addon-webgl');
  const addon = new WebglAddon();
  addon.onContextLoss(() => {
    console.warn('[TerminalPanel] WebGL context lost for panel', panel.id, ', falling back to DOM renderer');
    try { addon.dispose(); } catch { /* already disposed */ }
    webglAddonRef.current = null;
  });
  terminal.loadAddon(addon);
  webglAddonRef.current = addon;
  console.log('[TerminalPanel] WebGL renderer loaded for panel', panel.id);
} catch (e) {
  console.warn('[TerminalPanel] WebGL renderer failed for panel', panel.id, ', using DOM renderer:', e);
  webglAddonRef.current = null;
}

// In cleanup function (the return () => { ... } block), add BEFORE terminal dispose:
if (webglAddonRef.current) {
  try { webglAddonRef.current.dispose(); } catch { /* ignore */ }
  webglAddonRef.current = null;
}
```

### Task 3: Reduce scrollback from 50,000 to 10,000

```yaml
MODIFY frontend/src/components/panels/TerminalPanel.tsx:
  - CHANGE scrollback: 50000 → scrollback: 10000
```

One-line change at the Terminal constructor options. This aligns with the backend's existing `MAX_SCROLLBACK_LINES = 10000` in `terminalPanelManager.ts` line 25.

### Task 4: Throttle ResizeObserver

```yaml
MODIFY frontend/src/components/panels/TerminalPanel.tsx:
  - IMPORT throttle from '../../utils/performanceUtils'
  - CREATE the throttled resize function at the same scope as the ResizeObserver
    (inside initializeTerminal, right before the ResizeObserver creation)
  - The throttled function calls fitAddon.fit() and sends resize dimensions to backend
```

Pseudocode (inside `initializeTerminal`, just before ResizeObserver creation):
```typescript
import { throttle } from '../../utils/performanceUtils';

// Inside initializeTerminal, right before ResizeObserver:
const throttledResize = throttle(() => {
  if (fitAddon && !disposed) {
    fitAddon.fit();
    const dimensions = fitAddon.proposeDimensions();
    if (dimensions) {
      window.electronAPI.invoke('terminal:resize', panel.id, dimensions.cols, dimensions.rows);
    }
  }
}, 100);

const resizeObserver = new ResizeObserver(() => {
  throttledResize();
});
```

### Task 5: Add output batching + flow control in terminalPanelManager.ts

This is the most complex change. Two things happen:

**A) Output batching**: Instead of sending every PTY data chunk as a separate IPC message, accumulate chunks for 16ms or 4KB (whichever comes first) and send as one batch.

**B) Flow control**: Track pending (unacknowledged) bytes. When they exceed HIGH_WATERMARK, pause the PTY. When ack brings them below LOW_WATERMARK, resume.

```yaml
MODIFY main/src/services/terminalPanelManager.ts:
  - ADD flow control constants
  - ADD fields to TerminalProcess interface: pendingBytes, isPaused, outputBuffer, outputFlushTimer
  - INITIALIZE new fields when creating TerminalProcess (pendingBytes: 0, isPaused: false, etc.)
  - MODIFY pty.onData handler: buffer output instead of sending immediately
  - ADD flushOutputBuffer method: sends batched data to renderer, tracks pending bytes, applies backpressure
  - ADD acknowledgeBytes method: decrements pendingBytes, resumes PTY if below LOW_WATERMARK
  - CALL flushOutputBuffer on timer (16ms) and on buffer size threshold (4KB)
```

Pseudocode:
```typescript
// Constants
const HIGH_WATERMARK = 100_000; // 100KB — pause PTY when pending exceeds this
const LOW_WATERMARK = 10_000;   // 10KB — resume PTY when pending drops below this
const OUTPUT_BATCH_INTERVAL = 16; // ms (~60fps)
const OUTPUT_BATCH_SIZE = 4096;   // 4KB — flush immediately if buffer exceeds this

// Updated TerminalProcess interface:
interface TerminalProcess {
  pty: pty.IPty;
  panelId: string;
  sessionId: string;
  scrollbackBuffer: string;
  commandHistory: string[];
  currentCommand: string;
  lastActivity: Date;
  isWSL?: boolean;
  // Flow control
  pendingBytes: number;
  isPaused: boolean;
  // Output batching
  outputBuffer: string;
  outputFlushTimer: ReturnType<typeof setTimeout> | null;
}

// Initialize when creating terminalProcess:
const terminalProcess: TerminalProcess = {
  // ... existing fields ...
  pendingBytes: 0,
  isPaused: false,
  outputBuffer: '',
  outputFlushTimer: null,
};

// New method on TerminalPanelManager:
private flushOutputBuffer(terminal: TerminalProcess): void {
  if (terminal.outputFlushTimer) {
    clearTimeout(terminal.outputFlushTimer);
    terminal.outputFlushTimer = null;
  }

  if (!terminal.outputBuffer) return;

  const data = terminal.outputBuffer;
  terminal.outputBuffer = '';

  // Track pending bytes for flow control
  terminal.pendingBytes += data.length;

  // Send batched output to renderer
  if (mainWindow) {
    mainWindow.webContents.send('terminal:output', {
      sessionId: terminal.sessionId,
      panelId: terminal.panelId,
      output: data
    });
  }

  // Apply backpressure if watermark exceeded
  if (terminal.pendingBytes > HIGH_WATERMARK && !terminal.isPaused) {
    terminal.isPaused = true;
    terminal.pty.pause();
  }
}

// New public method for ack handling:
acknowledgeBytes(panelId: string, bytesConsumed: number): void {
  const terminal = this.terminals.get(panelId);
  if (!terminal) return;

  terminal.pendingBytes = Math.max(0, terminal.pendingBytes - bytesConsumed);

  if (terminal.isPaused && terminal.pendingBytes < LOW_WATERMARK) {
    terminal.isPaused = false;
    terminal.pty.resume();
  }
}

// Modified pty.onData handler in setupTerminalHandlers:
terminal.pty.onData((data: string) => {
  terminal.lastActivity = new Date();
  this.addToScrollback(terminal, data);

  // ... existing command detection logic stays the same ...

  // Buffer output for batching instead of sending immediately
  terminal.outputBuffer += data;

  if (terminal.outputBuffer.length >= OUTPUT_BATCH_SIZE) {
    // Buffer is large enough — flush immediately
    this.flushOutputBuffer(terminal);
  } else if (!terminal.outputFlushTimer) {
    // Schedule flush for next frame
    terminal.outputFlushTimer = setTimeout(() => {
      this.flushOutputBuffer(terminal);
    }, OUTPUT_BATCH_INTERVAL);
  }
});
```

Also clean up flush timer in `destroyTerminal`:
```typescript
// In destroyTerminal, before killing PTY:
if (terminal.outputFlushTimer) {
  clearTimeout(terminal.outputFlushTimer);
  terminal.outputFlushTimer = null;
}
// Flush any remaining buffered output
this.flushOutputBuffer(terminal);
```

### Task 6: Register terminal:ack IPC handler + renderer ack batching

**Backend** (main/src/ipc/panels.ts):
```yaml
MODIFY main/src/ipc/panels.ts:
  - ADD ipcMain.handle('terminal:ack', ...) handler near the other terminal handlers (lines 287-299)
  - Handler calls terminalPanelManager.acknowledgeBytes(panelId, bytesConsumed)
```

Pseudocode:
```typescript
// In registerPanelHandlers, near line 299 (after terminal:saveState):
ipcMain.handle('terminal:ack', async (_, panelId: string, bytesConsumed: number) => {
  terminalPanelManager.acknowledgeBytes(panelId, bytesConsumed);
});
```

**Frontend** (TerminalPanel.tsx) — batched ack:

Instead of ACKing every `terminal.write()` callback individually, batch acks to reduce IPC round-trips:

```yaml
MODIFY frontend/src/components/panels/TerminalPanel.tsx:
  - ADD ack batching state: bytesToAck counter and flush timer
  - In the output handler, use terminal.write(data, callback) form
  - In the callback, accumulate bytes and flush ack every 10KB or 100ms
```

Pseudocode (inside `initializeTerminal`, near the output handler):
```typescript
const ACK_BATCH_SIZE = 10_000; // 10KB
const ACK_BATCH_INTERVAL = 100; // ms
let pendingAckBytes = 0;
let ackFlushTimer: ReturnType<typeof setTimeout> | null = null;

const flushAck = () => {
  if (ackFlushTimer) {
    clearTimeout(ackFlushTimer);
    ackFlushTimer = null;
  }
  if (pendingAckBytes > 0) {
    const bytes = pendingAckBytes;
    pendingAckBytes = 0;
    window.electronAPI.invoke('terminal:ack', panel.id, bytes);
  }
};

// Modified output handler:
const outputHandler = (data: { panelId?: string; sessionId?: string; output?: string } | unknown) => {
  if (data && typeof data === 'object' && 'panelId' in data && data.panelId && 'output' in data) {
    const typedData = data as { panelId: string; output: string };
    if (typedData.panelId === panel.id && terminal && !disposed) {
      terminal.write(typedData.output, () => {
        // Batch ack bytes
        pendingAckBytes += typedData.output.length;
        if (pendingAckBytes >= ACK_BATCH_SIZE) {
          flushAck();
        } else if (!ackFlushTimer) {
          ackFlushTimer = setTimeout(flushAck, ACK_BATCH_INTERVAL);
        }
      });
    }
  }
};

// In cleanup, add:
flushAck(); // flush remaining acks
if (ackFlushTimer) clearTimeout(ackFlushTimer);
```

### Integration Points

```yaml
FRONTEND:
  - TerminalPanel.tsx: WebGL addon, resize throttle, write callback + ack batching
  - package.json: Dependency changes

BACKEND:
  - terminalPanelManager.ts: Output batching, flow control, acknowledgeBytes method
  - ipc/panels.ts: New terminal:ack handler (follows existing ipcMain.handle pattern)
```

## Validation Loop

```bash
# Run these after implementation — fix any errors before proceeding
pnpm typecheck          # TypeScript compilation across all workspaces
pnpm lint               # ESLint across all workspaces
```

Manual validation:
1. Start app with `pnpm electron-dev`
2. Open a terminal panel
3. Check console for "WebGL renderer loaded for panel ..." log
4. Run `seq 1 100000` in the terminal — UI should remain responsive
5. Resize the window — smooth, no excessive reflows or flickering
6. Open multiple terminal panels — all should work independently

## Final Validation Checklist

- [ ] No linting errors: `pnpm lint`
- [ ] No type errors: `pnpm typecheck`
- [ ] WebGL addon loads on terminal open (check console log)
- [ ] Context loss fallback works (simulate via DevTools: `document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`)
- [ ] High-throughput output doesn't freeze UI
- [ ] Resize is smooth without excessive `fit()` calls
- [ ] Unused addons removed from package.json and no import errors
- [ ] Flow control: PTY pauses during heavy output, resumes when renderer catches up

## Deprecated Code to Remove

```yaml
- "@xterm/addon-search" from frontend/package.json (verify never imported, then remove)
- "@xterm/addon-web-links" from frontend/package.json (verify never imported, then remove)
```

## Anti-Patterns to Avoid

- Don't load WebGL addon before `terminal.open()` — it needs the DOM element
- Don't set HIGH_WATERMARK above 500KB — degrades keystroke responsiveness
- Don't use per-chunk pause/resume (pause on every `onData`) — kills throughput
- Don't skip the context loss handler — will leave broken rendering on sleep/wake
- Don't add flow control to the renderer side only — the PTY lives in the main process
- Don't create a CanvasAddon fallback — it's deprecated and being removed in xterm v6; DOM is fine as fallback
- Don't use `window.electronAPI.send()` — it doesn't exist. Always use `invoke`/`handle` pattern
- Don't ACK every single write callback — batch acks to reduce IPC overhead
- Don't send every PTY chunk as a separate IPC message — batch output first

## Plan Confidence: 8/10

High confidence because:
- All APIs are well-documented
- Changes are isolated to 4 files
- WebGL addon is battle-tested in VSCode
- Flow control pattern is well-established
- IPC pattern matches existing codebase conventions

Risk areas:
- Watermark values (100KB/10KB) and batch sizes (4KB/16ms) may need runtime tuning
- Need to verify `@xterm/addon-webgl@0.19.0` works with `@xterm/xterm@5.5.0` at runtime
