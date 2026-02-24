import type { ILinkProvider, Terminal } from '@xterm/xterm';

export interface LinkMatch {
  text: string;
  startIndex: number;
  endIndex: number;
  type: 'file' | 'git-sha' | 'issue';
  // For file links
  filePath?: string;
  lineNumber?: number;
  columnNumber?: number;
  // For git links
  sha?: string;
  issueNumber?: number;
  repo?: string; // org/repo format
}

export interface LinkProviderConfig {
  terminal: Terminal;
  workingDirectory: string;
  githubRemoteUrl?: string; // e.g., "https://github.com/org/repo"
  onShowTooltip: (event: MouseEvent, text: string, hint: string) => void;
  onHideTooltip: () => void;
  onShowFilePopover: (event: MouseEvent, filePath: string, line?: number) => void;
  onOpenUrl: (url: string) => void;
}

export type CreateLinkProvider = (config: LinkProviderConfig) => ILinkProvider;
