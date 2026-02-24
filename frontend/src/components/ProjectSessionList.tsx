import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronDown, ChevronRight, Plus, GitBranch, MoreHorizontal, Home, Archive, ArchiveRestore, Pencil, Play, Trash2, Settings as SettingsIcon, FolderPlus, Loader2, Brain, Code2 } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import { useNavigationStore } from '../stores/navigationStore';
import { useHotkeyStore } from '../stores/hotkeyStore';
import { CreateSessionDialog } from './CreateSessionDialog';
import { Dropdown } from './ui/Dropdown';
import type { DropdownItem } from './ui/Dropdown';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';
import { EnhancedInput } from './ui/EnhancedInput';
import { FieldWithTooltip } from './ui/FieldWithTooltip';
import { Card } from './ui/Card';
import { TogglePillImproved } from './ui/TogglePillImproved';
import { API } from '../utils/api';
import { cycleIndex } from '../utils/arrayUtils';
import type { Session, GitStatus } from '../types/session';
import type { Project, CreateProjectRequest } from '../types/project';

const RUN_SCRIPT_PROMPT = `I use foozol to manage multiple AI coding sessions with git worktrees.
Each worktree needs its own dev server on a unique port.

Make the dev command intelligent:

1. **Worktree detection** - Auto-detect if running from main repo or a git worktree, resolve paths correctly
2. **Dynamic port allocation** - Assign unique, deterministic port using hash(cwd) % 1000 + base_port
3. **Port conflict resolution** - Check if port is in use and auto-resolve by incrementing
4. **Cross-platform** - Use Node.js (not bash) for Windows/macOS/Linux compatibility
5. **Smart dependency detection** - Auto-detect if deps need installing (compare package.json mtime vs node_modules)
6. **Build staleness check** - Auto-detect if build is stale (compare src mtime vs dist)
7. **Clean termination** - Handle Ctrl+C gracefully (use taskkill on Windows)
8. **Modify package.json directly** - Don't create separate shell scripts
9. **Auto-detect project type** - Look for package.json, requirements.txt, Cargo.toml, go.mod, etc.
10. **Clear output** - Print the URL/port being used so user knows where to access the app

First analyze the project structure, then implement the intelligent dev command.
This enables running 3+ instances of the same project in different worktrees with zero manual config.`;

interface ProjectSessionListProps {
  sessionSortAscending: boolean;
}

export function ProjectSessionList({ sessionSortAscending }: ProjectSessionListProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForProject, setCreateForProject] = useState<Project | null>(null);

  // Add project dialog state
  const [showAddProjectDialog, setShowAddProjectDialog] = useState(false);
  const [newProject, setNewProject] = useState<CreateProjectRequest>({ name: '', path: '', buildScript: '', runScript: '' });
  const [detectedBranch, setDetectedBranch] = useState<string | null>(null);
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  // AI-assisted run script state
  const [generateRunScript, setGenerateRunScript] = useState(true);
  const [selectedAiTool, setSelectedAiTool] = useState<'claude' | 'codex'>('claude');

  // Inline rename state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const sessions = useSessionStore(s => s.sessions);
  const activeSessionId = useSessionStore(s => s.activeSessionId);
  const setActiveSession = useSessionStore(s => s.setActiveSession);
  const navigateToSessions = useNavigationStore(s => s.navigateToSessions);
  const navigateToProject = useNavigationStore(s => s.navigateToProject);

  // Hotkey registration
  const register = useHotkeyStore(s => s.register);
  const unregister = useHotkeyStore(s => s.unregister);

  // Load projects
  const loadProjects = useCallback(async () => {
    try {
      const res = await API.projects.getAll();
      if (res.success && res.data) {
        setProjects(res.data);
      }
    } catch (e) {
      console.error('Failed to load projects:', e);
    }
  }, []);

  useEffect(() => {
    loadProjects();
    const handle = () => loadProjects();
    window.addEventListener('project-changed', handle);
    window.addEventListener('project-sessions-refresh', handle);
    return () => {
      window.removeEventListener('project-changed', handle);
      window.removeEventListener('project-sessions-refresh', handle);
    };
  }, [loadProjects]);

  // Group sessions by project
  const sessionsByProject = useMemo(() => {
    const map = new Map<number, Session[]>();
    sessions
      .filter(s => !s.archived)
      .forEach(s => {
        if (s.projectId != null) {
          const list = map.get(s.projectId) || [];
          list.push(s);
          map.set(s.projectId, list);
        }
      });
    map.forEach((list, key) => {
      map.set(key, list.sort((a, b) => {
        const da = new Date(a.createdAt).getTime();
        const db = new Date(b.createdAt).getTime();
        return sessionSortAscending ? da - db : db - da;
      }));
    });
    return map;
  }, [sessions, sessionSortAscending]);

  // Flat list of all visible sessions (for hotkey mapping)
  const allVisibleSessions = useMemo(() => {
    const result: Session[] = [];
    projects.forEach(p => {
      if (expandedProjects.has(p.id)) {
        const list = sessionsByProject.get(p.id) || [];
        result.push(...list);
      }
    });
    return result;
  }, [projects, expandedProjects, sessionsByProject]);

  // Flat list of ALL active sessions (for cycling - includes collapsed projects)
  const allActiveSessions = useMemo(() => {
    const result: Session[] = [];
    projects.forEach(p => {
      const list = sessionsByProject.get(p.id) || [];
      result.push(...list);
    });
    return result;
  }, [projects, sessionsByProject]);

  // Register ⌘1-⌘9 hotkeys with dynamic session name labels
  const allVisibleSessionsRef = useRef(allVisibleSessions);
  allVisibleSessionsRef.current = allVisibleSessions;
  const allActiveSessionsRef = useRef(allActiveSessions);
  allActiveSessionsRef.current = allActiveSessions;
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  const setActiveSessionRef = useRef(setActiveSession);
  setActiveSessionRef.current = setActiveSession;
  const navigateToSessionsRef = useRef(navigateToSessions);
  navigateToSessionsRef.current = navigateToSessions;
  const expandedProjectsRef = useRef(expandedProjects);
  expandedProjectsRef.current = expandedProjects;
  const setExpandedProjectsRef = useRef(setExpandedProjects);
  setExpandedProjectsRef.current = setExpandedProjects;

  // Build stable label key so we re-register when session names/projects change
  const sessionLabelKey = allVisibleSessions.slice(0, 9).map(s => `${s.name}:${s.projectId}`).join('|');
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  useEffect(() => {
    const ids: string[] = [];
    for (let i = 1; i <= 9; i++) {
      const id = `switch-session-${i}`;
      ids.push(id);
      const session = allVisibleSessionsRef.current[i - 1];
      let label = `Switch to session ${i}`;
      if (session) {
        const project = projectsRef.current.find(p => p.id === session.projectId);
        label = project
          ? `Switch to ${session.name} (${project.name})`
          : `Switch to ${session.name}`;
      }
      const idx = i - 1;
      register({
        id,
        label,
        keys: `mod+${i}`,
        category: 'session',
        enabled: () => !!allVisibleSessionsRef.current[idx],
        action: () => {
          const s = allVisibleSessionsRef.current[idx];
          if (s) {
            setActiveSessionRef.current(s.id);
            navigateToSessionsRef.current();
          }
        },
      });
    }
    return () => ids.forEach(id => unregister(id));
  }, [register, unregister, sessionLabelKey]);

  // Session cycling: navigates to next/prev session across ALL active sessions
  // (not just visible ones from expanded projects). Auto-expands collapsed
  // projects when cycling to their sessions so users can see the selection.
  const cycleSession = useCallback((direction: 'next' | 'prev') => {
    const sessions = allActiveSessionsRef.current;
    if (sessions.length === 0) return;

    const currentId = activeSessionIdRef.current;
    const currentIndex = sessions.findIndex(s => s.id === currentId);
    const nextIndex = cycleIndex(currentIndex, sessions.length, direction);
    if (nextIndex === -1) return;

    const nextSession = sessions[nextIndex];

    // Auto-expand the project if it's collapsed
    if (nextSession.projectId != null && !expandedProjectsRef.current.has(nextSession.projectId)) {
      setExpandedProjectsRef.current(prev => {
        const next = new Set(prev);
        next.add(nextSession.projectId!);
        return next;
      });
    }

    setActiveSessionRef.current(nextSession.id);
    navigateToSessionsRef.current();
  }, []);

  // Register session cycling hotkeys
  useEffect(() => {
    const nextKeys = ['mod+shift+Tab', 'mod+ArrowDown'];
    const prevKeys = ['mod+Tab', 'mod+ArrowUp'];
    const ids: string[] = [];

    nextKeys.forEach((keys, i) => {
      const id = `cycle-session-next-${i}`;
      ids.push(id);
      register({
        id,
        label: 'Next Session',
        keys,
        category: 'session',
        enabled: () => allActiveSessionsRef.current.length > 1,
        action: () => cycleSession('next'),
      });
    });

    prevKeys.forEach((keys, i) => {
      const id = `cycle-session-prev-${i}`;
      ids.push(id);
      register({
        id,
        label: 'Previous Session',
        keys,
        category: 'session',
        enabled: () => allActiveSessionsRef.current.length > 1,
        action: () => cycleSession('prev'),
      });
    });

    return () => ids.forEach(id => unregister(id));
  }, [register, unregister, cycleSession]);

  // Auto-expand projects with active session or that have sessions
  useEffect(() => {
    const toExpand = new Set<number>();
    if (activeSessionId) {
      const s = sessions.find(s => s.id === activeSessionId);
      if (s?.projectId != null) toExpand.add(s.projectId);
    }
    projects.forEach(p => {
      if ((sessionsByProject.get(p.id)?.length ?? 0) > 0) {
        toExpand.add(p.id);
      }
    });
    if (toExpand.size > 0) {
      setExpandedProjects(prev => {
        const next = new Set(prev);
        toExpand.forEach(id => next.add(id));
        return next;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.length]);

  const toggleProject = (id: number) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSessionClick = (sessionId: string) => {
    setActiveSession(sessionId);
    navigateToSessions();
  };

  const handleNewSession = (project: Project) => {
    setCreateForProject(project);
    setShowCreateDialog(true);
  };

  // Session operations
  const handleArchiveSession = async (sessionId: string) => {
    try {
      await API.sessions.delete(sessionId);
    } catch (e) {
      console.error('Failed to archive session:', e);
    }
  };

  const handleContinueSession = (sessionId: string) => {
    setActiveSession(sessionId);
    navigateToSessions();
    // The session view will handle showing the input for continuation
  };

  const handleRenameSession = async (sessionId: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      await API.sessions.rename(sessionId, newName.trim());
    } catch (e) {
      console.error('Failed to rename session:', e);
    }
    setEditingSessionId(null);
    setEditingName('');
  };

  // Project operations
  const detectCurrentBranch = async (path: string) => {
    if (!path) { setDetectedBranch(null); return; }
    try {
      const response = await API.projects.detectBranch(path);
      if (response.success && response.data) {
        setDetectedBranch(response.data);
      }
    } catch {
      setDetectedBranch(null);
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.name || !newProject.path) {
      setShowValidationErrors(true);
      return;
    }
    try {
      // Set run script path if AI generation is enabled
      const projectToCreate = {
        ...newProject,
        active: false,
        runScript: generateRunScript ? './foozol-run.sh' : newProject.runScript
      };

      const response = await API.projects.create(projectToCreate);
      if (!response.success || !response.data) {
        console.error('Failed to create project:', response.error);
        return;
      }

      const newProjectId = response.data.id;

      // Store pending AI prompt if enabled
      if (generateRunScript) {
        localStorage.setItem(`pending-ai-prompt-${newProjectId}`, JSON.stringify({
          aiTool: selectedAiTool,
          prompt: RUN_SCRIPT_PROMPT
        }));
      }

      // Reset form state
      setShowAddProjectDialog(false);
      setNewProject({ name: '', path: '', buildScript: '', runScript: '' });
      setDetectedBranch(null);
      setShowValidationErrors(false);
      setGenerateRunScript(true);
      setSelectedAiTool('claude');

      // Refresh projects list
      loadProjects();

      // Navigate to the new project
      navigateToProject(newProjectId);
    } catch (e) {
      console.error('Failed to create project:', e);
    }
  };

  const handleDeleteProject = async (projectId: number) => {
    try {
      await API.projects.delete(String(projectId));
      loadProjects();
    } catch (e) {
      console.error('Failed to delete project:', e);
    }
  };

  // Compute global index for each session (for hotkey labels)
  const globalSessionIndex = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    projects.forEach(p => {
      if (expandedProjects.has(p.id)) {
        const list = sessionsByProject.get(p.id) || [];
        list.forEach(s => {
          map.set(s.id, idx);
          idx++;
        });
      }
    });
    return map;
  }, [projects, expandedProjects, sessionsByProject]);

  return (
    <>
      <div className="flex flex-col py-1">
        {/* Home */}
        <button
          onClick={() => {
            setActiveSession(null);
            navigateToSessions();
          }}
          className="flex items-center gap-2.5 px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
        >
          <Home className="w-4 h-4" />
          <span>Home</span>
        </button>

        {/* Projects */}
        {projects.map(project => {
          const isExpanded = expandedProjects.has(project.id);
          const projectSessions = sessionsByProject.get(project.id) || [];

          const projectMenuItems: DropdownItem[] = [
            {
              id: 'settings',
              label: 'Project Settings',
              icon: SettingsIcon,
              onClick: () => navigateToProject(project.id),
            },
            {
              id: 'delete',
              label: 'Delete Project',
              icon: Trash2,
              variant: 'danger',
              onClick: () => {
                if (confirm(`Delete project "${project.name}"? Sessions will be archived.`)) {
                  handleDeleteProject(project.id);
                }
              },
            },
          ];

          return (
            <div key={project.id} className="mt-3 first:mt-2">
              {/* Project header */}
              <button
                onClick={() => toggleProject(project.id)}
                className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-surface-hover transition-colors"
              >
                <span className="text-sm font-semibold text-text-primary truncate">{project.name}</span>
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
                )}
              </button>

              {isExpanded && (
                <div className="mt-0.5">
                  {/* Sessions */}
                  {projectSessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      isActive={session.id === activeSessionId}
                      globalIndex={globalSessionIndex.get(session.id) ?? -1}
                      onClick={() => handleSessionClick(session.id)}
                      onArchive={() => handleArchiveSession(session.id)}
                      onContinue={() => handleContinueSession(session.id)}
                      onStartRename={() => {
                        setEditingSessionId(session.id);
                        setEditingName(session.name || '');
                      }}
                      isEditing={editingSessionId === session.id}
                      editingName={editingName}
                      onEditingNameChange={setEditingName}
                      onRenameSubmit={() => handleRenameSession(session.id, editingName)}
                      onRenameCancel={() => { setEditingSessionId(null); setEditingName(''); }}
                    />
                  ))}

                  {/* + New workspace + project menu */}
                  <div className="flex items-center justify-between pl-6 pr-3">
                    <button
                      onClick={() => handleNewSession(project)}
                      className="flex items-center gap-1.5 py-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New workspace</span>
                    </button>
                    <Dropdown
                      trigger={
                        <button className="p-1 rounded text-text-muted hover:text-text-tertiary hover:bg-surface-hover transition-colors">
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      }
                      items={projectMenuItems}
                      position="auto"
                      width="sm"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* + New repository */}
        <div className="mt-4 px-4">
          <button
            onClick={() => setShowAddProjectDialog(true)}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs text-text-tertiary hover:text-text-primary hover:bg-surface-hover rounded transition-colors border border-dashed border-border-primary hover:border-interactive/50"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>New repository</span>
          </button>
        </div>
      </div>

      {/* Create Session Dialog */}
      {showCreateDialog && createForProject && (
        <CreateSessionDialog
          isOpen={showCreateDialog}
          onClose={() => {
            setShowCreateDialog(false);
            setCreateForProject(null);
          }}
          projectName={createForProject.name}
          projectId={createForProject.id}
        />
      )}

      {/* Add Project Dialog */}
      <Modal
        isOpen={showAddProjectDialog}
        onClose={() => {
          setShowAddProjectDialog(false);
          setNewProject({ name: '', path: '', buildScript: '', runScript: '' });
          setDetectedBranch(null);
          setShowValidationErrors(false);
          setGenerateRunScript(true);
          setSelectedAiTool('claude');
        }}
        size="lg"
      >
        <ModalHeader title="Add New Repository" icon={<FolderPlus className="w-5 h-5" />} />
        <ModalBody>
          <div className="space-y-6">
            <FieldWithTooltip
              label="Project Name"
              tooltip="A display name for this project in the sidebar"
            >
              <EnhancedInput
                type="text"
                value={newProject.name}
                onChange={(e) => {
                  setNewProject({ ...newProject, name: e.target.value });
                  if (showValidationErrors) setShowValidationErrors(false);
                }}
                placeholder="Enter project name"
                size="lg"
                fullWidth
                required
                showRequiredIndicator={showValidationErrors}
              />
            </FieldWithTooltip>

            <FieldWithTooltip
              label="Repository Path"
              tooltip="The absolute path to a git repository on your machine"
            >
              <div className="space-y-2">
                <EnhancedInput
                  type="text"
                  value={newProject.path}
                  onChange={(e) => {
                    setNewProject({ ...newProject, path: e.target.value });
                    detectCurrentBranch(e.target.value);
                    if (showValidationErrors) setShowValidationErrors(false);
                  }}
                  placeholder="/path/to/your/repository"
                  size="lg"
                  fullWidth
                  required
                  showRequiredIndicator={showValidationErrors}
                />
                <div className="flex justify-end">
                  <Button
                    onClick={async () => {
                      const result = await window.electron?.invoke('dialog:open-directory') as { success: boolean; data?: string } | undefined;
                      if (result?.success && result.data) {
                        setNewProject({ ...newProject, path: result.data });
                        detectCurrentBranch(result.data);
                      }
                    }}
                    variant="secondary"
                    size="sm"
                  >
                    Browse
                  </Button>
                </div>
              </div>
            </FieldWithTooltip>

            {newProject.path && (
              <FieldWithTooltip
                label="Detected Branch"
                tooltip="The main branch foozol will use as the base for worktrees"
              >
                <Card variant="bordered" padding="md">
                  <div className="flex items-center gap-2 text-sm text-text-secondary">
                    <GitBranch className="w-4 h-4" />
                    <span className="font-mono">
                      {detectedBranch || 'Detecting...'}
                    </span>
                  </div>
                </Card>
              </FieldWithTooltip>
            )}

            {/* AI-Assisted Run Script */}
            <div className="pt-4 border-t border-border-primary">
              <FieldWithTooltip
                label="Run Script Setup"
                tooltip="Let AI analyze your project and create a foozol-run.sh script that works with git worktrees and handles dynamic port allocation."
              >
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={generateRunScript}
                      onChange={(e) => setGenerateRunScript(e.target.checked)}
                      className="w-4 h-4 rounded border-border-primary text-interactive focus:ring-interactive"
                    />
                    <span className="text-sm text-text-primary">Help me create a run script</span>
                  </label>

                  {generateRunScript && (
                    <div className="ml-6 flex items-center gap-2">
                      <TogglePillImproved
                        checked={selectedAiTool === 'claude'}
                        onCheckedChange={() => setSelectedAiTool('claude')}
                        icon={<Brain className="w-3 h-3" />}
                        size="sm"
                      >
                        Claude
                      </TogglePillImproved>
                      <TogglePillImproved
                        checked={selectedAiTool === 'codex'}
                        onCheckedChange={() => setSelectedAiTool('codex')}
                        icon={<Code2 className="w-3 h-3" />}
                        size="sm"
                      >
                        Codex
                      </TogglePillImproved>
                    </div>
                  )}
                </div>
              </FieldWithTooltip>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            onClick={() => {
              setShowAddProjectDialog(false);
              setNewProject({ name: '', path: '', buildScript: '', runScript: '' });
              setDetectedBranch(null);
              setShowValidationErrors(false);
              setGenerateRunScript(true);
              setSelectedAiTool('claude');
            }}
            variant="ghost"
            size="md"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateProject}
            disabled={!newProject.name || !newProject.path}
            variant="primary"
            size="md"
          >
            Create
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

// --- Session row sub-component ---

interface SessionRowProps {
  session: Session;
  isActive: boolean;
  globalIndex: number;
  onClick: () => void;
  onArchive: () => void;
  onContinue: () => void;
  onStartRename: () => void;
  isEditing: boolean;
  editingName: string;
  onEditingNameChange: (name: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
}

interface GitStatusIPCResponse {
  success: boolean;
  gitStatus?: GitStatus;
}

function SessionRow({
  session, isActive, globalIndex, onClick,
  onArchive, onContinue, onStartRename,
  isEditing, editingName, onEditingNameChange, onRenameSubmit, onRenameCancel,
}: SessionRowProps) {
  const [localGitStatus, setLocalGitStatus] = useState<GitStatus | undefined>(session.gitStatus);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  // Fetch git status if not available
  useEffect(() => {
    if (localGitStatus || session.gitStatus || session.archived || session.status === 'error') return;
    const fetchStatus = async () => {
      try {
        if (!window.electron?.invoke) return;
        const res = await window.electron.invoke(
          'sessions:get-git-status',
          session.id,
          false,
          true
        ) as GitStatusIPCResponse;
        if (res?.success && res.gitStatus) {
          setLocalGitStatus(res.gitStatus);
        }
      } catch {
        // Silently fail
      }
    };
    fetchStatus();
  }, [session.id, session.archived, session.status, localGitStatus, session.gitStatus]);

  // Sync from session prop when store updates
  useEffect(() => {
    if (session.gitStatus) setLocalGitStatus(session.gitStatus);
  }, [session.gitStatus]);

  const gs = localGitStatus;
  const branch = session.worktreePath?.split('/').pop() || '';

  // Status text + color
  let statusText = '';
  let statusColor = 'text-text-tertiary';

  if (session.status === 'running' || session.status === 'initializing') {
    statusText = session.status === 'initializing' ? 'Initializing' : 'Running';
    statusColor = 'text-status-success';
  } else if (session.status === 'waiting') {
    statusText = 'Waiting for input';
    statusColor = 'text-status-warning';
  } else if (session.status === 'error') {
    statusText = 'Error';
    statusColor = 'text-status-error';
  } else if (gs) {
    if (gs.state === 'conflict') {
      statusText = 'Merge conflicts';
      statusColor = 'text-status-error';
    } else if (gs.isReadyToMerge) {
      statusText = 'Ready to merge';
      statusColor = 'text-status-success';
    } else if (gs.hasUncommittedChanges) {
      statusText = 'Uncommitted changes';
      statusColor = 'text-status-warning';
    } else if (gs.state === 'diverged') {
      statusText = 'Diverged';
      statusColor = 'text-status-warning';
    } else if (gs.state === 'ahead' && gs.ahead) {
      statusText = `${gs.ahead} ahead`;
    } else if (gs.state === 'behind' && gs.behind) {
      statusText = `${gs.behind} behind`;
    } else if (gs.state === 'clean') {
      statusText = 'Up to date';
    }
  }

  const iconColor = session.status === 'running' || session.status === 'initializing'
    ? 'text-status-success'
    : session.status === 'waiting'
    ? 'text-status-warning'
    : session.status === 'error'
    ? 'text-status-error'
    : 'text-text-tertiary';

  const adds = (gs?.commitAdditions ?? 0) + (gs?.additions ?? 0);
  const dels = (gs?.commitDeletions ?? 0) + (gs?.deletions ?? 0);
  const hasDiff = adds > 0 || dels > 0;

  const sessionMenuItems: DropdownItem[] = [
    {
      id: 'rename',
      label: 'Rename',
      icon: Pencil,
      onClick: onStartRename,
    },
    {
      id: 'continue',
      label: 'Continue',
      icon: Play,
      onClick: onContinue,
    },
    {
      id: 'archive',
      label: 'Archive',
      icon: Archive,
      variant: 'warning',
      onClick: onArchive,
    },
  ];

  return (
    <div
      className={`group/session w-full text-left pl-6 pr-1 py-2 transition-colors flex items-start gap-1 ${
        isActive
          ? 'bg-interactive/10 border-l-2 border-interactive'
          : 'hover:bg-surface-hover border-l-2 border-transparent'
      }`}
    >
      {/* Clickable session content */}
      <button onClick={onClick} className="flex-1 text-left min-w-0">
        {/* Row 1: icon + name + diff stats */}
        <div className="flex items-center gap-2 min-w-0">
          <GitBranch className={`w-3.5 h-3.5 flex-shrink-0 ${iconColor}`} />
          {isEditing ? (
            <input
              ref={editInputRef}
              value={editingName}
              onChange={(e) => onEditingNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRenameSubmit();
                if (e.key === 'Escape') onRenameCancel();
              }}
              onBlur={onRenameSubmit}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-medium text-text-primary bg-surface-secondary border border-border-primary rounded px-1.5 py-0.5 min-w-0 w-full outline-none focus:border-interactive"
            />
          ) : (
            <span className="text-sm font-medium text-text-primary truncate">
              {session.name || 'Untitled'}
            </span>
          )}
          {!isEditing && hasDiff && (
            <span className="flex items-center gap-1 text-xs flex-shrink-0 ml-auto">
              <span className="text-status-success font-semibold">+{adds}</span>
              <span className="text-status-error font-semibold">-{dels}</span>
            </span>
          )}
        </div>
        {/* Row 2: branch · status + shortcut */}
        <div className="flex items-center gap-1 mt-0.5 pl-[22px] text-xs text-text-tertiary min-w-0">
          {branch && <span className="truncate max-w-[120px]">{branch}</span>}
          {branch && statusText && <span className="flex-shrink-0">·</span>}
          {statusText && (
            <span className={`truncate ${statusColor}`}>{statusText}</span>
          )}
          {globalIndex >= 0 && globalIndex < 9 && (
            <span className="ml-auto flex-shrink-0 text-text-muted text-[10px]">⌘{globalIndex + 1}</span>
          )}
        </div>
      </button>

      {/* Session menu */}
      <div className="flex-shrink-0 opacity-0 group-hover/session:opacity-100 transition-opacity">
        <Dropdown
          trigger={
            <button
              className="p-1 rounded text-text-muted hover:text-text-tertiary hover:bg-surface-hover transition-colors"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          }
          items={sessionMenuItems}
          position="auto"
          width="sm"
        />
      </div>
    </div>
  );
}

// --- Archived Sessions panel (pinned to sidebar bottom) ---

export function ArchivedSessions() {
  const [showArchived, setShowArchived] = useState(false);
  const [archivedProjects, setArchivedProjects] = useState<Array<Project & { sessions: Session[] }>>([]);
  const [expandedArchivedProjects, setExpandedArchivedProjects] = useState<Set<number>>(new Set());
  const [isLoadingArchived, setIsLoadingArchived] = useState(false);
  const [hasLoadedArchived, setHasLoadedArchived] = useState(false);

  const setActiveSession = useSessionStore(s => s.setActiveSession);
  const navigateToSessions = useNavigationStore(s => s.navigateToSessions);

  const loadArchivedSessions = useCallback(async () => {
    try {
      setIsLoadingArchived(true);
      const response = await API.sessions.getArchivedWithProjects();
      if (response.success && response.data) {
        setArchivedProjects(response.data as Array<Project & { sessions: Session[] }>);
      }
    } catch (e) {
      console.error('Failed to load archived sessions:', e);
    } finally {
      setIsLoadingArchived(false);
      setHasLoadedArchived(true);
    }
  }, []);

  const toggleArchived = useCallback(() => {
    setShowArchived(prev => {
      const next = !prev;
      if (next && !hasLoadedArchived) {
        loadArchivedSessions();
      }
      return next;
    });
  }, [hasLoadedArchived, loadArchivedSessions]);

  const toggleArchivedProject = (id: number) => {
    setExpandedArchivedProjects(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRestoreSession = async (sessionId: string) => {
    try {
      await API.sessions.restore(sessionId);
      loadArchivedSessions();
    } catch (e) {
      console.error('Failed to restore session:', e);
    }
  };

  const handleSessionClick = (sessionId: string) => {
    setActiveSession(sessionId);
    navigateToSessions();
  };

  return (
    <div className="border-t border-border-primary">
      <button
        onClick={toggleArchived}
        className="w-full flex items-center gap-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
      >
        {showArchived ? (
          <ChevronDown className="w-3 h-3 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 flex-shrink-0" />
        )}
        <Archive className="w-3 h-3 flex-shrink-0" />
        <span>Archived</span>
        {hasLoadedArchived && archivedProjects.length > 0 && (
          <span className="ml-auto text-[10px] text-text-muted font-normal tabular-nums">
            {archivedProjects.reduce((sum, p) => sum + p.sessions.length, 0)}
          </span>
        )}
      </button>

      {showArchived && (
        <div className="pb-2 max-h-[40vh] overflow-y-auto">
          {isLoadingArchived ? (
            <div className="flex items-center gap-2 px-6 py-3 text-xs text-text-tertiary">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Loading...</span>
            </div>
          ) : archivedProjects.length === 0 ? (
            <div className="px-6 py-3 text-xs text-text-tertiary">
              No archived sessions
            </div>
          ) : (
            archivedProjects.map(project => {
              const isExpanded = expandedArchivedProjects.has(project.id);
              return (
                <div key={`archived-${project.id}`}>
                  <button
                    onClick={() => toggleArchivedProject(project.id)}
                    className="w-full flex items-center gap-2 px-6 py-1.5 text-xs text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 flex-shrink-0" />
                    )}
                    <span className="truncate">{project.name}</span>
                    <span className="ml-auto text-text-muted text-[10px]">{project.sessions.length}</span>
                  </button>
                  {isExpanded && project.sessions.map(session => (
                    <div
                      key={session.id}
                      className="group/archived flex items-center gap-1 pl-10 pr-1 py-1.5 hover:bg-surface-hover transition-colors"
                    >
                      <button onClick={() => handleSessionClick(session.id)} className="flex-1 text-left min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <Archive className="w-3 h-3 flex-shrink-0 text-text-muted" />
                          <span className="text-xs text-text-tertiary truncate">
                            {session.name || 'Untitled'}
                          </span>
                        </div>
                      </button>
                      <div className="flex-shrink-0 opacity-0 group-hover/archived:opacity-100 transition-opacity">
                        <Dropdown
                          trigger={
                            <button className="p-1 rounded text-text-muted hover:text-text-tertiary hover:bg-surface-hover transition-colors">
                              <MoreHorizontal className="w-3 h-3" />
                            </button>
                          }
                          items={[{
                            id: 'restore',
                            label: 'Restore',
                            icon: ArchiveRestore,
                            onClick: () => handleRestoreSession(session.id),
                          }]}
                          position="auto"
                          width="sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
