/**
 * Session history tracking store using Zustand.
 *
 * Tracks which sessions and panels the user has visited for analytics
 * and potential future features. Currently only adds entries via
 * `addToHistory()` when users switch panels.
 *
 * Note: Back/forward navigation was removed in favor of cycling shortcuts.
 * The history tracking remains for potential future use.
 *
 * @module sessionHistoryStore
 */
import { create } from 'zustand';

interface SessionHistoryEntry {
  sessionId: string;
  panelId: string;
  timestamp: number;
}

interface SessionHistoryStore {
  history: SessionHistoryEntry[];
  currentIndex: number;
  maxHistorySize: number;

  /** Add a new entry to history when navigating to a panel */
  addToHistory: (sessionId: string, panelId: string) => void;
}

export const useSessionHistoryStore = create<SessionHistoryStore>((set, get) => ({
  history: [],
  currentIndex: -1,
  maxHistorySize: 50,

  addToHistory: (sessionId: string, panelId: string) => {
    const state = get();
    const newEntry: SessionHistoryEntry = {
      sessionId,
      panelId,
      timestamp: Date.now(),
    };

    // Don't add duplicate consecutive entries
    const currentEntry = state.history[state.currentIndex];
    if (currentEntry?.sessionId === sessionId && currentEntry?.panelId === panelId) {
      return;
    }

    // If we're not at the end of history, truncate forward history
    const newHistory =
      state.currentIndex < state.history.length - 1
        ? [...state.history.slice(0, state.currentIndex + 1), newEntry]
        : [...state.history, newEntry];

    // Limit history size
    const trimmedHistory = newHistory.slice(-state.maxHistorySize);

    set({
      history: trimmedHistory,
      currentIndex: trimmedHistory.length - 1,
    });
  },
}));
