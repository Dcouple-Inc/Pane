# foozol Cloud VM Research Findings

**Date:** 2026-02-24
**Goal:** Run foozol on a persistent cloud VM per user, accessible from any device via browser.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Display Streaming: noVNC Stack](#2-display-streaming-novnc-stack)
3. [Terminal Persistence: tmux Integration](#3-terminal-persistence-tmux-integration)
4. [Authentication: First-Run Setup](#4-authentication-first-run-setup)
5. [VM Provisioning: GCP/AWS + Terraform](#5-vm-provisioning-gcpaws--terraform)
6. [VM Pricing: 16GB RAM at $20/user Budget](#6-vm-pricing-16gb-ram-at-20user-budget)
7. [Process Management: How foozol Spawns Processes](#7-process-management-how-foozol-spawns-processes)
8. [Session Resume: Existing Recovery Logic](#8-session-resume-existing-recovery-logic)
9. [Security Considerations](#9-security-considerations)
10. [Clipboard Problem & Future WebSocket Path](#10-clipboard-problem--future-websocket-path)
11. [Backup & Disaster Recovery](#11-backup--disaster-recovery)

---

## 1. Architecture Overview

The core idea: **1 user = 1 VM = 1 filesystem**. The VM runs foozol as a native Electron app with a virtual display (Xvfb), streamed to the user's browser via noVNC/Guacamole.

```
User's Browser (any device)
    |
    v  HTTPS + WebSocket (wss://)
+------------------------------------------+
|  NGINX (TLS termination + auth)          |
+------------------------------------------+
    |
    v  WebSocket
+------------------------------------------+
|  websockify (port 6080)                  |
|  WebSocket-to-TCP proxy                  |
+------------------------------------------+
    |
    v  VNC protocol (localhost:5900)
+------------------------------------------+
|  x11vnc                                  |
|  VNC server attached to virtual display  |
+------------------------------------------+
    |
    v  X11 protocol
+------------------------------------------+
|  Xvfb (virtual display :99)             |
|  1920x1080x24                            |
+------------------------------------------+
    |
    v
+------------------------------------------+
|  foozol (Electron app)                   |
|  - Same binary as local desktop          |
|  - ~/.foozol/ (SQLite, config)           |
|  - ~/.claude/ (Claude Code auth)         |
|  - ~/.config/gh/ (GitHub auth)           |
|  - ~/projects/ (git worktrees)           |
+------------------------------------------+
```

**Key insight:** From foozol's perspective, nothing changes. It's running on a real (virtual) display with a real filesystem. Auth flows, git operations, terminal processes — all identical to local usage.

---

## 2. Display Streaming: noVNC Stack

### Components

| Component | Purpose | Package |
|-----------|---------|---------|
| **Xvfb** | Virtual X11 display (no physical monitor) | `xvfb` |
| **Fluxbox** | Lightweight window manager (optional but recommended) | `fluxbox` |
| **x11vnc** | VNC server that captures the virtual display | `x11vnc` |
| **websockify** | Translates WebSocket (browser) to VNC protocol (TCP) | `websockify` |
| **noVNC** | HTML5 VNC client that runs in the browser | `novnc` |

### Setup Commands

```bash
# Install all components
sudo apt-get install -y xvfb x11vnc novnc websockify fluxbox

# Install Electron dependencies (Chromium needs these)
sudo apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libgtk-3-0 libgbm1 \
  libasound2 libxss1 libxtst6 libcups2 libdrm2 libxkbcommon0 \
  libgdk-pixbuf2.0-0 libx11-xcb1 fonts-liberation xdg-utils

# Start the stack
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99
fluxbox &
x11vnc -display :99 -passwd "$VNC_PASSWORD" -forever -shared -rfbport 5900 -localhost &
websockify --web=/usr/share/novnc 6080 localhost:5900 &

# Start foozol
/path/to/foozol &
```

### Production: supervisord

Use supervisord to manage all processes with proper startup ordering:

```ini
[program:xvfb]
command=/usr/bin/Xvfb :99 -screen 0 1920x1080x24
priority=10
autorestart=true

[program:fluxbox]
command=/usr/bin/fluxbox
priority=20
autorestart=true
environment=DISPLAY=":99"

[program:foozol]
command=/path/to/foozol
priority=30
autorestart=true
environment=DISPLAY=":99"

[program:x11vnc]
command=/usr/bin/x11vnc -display :99 -passwd %(ENV_VNC_PASSWORD)s -forever -shared -rfbport 5900 -localhost
priority=40
autorestart=true

[program:websockify]
command=/usr/bin/websockify --web=/usr/share/novnc 6080 localhost:5900
priority=50
autorestart=true
```

### Performance Characteristics

- **Bandwidth:** ~2-5 Mbps sustained during active use, ~0.5 Mbps idle
- **Latency:** 30-80ms on good connection, 100-200ms on mediocre wifi
- **Resolution:** Configurable via Xvfb args (1920x1080 recommended)
- **Color depth:** 24-bit (16-bit reduces bandwidth but looks worse)

### Known Limitations

- **Clipboard:** noVNC has its own clipboard buffer, separate from user's system clipboard. Copying between local machine and remote session requires Guacamole's clipboard sidebar.
- **File drag/drop:** Only works with server files, not local files.
- **Keyboard shortcuts:** Some (Cmd+W, Cmd+T, Cmd+Q) get intercepted by the browser before reaching the remote session.
- **Platform detection:** foozol will detect the server OS (Linux), not the user's OS. Keyboard shortcuts show Ctrl instead of Cmd for Mac users.

---

## 3. Terminal Persistence: tmux Integration

### Why tmux?

foozol spawns PTY processes via `node-pty` for Claude Code, Codex, and terminal panels. These processes die if:
- The Electron app restarts
- The VM reboots (not sleeps — sleep preserves processes)
- A crash occurs

tmux wraps PTY sessions so they survive app restarts and can be reattached.

### Where foozol Spawns Processes

Three locations use `pty.spawn()`:

| File | Purpose | What it spawns |
|------|---------|---------------|
| `terminalPanelManager.ts:152` | User terminal panels | Shell (bash/zsh) |
| `AbstractCliManager.ts:619-662` | Claude Code / Codex processes | `claude --verbose --output-format stream-json ...` |
| `runCommandManager.ts:104` | Project run/test commands | User-defined (e.g., `npm test`) |

### tmux Wrapper Pattern

Instead of spawning the shell directly, spawn tmux:

```typescript
// Before (current):
const ptyProcess = pty.spawn(shellPath, shellArgs, {
  name: 'xterm-color',
  cols: 80, rows: 30,
  cwd: worktreePath,
  env: enhancedEnv
});

// After (with tmux):
const sessionName = `foozol-${panelId}`;
const ptyProcess = pty.spawn('tmux', [
  'new-session', '-A', '-s', sessionName,
  shellPath, ...shellArgs
], {
  name: 'xterm-256color',
  cols: 80, rows: 30,
  cwd: worktreePath,
  env: enhancedEnv
});
```

The `-A` flag means "attach if exists, create if not" — so on app restart, reconnecting to the same panel reattaches to the running tmux session.

### tmux Session Management

```bash
# Check if session exists
tmux has-session -t "session-name" 2>/dev/null  # exit code 0 = exists

# Create detached session
tmux new-session -d -s "session-name"

# Attach to existing session
tmux attach-session -t "session-name"

# Send command to session
tmux send-keys -t "session-name" "your-command" Enter

# Kill session
tmux kill-session -t "session-name"

# List all sessions
tmux list-sessions
```

### Important Consideration

tmux is most valuable for **terminal panels** (user shells). For Claude Code processes, foozol already has robust resume logic via `--resume <sessionId>` that reloads conversation history from `~/.claude/sessions/`. tmux adds redundancy but isn't strictly required for Claude sessions.

---

## 4. Authentication: First-Run Setup

### Key Insight: NOT Headless

Because the VM has a virtual display streamed via noVNC, **all auth flows work identically to local usage**. The user is looking at a real desktop session through their browser. No special headless workarounds needed.

### First-Run Experience

User opens noVNC in their browser and sees the foozol desktop. First time setup:

| Step | How | Persists To |
|------|-----|-------------|
| GitHub auth | `gh auth login` in terminal → OAuth in browser | `~/.config/gh/hosts.yml` |
| Claude Code auth | `claude login` → OAuth redirect works normally | `~/.claude/.credentials.json` |
| Anthropic API key | Set in foozol Settings UI | `~/.foozol/config.json` |
| OpenAI API key (Codex) | Set in foozol Settings or `~/.bashrc` | `~/.foozol/config.json` or env |
| Git SSH keys | `ssh-keygen` + add to GitHub | `~/.ssh/` |

**All credentials persist on the VM filesystem.** Set once, works forever (until tokens expire, which is rare for GitHub and Claude OAuth tokens).

### Alternative: API Key Only (Simplest)

For users who don't want to go through OAuth:

```bash
# Just set the API key — Claude Code uses it automatically
export ANTHROPIC_API_KEY="sk-ant-api03-xxxxxxxxxxxx"
```

Note: This bypasses Claude subscription and uses API pay-as-you-go billing.

---

## 5. VM Provisioning: GCP/AWS + Terraform

### GCP Approach (Recommended)

GCP Compute Engine with Terraform for provisioning/teardown.

#### Terraform Configuration (Example)

```hcl
resource "google_compute_instance" "foozol_vm" {
  name         = "foozol-user-${var.user_id}"
  machine_type = "e2-highmem-2"  # 2 vCPU, 16GB RAM
  zone         = "us-central1-a"

  boot_disk {
    initialize_params {
      image = "projects/your-project/global/images/foozol-base-image"
      size  = 64  # GB
      type  = "pd-ssd"
    }
  }

  network_interface {
    network = "default"
    access_config {}  # Ephemeral public IP
  }

  metadata_startup_script = <<-EOF
    #!/bin/bash
    systemctl start foozol-stack
  EOF

  labels = {
    user_id = var.user_id
    purpose = "foozol-cloud"
  }
}

# Snapshot schedule for daily backups
resource "google_compute_resource_policy" "daily_backup" {
  name   = "foozol-daily-backup"
  region = "us-central1"

  snapshot_schedule_policy {
    schedule {
      daily_schedule {
        days_in_cycle = 1
        start_time    = "04:00"
      }
    }
    retention_policy {
      max_retention_days = 7
    }
  }
}
```

#### VM Lifecycle Operations

```bash
# Stop VM (preserves disk, stops billing for compute)
gcloud compute instances stop foozol-user-123

# Start VM (~20-30 second boot)
gcloud compute instances start foozol-user-123

# Create snapshot backup
gcloud compute disks snapshot foozol-user-123 --zone=us-central1-a

# Restore from snapshot
gcloud compute instances create foozol-user-123-restored \
  --source-snapshot=foozol-user-123-snapshot-20260224
```

#### What Happens on Stop/Start

- **Disk persists** — all files intact (`~/.foozol/`, `~/.claude/`, worktrees)
- **Processes die** — foozol, tmux, x11vnc all stop
- **On start** — supervisord relaunches the entire stack
- **foozol recovery** — detects interrupted sessions, offers resume via `--resume`
- **Boot time** — ~20-30 seconds for GCP stop/start

### AWS Alternative

```hcl
resource "aws_instance" "foozol_vm" {
  ami           = "ami-foozol-base"
  instance_type = "r6i.large"  # 2 vCPU, 16GB RAM

  root_block_device {
    volume_size = 64
    volume_type = "gp3"
  }

  tags = {
    Name    = "foozol-user-${var.user_id}"
    Purpose = "foozol-cloud"
  }
}
```

---

## 6. VM Pricing: 16GB RAM at $20/user Budget

### Reality Check

Hitting $20/user/month with 16GB RAM on hyperscalers (GCP/AWS) requires either **spot instances** or **aggressive stop/start scheduling**. On-demand 24/7 is $66-97/mo. Hetzner is the budget king.

### GCP Compute Engine (us-central1)

| Instance Type | vCPU | RAM | On-Demand $/mo | Spot $/mo | 1yr CUD | 3yr CUD |
|--------------|------|-----|----------------|-----------|---------|---------|
| **e2-highmem-2** | 2 | 16GB | **$66** | **$26** | ~$48 | ~$41 |
| **e2-standard-4** | 4 | 16GB | $98 | $29 | ~$71 | ~$61 |

**Important:** E2 instances do NOT get sustained use discounts. Only CUD applies.

**Disk:** 64GB pd-balanced = $6.40/mo. pd-standard = $2.56/mo (slower but cheaper).

**Egress:** GCP is expensive — 50GB/mo costs ~$4-6 (almost no free tier).

**Total (e2-highmem-2 + 64GB pd-balanced + 50GB egress):**
- On-demand 24/7: **~$78/mo** (way over budget)
- Spot 24/7: **~$39/mo** (over, and interruption risk)
- On-demand 8hrs/day: **~$34/mo** (compute $22 + disk $6 + egress $6)
- Spot 8hrs/day: **~$21/mo** (close but interruption risk)
- With pd-standard + Standard tier egress: spot 8hrs/day drops to **~$16/mo**

### AWS EC2 (us-east-1)

| Instance Type | vCPU | RAM | On-Demand $/mo | Spot $/mo (~70% off) | 3yr Savings Plan |
|--------------|------|-----|----------------|---------------------|-----------------|
| **r6i.large** | 2 | 16GB | **$92** | **$28** | ~$32 |
| **t3.xlarge** | 4 | 16GB | $121 | $36 | ~$48 |

**Advantage:** AWS gives 100GB/mo free egress. No surprise bandwidth bills.

**Disk:** 64GB gp3 = $5.12/mo (persists and bills even when VM stopped).

**Total (r6i.large + 64GB gp3):**
- On-demand 24/7: **~$97/mo**
- Spot 24/7: **~$33/mo**
- On-demand 8hrs/day: **~$36/mo** (compute $31 + disk $5)
- Spot 8hrs/day: **~$14/mo** ✅ **(hits target, but interruption risk)**
- 3yr Savings Plan 24/7: **~$37/mo**

### Hetzner Cloud

| Instance Type | Arch | vCPU | RAM | Disk | EU $/mo | US $/mo |
|--------------|------|------|-----|------|---------|---------|
| **CAX31** | ARM | 8 | 16GB | 160GB NVMe | **~$14** | Limited |
| **CX42** | Intel | 8 | 16GB | 160GB NVMe | **~$18** | N/A (EU only) |
| **CPX41** | AMD | 8 | 16GB | 240GB NVMe | ~$26 | **~$33** |

**Includes:** IPv4, 20TB bandwidth (EU) / 4TB (US), NVMe disk. No hidden costs.

**Limitations:** EU-only for cheapest tiers. No spot. No native suspend/resume (only stop/start). Price increases ~30-37% coming April 2026 (CAX31 → ~$18-19/mo).

### Summary: Paths to $20/user

| Strategy | Monthly Cost | Tradeoffs |
|----------|-------------|-----------|
| **Hetzner CAX31 (EU) always-on** | **~$14/mo** ✅ | Cheapest. 8 ARM vCPU + 16GB + 160GB. EU latency from US (~80-120ms). Verify Electron/ARM compat. Rising to ~$18-19 Apr 2026. |
| **Hetzner CX42 (EU) always-on** | **~$18/mo** ✅ | x86 Intel. 8 vCPU + 16GB + 160GB. EU only. Rising to ~$22-24 Apr 2026. |
| **AWS r6i.large spot + stop/start 8h/day** | **~$14/mo** ✅ | Hits target. Spot interruption risk (~5%). Needs sleep/wake automation. US region. |
| **GCP e2-highmem-2 spot + stop/start 8h/day** | **~$16-21/mo** ✅ | Near target with pd-standard disk. Spot risk. GCP egress adds $4-6. |
| **GCP e2-highmem-2 on-demand + stop/start 8h/day** | **~$34/mo** ❌ | No spot risk but over budget. |
| **Hetzner CPX41 (US) always-on** | **~$33/mo** ❌ | US location but over budget. |

### Recommendation

**For MVP: Hetzner CX42 (EU) at ~$18/mo.** Always-on, x86, 8 vCPU, 16GB RAM, 160GB NVMe, 20TB bandwidth. No automation needed, no spot risk, flat pricing. The EU latency (~80-120ms from US) is acceptable since noVNC already adds 30-80ms — total ~110-200ms, same as the noVNC tradeoff.

**For US users or lower latency: GCP e2-highmem-2 with stop/start.** On-demand at 8hrs/day = ~$34/mo (over budget but reliable). Spot at 8hrs/day = ~$21/mo (within budget but interruption risk).

**Future: AWS r6i.large spot** becomes attractive at scale with Spot Fleet and diversification across instance types/AZs to minimize interruption risk.

---

## 7. Process Management: How foozol Spawns Processes

### Process Tracking

foozol tracks all processes in Maps keyed by `panelId`:

```
TerminalPanelManager.terminals: Map<panelId, TerminalProcess>
  - pty: IPty (node-pty handle)
  - scrollbackBuffer: string (500KB max)
  - commandHistory: string[]
  - Flow control: pendingBytes, isPaused, pauseSafetyTimer

AbstractCliManager.processes: Map<panelId, CliProcess>
  - process: IPty
  - worktreePath: string

RunCommandManager.processes: Map<sessionId, RunProcess[]>
  - process: IPty
  - command: ProjectRunCommand
```

### Output Flow Control

```
PTY output → outputBuffer → batch every 16ms (~60fps) → IPC to renderer
            → if >4KB, flush immediately
            → if pendingBytes >100KB, pause PTY (backpressure)
            → renderer acknowledges bytes → resume when <10KB pending
```

### Graceful Shutdown (index.ts:765-1018)

1. Send Ctrl+C to all terminals (lets Claude flush session data)
2. Wait up to 5 seconds for graceful exit
3. Force-kill remaining processes (SIGTERM → wait → SIGKILL)
4. Kill descendant process trees recursively
5. Save terminal state to SQLite
6. Exit

---

## 8. Session Resume: Existing Recovery Logic

### How Resume Works Today

foozol already handles process death and recovery:

1. **Claude session ID stored:** When Claude starts, it sends an `init` message with `session_id`. foozol stores this in `panel.state.customState.agentSessionId` (SQLite).

2. **On continue/resume:** foozol spawns `claude --resume <sessionId>` which tells Claude Code to reload conversation history from `~/.claude/sessions/<uuid>.jsonl`.

3. **On app restart:** `sessionManager.initializeFromDatabase()` finds sessions in interrupted state, sets up `initialCommand = "claude --resume <id>"` which executes when the user views that panel.

### What This Means for Cloud VMs

VM stop/start is functionally identical to an app crash and restart:
- Filesystem persists (SQLite + Claude session files)
- Processes die
- On boot, foozol recovers all sessions automatically
- User clicks a session → Claude resumes from where it left off

**No additional work needed** for basic VM stop/start resilience.

---

## 9. Security Considerations

### Threat Model

A public-facing noVNC endpoint is equivalent to SSH access — full control of the VM.

### Required Security Layers

| Layer | Implementation | Priority |
|-------|---------------|----------|
| **TLS** | NGINX with Let's Encrypt (mandatory) | P0 |
| **Auth** | Application-level auth before serving noVNC page | P0 |
| **Token-based VNC access** | Short-lived tokens via websockify `--token-plugin` | P0 |
| **VNC password** | Per-user password on x11vnc | P1 |
| **Localhost binding** | x11vnc `-localhost` flag (only accessible via websockify) | P0 |
| **Firewall** | Only expose port 443 (HTTPS). Block 5900 (VNC), 6080 (websockify) | P0 |
| **Session timeout** | Auto-disconnect idle sessions (30-60 min) | P1 |
| **Rate limiting** | NGINX rate limits on VNC endpoint | P1 |
| **Audit logging** | Log all VNC connection events | P2 |

### Auth Flow

```
User opens foozol.cloud/dashboard
    → Authenticates with GitHub OAuth (or email/password)
    → Backend generates short-lived VNC token
    → Redirects to /vnc?token=abc123&autoconnect=true
    → noVNC connects via wss:// with token
    → Token validated by websockify, routes to user's VNC port
    → User sees their foozol desktop
```

---

## 10. Clipboard Problem & Future WebSocket Path

### The Problem

noVNC's clipboard is **separate** from the user's system clipboard. Copy/paste between local machine and remote session requires using a clipboard sidebar panel. This affects 8+ places in foozol that use `navigator.clipboard`.

### The Solution: Hybrid WebSocket Architecture (Phase 2)

Serve foozol's React frontend as a real web page. Stream only terminal data over WebSocket. Clipboard works natively because it's a real browser page, not a pixel stream.

```
User's Browser (native web app)                Remote VM
┌──────────────────────────┐      ┌─────────────────────────────┐
│  React Frontend          │      │  Node.js Backend            │
│  (served as static HTML) │      │                             │
│                          │ HTTP │  Express/Fastify server     │
│  Zustand Stores     ◄────┼──────┼─► (serves frontend build)  │
│  React Components        │      │                             │
│                          │  WS  │  WebSocket Server           │
│  xterm.js           ◄────┼──────┼─► - Terminal I/O per panel  │
│  + addon-attach          │      │    - Session management     │
│  + addon-clipboard       │      │    - Git/file operations    │
│  + addon-fit             │      │                             │
│                          │      │  node-pty + SessionManager  │
│  Clipboard: NATIVE       │      │  SQLite database            │
│  (navigator.clipboard)   │      │                             │
└──────────────────────────┘      └─────────────────────────────┘
```

### xterm.js Has Native WebSocket Support

**`@xterm/addon-attach`** (48K+ weekly npm downloads) — first-party addon that bridges a WebSocket to a Terminal instance:

```typescript
// Client: ~5 lines to connect a remote terminal
import { Terminal } from '@xterm/xterm';
import { AttachAddon } from '@xterm/addon-attach';

const terminal = new Terminal();
const ws = new WebSocket(`wss://${host}/api/terminal?panelId=${panelId}`);
const attachAddon = new AttachAddon(ws, { bidirectional: true });
terminal.loadAddon(attachAddon);
```

```typescript
// Server: ~15 lines to bridge node-pty to WebSocket
wss.on('connection', (ws, req) => {
  const panelId = new URL(req.url, 'http://localhost').searchParams.get('panelId');
  const ptyProcess = panelManager.getPtyProcess(panelId);

  ptyProcess.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  });

  ws.on('message', (msg) => {
    const str = msg.toString();
    try {
      const parsed = JSON.parse(str);
      if (parsed.type === 'resize') { ptyProcess.resize(parsed.cols, parsed.rows); return; }
    } catch {}
    ptyProcess.write(str);
  });

  ws.on('close', () => { /* PTY stays alive for reconnect */ });
});
```

### Clipboard: Three Layers, All Work Natively

**Layer 1: Browser Clipboard API** (works because it's a real web page)
```typescript
// Copy on terminal selection
terminal.onSelectionChange(() => {
  const selection = terminal.getSelection();
  if (selection) navigator.clipboard.writeText(selection);
});

// Paste via Ctrl+V / Cmd+V
document.addEventListener('keydown', async (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    e.preventDefault();
    const text = await navigator.clipboard.readText();
    ws.send(text); // Send to remote PTY
  }
});
```

**Layer 2: OSC 52 via `@xterm/addon-clipboard`**
```typescript
import { ClipboardAddon } from '@xterm/addon-clipboard';
terminal.loadAddon(new ClipboardAddon());
// Now remote programs (tmux, vim) that use OSC 52 escape sequences
// can read/write the user's local clipboard transparently
```

**Layer 3: foozol's existing `navigator.clipboard` calls** — all 8+ places (PromptHistory, LogsView, RichOutputView, MessagesView, GitErrorDialog, etc.) work unchanged because it's a real browser page.

### IPC → WebSocket Adapter

The cleanest approach: wrap existing IPC handlers with a WebSocket transport layer. Same function signatures, different transport.

```typescript
// Shared protocol (request-response over WebSocket)
interface IPCMessage { id: string; channel: string; args: unknown[]; }
interface IPCResponse { id: string; result?: unknown; error?: string; }

// Server: route WebSocket messages to existing IPC handler functions
wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
    const msg: IPCMessage = JSON.parse(raw.toString());
    const handler = ipcHandlers.get(msg.channel);
    try {
      const result = await handler(...msg.args);
      ws.send(JSON.stringify({ id: msg.id, result }));
    } catch (err) { ws.send(JSON.stringify({ id: msg.id, error: err.message })); }
  });
});

// Client: drop-in replacement for window.electronAPI
const api = isElectron()
  ? window.electronAPI          // Electron IPC (existing, unchanged)
  : new WebSocketAPI(wsUrl);    // WebSocket (new, same interface)
```

### Reconnection on Disconnect

PTY processes stay alive on the server. On reconnect, replay terminal state:

```typescript
// Server: use xterm-headless + addon-serialize to track terminal state
import { Terminal as HeadlessTerminal } from '@xterm/headless';
import { SerializeAddon } from '@xterm/addon-serialize';

const headless = new HeadlessTerminal({ cols: 80, rows: 24 });
const serialize = new SerializeAddon();
headless.loadAddon(serialize);

ptyProcess.onData((data) => {
  headless.write(data);       // Track state server-side
  broadcastToClients(data);   // Stream to connected browsers
});

// On reconnect: send full terminal state
ws.on('message', (msg) => {
  if (JSON.parse(msg).type === 'replay') {
    ws.send(serialize.serialize());
  }
});
```

### Reference: How Others Solve This

| Product | Architecture | Clipboard | Source |
|---------|-------------|-----------|--------|
| **code-server** | VS Code backend → WebSocket → browser | `navigator.clipboard` (requires HTTPS) + `--stdin-to-clipboard` CLI bridge | [github.com/coder/code-server](https://github.com/coder/code-server) |
| **ttyd** | C server (libwebsockets) → xterm.js | `@xterm/addon-clipboard` (OSC 52) | [github.com/tsl0922/ttyd](https://github.com/tsl0922/ttyd) |
| **GitHub Codespaces** | VS Code Server → WebSocket | `navigator.clipboard` (Chrome works, Safari unreliable) | Proprietary |
| **Gitpod** | xterm.js + WebSocket | `Ctrl+Shift+C/V` + right-click | [github.com/gitpod-io](https://github.com/gitpod-io) |

### Phase 2 vs noVNC Comparison

| | noVNC (Phase 1) | WebSocket Hybrid (Phase 2) |
|---|---|---|
| Clipboard | Broken (sidebar workaround) | **Native** |
| Latency | 30-200ms (pixels) | **5-20ms (text)** |
| Bandwidth | 2-5 Mbps | **10-50 Kbps** |
| RAM per user | ~2GB (Xvfb + Electron + x11vnc) | **~512MB (Node.js + node-pty)** |
| Keyboard shortcuts | Many intercepted by browser | **Full control** |
| Mobile support | Unusable | **Possible** |
| foozol code changes | Zero | Medium (~23 IPC handler files) |
| VM cost savings | — | **~50% less RAM needed** |

### Effort Estimate for Phase 2

| Task | Days | Notes |
|------|------|-------|
| Add Express server alongside Electron | 1 | Serve `frontend/dist/` |
| WebSocket adapter for IPC handlers | 5-7 | 23 handler files, mechanical wrapping |
| Terminal WebSocket endpoints | 2 | `@xterm/addon-attach` server + client |
| Clipboard integration | 1 | `@xterm/addon-clipboard` + existing code |
| Reconnection logic | 2 | `xterm-headless` + `addon-serialize` |
| Auth (JWT/session tokens) | 2 | Network-accessible = needs auth |
| Strip Electron from frontend | 2 | Replace `window.electronAPI` with API client |
| **Total** | **~15-20 days** | Can be done incrementally |

**Recommendation:** Ship noVNC (Phase 1) in days. If clipboard complaints are frequent (they will be), Phase 2 is a well-understood, well-supported path with first-party xterm.js tooling.

---

## 11. Backup & Disaster Recovery

### Daily VM Snapshots

```bash
# GCP: Automated snapshot schedule
gcloud compute resource-policies create snapshot-schedule foozol-daily \
  --region=us-central1 \
  --max-retention-days=7 \
  --daily-schedule \
  --start-time=04:00

# Attach to disk
gcloud compute disks add-resource-policies foozol-user-123 \
  --resource-policies=foozol-daily \
  --zone=us-central1-a
```

**Cost:** ~$0.05/GB/month for snapshot storage. 64GB disk with 7-day retention ≈ $3-4/user/month for snapshots (incremental, so actual cost is less).

### What's Backed Up

Everything. The snapshot captures the entire disk:
- `~/.foozol/` (SQLite database, config, logs)
- `~/.claude/` (Claude Code auth + session files)
- `~/.config/gh/` (GitHub auth)
- `~/.ssh/` (SSH keys)
- `~/projects/` (all git worktrees)
- System packages and configuration

### Recovery

```bash
# Restore from snapshot (creates new instance)
gcloud compute instances create foozol-user-123-restored \
  --source-snapshot=foozol-user-123-20260224 \
  --zone=us-central1-a \
  --machine-type=e2-highmem-2
```

User gets their exact state back — all sessions, auth, worktrees, everything.
