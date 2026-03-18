/**
 * HomePage Component
 *
 * Landing page displayed when no session is selected. Provides quick access to:
 * - Open an existing project
 * - Create a new project
 * - Clone a repository from GitHub
 * - Quick preferences (theme, UI scale, terminal shell)
 * - Recently active sessions across all projects
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useConfigStore } from '../stores/configStore';
import { useSessionStore } from '../stores/sessionStore';
import { useNavigationStore } from '../stores/navigationStore';
import { API } from '../utils/api';
import { Dropdown } from './ui/Dropdown';
import { Badge } from './ui/Badge';
import { AddProjectDialog } from './AddProjectDialog';
import { CloneFromGitHubDialog } from './CloneFromGitHubDialog';
import { formatDistanceToNow } from '../utils/timestampUtils';
import type { Project } from '../types/project';
import type { Session } from '../types/session';

// ─── Inline SVG Icons ────────────────────────────────────────────────────────

function FolderOpenIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v1" />
      <path d="M20.5 16.5L21 12h-6l-.5 4.5" />
      <path d="M3 12h18l-1.5 7H4.5L3 12z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function TerminalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function getStatusVariant(
  status: Session['status'],
): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (status) {
    case 'running':
      return 'success';
    case 'waiting':
      return 'warning';
    case 'error':
      return 'error';
    case 'initializing':
      return 'info';
    case 'completed_unviewed':
      return 'info';
    case 'stopped':
      return 'default';
    case 'ready':
      return 'default';
    default:
      return 'default';
  }
}

function getStatusLabel(status: Session['status']): string {
  switch (status) {
    case 'running':
      return 'Running';
    case 'waiting':
      return 'Waiting';
    case 'error':
      return 'Error';
    case 'initializing':
      return 'Initializing';
    case 'completed_unviewed':
      return 'New Activity';
    case 'stopped':
      return 'Stopped';
    case 'ready':
      return 'Ready';
    default:
      return status;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function OpenProjectCard({
  projects,
  onAddProject,
}: {
  projects: Project[];
  onAddProject: () => void;
}) {
  const navigateToProject = useNavigationStore(s => s.navigateToProject);

  // Build items: real projects + separator "Add Repository" item at the end
  const items = [
    ...projects.map(p => ({
      id: String(p.id),
      label: p.name,
      onClick: () => {
        API.projects.activate(String(p.id)).catch(() => {});
        navigateToProject(p.id);
      },
    })),
    // "Add Repository" as the last item so it auto-closes the dropdown on click
    {
      id: '__add_repository__',
      label: '+ Add Repository',
      onClick: onAddProject,
      variant: 'default' as const,
    },
  ];

  return (
    <Dropdown
      trigger={
        <div className="flex flex-col items-center justify-center gap-3 p-6 bg-surface-secondary rounded-lg hover:bg-surface-hover cursor-pointer transition-colors">
          <FolderOpenIcon className="w-8 h-8 text-text-secondary" />
          <span className="text-sm font-medium text-text-primary">Open Project</span>
        </div>
      }
      items={items}
      position="bottom-left"
      width="md"
    />
  );
}

// ─── Main HomePage component ──────────────────────────────────────────────────

export function HomePage() {
  const { sessions, setActiveSession } = useSessionStore();
  const { theme, setTheme } = useTheme();
  const { config, updateConfig } = useConfigStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showCloneDialog, setShowCloneDialog] = useState(false);

  // Platform and shell state for preferences
  const [platform, setPlatform] = useState<string>('');
  const [availableShells, setAvailableShells] = useState<Array<{id: string; name: string; path: string}>>([]);
  const [preferredShell, setPreferredShell] = useState<string>('auto');

  const uiScale = config?.uiScale ?? 1.0;

  const loadProjects = useCallback(async () => {
    try {
      const result = await API.projects.getAll();
      if (result.success && result.data) {
        setProjects(result.data as Project[]);
      }
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    void loadProjects();
    const handler = () => void loadProjects();
    window.addEventListener('project-changed', handler);
    return () => window.removeEventListener('project-changed', handler);
  }, [loadProjects]);

  // Fetch platform and available shells on mount
  useEffect(() => {
    window.electronAPI
      .getPlatform()
      .then(async (p) => {
        setPlatform(p);
        if (p === 'win32') {
          try {
            const shellsResponse = await API.config.getAvailableShells();
            if (shellsResponse.success) {
              setAvailableShells(shellsResponse.data);
            }
          } catch (error) {
            console.error('Failed to fetch available shells:', error);
          }
        }
      })
      .catch((error) => {
        console.error('Failed to get platform:', error);
      });
  }, []);

  // Sync preferredShell with config
  useEffect(() => {
    if (config?.preferredShell) {
      setPreferredShell(config.preferredShell);
    }
  }, [config?.preferredShell]);

  const handleScaleChange = async (delta: number) => {
    const newScale = Math.round((uiScale + delta) * 10) / 10;
    if (newScale >= 0.8 && newScale <= 1.5) {
      await updateConfig({ uiScale: newScale }).catch(() => {});
    }
  };

  const handleShellChange = async (shell: string) => {
    setPreferredShell(shell);
    await updateConfig({ preferredShell: shell as 'auto' | 'gitbash' | 'powershell' | 'pwsh' | 'cmd' }).catch(() => {});
  };

  // Recent sessions: those with a lastActivity timestamp, sorted desc, limited to 8
  const recentSessions = useMemo(() => {
    return sessions
      .filter((s): s is Session & { lastActivity: string } => !s.archived && typeof s.lastActivity === 'string')
      .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
      .slice(0, 8);
  }, [sessions]);

  const projectNameMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of projects) {
      map.set(p.id, p.name);
    }
    return map;
  }, [projects]);

  const navigateToSessions = useNavigationStore(s => s.navigateToSessions);

  const handleOpenSession = (session: Session) => {
    navigateToSessions();
    setActiveSession(session.id).catch(() => {});
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-bg-primary overflow-y-auto">
      <div className="w-full max-w-3xl space-y-10">

        {/* Action cards */}
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Get Started</h2>
          <div className="grid grid-cols-3 gap-4">
            <OpenProjectCard
              projects={projects}
              onAddProject={() => setShowAddProject(true)}
            />

            <button
              type="button"
              onClick={() => setShowAddProject(true)}
              className="flex flex-col items-center justify-center gap-3 p-6 bg-surface-secondary rounded-lg hover:bg-surface-hover cursor-pointer transition-colors text-left"
            >
              <PlusIcon className="w-8 h-8 text-text-secondary" />
              <span className="text-sm font-medium text-text-primary">New Project</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCloneDialog(true)}
              className="flex flex-col items-center justify-center gap-3 p-6 bg-surface-secondary rounded-lg hover:bg-surface-hover cursor-pointer transition-colors text-left"
            >
              <GitHubIcon className="w-8 h-8 text-text-secondary" />
              <span className="text-sm font-medium text-text-primary">Clone from GitHub</span>
            </button>
          </div>
        </div>

        {/* Quick Preferences */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Preferences</h2>

          {/* Theme */}
          <div className="flex items-center justify-between p-4 bg-surface-secondary rounded-lg">
            <span className="text-text-primary">Theme</span>
            <Dropdown
              trigger={
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-md bg-surface-tertiary hover:bg-surface-hover text-sm text-text-primary border border-border-secondary focus:outline-none focus:ring-2 focus:ring-interactive cursor-pointer flex items-center gap-2"
                >
                  <span>{theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'OLED Black'}</span>
                  <ChevronDownIcon className="w-3 h-3 text-text-tertiary" />
                </button>
              }
              items={[
                { id: 'light', label: 'Light', onClick: () => setTheme('light') },
                { id: 'dark', label: 'Dark', onClick: () => setTheme('dark') },
                { id: 'oled', label: 'OLED Black', onClick: () => setTheme('oled') },
              ]}
              selectedId={theme}
              position="bottom-right"
              width="sm"
            />
          </div>

          {/* UI Scale */}
          <div className="flex items-center justify-between p-4 bg-surface-secondary rounded-lg">
            <span className="text-text-primary">UI Scale</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleScaleChange(-0.1)}
                disabled={uiScale <= 0.8}
                className="p-1 rounded-md bg-surface-tertiary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronDownIcon className="w-4 h-4" />
              </button>
              <span className="text-sm text-text-secondary w-10 text-center">{uiScale.toFixed(1)}x</span>
              <button
                onClick={() => handleScaleChange(0.1)}
                disabled={uiScale >= 1.5}
                className="p-1 rounded-md bg-surface-tertiary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronUpIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Terminal Shell (Windows only) */}
          {platform === 'win32' && (
            <div className="flex items-center justify-between p-4 bg-surface-secondary rounded-lg">
              <div className="flex items-center gap-2">
                <TerminalIcon className="w-4 h-4 text-text-secondary" />
                <span className="text-text-primary">Terminal Shell</span>
              </div>
              <Dropdown
                trigger={
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-md bg-surface-tertiary hover:bg-surface-hover text-sm text-text-primary border border-border-secondary focus:outline-none focus:ring-2 focus:ring-interactive cursor-pointer flex items-center gap-2"
                  >
                    <span>{preferredShell === 'auto' ? 'Auto (Git Bash)' : availableShells.find(s => s.id === preferredShell)?.name ?? preferredShell}</span>
                    <ChevronDownIcon className="w-3 h-3 text-text-tertiary" />
                  </button>
                }
                items={[
                  { id: 'auto', label: 'Auto (Git Bash)', onClick: () => handleShellChange('auto') },
                  ...availableShells.map(shell => ({
                    id: shell.id,
                    label: shell.name,
                    onClick: () => handleShellChange(shell.id),
                  })),
                ]}
                selectedId={preferredShell}
                position="bottom-right"
                width="sm"
              />
            </div>
          )}
        </div>

        {/* Recent sessions */}
        {recentSessions.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-4">Recent Panes</h2>
            <div className="space-y-1">
              {recentSessions.map(session => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => handleOpenSession(session)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-surface-secondary rounded-lg hover:bg-surface-hover text-left transition-colors gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-text-primary truncate">
                      {session.name}
                    </span>
                    {session.projectId != null && projectNameMap.has(session.projectId) && (
                      <span className="block text-xs text-text-tertiary truncate">
                        {projectNameMap.get(session.projectId)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant={getStatusVariant(session.status)} size="sm">
                      {getStatusLabel(session.status)}
                    </Badge>
                    <span className="text-xs text-text-tertiary whitespace-nowrap">
                      {formatDistanceToNow(session.lastActivity)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {recentSessions.length === 0 && projects.length === 0 && (
          <p className="text-center text-sm text-text-tertiary">
            Select a project from the sidebar or create a new one to get started.
          </p>
        )}
      </div>

      {/* Dialogs */}
      <AddProjectDialog
        isOpen={showAddProject}
        onClose={() => setShowAddProject(false)}
      />
      <CloneFromGitHubDialog
        isOpen={showCloneDialog}
        onClose={() => setShowCloneDialog(false)}
      />
    </div>
  );
}
