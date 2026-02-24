import React, { useState, useEffect, useCallback } from 'react';
import { API } from '../utils/api';
import type { CreateSessionRequest } from '../types/session';
import type { Project } from '../types/project';
import { useErrorStore } from '../stores/errorStore';
import { GitBranch, ChevronRight, ChevronDown, X } from 'lucide-react';
import { CommitModeSettings } from './CommitModeSettings';
import type { CommitModeSettings as CommitModeSettingsType } from '../../../shared/types';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useSessionPreferencesStore, type SessionCreationPreferences } from '../stores/sessionPreferencesStore';

// Interface for branch information
interface BranchInfo {
  name: string;
  isCurrent: boolean;
  hasWorktree: boolean;
  isRemote: boolean;
}

interface CreateSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectName?: string;
  projectId?: number;
  initialSessionName?: string;
  initialBaseBranch?: string;
  initialFolderId?: string; // Folder to create the new session in
  // Callback called after session is successfully created (for "Discard and Retry" to archive old session)
  onSessionCreated?: () => void;
}

export function CreateSessionDialog({
  isOpen,
  onClose,
  projectName,
  projectId,
  initialSessionName,
  initialBaseBranch,
  initialFolderId,
  onSessionCreated
}: CreateSessionDialogProps) {
  const [sessionName, setSessionName] = useState<string>(initialSessionName || '');
  const [sessionCount, setSessionCount] = useState<number>(1);
  const [formData, setFormData] = useState<CreateSessionRequest>({
    prompt: '',
    worktreeTemplate: '',
    count: 1,
    permissionMode: 'ignore',
    baseBranch: initialBaseBranch
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [commitModeSettings, setCommitModeSettings] = useState<CommitModeSettingsType>({
    mode: 'disabled',
    checkpointPrefix: 'checkpoint: '
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSessionOptions, setShowSessionOptions] = useState(false);
  const { showError } = useErrorStore();
  const { preferences, loadPreferences, updatePreferences } = useSessionPreferencesStore();

  // Load session creation preferences when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadPreferences();
      // Only clear session name if there's no initialSessionName
      if (!initialSessionName) {
        setSessionName('');
      } else {
        setSessionName(initialSessionName);
      }
      setSessionCount(1);
      setFormData(prev => ({ ...prev, count: 1, baseBranch: initialBaseBranch }));
    }
  }, [isOpen, loadPreferences, initialSessionName, initialBaseBranch]);

  // Apply loaded preferences to state
  useEffect(() => {
    if (preferences) {
      setShowAdvanced(preferences.showAdvanced);
      setShowSessionOptions(preferences.showSessionOptions ?? false);
      setCommitModeSettings(preferences.commitModeSettings);
    }
  }, [preferences]);

  // Save preferences when certain settings change
  const savePreferences = useCallback(async (updates: Partial<SessionCreationPreferences>) => {
    await updatePreferences(updates);
  }, [updatePreferences]);

  useEffect(() => {
    if (isOpen) {
      // Fetch branches if projectId is provided
      if (projectId) {
        setIsLoadingBranches(true);
        // First get the project to get its path
        API.projects.getAll().then(projectsResponse => {
          if (!projectsResponse.success || !projectsResponse.data) {
            throw new Error('Failed to fetch projects');
          }
          const project = projectsResponse.data.find((p: Project) => p.id === projectId);
          if (!project) {
            throw new Error('Project not found');
          }

          return Promise.all([
            API.projects.listBranches(projectId.toString()),
            // Get the main branch for this project using its path
            API.projects.detectBranch(project.path)
          ]);
        }).then(([branchesResponse, mainBranchResponse]) => {
          if (branchesResponse.success && branchesResponse.data) {
            setBranches(branchesResponse.data);
            // Default to remote main branch (origin/main or origin/master) for proper tracking
            // Fall back to current local branch if no remote main found
            if (!formData.baseBranch) {
              const remoteMain = branchesResponse.data.find((b: BranchInfo) =>
                b.isRemote && (b.name === 'origin/main' || b.name === 'origin/master')
              );
              const currentBranch = branchesResponse.data.find((b: BranchInfo) => b.isCurrent);
              const defaultBranch = remoteMain || currentBranch;
              if (defaultBranch) {
                setFormData(prev => ({ ...prev, baseBranch: defaultBranch.name }));
              }
            }
          }

          if (mainBranchResponse.success && mainBranchResponse.data) {
            // Main branch detected but not currently used in UI
          }
        }).catch((err: Error) => {
          console.error('Failed to fetch branches:', err);
        }).finally(() => {
          setIsLoadingBranches(false);
        });
      }
    }
  }, [isOpen, projectId]);

  // Add keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      // Cmd/Ctrl + Enter to submit
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        const form = document.getElementById('create-session-form') as HTMLFormElement;
        if (form) {
          const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
          form.dispatchEvent(submitEvent);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Auto-focus session name input on dialog open
  useEffect(() => {
    if (isOpen) {
      // Small delay to let the dialog render
      const timer = setTimeout(() => {
        const input = document.getElementById('worktreeTemplate') as HTMLInputElement;
        if (input) input.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const validateWorktreeName = (name: string): string | null => {
    if (!name) return null; // Empty is allowed

    // Spaces are now allowed in session names
    // They will be converted to hyphens for the actual worktree name

    // Check for invalid git characters (excluding spaces which are now allowed)
    const invalidChars = /[~^:?*\[\]\\]/;
    if (invalidChars.test(name)) {
      return 'Session name contains invalid characters (~^:?*[]\\)';
    }

    // Check if it starts or ends with dot
    if (name.startsWith('.') || name.endsWith('.')) {
      return 'Session name cannot start or end with a dot';
    }

    // Check if it starts or ends with slash
    if (name.startsWith('/') || name.endsWith('/')) {
      return 'Session name cannot start or end with a slash';
    }

    // Check for consecutive dots
    if (name.includes('..')) {
      return 'Session name cannot contain consecutive dots';
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Session name is always required
    if (!sessionName.trim()) {
      showError({
        title: 'Session Name Required',
        error: 'Please provide a session name.'
      });
      return;
    }

    // Validate worktree name
    const validationError = validateWorktreeName(sessionName);
    if (validationError) {
      showError({
        title: 'Invalid Session Name',
        error: validationError
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Determine if we need to create a folder
      // Create folder when: multiple sessions (sessionCount > 1)
      // But NOT if we already have an initialFolderId (from "Discard and Retry")
      const shouldCreateFolder = !initialFolderId && sessionCount > 1;

      // Use initialFolderId if provided, otherwise create folder if needed
      let folderId: string | undefined = initialFolderId;
      if (shouldCreateFolder && projectId) {
        try {
          const folderResponse = await API.folders.create(sessionName, projectId);
          if (folderResponse.success && folderResponse.data) {
            folderId = folderResponse.data.id;
            console.log(`[CreateSessionDialog] Created folder: ${sessionName} (${folderId})`);
            // Wait a bit to ensure the folder is created in the UI
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (error) {
          console.error('[CreateSessionDialog] Failed to create folder:', error);
          // Continue without folder - sessions will be created at project level
        }
      }

      console.log('[CreateSessionDialog] Creating session with:', {
        sessionName,
        count: sessionCount,
        toolType: 'none',
        folderId
      });

      const response = await API.sessions.create({
        prompt: '',
        worktreeTemplate: sessionName,
        count: sessionCount,
        toolType: 'none',
        permissionMode: 'ignore',
        projectId,
        folderId,
        commitMode: commitModeSettings.mode,
        commitModeSettings: JSON.stringify(commitModeSettings),
        baseBranch: formData.baseBranch
      });

      if (!response.success) {
        showError({
          title: 'Failed to Create Session',
          error: response.error || 'An error occurred while creating the session.',
          details: response.details,
          command: response.command
        });
        return;
      }

      // Call onSessionCreated callback (e.g., to archive old session in "Discard and Retry")
      if (onSessionCreated) {
        onSessionCreated();
      }

      onClose();
    } catch (error: unknown) {
      console.error('Error creating session:', error);
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while creating the session.';
      const errorDetails = error instanceof Error ? (error.stack || error.toString()) : String(error);
      showError({
        title: 'Failed to Create Session',
        error: errorMessage,
        details: errorDetails
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setWorktreeError(null);
        onClose();
      }}
      size="lg"
      closeOnOverlayClick={false}
    >
      <ModalHeader>
        New Session{projectName && ` in ${projectName}`}
      </ModalHeader>

      <ModalBody className="p-0">
        <div className="flex-1 overflow-y-auto">
          <form id="create-session-form" onSubmit={handleSubmit}>
            {/* 1. Session Name (visible, required) */}
            <div className="p-6 border-b border-border-primary">
              <label className="block text-sm font-medium text-text-primary mb-1">
                Session Name
              </label>
              <Input
                id="worktreeTemplate"
                type="text"
                value={sessionName}
                onChange={(e) => {
                  const value = e.target.value;
                  setSessionName(value);
                  setFormData({ ...formData, worktreeTemplate: value });
                  // Real-time validation
                  const error = validateWorktreeName(value);
                  setWorktreeError(error);
                }}
                error={worktreeError || undefined}
                placeholder="Enter a name for your session"
                className="w-full"
              />
              {!worktreeError && (
                <p className="text-xs text-text-tertiary mt-1">
                  The name for your session and worktree folder.
                </p>
              )}
            </div>

            {/* 2. Base Branch (always visible) */}
            {branches.length > 0 && (
              <div className="p-6 border-b border-border-primary">
                <div className="flex items-center gap-2 mb-1">
                  <GitBranch className="w-4 h-4 text-text-tertiary" />
                  <label htmlFor="baseBranch" className="text-sm font-medium text-text-primary">
                    Base Branch
                  </label>
                </div>
                <select
                  id="baseBranch"
                  value={formData.baseBranch || ''}
                  onChange={(e) => {
                    const selectedBranch = e.target.value;
                    setFormData({ ...formData, baseBranch: selectedBranch });
                    savePreferences({ baseBranch: selectedBranch });
                  }}
                  className="w-full px-3 py-2 border border-border-primary rounded-md focus:outline-none focus:ring-2 focus:ring-interactive text-text-primary bg-surface-secondary"
                  disabled={isLoadingBranches}
                >
                  {/* Remote branches group */}
                  {branches.some(b => b.isRemote) && (
                    <optgroup label="Remote Branches">
                      {branches.filter(b => b.isRemote).map(branch => (
                        <option key={branch.name} value={branch.name}>
                          {branch.name}
                        </option>
                      ))}
                    </optgroup>
                  )}

                  {/* Local branches group */}
                  {branches.some(b => !b.isRemote) && (
                    <optgroup label="Local Branches">
                      {branches.filter(b => !b.isRemote).map(branch => (
                        <option key={branch.name} value={branch.name}>
                          {branch.name} {branch.isCurrent ? '(current)' : ''} {branch.hasWorktree ? '(has worktree)' : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <p className="text-xs text-text-tertiary mt-1">
                  Remote branches will automatically track the remote for git pull/push.
                </p>
              </div>
            )}

            {/* 3. Number of Sessions (compact with expand) */}
            <div className="px-6 py-4 border-b border-border-primary">
              <div className="flex items-center gap-3">
                <span className="text-sm text-text-secondary">Sessions: {sessionCount}</span>
                {!showSessionOptions && sessionCount === 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSessionOptions(true)}
                    className="text-text-tertiary hover:text-text-primary p-1"
                    title="Create multiple sessions"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
                {(showSessionOptions || sessionCount > 1) && (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      id="count"
                      type="range"
                      min="1"
                      max="5"
                      value={sessionCount}
                      onChange={(e) => {
                        const count = parseInt(e.target.value) || 1;
                        setSessionCount(count);
                        setFormData(prev => ({ ...prev, count }));
                      }}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowSessionOptions(false);
                        setSessionCount(1);
                        setFormData(prev => ({ ...prev, count: 1 }));
                      }}
                      className="text-text-tertiary hover:text-text-primary p-1"
                      title="Reset to 1"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
              {sessionCount > 1 && (
                <p className="text-xs text-text-tertiary mt-1">
                  Creating multiple sessions with numbered suffixes
                </p>
              )}
            </div>

            {/* 4. Advanced Options Toggle */}
            <div className="px-6 py-4">
              <Button
                type="button"
                onClick={() => {
                  const newShowAdvanced = !showAdvanced;
                  setShowAdvanced(newShowAdvanced);
                  savePreferences({ showAdvanced: newShowAdvanced });
                }}
                variant="ghost"
                size="sm"
                className="text-text-secondary hover:text-text-primary"
              >
                {showAdvanced ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                Advanced
              </Button>
            </div>

            {/* Advanced Options - Collapsible */}
            {showAdvanced && (
              <div className="px-6 pb-6 space-y-4 border-t border-border-primary pt-4">
                {/* Commit Mode Settings */}
                <CommitModeSettings
                  projectId={projectId}
                  mode={commitModeSettings.mode}
                  settings={commitModeSettings}
                  onChange={(_mode, settings) => {
                    setCommitModeSettings(settings);
                    savePreferences({ commitModeSettings: settings });
                  }}
                />
              </div>
            )}
          </form>
        </div>
      </ModalBody>

      <ModalFooter className="flex items-center justify-between">
        <div className="text-xs text-text-tertiary">
          <span className="font-medium">Tip:</span> Press {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to create
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={() => {
              setWorktreeError(null);
              onClose();
            }}
            variant="ghost"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-session-form"
            disabled={isSubmitting || !!worktreeError || !sessionName.trim()}
            loading={isSubmitting}
            title={
              isSubmitting ? 'Creating session...' :
              worktreeError ? 'Please fix the session name error' :
              !sessionName.trim() ? 'Please enter a session name' :
              undefined
            }
          >
            {isSubmitting ? 'Creating...' : `Create${sessionCount > 1 ? ` ${sessionCount} Sessions` : ''}`}
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
