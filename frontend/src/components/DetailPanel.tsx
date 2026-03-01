import React, { useCallback, useMemo } from 'react';
import { useSession } from '../contexts/SessionContext';
import { GitBranch, AlertTriangle, Code2, Settings, Link, TerminalSquare } from 'lucide-react';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { Dropdown, DropdownMenuItem } from './ui/Dropdown';
import { GitHistoryGraph } from './GitHistoryGraph';
import { usePanelStore } from '../stores/panelStore';

interface DetailPanelProps {
  isVisible: boolean;
  onToggle: () => void;
  width: number;
  onResize: (e: React.MouseEvent) => void;
  mergeError?: string | null;
  projectGitActions?: {
    onPull?: () => void;
    onPush?: () => void;
    isMerging?: boolean;
  };
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2 border-b border-border-primary">
      <h3 className="text-xs uppercase text-text-tertiary font-medium mb-2">{title}</h3>
      {children}
    </div>
  );
}

export function DetailPanel({ isVisible, width, onResize, mergeError, projectGitActions }: DetailPanelProps) {
  const sessionContext = useSession();
  const setActivePanel = usePanelStore(s => s.setActivePanel);
  const getSessionPanels = usePanelStore(s => s.getSessionPanels);

  const handleSelectCommit = useCallback((_hash: string) => {
    if (!sessionContext) return;
    const sessionPanels = getSessionPanels(sessionContext.session.id);
    const diffPanel = sessionPanels.find(p => p.type === 'diff');
    if (diffPanel) {
      setActivePanel(sessionContext.session.id, diffPanel.id);
    }
  }, [sessionContext, setActivePanel, getSessionPanels]);

  // Build IDE dropdown items, sending safe IDE keys (resolved to commands server-side)
  const ideItems = useMemo(() => {
    if (!sessionContext?.onOpenIDEWithCommand) return [];
    const handler = sessionContext.onOpenIDEWithCommand;
    const configured = sessionContext.configuredIDECommand?.trim();
    const knownCommands = ['code .', 'cursor .'];
    const isCustom = configured && !knownCommands.includes(configured);
    const items = isCustom
      ? [{ id: 'configured', label: configured, description: 'Project default', icon: TerminalSquare, onClick: () => handler() }]
      : [];
    return [
      ...items,
      { id: 'vscode', label: 'VS Code', description: 'code .', icon: Code2, onClick: () => handler('vscode') },
      { id: 'cursor', label: 'Cursor', description: 'cursor .', icon: Code2, onClick: () => handler('cursor') },
    ];
  }, [sessionContext?.onOpenIDEWithCommand, sessionContext?.configuredIDECommand]);

  if (!isVisible || !sessionContext) return null;

  const { session, gitBranchActions, isMerging, gitCommands, onOpenIDEWithCommand, onConfigureIDE, onSetTracking, trackingBranch } = sessionContext;
  const gitStatus = session.gitStatus;
  const isProject = !!session.isMainRepo;

  return (
    <div
      className="flex-shrink-0 border-l border-border-primary bg-surface-primary flex flex-col overflow-hidden relative"
      style={{ width: `${width}px` }}
    >
      {/* Resize handle */}
      <div
        className="absolute top-0 left-0 w-1 h-full cursor-col-resize group z-10"
        onMouseDown={onResize}
      >
        <div className="absolute inset-0 group-hover:bg-interactive transition-colors" />
      </div>

      {/* All sections in a single scrollable container */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Changes — worktree sessions only */}
        {!isProject && gitStatus && (
          <DetailSection title="Changes">
            <div className="space-y-1 text-sm">
              {gitStatus.ahead != null && gitStatus.ahead > 0 && (
                <div className="flex justify-between text-text-secondary">
                  <span>Commits ahead</span>
                  <span className="text-status-success font-medium">{gitStatus.ahead}</span>
                </div>
              )}
              {gitStatus.behind != null && gitStatus.behind > 0 && (
                <div className="flex justify-between text-text-secondary">
                  <span>Commits behind</span>
                  <span className="text-status-warning font-medium">{gitStatus.behind}</span>
                </div>
              )}
              {gitStatus.hasUncommittedChanges && gitStatus.filesChanged != null && gitStatus.filesChanged > 0 && (
                <div className="flex justify-between text-text-secondary">
                  <span>Uncommitted files</span>
                  <span className="text-status-info font-medium">{gitStatus.filesChanged}</span>
                </div>
              )}
              {(!gitStatus.ahead || gitStatus.ahead === 0) &&
               (!gitStatus.behind || gitStatus.behind === 0) &&
               !gitStatus.hasUncommittedChanges && (
                <div className="text-text-tertiary text-xs">No changes detected</div>
              )}
            </div>
          </DetailSection>
        )}

        {/* Branch info */}
        <DetailSection title="Branch">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <GitBranch className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
              <span className="text-text-primary font-medium truncate">
                {(gitCommands?.currentBranch?.trim()) || session.baseBranch?.replace(/^origin\//, '') || 'unknown'}
              </span>
            </div>
            {session.baseBranch && gitCommands?.currentBranch &&
             gitCommands.currentBranch !== session.baseBranch.replace(/^origin\//, '') && (
              <div className="text-xs text-text-tertiary pl-5">
                from {session.baseBranch.replace(/^origin\//, '')}
              </div>
            )}
            {/* Branch-level actions */}
            {!isProject && (
              <div className="space-y-1 pt-1">
                {onSetTracking && (
                  <>
                    <Tooltip content="Set upstream tracking branch for git pull/push" side="left">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-sm"
                        onClick={onSetTracking}
                        disabled={isMerging}
                      >
                        <Link className="w-4 h-4 mr-2" />
                        Set Tracking
                      </Button>
                    </Tooltip>
                    {trackingBranch && (
                      <div className="text-xs text-text-tertiary pl-6 truncate">
                        {trackingBranch}
                      </div>
                    )}
                  </>
                )}
                {onOpenIDEWithCommand && (
                  <Dropdown
                    trigger={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-sm"
                      >
                        <Code2 className="w-4 h-4 mr-2" />
                        Open in IDE
                      </Button>
                    }
                    items={ideItems}
                    footer={
                      <DropdownMenuItem
                        icon={Settings}
                        label="Configure..."
                        onClick={onConfigureIDE}
                      />
                    }
                    position="auto"
                    width="sm"
                  />
                )}
              </div>
            )}
          </div>
        </DetailSection>

        {/* Merge error */}
        {mergeError && (
          <div className="px-3 py-2 border-b border-border-primary">
            <div className="p-2 bg-status-error/10 border border-status-error/30 rounded-md">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-status-error flex-shrink-0 mt-0.5" />
                <p className="text-xs text-status-error">{mergeError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Git actions */}
        <DetailSection title="Actions">
          <div className="space-y-1">
            {/* Worktree: rebase/merge from gitBranchActions */}
            {!isProject && gitBranchActions?.map(action => (
              <React.Fragment key={action.id}>
                {(action.id === 'stash' || action.id === 'rebase-from-main') && (
                  <div className="border-t border-border-primary my-1" />
                )}
                <Tooltip content={action.description} side="left">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-sm"
                    onClick={action.onClick}
                    disabled={action.disabled || isMerging}
                  >
                    <action.icon className="w-4 h-4 mr-2" />
                    {action.label}
                  </Button>
                </Tooltip>
              </React.Fragment>
            ))}

            {/* Project: Pull/Push */}
            {isProject && projectGitActions && (
              <>
                {projectGitActions.onPull && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-sm"
                    onClick={projectGitActions.onPull}
                    disabled={projectGitActions.isMerging}
                  >
                    Pull
                  </Button>
                )}
                {projectGitActions.onPush && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-sm"
                    onClick={projectGitActions.onPush}
                    disabled={projectGitActions.isMerging}
                  >
                    Push
                  </Button>
                )}
              </>
            )}
          </div>
        </DetailSection>

        {/* Git History Graph */}
        {session.worktreePath && (
          <DetailSection title="History">
            <GitHistoryGraph
              sessionId={session.id}
              baseBranch={session.baseBranch || 'main'}
              onSelectCommit={handleSelectCommit}
            />
          </DetailSection>
        )}
      </div>
    </div>
  );
}
