import { useState, useEffect, useCallback } from 'react';
import { GitLog, type GitLogEntry, type Commit } from '@tomplum/react-git-log';
import '@tomplum/react-git-log/dist/index.css';
import { API } from '../utils/api';
import { Loader2 } from 'lucide-react';

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

export function GitHistoryGraph({ sessionId, baseBranch, onSelectCommit }: GitHistoryGraphProps) {
  const [entries, setEntries] = useState<GitLogEntry[]>([]);
  const [currentBranch, setCurrentBranch] = useState(baseBranch);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGraph = useCallback(async () => {
    try {
      setError(null);
      const response = await API.sessions.getGitGraph(sessionId);
      if (response.success && response.data) {
        const data = response.data as GitGraphResponse;
        const mapped: GitLogEntry[] = data.entries.map((entry) => ({
          hash: entry.hash,
          parents: entry.parents,
          branch: entry.branch,
          message: entry.message,
          committerDate: entry.committerDate,
          author: entry.author ? { name: entry.author, email: entry.authorEmail } : undefined,
        }));
        setEntries(mapped);
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
      const detail = customEvent.detail as { type?: string } | undefined;
      if (detail?.type === 'git:operation_completed') {
        fetchGraph();
      }
    };

    window.addEventListener('panel:event', handler);
    return () => window.removeEventListener('panel:event', handler);
  }, [fetchGraph]);

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

  if (entries.length === 0) {
    return (
      <div className="text-xs text-text-tertiary px-1 py-2">
        No commits yet
      </div>
    );
  }

  const handleSelectCommit = (commit?: Commit) => {
    if (commit && commit.hash !== 'index' && onSelectCommit) {
      onSelectCommit(commit.hash);
    }
  };

  return (
    <div className="max-h-[400px] overflow-y-auto overflow-x-hidden git-history-graph">
      <GitLog
        entries={entries}
        currentBranch={currentBranch}
        theme="dark"
        defaultGraphWidth={60}
        rowSpacing={0}
        onSelectCommit={handleSelectCommit}
        enableSelectedCommitStyling
      >
        <GitLog.GraphHTMLGrid
          nodeTheme="plain"
          nodeSize={10}
          showCommitNodeTooltips
        />
        <GitLog.Table
          timestampFormat="MMM D"
        />
      </GitLog>
    </div>
  );
}
