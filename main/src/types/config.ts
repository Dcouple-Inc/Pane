export interface CustomCommand {
  name: string;
  command: string;
}

export interface AppConfig {
  verbose?: boolean;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  // Legacy fields for backward compatibility
  gitRepoPath?: string;
  systemPromptAppend?: string;
  runScript?: string[];
  // Custom claude executable path (for when it's not in PATH)
  claudeExecutablePath?: string;
  // Custom codex executable path (for when it's not in PATH)
  codexExecutablePath?: string;
  // Permission mode for all sessions
  defaultPermissionMode?: 'approve' | 'ignore';
  // Default model for new sessions
  defaultModel?: string;
  // Auto-check for updates
  autoCheckUpdates?: boolean;
  // Stravu MCP integration
  stravuApiKey?: string;
  stravuServerUrl?: string;
  // Theme preference
  theme?: 'light' | 'dark';
  // UI scale factor (0.75 to 1.5, default 1.0)
  uiScale?: number;
  // Notification settings
  notifications?: {
    enabled: boolean;
    playSound: boolean;
    notifyOnStatusChange: boolean;
    notifyOnWaiting: boolean;
    notifyOnComplete: boolean;
  };
  // Dev mode for debugging
  devMode?: boolean;
  // Additional paths to add to PATH environment variable
  additionalPaths?: string[];
  // Session creation preferences
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
  // Use interactive mode for Claude CLI (persistent process with stdin instead of spawn-per-message)
  useInteractiveMode?: boolean;
  // PostHog analytics settings
  analytics?: {
    enabled: boolean;
    posthogApiKey?: string;
    posthogHost?: string;
    distinctId?: string; // Random UUID for anonymous user identification
  };
  // User-defined custom commands for the Add Tool picker
  customCommands?: CustomCommand[];
  // Preferred shell for Windows terminals
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
    // Tunnel status set by external scripts (setup-cloud.sh)
    tunnelStatus?: 'off' | 'starting' | 'running' | 'error';
  };
}

export interface UpdateConfigRequest {
  verbose?: boolean;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  claudeExecutablePath?: string;
  codexExecutablePath?: string;
  systemPromptAppend?: string;
  defaultPermissionMode?: 'approve' | 'ignore';
  defaultModel?: string;
  autoCheckUpdates?: boolean;
  stravuApiKey?: string;
  stravuServerUrl?: string;
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
  additionalPaths?: string[];
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
  disableCommitFooter?: boolean;
  // Disable automatic context tracking after Claude responses
  disableAutoContext?: boolean;
  // Use interactive mode for Claude CLI (persistent process with stdin instead of spawn-per-message)
  useInteractiveMode?: boolean;
  // PostHog analytics settings
  analytics?: {
    enabled: boolean;
    posthogApiKey?: string;
    posthogHost?: string;
    distinctId?: string; // Random UUID for anonymous user identification
  };
  // User-defined custom commands for the Add Tool picker
  customCommands?: CustomCommand[];
  // Preferred shell for Windows terminals
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
    // Tunnel status set by external scripts (setup-cloud.sh)
    tunnelStatus?: 'off' | 'starting' | 'running' | 'error';
  };
}
