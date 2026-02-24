<p align="center">
  <img src="frontend/src/assets/foozol-logo.svg" alt="foozol" width="120" height="120">
</p>

<h1 align="center">foozol</h1>

<p align="center">
  <strong>Run AI agents in parallel. Ship faster.</strong>
</p>

<p align="center">
  <a href="https://foozol.com">
    <img src="https://img.shields.io/badge/website-foozol.com-blue?style=flat-square" alt="Website">
  </a>
  <a href="https://discord.gg/BdMyubeAZn">
    <img src="https://img.shields.io/badge/discord-join-5865F2?style=flat-square&logo=discord&logoColor=white" alt="Discord">
  </a>
  <a href="https://github.com/parsakhaz/foozol/releases/latest">
    <img src="https://img.shields.io/github/v/release/parsakhaz/foozol?style=flat-square&color=blue" alt="Latest Release">
  </a>
  <a href="https://github.com/parsakhaz/foozol/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/parsakhaz/foozol?style=flat-square" alt="License">
  </a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" alt="Platform">
</p>

<p align="center">
  <a href="https://foozol.com">Website</a> •
  <a href="https://discord.gg/BdMyubeAZn">Discord</a> •
  <a href="#installation">Installation</a> •
  <a href="#features">Features</a> •
  <a href="#keyboard-shortcuts">Shortcuts</a> •
  <a href="#building">Building</a>
</p>

---

## What is foozol?

Stop waiting for AI agents to finish. Run Claude Code and Codex in parallel across isolated git worktrees. Work on multiple features at once. Merge when ready.

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

## Features

| Feature | Description |
|---------|-------------|
| **Terminal-First** | Quick-launch Terminal (Claude) and Terminal (Codex) from the toolbar |
| **Parallel Sessions** | Run multiple AI assistants simultaneously on different tasks |
| **Git Worktrees** | Each session is isolated in its own worktree - no conflicts |
| **Git Tree Sidebar** | Browse files, view changes, quick actions for rebase/squash |
| **Command Palette** | `⌘K` / `Ctrl+K` - Quick access to all commands |
| **Diff Viewer** | Review all changes before merging back to main |
| **Cross-Platform** | Works on macOS, Windows, and Linux |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Open Command Palette |
| `⌘Enter` / `Ctrl+Enter` | Send message to AI |
| `⌘N` / `Ctrl+N` | New session |
| `⌘,` / `Ctrl+,` | Open settings |
| `⌘1-9` / `Ctrl+1-9` | Switch between sessions |

---

## Installation

### Download

> **[Download Latest Release](https://github.com/parsakhaz/foozol/releases/latest)**

| Platform | File |
|----------|------|
| Windows (x64) | `foozol-x.x.x-Windows-x64.exe` |
| Windows (ARM) | `foozol-x.x.x-Windows-arm64.exe` |
| macOS (Universal) | `foozol-x.x.x-macOS-universal.dmg` |
| Linux (x64) | `foozol-x.x.x-linux-x86_64.AppImage` or `.deb` |
| Linux (ARM64) | `foozol-x.x.x-linux-arm64.AppImage` or `.deb` |

### Requirements

- **Git** - Required for worktree management
- **Claude Code** - `npm install -g @anthropic-ai/claude-code`
- **Codex** - `npm install -g @openai/codex`

---

## Usage

1. **Open foozol** and create or select a project
2. **Create a session** with your prompt
3. **Add Tool** → **Terminal (Claude)** or **Terminal (Codex)**
4. Use the **right sidebar** to browse git tree and quick actions
5. Press `⌘K` to open the **Command Palette** for quick navigation
6. Review diffs and merge back to main

---

## Building

```bash
git clone https://github.com/parsakhaz/foozol.git
cd foozol
pnpm run setup
pnpm run electron-dev
```

### Production

```bash
pnpm build:win    # Windows (x64 + ARM64)
pnpm build:mac    # macOS (universal)
pnpm build:linux  # Linux (x64 + ARM64)
```

### Releasing

```bash
pnpm run release patch   # 0.0.2 -> 0.0.3
pnpm run release minor   # 0.0.2 -> 0.1.0
pnpm run release major   # 0.0.2 -> 1.0.0
```

Bumps the version, tags, pushes, and triggers GitHub Actions to build and publish installers for all platforms to [GitHub Releases](https://github.com/parsakhaz/foozol/releases).

---

## License

[AGPL-3.0](LICENSE) - Free to use, modify, and distribute. If you deploy a modified version (including as a service), you must open source your changes.

---

<p align="center">
  <sub>Built by <a href="https://dcouple.ai">Dcouple Inc</a> — Decoupling humans from interfaces</sub>
</p>
