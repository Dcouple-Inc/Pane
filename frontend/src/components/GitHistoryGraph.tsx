import { useState, useEffect, useCallback, memo } from 'react';
import { API } from '../utils/api';
import { Loader2, GitCommitHorizontal } from 'lucide-react';

interface GitGraphCommitData {
  hash: string;
  parents: string[];
  branch: string;
  message: string;
  committerDate: string;
  author: string;
  authorEmail?: string;
}

interface GitGraphResponse {
  entries: GitGraphCommitData[];
  currentBranch: string;
}

interface GitHistoryGraphProps {
  sessionId: string;
  baseBranch: string;
  onSelectCommit?: (hash: string) => void;
}

const CommitRow = memo(function CommitRow({
  entry,
  isFirst,
  isLast,
  isSelected,
  onSelect,
}: {
  entry: GitGraphCommitData;
  isFirst: boolean;
  isLast: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isIndex = entry.hash === 'index';
  const date = new Date(entry.committerDate);
  const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <button
      className={`flex items-start gap-2 w-full text-left px-1 py-1 rounded-sm transition-colors ${
        isSelected ? 'bg-surface-tertiary' : 'hover:bg-surface-secondary'
      }`}
      onClick={onSelect}
    >
      {/* Graph line + node */}
      <div className="flex flex-col items-center flex-shrink-0 w-4 mt-0.5">
        {!isFirst && <div className="w-px h-1.5 bg-border-secondary" />}
        <GitCommitHorizontal
          className={`w-3.5 h-3.5 flex-shrink-0 ${
            isIndex ? 'text-status-warning' : 'text-interactive'
          }`}
        />
        {!isLast && <div className="w-px h-full bg-border-secondary min-h-[8px]" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-0.5">
        <div className="text-xs text-text-primary truncate leading-tight">
          {isIndex ? (
            <span className="italic text-status-warning">{entry.message}</span>
          ) : (
            entry.message
          )}
        </div>
        {!isIndex && (
          <div className="text-[10px] text-text-tertiary leading-tight mt-0.5">
            <span className="font-mono">{entry.hash}</span>
            <span className="mx-1">&middot;</span>
            <span>{dateStr}</span>
          </div>
        )}
      </div>
    </button>
  );
});

export function GitHistoryGraph({ sessionId, baseBranch, onSelectCommit }: GitHistoryGraphProps) {
  const [rawEntries, setRawEntries] = useState<GitGraphCommitData[]>([]);
  const [currentBranch, setCurrentBranch] = useState(baseBranch);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);

  const fetchGraph = useCallback(async () => {
    try {
      setError(null);
      const response = await API.sessions.getGitGraph(sessionId);
      if (response.success && response.data) {
        const data = response.data as GitGraphResponse;
        setRawEntries(data.entries);
        setCurrentBranch(data.currentBranch);
      } else {
        setError(response.error || 'Failed to load history');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    setLoading(true);
    fetchGraph();
  }, [fetchGraph]);

  // Listen for git status updates to refresh the graph
  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent;
      const detail = customEvent.detail as { sessionId?: string } | undefined;
      if (detail?.sessionId === sessionId) {
        fetchGraph();
      }
    };

    window.addEventListener('git-status-updated', handler);
    return () => window.removeEventListener('git-status-updated', handler);
  }, [sessionId, fetchGraph]);

  // Also listen for panel events (git operations)
  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent;
      const detail = customEvent.detail as { type?: string; sessionId?: string } | undefined;
      if (detail?.type === 'git:operation_completed' && (!detail.sessionId || detail.sessionId === sessionId)) {
        fetchGraph();
      }
    };

    window.addEventListener('panel:event', handler);
    return () => window.removeEventListener('panel:event', handler);
  }, [sessionId, fetchGraph]);

  const handleSelect = useCallback((hash: string) => {
    setSelectedHash(hash);
    if (hash !== 'index' && onSelectCommit) {
      onSelectCommit(hash);
    }
  }, [onSelectCommit]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-text-tertiary px-1 py-2">
        {error}
      </div>
    );
  }

  if (rawEntries.length === 0) {
    return (
      <div className="text-xs text-text-tertiary px-1 py-2">
        No commits yet
      </div>
    );
  }

  return (
    <div className="max-h-[400px] overflow-y-auto overflow-x-hidden">
      <div className="flex flex-col">
        {rawEntries.map((entry, i) => (
          <CommitRow
            key={entry.hash}
            entry={entry}
            isFirst={i === 0}
            isLast={i === rawEntries.length - 1}
            isSelected={selectedHash === entry.hash}
            onSelect={() => handleSelect(entry.hash)}
          />
        ))}
      </div>
      {currentBranch && (
        <div className="text-[10px] text-text-tertiary px-1 pt-2 pb-1">
          on <span className="font-mono">{currentBranch}</span>
        </div>
      )}
    </div>
  );
}
