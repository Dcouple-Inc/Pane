import { useState, useEffect } from 'react';
import { NotificationSettings } from './NotificationSettings';
import { useNotifications } from '../hooks/useNotifications';
import { API } from '../utils/api';
import type { AppConfig } from '../types/config';
import { useConfigStore } from '../stores/configStore';
import {
  Shield,
  ShieldOff,
  Sun,
  Moon,
  Settings as SettingsIcon,
  Palette,
  Zap,
  RefreshCw,
  FileText,
  Eye,
  BarChart3,
  Activity,
  ChevronUp,
  ChevronDown,
  Terminal,
  Cloud,
  Trash2,
  Copy,
  Check
} from 'lucide-react';
import { Input, Textarea, Checkbox } from './ui/Input';
import { Button } from './ui/Button';
import { useTheme } from '../contexts/ThemeContext';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/Modal';
import { CollapsibleCard } from './ui/CollapsibleCard';
import { SettingsSection } from './ui/SettingsSection';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Settings({ isOpen, onClose }: SettingsProps) {
  const [_config, setConfig] = useState<AppConfig | null>(null);
  const [verbose, setVerbose] = useState(false);
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState('');
  const [claudeExecutablePath, setClaudeExecutablePath] = useState('');
  const [defaultPermissionMode, setDefaultPermissionMode] = useState<'approve' | 'ignore'>('ignore');
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(true);
  const [devMode, setDevMode] = useState(false);
  const [additionalPathsText, setAdditionalPathsText] = useState('');
  const [platform, setPlatform] = useState<string>('darwin');
  const [enableCommitFooter, setEnableCommitFooter] = useState(true);
  const [disableAutoContext, setDisableAutoContext] = useState(false);
  const [uiScale, setUiScale] = useState(1.0);
  const [notificationSettings, setNotificationSettings] = useState({
    enabled: true,
    playSound: true,
    notifyOnStatusChange: true,
    notifyOnWaiting: true,
    notifyOnComplete: true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'notifications' | 'analytics'>('general');
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [previousAnalyticsEnabled, setPreviousAnalyticsEnabled] = useState(true);
  const [preferredShell, setPreferredShell] = useState<string>('auto');
  const [availableShells, setAvailableShells] = useState<Array<{id: string; name: string; path: string}>>([]);
  const [cloudProvider] = useState<'gcp'>('gcp');
  const [cloudApiToken, setCloudApiToken] = useState('');
  const [cloudServerId, setCloudServerId] = useState('');
  const [cloudServerIp, setCloudServerIp] = useState('');
  const [cloudVncPassword, setCloudVncPassword] = useState('');
  const [vncPasswordCopied, setVncPasswordCopied] = useState(false);
  const [cloudRegion, setCloudRegion] = useState('');
  const [cloudGcpProjectId, setCloudGcpProjectId] = useState('');
  const [cloudGcpZone, setCloudGcpZone] = useState('');
  const [cloudTunnelPort, setCloudTunnelPort] = useState('8080');
  const { updateSettings } = useNotifications();
  const { theme, toggleTheme } = useTheme();
  const { fetchConfig: refreshConfigStore } = useConfigStore();

  useEffect(() => {
    if (isOpen) {
      // Get platform first, then fetch config (needed for Windows shell detection)
      window.electronAPI.getPlatform().then((p) => {
        setPlatform(p);
        fetchConfig(p);
      });
    }
  }, [isOpen]);

  const fetchConfig = async (currentPlatform?: string) => {
    try {
      const response = await API.config.get();
      if (!response.success) throw new Error(response.error || 'Failed to fetch config');
      const data = response.data;
      setConfig(data);
      setVerbose(data.verbose || false);
      setAnthropicApiKey(data.anthropicApiKey || '');
      setGlobalSystemPrompt(data.systemPromptAppend || '');
      setClaudeExecutablePath(data.claudeExecutablePath || '');
      setDefaultPermissionMode(data.defaultPermissionMode || 'ignore');
      setAutoCheckUpdates(data.autoCheckUpdates !== false); // Default to true
      setDevMode(data.devMode || false);
      setEnableCommitFooter(data.enableCommitFooter !== false); // Default to true
      setDisableAutoContext(data.disableAutoContext || false);
      setUiScale(data.uiScale || 1.0);

      // Load additional paths
      const paths = data.additionalPaths || [];
      setAdditionalPathsText(paths.join('\n'));

      // Load notification settings
      if (data.notifications) {
        setNotificationSettings(data.notifications);
        // Update the useNotifications hook with loaded settings
        updateSettings(data.notifications);
      }

      // Load analytics settings
      if (data.analytics) {
        const enabled = data.analytics.enabled !== false; // Default to true
        setAnalyticsEnabled(enabled);
        setPreviousAnalyticsEnabled(enabled);
      }

      // Fetch available shells on Windows
      const platformToCheck = currentPlatform || platform;
      if (platformToCheck === 'win32') {
        const shellsResponse = await API.config.getAvailableShells();
        if (shellsResponse.success) {
          setAvailableShells(shellsResponse.data);
        }
      }
      setPreferredShell(data.preferredShell || 'auto');

      // Load cloud settings
      if (data.cloud) {
        // Provider is always GCP (IAP-secured)
        setCloudApiToken(data.cloud.apiToken || '');
        setCloudServerId(data.cloud.serverId || '');
        setCloudServerIp(data.cloud.serverIp || '');
        setCloudVncPassword(data.cloud.vncPassword || '');
        setCloudRegion(data.cloud.region || '');
        setCloudGcpProjectId(data.cloud.projectId || '');
        setCloudGcpZone(data.cloud.zone || '');
        setCloudTunnelPort(String(data.cloud.tunnelPort || 8080));
      }
    } catch (err) {
      setError('Failed to load configuration');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Parse the additional paths text into an array
      const parsedPaths = additionalPathsText
        .split('\n')
        .map(p => p.trim())
        .filter(p => p.length > 0);
      
      // Track analytics opt-in/opt-out events if the preference changed
      if (previousAnalyticsEnabled !== analyticsEnabled) {
        if (analyticsEnabled) {
          // User opted back in
          await window.electronAPI.analytics.trackUIEvent({
            event: 'analytics_opted_in',
            properties: {}
          });
        } else {
          // User opted out - send final event before disabling
          await window.electronAPI.analytics.trackUIEvent({
            event: 'analytics_opted_out',
            properties: {}
          });
        }
      }

      const response = await API.config.update({
        verbose,
        anthropicApiKey,
        systemPromptAppend: globalSystemPrompt,
        claudeExecutablePath,
        defaultPermissionMode,
        autoCheckUpdates,
        devMode,
        enableCommitFooter,
        disableAutoContext,
        uiScale,
        additionalPaths: parsedPaths,
        notifications: notificationSettings,
        analytics: {
          enabled: analyticsEnabled
        },
        preferredShell,
        cloud: cloudApiToken ? {
          provider: cloudProvider,
          apiToken: cloudApiToken,
          serverId: cloudServerId || undefined,
          serverIp: cloudServerIp || undefined,
          vncPassword: cloudVncPassword || undefined,
          region: cloudRegion || undefined,
          projectId: cloudGcpProjectId || undefined,
          zone: cloudGcpZone || undefined,
          tunnelPort: parseInt(cloudTunnelPort, 10) || 8080,
        } : undefined,
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to update configuration');
      }

      // Update the useNotifications hook with new settings
      updateSettings(notificationSettings);

      // Refresh config from server
      await fetchConfig();

      // Also refresh the global config store
      await refreshConfigStore();

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update configuration');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" showCloseButton={false}>
      <ModalHeader
        title="foozol Settings"
        icon={<SettingsIcon className="w-5 h-5" />}
        onClose={onClose}
      />

      <ModalBody>
        {/* Tabs */}
        <div className="flex border-b border-border-primary mb-8">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'general'
                ? 'text-interactive border-b-2 border-interactive bg-interactive/5'
                : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'notifications'
                ? 'text-interactive border-b-2 border-interactive bg-interactive/5'
                : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            Notifications
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'analytics'
                ? 'text-interactive border-b-2 border-interactive bg-interactive/5'
                : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            Analytics
          </button>
        </div>

        {activeTab === 'general' && (
          <form id="settings-form" onSubmit={handleSubmit} className="space-y-6">
            {/* Appearance */}
            <CollapsibleCard
              title="Appearance & Theme"
              subtitle="Customize how foozol looks and feels"
              icon={<Palette className="w-5 h-5" />}
              defaultExpanded={true}
            >
              <SettingsSection
                title="Theme Mode"
                description="Choose between light and dark theme"
                icon={theme === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              >
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="flex items-center gap-3 px-4 py-3 bg-surface-secondary hover:bg-surface-hover rounded-lg transition-colors border border-border-secondary w-full"
                >
                  {theme === 'light' ? (
                    <>
                      <Sun className="w-5 h-5 text-status-warning" />
                      <span className="text-text-primary font-medium">Light Mode</span>
                      <span className="ml-auto text-xs text-text-tertiary">Currently active</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-5 h-5 text-interactive" />
                      <span className="text-text-primary font-medium">Dark Mode</span>
                      <span className="ml-auto text-xs text-text-tertiary">Currently active</span>
                    </>
                  )}
                </button>
              </SettingsSection>

              <SettingsSection
                title="UI Scale"
                description="Adjust the size of all UI elements for better readability"
                icon={<Eye className="w-4 h-4" />}
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const newScale = Math.round((uiScale - 0.1) * 10) / 10;
                        if (newScale >= 0.8) {
                          setUiScale(newScale);
                          API.config.update({ uiScale: newScale });
                        }
                      }}
                      disabled={uiScale <= 0.8}
                      className="p-1.5 rounded-md bg-surface-tertiary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-medium text-text-primary w-12 text-center">
                      {uiScale.toFixed(1)}x
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const newScale = Math.round((uiScale + 0.1) * 10) / 10;
                        if (newScale <= 1.5) {
                          setUiScale(newScale);
                          API.config.update({ uiScale: newScale });
                        }
                      }}
                      disabled={uiScale >= 1.5}
                      className="p-1.5 rounded-md bg-surface-tertiary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {[0.8, 1.0, 1.2, 1.5].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setUiScale(preset);
                          API.config.update({ uiScale: preset });
                        }}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                          uiScale === preset
                            ? 'bg-interactive text-white border-interactive'
                            : 'bg-surface-secondary text-text-secondary border-border-secondary hover:bg-surface-hover'
                        }`}
                      >
                        {preset.toFixed(1)}x
                      </button>
                    ))}
                  </div>
                </div>
              </SettingsSection>
            </CollapsibleCard>

            {/* AI Integration */}
            <CollapsibleCard
              title="AI Integration"
              subtitle="Configure Claude integration and smart features"
              icon={<Zap className="w-5 h-5" />}
              defaultExpanded={true}
            >
              <SettingsSection
                title="Smart Session Names"
                description="Let Claude automatically generate meaningful names for your sessions"
                icon={<FileText className="w-4 h-4" />}
              >
                <Input
                  label="Anthropic API Key"
                  type="password"
                  value={anthropicApiKey}
                  onChange={(e) => setAnthropicApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  fullWidth
                  helperText="Optional: Used only for generating session names. Your main Claude Code API key is separate."
                />
              </SettingsSection>

              <SettingsSection
                title="Default Security Mode"
                description="How Claude should handle potentially risky operations"
                icon={defaultPermissionMode === 'approve' ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
              >
                <div className="space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-surface-hover transition-colors border border-border-secondary">
                    <input
                      type="radio"
                      name="defaultPermissionMode"
                      value="ignore"
                      checked={defaultPermissionMode === 'ignore'}
                      onChange={(e) => setDefaultPermissionMode(e.target.value as 'ignore' | 'approve')}
                      className="text-interactive mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <ShieldOff className="w-4 h-4 text-text-tertiary" />
                        <span className="text-sm font-medium text-text-primary">Fast & Flexible</span>
                        <span className="ml-auto px-2 py-0.5 text-xs bg-status-warning/20 text-status-warning rounded-full">Default</span>
                      </div>
                      <p className="text-xs text-text-tertiary leading-relaxed">
                        Claude executes commands quickly without asking permission. Great for development workflows.
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-surface-hover transition-colors border border-border-secondary">
                    <input
                      type="radio"
                      name="defaultPermissionMode"
                      value="approve"
                      checked={defaultPermissionMode === 'approve'}
                      onChange={(e) => setDefaultPermissionMode(e.target.value as 'ignore' | 'approve')}
                      className="text-interactive mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Shield className="w-4 h-4 text-status-success" />
                        <span className="text-sm font-medium text-text-primary">Secure & Controlled</span>
                      </div>
                      <p className="text-xs text-text-tertiary leading-relaxed">
                        Claude asks for your approval before running potentially risky commands. Safer for production code.
                      </p>
                    </div>
                  </label>
                </div>
              </SettingsSection>

              <SettingsSection
                title="Global Instructions"
                description="Add custom instructions that apply to all your projects"
                icon={<FileText className="w-4 h-4" />}
              >
                <Textarea
                  label="Global System Prompt"
                  value={globalSystemPrompt}
                  onChange={(e) => setGlobalSystemPrompt(e.target.value)}
                  placeholder="Always use TypeScript... Follow our team's coding standards..."
                  rows={3}
                  fullWidth
                  helperText="These instructions will be added to every Claude session across all projects."
                />
              </SettingsSection>

              <SettingsSection
                title="foozol Attribution"
                description="Add foozol branding to commit messages"
                icon={<FileText className="w-4 h-4" />}
              >
                <Checkbox
                  label="Include foozol footer in commits"
                  checked={enableCommitFooter}
                  onChange={(e) => setEnableCommitFooter(e.target.checked)}
                />
                <p className="text-xs text-text-tertiary mt-1">
                  When enabled, commits made through foozol will include a footer crediting foozol. This helps others know you're using foozol for AI-powered development.
                </p>
              </SettingsSection>

              <SettingsSection
                title="Automatic Context Tracking"
                description="Control whether Claude automatically runs /context after responses"
                icon={<Activity className="w-4 h-4" />}
              >
                <Checkbox
                  label="Disable automatic context tracking"
                  checked={disableAutoContext}
                  onChange={(e) => setDisableAutoContext(e.target.checked)}
                />
                <p className="text-xs text-text-tertiary mt-1">
                  When checked, foozol will not automatically run /context after each
                  Claude response. This reduces wait time and Claude quota usage.
                  You can still manually run /context when needed.
                </p>
              </SettingsSection>
            </CollapsibleCard>

            {/* Cloud VM */}
            <CollapsibleCard
              title="Cloud VM"
              subtitle="Run foozol on a persistent cloud VM"
              icon={<Cloud className="w-5 h-5" />}
              defaultExpanded={false}
            >
              <SettingsSection
                title="Cloud Provider"
                description="Google Cloud Platform with IAP-secured access (no public IP)"
                icon={<Cloud className="w-4 h-4" />}
              >
                <div className="p-3 rounded-lg bg-surface-secondary border border-border-secondary">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">Google Cloud Platform</span>
                    <span className="px-2 py-0.5 text-xs bg-status-success/20 text-status-success rounded-full">IAP Secured</span>
                  </div>
                  <p className="text-xs text-text-tertiary mt-1">e2-highmem-2 (2 vCPU, 16GB RAM) — access via IAP tunnel only, no public IP exposed</p>
                </div>
              </SettingsSection>

              <SettingsSection
                title="API Token"
                description="Your GCP service account key or access token"
                icon={<Shield className="w-4 h-4" />}
              >
                <Input
                  label="API Token"
                  type="password"
                  value={cloudApiToken}
                  onChange={(e) => setCloudApiToken(e.target.value)}
                  placeholder="GCP access token..."
                  fullWidth
                  helperText="Required to manage your cloud VM. Never shared or logged."
                />
              </SettingsSection>

              <SettingsSection
                title="Server Details"
                description="VM identifiers from your Terraform output"
                icon={<FileText className="w-4 h-4" />}
              >
                <div className="space-y-3">
                  <Input
                    label="Server ID"
                    value={cloudServerId}
                    onChange={(e) => setCloudServerId(e.target.value)}
                    placeholder="e.g. foozol-user123"
                    fullWidth
                    helperText="GCP instance name from terraform output"
                  />
                  <Input
                    label="Server IP"
                    value={cloudServerIp}
                    onChange={(e) => setCloudServerIp(e.target.value)}
                    placeholder="e.g. 203.0.113.42"
                    fullWidth
                    helperText="Public IPv4 address (auto-detected when VM starts)"
                  />
                  <div className="relative">
                    <Input
                      label="VNC Password"
                      type="password"
                      value={cloudVncPassword}
                      onChange={(e) => setCloudVncPassword(e.target.value)}
                      placeholder="VNC password..."
                      fullWidth
                      helperText="Password for noVNC access (set during VM setup)"
                    />
                    {cloudVncPassword && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(cloudVncPassword);
                          setVncPasswordCopied(true);
                          setTimeout(() => setVncPasswordCopied(false), 2000);
                        }}
                        className="absolute right-2 top-[30px] p-1.5 rounded hover:bg-surface-secondary transition-colors"
                        title="Copy password"
                      >
                        {vncPasswordCopied ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-text-secondary" />
                        )}
                      </button>
                    )}
                  </div>
                  <Input
                    label="Region"
                    value={cloudRegion}
                    onChange={(e) => setCloudRegion(e.target.value)}
                    placeholder="e.g. us-central1"
                    fullWidth
                  />
                  {cloudProvider === 'gcp' && (
                    <>
                      <Input
                        label="GCP Project ID"
                        value={cloudGcpProjectId}
                        onChange={(e) => setCloudGcpProjectId(e.target.value)}
                        placeholder="e.g. my-gcp-project"
                        fullWidth
                      />
                      <Input
                        label="GCP Zone"
                        value={cloudGcpZone}
                        onChange={(e) => setCloudGcpZone(e.target.value)}
                        placeholder="e.g. us-central1-a"
                        fullWidth
                      />
                      <Input
                        label="IAP Tunnel Port"
                        value={cloudTunnelPort}
                        onChange={(e) => setCloudTunnelPort(e.target.value)}
                        placeholder="8080"
                        fullWidth
                        helperText="Local port for IAP tunnel (default 8080). Must match --local-host-port in your gcloud tunnel command."
                      />
                    </>
                  )}
                </div>
              </SettingsSection>

              <SettingsSection
                title="Reset Cloud Configuration"
                description="Clear settings or destroy cloud infrastructure"
                icon={<Trash2 className="w-4 h-4" />}
              >
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-surface-secondary border border-border-secondary">
                    <p className="text-sm text-text-secondary mb-3">
                      Clear local settings only. Use this if infrastructure was already destroyed or you want to re-configure.
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setCloudApiToken('');
                        setCloudServerId('');
                        setCloudServerIp('');
                        setCloudVncPassword('');
                        setCloudRegion('');
                        setCloudGcpProjectId('');
                        setCloudGcpZone('');
                        setCloudTunnelPort('8080');
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Clear Local Settings
                    </Button>
                  </div>
                  <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                    <p className="text-sm text-text-secondary mb-2">
                      To fully destroy the cloud VM and clean up GCP resources, run:
                    </p>
                    <code className="block text-xs bg-surface-primary p-2 rounded border border-border-primary mb-2 font-mono">
                      bash cloud/scripts/setup-cloud.sh --destroy
                    </code>
                    <p className="text-xs text-text-tertiary">
                      This will run terraform destroy and delete the GCP project.
                    </p>
                  </div>
                </div>
              </SettingsSection>
            </CollapsibleCard>

            {/* System Updates */}
            <CollapsibleCard
              title="Updates & Maintenance"
              subtitle="Keep foozol up to date with the latest features"
              icon={<RefreshCw className="w-5 h-5" />}
              defaultExpanded={false}
            >
              <SettingsSection
                title="Automatic Updates"
                description="Stay current with new features and bug fixes"
                icon={<RefreshCw className="w-4 h-4" />}
              >
                <div className="flex items-center justify-between p-3 bg-surface-secondary rounded-lg border border-border-secondary">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      label="Check for updates automatically"
                      checked={autoCheckUpdates}
                      onChange={(e) => setAutoCheckUpdates(e.target.checked)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      try {
                        const response = await API.checkForUpdates();
                        if (response.success && response.data) {
                          if (response.data.hasUpdate) {
                            // Update will be shown via the version update event
                          } else {
                            alert('You are running the latest version of foozol!');
                          }
                        }
                      } catch (error) {
                        console.error('Failed to check for updates:', error);
                        alert('Failed to check for updates. Please try again later.');
                      }
                    }}
                  >
                    Check Now
                  </Button>
                </div>
                <p className="text-xs text-text-tertiary mt-2">
                  We check GitHub for new releases every 24 hours. Updates require manual installation.
                </p>
              </SettingsSection>
            </CollapsibleCard>

            {/* Advanced Options */}
            <CollapsibleCard
              title="Advanced Options"
              subtitle="Technical settings for power users"
              icon={<Eye className="w-5 h-5" />}
              defaultExpanded={false}
              variant="subtle"
            >
              <SettingsSection
                title="Debugging"
                description="Enable detailed logging for troubleshooting"
                icon={<FileText className="w-4 h-4" />}
              >
                <Checkbox
                  label="Enable verbose logging"
                  checked={verbose}
                  onChange={(e) => setVerbose(e.target.checked)}
                />
                <p className="text-xs text-text-tertiary mt-1">
                  Shows detailed logs for session creation and Claude Code execution. Useful for debugging issues.
                </p>
                
                <div className="mt-4">
                  <Checkbox
                    label="Enable dev mode"
                    checked={devMode}
                    onChange={(e) => setDevMode(e.target.checked)}
                  />
                  <p className="text-xs text-text-tertiary mt-1">
                    Adds a "Messages" tab to each session showing raw JSON responses from Claude Code. Useful for debugging and development.
                  </p>
                </div>
              </SettingsSection>

              <SettingsSection
                title="Additional PATH Directories"
                description="Add custom directories to the PATH environment variable"
                icon={<FileText className="w-4 h-4" />}
              >
                <Textarea
                  label=""
                  value={additionalPathsText}
                  onChange={(e) => setAdditionalPathsText(e.target.value)}
                  placeholder={
                    platform === 'win32' 
                      ? "C:\\tools\\bin\nC:\\Program Files\\MyApp\n%USERPROFILE%\\bin"
                      : platform === 'darwin'
                      ? "/opt/homebrew/bin\n/usr/local/bin\n~/bin\n~/.cargo/bin"
                      : "/usr/local/bin\n/opt/bin\n~/bin\n~/.local/bin"
                  }
                  rows={4}
                  fullWidth
                  helperText={
                    `Enter one directory path per line. These will be added to PATH for all tools.\n${
                      platform === 'win32' 
                        ? "Windows: Use backslashes (C:\\path) or forward slashes (C:/path). Environment variables like %USERPROFILE% are supported."
                        : "Unix/macOS: Use forward slashes (/path). The tilde (~) expands to your home directory."
                    }\nNote: Changes require restarting foozol to take full effect.`
                  }
                />
              </SettingsSection>

              {platform === 'win32' && (
                <SettingsSection
                  title="Terminal Shell"
                  description="Default shell for terminal panels"
                  icon={<Terminal className="w-4 h-4" />}
                >
                  <select
                    value={preferredShell}
                    onChange={(e) => setPreferredShell(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border-primary bg-surface-secondary text-text-primary focus:ring-2 focus:ring-interactive focus:border-interactive"
                  >
                    <option value="auto">Auto-detect (Git Bash preferred)</option>
                    {availableShells.map(shell => (
                      <option key={shell.id} value={shell.id}>{shell.name}</option>
                    ))}
                  </select>
                </SettingsSection>
              )}

              <SettingsSection
                title="Custom Claude Installation"
                description="Override the default Claude executable path"
                icon={<FileText className="w-4 h-4" />}
              >
                <div className="flex gap-2">
                  <input
                    id="claudeExecutablePath"
                    type="text"
                    value={claudeExecutablePath}
                    onChange={(e) => setClaudeExecutablePath(e.target.value)}
                    className="flex-1 px-3 py-2 border border-border-primary rounded-md focus:outline-none focus:ring-2 focus:ring-interactive text-text-primary bg-surface-secondary"
                    placeholder="/usr/local/bin/claude"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      const result = await API.dialog.openFile({
                        title: 'Select Claude Executable',
                        buttonLabel: 'Select',
                        properties: ['openFile'],
                        filters: [
                          { name: 'Executables', extensions: ['*'] }
                        ]
                      });
                      if (result.success && result.data) {
                        setClaudeExecutablePath(result.data);
                      }
                    }}
                  >
                    Browse
                  </Button>
                </div>
                <p className="text-xs text-text-tertiary mt-1">
                  Leave empty to use the 'claude' command from your system PATH.
                </p>
              </SettingsSection>
            </CollapsibleCard>

            {error && (
              <div className="text-status-error text-sm bg-status-error/10 border border-status-error/30 rounded-lg p-4">
                {error}
              </div>
            )}
          </form>
        )}
        
        {activeTab === 'notifications' && (
          <NotificationSettings
            settings={notificationSettings}
            onUpdateSettings={(updates) => {
              setNotificationSettings(prev => ({ ...prev, ...updates }));
            }}
          />
        )}

        {activeTab === 'analytics' && (
          <form id="analytics-form" onSubmit={handleSubmit} className="space-y-6">
            {/* Analytics Overview */}
            <CollapsibleCard
              title="About Analytics"
              subtitle="Help improve foozol by sharing anonymous usage data"
              icon={<BarChart3 className="w-5 h-5" />}
              defaultExpanded={true}
              variant="subtle"
            >
              <div className="space-y-4">
                <p className="text-sm text-text-secondary leading-relaxed">
                  foozol collects anonymous usage analytics to understand how the application is used and to help prioritize improvements. All data is completely anonymous and privacy-focused.
                </p>

                <div className="bg-surface-tertiary rounded-lg p-4 border border-border-secondary">
                  <h4 className="font-medium text-text-primary mb-3 text-sm">✅ What we track:</h4>
                  <ul className="space-y-1 text-xs text-text-secondary">
                    <li>• Feature usage patterns (which features are used)</li>
                    <li>• Session counts and statuses</li>
                    <li>• Git operation types (rebase, squash, etc.)</li>
                    <li>• UI interactions (view switches, button clicks)</li>
                    <li>• Error types (generic categories only)</li>
                    <li>• Performance metrics (categorized durations)</li>
                  </ul>
                </div>

                <div className="bg-status-error/10 rounded-lg p-4 border border-status-error/30">
                  <h4 className="font-medium text-text-primary mb-3 text-sm">❌ What we NEVER track:</h4>
                  <ul className="space-y-1 text-xs text-text-secondary">
                    <li>• Your prompts or AI responses</li>
                    <li>• File paths, names, or directory structures</li>
                    <li>• Project names or descriptions</li>
                    <li>• Git commit messages or code diffs</li>
                    <li>• Terminal output or commands</li>
                    <li>• Personal identifiers (emails, usernames, API keys)</li>
                  </ul>
                </div>

                <p className="text-xs text-text-tertiary italic">
                  You can opt-out at any time. When disabled, no analytics data will be collected or sent.
                </p>
              </div>
            </CollapsibleCard>

            {/* Analytics Settings */}
            <CollapsibleCard
              title="Analytics Settings"
              subtitle="Configure anonymous usage tracking"
              icon={<BarChart3 className="w-5 h-5" />}
              defaultExpanded={true}
            >
              <SettingsSection
                title="Enable Analytics"
                description="Allow foozol to collect anonymous usage data to improve the product"
                icon={<BarChart3 className="w-4 h-4" />}
              >
                <Checkbox
                  label="Enable anonymous analytics tracking"
                  checked={analyticsEnabled}
                  onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                />
                {!analyticsEnabled && (
                  <p className="text-xs text-status-warning mt-2">
                    Analytics is disabled. No data will be collected or sent.
                  </p>
                )}
                {analyticsEnabled && (
                  <p className="text-xs text-status-success mt-2">
                    Analytics is enabled. Thank you for helping improve foozol!
                  </p>
                )}
              </SettingsSection>
            </CollapsibleCard>

            {error && (
              <div className="text-status-error text-sm bg-status-error/10 border border-status-error/30 rounded-lg p-4">
                {error}
              </div>
            )}
          </form>
        )}

      </ModalBody>

      {/* Footer */}
      {(activeTab === 'general' || activeTab === 'notifications' || activeTab === 'analytics') && (
        <ModalFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type={activeTab === 'general' ? 'submit' : 'button'}
            form={activeTab === 'general' ? 'settings-form' : undefined}
            onClick={activeTab === 'notifications' ? (e) => handleSubmit(e as React.FormEvent) : undefined}
            disabled={isSubmitting}
            loading={isSubmitting}
            variant="primary"
          >
            Save Changes
          </Button>
        </ModalFooter>
      )}
    </Modal>
  );
}