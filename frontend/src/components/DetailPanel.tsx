import React from 'react';
import { useSession } from '../contexts/SessionContext';
import { CommitModeIndicator } from './CommitModeIndicator';
import { GitBranch, AlertTriangle } from 'lucide-react';
import { Button } from './ui/Button';
import { GitHistoryGraph } from './GitHistoryGraph';

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
  if (!isVisible || !sessionContext) return null;

  const { session, gitBranchActions, isMerging } = sessionContext;
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

      <div className="flex-1 overflow-y-auto">
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
                {session.baseBranch || 'unknown'}
              </span>
            </div>
            {session.commitMode && session.commitMode !== 'disabled' && (
              <CommitModeIndicator mode={session.commitMode} />
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
              <Button
                key={action.id}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sm"
                onClick={action.onClick}
                disabled={action.disabled || isMerging}
              >
                <action.icon className="w-4 h-4 mr-2" />
                {action.label}
              </Button>
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
            />
          </DetailSection>
        )}
      </div>
    </div>
  );
}
