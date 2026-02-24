# PRD: foozol Cloud — Persistent VM per User

**Author:** Dcouple Inc
**Date:** 2026-02-24
**Status:** Draft
**Target:** MVP in ~1 week of focused work

---

## 1. Problem Statement

foozol currently runs as a desktop Electron app. Users must keep their computer on and running for sessions to continue. If the laptop closes, sleeps, or loses power — Claude Code sessions stop, terminals die, and work is interrupted.

Users want:
- Sessions that **never stop** just because they closed their laptop
- Access from **any device** (work laptop, home desktop, phone for quick checks)
- A persistent environment where auth, projects, and sessions are **always ready**
- The same experience they have locally, but in the cloud

---

## 2. Solution: "Mac Mini in the Cloud"

Give each user a persistent cloud VM that runs foozol exactly as it runs locally. Stream the desktop to the user's browser. The VM is always on (or sleeps and wakes), and the user's entire environment — auth tokens, sessions, git worktrees, terminal history — persists on the VM's filesystem.

**Mental model:** It's like having a dedicated Mac Mini in a closet that's always on, except it's in the cloud and you access it through your browser.

### What Changes

- foozol binary: **Nothing.** Same Electron app, same code.
- User experience: **Browser tab instead of native app.** Everything else identical.
- Infrastructure: **New.** VM provisioning, display streaming, auth gateway.

### What Stays the Same

- foozol UI and functionality: 100% identical
- Auth flows (GitHub, Claude, API keys): Same flows, same UX
- Git worktrees, SQLite database, config: Same files, same locations
- Session resume/continue logic: Already works for process recovery

---

## 3. User Stories

### P0 — Must Have (MVP)

1. **As a user**, I can open a URL in my browser and see my foozol desktop, so I can work from any device.

2. **As a user**, I can close my browser and reopen it later, and my sessions are still running (or resumable), so I don't lose work.

3. **As a user**, I can set up GitHub and Claude Code auth on first launch (same as local), and never have to do it again.

4. **As a user**, my VM has 16GB RAM so terminals and Claude sessions run smoothly without memory pressure.

### P1 — Should Have

5. **As a user**, my VM is backed up daily, so I can recover from disasters.

6. **As a user**, idle VMs automatically stop to save costs, and start again when I connect.

7. **As a user**, my connection is secured with HTTPS and I must authenticate before accessing my VM.

### P2 — Future / Phase 2

8. **As a user**, clipboard copy/paste works natively between my local machine and remote foozol (requires WebSocket migration).

9. **As a user**, I can toggle my VM on/off from a dashboard to manage costs.

10. **As a user**, I can migrate my environment to a different VM without losing state (requires external database).

---

## 4. Architecture

### Phase 1: noVNC (MVP — ships in days)

```
                    Internet
                       |
                       v
              +------------------+
              |  NGINX (TLS)     |
              |  + Auth gateway  |
              +------------------+
                       |
                       v
              +------------------+
              |  websockify      |
              |  (WS → VNC)     |
              +------------------+
                       |
                       v
              +------------------+
              |  x11vnc          |
              +------------------+
                       |
                       v
              +------------------+
              |  Xvfb :99        |
              |  1920x1080x24    |
              +------------------+
                       |
                       v
              +------------------+
              |  foozol          |
              |  (Electron)      |
              +------------------+
                       |
              +--------+--------+
              |                 |
        ~/.foozol/       ~/projects/
        (SQLite,          (git worktrees)
         config)
```

### Phase 2: Hybrid WebSocket (future — ships in 2-3 weeks)

```
    User's Browser                          Cloud VM
    +-----------------+                +------------------+
    | foozol web UI   |  -- HTTPS -->  | foozol backend   |
    | (React, native) |  <-- WS ---   | (Node.js server) |
    | xterm.js        |                | node-pty + tmux  |
    | native clipboard|                | SQLite           |
    +-----------------+                +------------------+
```

Phase 2 eliminates noVNC entirely. The React frontend runs natively in the user's browser, terminal data streams over WebSocket (~50 Kbps vs ~3 Mbps for pixels). Clipboard works natively. But this requires converting ~377 IPC handlers to HTTP/WebSocket endpoints.

**Recommendation:** Ship Phase 1 now, validate demand, build Phase 2 if clipboard/latency complaints justify the effort.

---

## 5. Technical Specification

### 5.1 VM Image (Golden Image)

Build a base VM image with everything pre-installed:

```
Ubuntu 24.04 LTS
├── System packages
│   ├── Xvfb, x11vnc, websockify, noVNC, fluxbox
│   ├── Electron dependencies (libnss3, libgtk-3-0, etc.)
│   ├── tmux, git, gh (GitHub CLI), curl
│   └── Node.js 20 LTS, pnpm
├── foozol (pre-installed, latest version)
├── Claude Code CLI (pre-installed)
├── supervisord configuration
│   ├── xvfb.conf
│   ├── x11vnc.conf
│   ├── websockify.conf
│   ├── fluxbox.conf
│   └── foozol.conf
├── NGINX configuration
│   ├── TLS termination
│   ├── WebSocket proxy to websockify
│   └── Auth token validation
└── systemd services
    ├── supervisord.service (manages display stack)
    └── nginx.service
```

### 5.2 VM Specs

**Primary recommendation: Hetzner CX42 (EU)**

| Spec | Value | Rationale |
|------|-------|-----------|
| **Machine type** | Hetzner CX42 | 8 Intel vCPU, 16GB RAM. Best price/performance |
| **Disk** | 160GB NVMe (included) | Fast. Included in price. No separate billing |
| **OS** | Ubuntu 24.04 LTS | Long-term support, wide package availability |
| **Region** | Falkenstein or Nuremberg (EU) | Cheapest. US Ashburn available at higher cost |
| **Bandwidth** | 20TB included | More than enough for noVNC streaming |

**Alternative: GCP e2-highmem-2 (for US users)**

| Spec | Value | Rationale |
|------|-------|-----------|
| **Machine type** | GCP e2-highmem-2 | 2 vCPU, 16GB RAM. Closest to $20 on hyperscaler |
| **Disk** | 64GB pd-balanced | $6.40/mo. Persists across stop/start |
| **Region** | us-central1 | Lowest GCP pricing. Low latency from US |

### 5.3 Cost Per User

**Option A: Hetzner CX42 (recommended for MVP)**

| Component | Monthly Cost |
|-----------|-------------|
| CX42 (8 vCPU, 16GB, 160GB NVMe) | ~$18 |
| Bandwidth (20TB included) | $0 |
| Snapshots/backups | ~$2 |
| **Total** | **~$20/mo** ✅ |

Always-on, flat pricing, no automation needed, no spot risk.

**Option B: GCP e2-highmem-2 with stop/start**

| Component | Monthly Cost (8h/day) |
|-----------|----------------------|
| e2-highmem-2 compute (~243 hrs) | ~$22 |
| 64GB pd-balanced (24/7) | $6.40 |
| Egress (~50GB) | ~$5 |
| Snapshots | ~$2 |
| **Total** | **~$35/mo** ❌ (over budget on-demand) |

Drops to ~$21/mo with spot instances (accepts ~5% interruption risk).

**Cost optimization paths (GCP):**
- Spot instances: ~40% savings (but interruption risk)
- pd-standard disk: saves ~$4/mo (slower but fine for dev work)
- Standard tier egress: saves ~$1.50/mo
- 1yr CUD: ~28% off compute (but committed spend even when stopped)

### 5.4 Provisioning Flow

```
User signs up at foozol.cloud
    → Authenticates with GitHub OAuth
    → Backend: Terraform provisions new VM from golden image
    → VM boots (~20-30 seconds)
    → supervisord starts display stack + foozol
    → Backend returns noVNC URL with auth token
    → User sees foozol desktop in browser
    → First-run: user does gh auth login + claude login (same as local)
    → Done. Bookmark the URL. Works from any device.
```

### 5.5 VM Lifecycle

```
States:
  PROVISIONING → RUNNING → IDLE → STOPPED → RUNNING (on reconnect)
                                          → TERMINATED (user request)

RUNNING: User connected, foozol active
  → All processes alive, display streaming

IDLE: User disconnected, no activity for 30 min
  → Trigger: VNC session closed + no terminal activity
  → Action: Optional auto-stop (configurable)

STOPPED: VM compute stopped, disk persists
  → No CPU/RAM billing
  → Disk billed at storage rate only
  → On reconnect: start VM (~20-30s boot), supervisord relaunches stack

TERMINATED: User deletes account or VM
  → Final snapshot taken
  → VM and disk destroyed
  → Snapshot retained 30 days for recovery
```

### 5.6 Security

| Requirement | Implementation |
|------------|---------------|
| TLS everywhere | NGINX with Let's Encrypt auto-renewal |
| Auth before VNC | Application gateway validates JWT/session cookie before serving noVNC page |
| VNC access tokens | Short-lived tokens (30 min TTL) generated per session, validated by websockify |
| VNC localhost only | x11vnc bound to localhost (-localhost flag), not accessible from network |
| Firewall | Only port 443 exposed. Ports 5900, 6080 blocked externally |
| VM isolation | Each user gets their own VM. No shared resources |
| Disk encryption | GCP default encryption at rest |
| Backup | Daily automated snapshots, 7-day retention |

### 5.7 tmux Integration (Optional Enhancement)

Wrap terminal PTY spawns in tmux for process persistence across foozol restarts:

**Files to modify:**
- `main/src/services/terminalPanelManager.ts` — terminal panel spawns
- `main/src/services/panels/cli/AbstractCliManager.ts` — Claude/Codex spawns

**Change:** ~50 lines. Replace `pty.spawn(shell, args, opts)` with `pty.spawn('tmux', ['new-session', '-A', '-s', panelId, shell, ...args], opts)`.

**Benefit:** If foozol crashes or is restarted by supervisord, terminal sessions survive and can be reattached.

**Note:** Not strictly required for MVP. foozol's existing `--resume` logic handles Claude session recovery. tmux adds resilience for interactive terminal sessions.

---

## 6. Implementation Plan

### Week 1: MVP

| Day | Task | Deliverable |
|-----|------|------------|
| **Day 1** | Build golden VM image | Packer/shell script that installs all packages, foozol, supervisord configs |
| **Day 1** | Configure display stack | supervisord configs for Xvfb + x11vnc + websockify + fluxbox + foozol |
| **Day 2** | NGINX + TLS setup | NGINX config with Let's Encrypt, WebSocket proxy to websockify |
| **Day 2** | Auth gateway | Simple token-based auth: user hits `/connect`, gets VNC URL with token |
| **Day 3** | Terraform provisioning | Terraform configs to create/start/stop/destroy VMs per user on GCP |
| **Day 3** | Landing page + signup | Simple web page: GitHub OAuth → provision VM → redirect to noVNC |
| **Day 4** | Auto-stop on idle | Script that monitors VNC connections, stops VM after 30min idle |
| **Day 4** | Auto-start on connect | Endpoint that starts stopped VM, waits for boot, redirects to noVNC |
| **Day 5** | Backup automation | GCP snapshot schedule: daily backups, 7-day retention |
| **Day 5** | Testing + polish | End-to-end flow: signup → provision → connect → use → disconnect → reconnect |

### Phase 2: WebSocket Migration (Future, 2-3 weeks)

| Task | Effort | Impact |
|------|--------|--------|
| Convert IPC handlers to HTTP/WebSocket | 1-2 weeks | Enables web frontend |
| xterm.js WebSocket terminal streaming | 2-3 days | Native terminal in browser |
| Web frontend (strip Electron) | 3-5 days | React app served as normal web page |
| Native clipboard support | Free | Comes with web frontend |
| Reconnection/resume over WebSocket | 2-3 days | Handles disconnects gracefully |

### Phase 3: Multi-VM / Scaling (Future)

| Feature | Description |
|---------|-------------|
| User dashboard | Web UI to manage VM (start/stop/resize/delete) |
| VM migration | Move user state between VMs (requires external DB) |
| Region selection | Let users pick closest GCP region |
| Shared VMs | Multiple users on one VM (cost savings, adds complexity) |
| Usage-based billing | Track active hours, bill accordingly |

---

## 7. Metrics & Success Criteria

### MVP Success

- [ ] User can sign up and access foozol in browser within 2 minutes
- [ ] Sessions survive browser close and reconnect
- [ ] Auth (GitHub + Claude) works identically to local
- [ ] VM cost stays at or under $26/user/month (on-demand, no CUD)
- [ ] VM boots from stopped state in under 45 seconds
- [ ] Daily backups running with successful restores tested

### Phase 2 Success

- [ ] Clipboard copy/paste works natively
- [ ] Terminal latency under 20ms
- [ ] Bandwidth per user under 100 Kbps average
- [ ] Mobile browser usable for basic monitoring

---

## 8. Known Tradeoffs & Risks

### Accepted for MVP

| Tradeoff | Impact | Mitigation |
|----------|--------|------------|
| **Clipboard doesn't pass through** | Users must use noVNC clipboard sidebar | Document in onboarding. Fix in Phase 2 |
| **30-200ms input latency** | Noticeable for fast typists | Acceptable for AI-assisted coding (waiting on Claude anyway) |
| **2-5 Mbps bandwidth** | Higher cost than text streaming | Acceptable for MVP. Fix in Phase 2 |
| **Browser keyboard conflicts** | Cmd+W/T/Q intercepted by browser | Document alternative shortcuts. Fix in Phase 2 |
| **Linux UI for Mac users** | Ctrl instead of Cmd in shortcuts | Minor UX issue. foozol already handles both |

### Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| noVNC latency makes typing unbearable | Medium | High | Test early. If unacceptable, fast-track Phase 2 |
| GCP costs exceed $20/user | Low | Medium | Stop/start scheduling. CUD commitments |
| Users confused by clipboard | High | Medium | Clear onboarding guide. Phase 2 priority |
| VM boot time too slow (>60s) | Low | Low | Pre-warm VMs. Use GCP suspend instead of stop |
| Security breach via exposed noVNC | Low | Critical | Multi-layer security (TLS + auth + tokens + firewall) |

---

## 9. Open Questions

1. **Hetzner vs GCP/AWS?** Hetzner is 3-5x cheaper but EU-only for best pricing. Need to test if EU latency (~80-120ms) + noVNC latency (~30-80ms) is acceptable. Could offer region choice in future.

2. **Always-on vs stop/start?** On Hetzner, always-on is so cheap ($18/mo) that stop/start automation isn't worth the complexity. On GCP/AWS, stop/start is necessary to hit budget but adds 20-30s boot time. Could offer as user toggle.

3. **ARM compatibility?** Hetzner CAX31 (ARM) is cheapest at ~$14/mo but need to verify Electron + node-pty + Claude Code all run on ARM64 Linux. If yes, significant savings.

4. **foozol updates on VMs?** How to push new foozol versions to existing user VMs? Options: apt repo, auto-updater, VM image rebuild + migration.

5. **Billing model?** Flat monthly fee (~$25 to cover cost + margin)? Usage-based? Included with foozol subscription?

6. **Hetzner API for Terraform?** Hetzner has a Terraform provider (`hetznercloud/hcloud`). Need to verify it supports all needed operations (create, snapshot, rebuild).

---

## 10. Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Display streaming | noVNC (Phase 1) → WebSocket (Phase 2) | noVNC ships in days, WebSocket is the right long-term architecture |
| VM provider | Hetzner Cloud (MVP) / GCP (US users) | Hetzner CX42 at ~$18/mo hits $20 budget. GCP as fallback for US-based users needing low latency |
| Provisioning | Terraform | Infrastructure as code. Reproducible. Both Hetzner and GCP have Terraform providers |
| VM specs | 8 vCPU / 16GB RAM / 160GB NVMe (Hetzner) | 16GB for terminal-heavy workloads. 160GB included, no extra cost |
| Auth approach | Same as local (via noVNC desktop) | Zero code changes. User already knows the flow. Not headless — full display via Xvfb |
| Backup strategy | Daily VM snapshots | Simple, automated, captures everything. ~$2/mo |
| Persistence | VM filesystem (no external DB) | Simplest architecture. 1 user = 1 VM = 1 filesystem |
| tmux | Optional enhancement, not MVP | foozol's existing --resume logic handles most recovery |
| External DB / VM migration | Deferred to Phase 3 | Adds significant complexity. Not needed when 1 user = 1 VM |
| VM spin up/down on demand | Deferred to future | Would require external DB for state. For now, always-on VMs on Hetzner are cheap enough |
