<p align="center">
  <img src="frontend/src/assets/foozol-logo.svg" alt="Pane" width="120" height="120">
</p>

<h1 align="center">Pane</h1>

<p align="center">
  <strong>Run any agent. Any OS. Ship faster.</strong>
</p>

<p align="center">
  Keyboard-first desktop app for running AI coding agents in parallel with built-in git workflow. Windows, Mac, Linux.
</p>

<p align="center">
  <a href="https://discord.gg/BdMyubeAZn">
    <img src="https://img.shields.io/badge/discord-join-5865F2?style=flat-square&logo=discord&logoColor=white" alt="Discord">
  </a>
  <a href="https://github.com/Dcouple-Inc/Pane/releases/latest">
    <img src="https://img.shields.io/github/v/release/Dcouple-Inc/Pane?style=flat-square&color=blue" alt="Latest Release">
  </a>
  <a href="https://github.com/Dcouple-Inc/Pane/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/Dcouple-Inc/Pane?style=flat-square" alt="License">
  </a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" alt="Platform">
</p>

<p align="center">
  <a href="https://discord.gg/BdMyubeAZn">Discord</a> •
  <a href="#installation">Install</a> •
  <a href="#features">Features</a> •
  <a href="#keyboard-shortcuts">Shortcuts</a> •
  <a href="#building-from-source">Build</a>
</p>

---

We're not an AI agent. We're not an IDE. We're not a terminal emulator.

We're an **agent manager** — a new category for a new workflow. The same way Superhuman is an email client (not an email provider), Pane is an agent client (not an agent provider). You bring the agents. We make them fly.

```
┌──────────────┬──────────────────────────────────────────┬─────────────────┐
│              │  Terminal (Claude)                       │                 │
│  Sessions    │  $ claude --dangerously-skip-permissions │   Git Tree      │
│              │  > Implementing feature X...             │                 │
│  ○ Feature A │                                          │   ├── src/      │
│  ○ Feature B ├──────────────────────────────────────────┤   ├── lib/      │
│  ○ Bug Fix   │  Terminal (Codex)                        │   └── test/     │
│              │  $ codex                                 │                 │
│              │  > Refactoring module Y...               │  Quick Actions  │
│              │                                          │  ⟳ Rebase       │
│              │  [Add Tool ▾]      [Git Actions ▾]       │  ⤵ Squash       │
└──────────────┴──────────────────────────────────────────┴─────────────────┘
                              ⌘K Command Palette
```

---

## Why Pane Exists

AI coding agents are incredible. Claude Code can work autonomously for hours. Codex can ship features end-to-end. Aider can refactor entire modules. The models are not the bottleneck.

**The way you interact with them is.**

Managing AI agents right now feels like air traffic control with a walkie-talkie. You're juggling terminal windows. Copy-pasting between tabs. Losing track of which agent is on which branch. Alt-tabbing between your diff viewer, your terminal, your git client, and your editor. The agents are fast — but your tools make you slow.

And then there's git worktrees. Everyone agrees worktrees are the right way to run parallel agents — isolated branches, no conflicts, clean separation. But actually using them? It's miserable. `git worktree add`, `git worktree remove`, remembering paths, tracking which worktree is on which branch, cleaning up stale ones, rebasing back to main, squashing commits before merging. Even experienced developers fumble the workflow. It's powerful infrastructure with terrible UX.

Pane makes worktrees invisible. You create a session, Pane creates the worktree. You delete a session, Pane cleans it up. You hit a shortcut, Pane rebases from main. You never type `git worktree` again. All the isolation benefits, none of the pain.

Pane fixes the interaction layer. It gives you a single, keyboard-driven surface to run multiple agents in parallel, each in its own isolated workspace, with git workflow built in. You see what every agent is doing. You switch between them instantly. You review diffs, commit, push, and rebase without leaving the app.

## How Pane Is Different

| | Pane | Conductor | Claude Squad | Cursor/Windsurf |
|---|---|---|---|---|
| **Platform** | Windows + Mac + Linux | Mac only | Unix only (needs tmux) | Windows + Mac |
| **Agent support** | Any CLI agent | Claude Code + Codex | Any (tmux-based) | Built-in only |
| **Interface** | Desktop app, keyboard-first | Desktop app, GUI-first | Terminal UI | IDE |
| **Git workflow** | Built-in (commit, push, rebase, merge, diff) | Worktrees + PR | Worktrees only | Editor-level |
| **Multi-agent parallel** | Yes | Yes | Yes | No |
| **Philosophy** | The cockpit | The dashboard | The multiplexer | The editor |

Every tool in the AI coding space either only works on Mac, only works with one agent, is a terminal hack that requires tmux, treats Windows as an afterthought, or wants to be your editor, your terminal, and your agent all at once.

Pane is the only tool that is a real desktop app, agent-agnostic, cross-platform with Windows as a first-class citizen, keyboard-first, and git-native. That combination doesn't exist anywhere else.

---

## Features

### Run Multiple AI Coding Agents in Parallel
Run Claude Code, Codex, Aider, Goose, or any CLI tool — side by side, each in its own git worktree. Work on multiple features at once. No conflicts. No stepping on each other. Merge when ready.

### Keyboard-First Interface
Every action has a keyboard shortcut. Switch between workspaces instantly. Navigate without touching the mouse. If you've used Superhuman, you know the feeling — every keystroke lands, every transition is instant.

### Built-In Git Workflow
Agents produce code. Code lives in git. Pane makes the loop seamless. View diffs with syntax highlighting. Commit, push, rebase, squash, merge — all from keyboard shortcuts. See file-level change statistics. Preview git commands before executing them.

### Agent-Agnostic
Pane doesn't embed or bundle any agent. It wraps any CLI tool that runs in a terminal. When a new AI coding agent launches tomorrow, you don't wait for Pane to "support" it. You just run it. This is a promise, not a feature.

### Cross-Platform — Actually
Not "Mac-first with a Windows waitlist." Not "Linux if you compile from source." Windows, Mac, and Linux. Same UI, same shortcuts, same speed. Built by developers who use Windows daily and feel the pain that Mac-first developers never see.

### Multiple Views
- **Output View** — Formatted terminal output with syntax highlighting
- **Diff View** — Git diff viewer with per-file change statistics
- **Terminal View** — Full xterm.js terminals with 50,000 line scrollback
- **Editor View** — File editor with syntax highlighting
- **Logs View** — Debug and session logs

### Tool Panel System
Run multiple terminal instances per session in separate panels. Create, switch, rename, and close panels dynamically. Panels only start processes when first viewed. State persists across app restarts.

### Session Management
Create sessions with templates. Archive instead of delete. Continue conversations with full history. AI-powered session naming. Real-time status tracking. Prompt history with search and one-click reuse.

### Notifications
Desktop and sound notifications for session status changes. Know when an agent is waiting for input, finished, or errored — without watching it.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Open Command Palette |
| `⌘Enter` / `Ctrl+Enter` | Send message to AI agent |
| `⌘N` / `Ctrl+N` | New session |
| `⌘,` / `Ctrl+,` | Open settings |
| `⌘1-9` / `Ctrl+1-9` | Switch between sessions |
| `Ctrl+B` | Toggle sidebar |

---

## Installation

### Download

> **[Download the Latest Release](https://github.com/Dcouple-Inc/Pane/releases/latest)**

| Platform | File |
|----------|------|
| Windows (x64) | `Pane-x.x.x-Windows-x64.exe` |
| Windows (ARM64) | `Pane-x.x.x-Windows-arm64.exe` |
| macOS (Universal) | `Pane-x.x.x-macOS-universal.dmg` |
| Linux (x64) | `Pane-x.x.x-linux-x86_64.AppImage` or `.deb` |
| Linux (ARM64) | `Pane-x.x.x-linux-arm64.AppImage` or `.deb` |

### Requirements

- **Git** installed and available in PATH
- At least one AI coding agent CLI installed:
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — `npm install -g @anthropic-ai/claude-code`
  - [Codex](https://github.com/openai/codex) — `npm install -g @openai/codex`
  - [Aider](https://aider.chat/) — `pip install aider-chat`
  - [Goose](https://github.com/block/goose) — or any other CLI agent

---

## Usage

1. **Open Pane** and create or select a project (any git repository)
2. **Create a session** — enter a prompt and pick your agent
3. **Add tools** — launch Terminal (Claude), Terminal (Codex), or any CLI tool
4. **Work in parallel** — create multiple sessions for different approaches
5. **Review diffs** — see what changed with the built-in diff viewer
6. **Ship** — commit, rebase, and merge from keyboard shortcuts

---

## The Windows Problem

The Windows developer experience for AI coding tools is broken across the board:

- **Claude Desktop on Windows** crashes repeatedly. Requires manual Hyper-V and Container feature enablement. Windows App Runtime dependencies aren't auto-installed.
- **Claude Code on Windows** is non-functional when your Windows username contains a period — standard in enterprise Active Directory environments.
- **Conductor** is Mac-only. No Windows version exists. The founder publicly said Windows support is "hopefully soon-ish."
- **Claude Squad** has a hard dependency on tmux, which doesn't exist on Windows.
- **Claude Code Agent Teams** requires tmux or iTerm2 for split panes. Explicitly not supported in VS Code terminal or Windows Terminal.

Windows has roughly 70% of the developer desktop market. Linux has another 5-10%. Mac has about 25%. The entire AI coding tool ecosystem is building for that 25%.

Pane is for the other 75%. And for Mac developers who want to choose their own agents.

---

## Design Principles

**Keyboard-first, always.** Every action has a shortcut. Power users never touch the mouse. New users discover shortcuts naturally. The keyboard isn't an alternative input — it's THE input.

**Agent-agnostic, forever.** We will never lock you into a single agent. Claude Code, Codex, Aider, Goose, your custom CLI tool — if it runs in a terminal, it runs in Pane.

**Cross-platform, actually.** The developer on a Surface Pro deserves the same tool as the developer on a MacBook Pro.

**Git-native, not git-adjacent.** Managing agent output IS managing git. The agent writes code. You review it. You commit it. That loop should be seamless.

**Speed is a feature.** If something takes more than 100ms, it's a bug. If an animation doesn't serve a purpose, remove it. If a UI element doesn't earn its pixels, it goes.

---

## Who Pane Is For

- **Developers on Windows and Linux** who are underserved by Mac-only AI coding tools
- **Multi-agent users** who run Claude Code, Codex, Aider, or Goose depending on the task and want one app to manage them all
- **Keyboard-driven developers** who want Superhuman-level speed in their AI-assisted coding workflow
- **Teams** where different engineers use different agents and need a consistent workflow layer
- **Anyone tired of juggling terminal windows**, alt-tabbing between diff viewers and git clients, or waiting for agents one at a time

## What Pane Is Not

Pane is not your editor. Not your terminal. Not your agent.

It replaces the chaos. The twelve terminal windows. The alt-tabbing. The mental overhead of tracking which agent is on which branch. The frustration of tools that don't work on your OS.

Pane replaces the mess with a single, fast, keyboard-driven surface.

---

## Adding Custom Agents

Pane supports any CLI tool that runs in a terminal. See the docs for extending it:

- [Adding New CLI Tools](./docs/ADDING_NEW_CLI_TOOLS.md)
- [Implementing New CLI Agents](./docs/IMPLEMENTING_NEW_CLI_AGENTS.md)

---

## Building from Source

```bash
git clone https://github.com/Dcouple-Inc/Pane.git
cd Pane
pnpm run setup
pnpm run electron-dev
```

### Production Builds

```bash
pnpm build:win    # Windows (x64 + ARM64)
pnpm build:mac    # macOS (Universal)
pnpm build:linux  # Linux (x64 + ARM64)
```

### Releasing

```bash
pnpm run release patch   # 0.0.2 -> 0.0.3
pnpm run release minor   # 0.0.2 -> 0.1.0
pnpm run release major   # 0.0.2 -> 1.0.0
```

Tags and pushes automatically. GitHub Actions builds and publishes installers for all platforms to [Releases](https://github.com/Dcouple-Inc/Pane/releases).

---

## License

[AGPL-3.0](LICENSE) — Free to use, modify, and distribute. If you deploy a modified version (including as a service), you must open source your changes.

---

<p align="center">
  <sub>Built by <a href="https://dcouple.ai">Dcouple Inc</a></sub>
</p>
