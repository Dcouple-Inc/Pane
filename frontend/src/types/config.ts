export interface CustomCommand {
  name: string;
  command: string;
}

export interface AppConfig {
  gitRepoPath: string;
  verbose?: boolean;
  anthropicApiKey?: string;
  systemPromptAppend?: string;
  runScript?: string[];
  claudeExecutablePath?: string;
  defaultPermissionMode?: 'approve' | 'ignore';
  autoCheckUpdates?: boolean;
  theme?: 'light' | 'dark';
  uiScale?: number;
  notifications?: {
    enabled: boolean;
    playSound: boolean;
    notifyOnStatusChange: boolean;
    notifyOnWaiting: boolean;
    notifyOnComplete: boolean;
  };
  devMode?: boolean;
  sessionCreationPreferences?: {
    sessionCount?: number;
    toolType?: 'claude' | 'codex' | 'none';
    selectedTools?: {
      claude?: boolean;
      codex?: boolean;
    };
    claudeConfig?: {
      model?: 'auto' | 'sonnet' | 'opus' | 'haiku';
      permissionMode?: 'ignore' | 'approve';
      ultrathink?: boolean;
    };
    codexConfig?: {
      model?: string;
      modelProvider?: string;
      approvalPolicy?: 'auto' | 'manual';
      sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
      webSearch?: boolean;
    };
    showAdvanced?: boolean;
    baseBranch?: string;
    commitModeSettings?: {
      mode?: 'checkpoint' | 'incremental' | 'single';
      checkpointPrefix?: string;
    };
  };
  // Pane commit footer setting (enabled by default)
  enableCommitFooter?: boolean;
  // Disable automatic context tracking after Claude responses
  disableAutoContext?: boolean;
  // PostHog analytics settings
  analytics?: {
    enabled: boolean;
    posthogApiKey?: string;
    posthogHost?: string;
  };
  // User-defined custom commands for the Add Tool picker
  customCommands?: CustomCommand[];
  // Preferred shell for terminal sessions on Windows
  preferredShell?: 'auto' | 'gitbash' | 'powershell' | 'pwsh' | 'cmd';
  // Cloud VM settings
  cloud?: {
    provider: 'gcp';
    apiToken: string;
    serverId?: string;
    serverIp?: string;
    vncPassword?: string;
    region?: string;
    projectId?: string;
    zone?: string;
    tunnelPort?: number;
  };
}
