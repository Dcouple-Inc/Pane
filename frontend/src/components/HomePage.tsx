/**
 * HomePage Component
 *
 * Landing page displayed when no session is selected. Provides quick access to:
 * - Theme toggle (dark/light mode)
 * - UI scale adjustment
 * - Terminal shell preference (Windows only)
 * - List of active sessions (running/waiting)
 *
 * Replaces the previous EmptyState component to provide a more functional
 * default view that allows users to configure settings without opening
 * the full Settings dialog.
 */
import { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Terminal } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useConfigStore } from '../stores/configStore';
import { useSessionStore } from '../stores/sessionStore';
import { API } from '../utils/api';

export function HomePage() {
  const { theme, setTheme } = useTheme();
  const { config, updateConfig } = useConfigStore();
  const { sessions, setActiveSession } = useSessionStore();

  const [platform, setPlatform] = useState<string>('');
  const [availableShells, setAvailableShells] = useState<Array<{id: string; name: string; path: string}>>([]);
  const [preferredShell, setPreferredShell] = useState<string>('auto');

  const uiScale = config?.uiScale ?? 1.0;

  // Filter for active sessions (running or waiting)
  const activeSessions = sessions.filter(
    s => s.status === 'running' || s.status === 'waiting'
  );

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
    const newScale = Math.round((uiScale + delta) * 10) / 10; // Avoid floating point issues
    if (newScale >= 0.8 && newScale <= 1.5) {
      await updateConfig({ uiScale: newScale });
    }
  };

  const handleShellChange = async (shell: string) => {
    setPreferredShell(shell);
    await updateConfig({ preferredShell: shell as 'auto' | 'gitbash' | 'powershell' | 'pwsh' | 'cmd' });
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-bg-primary">
      <div className="w-full max-w-md space-y-8">

        {/* Quick Preferences */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Preferences</h2>

          {/* Theme */}
          <div className="flex items-center justify-between p-4 bg-surface-secondary rounded-lg">
            <span className="text-text-primary">Theme</span>
            <select
              value={theme}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'light' || v === 'dark' || v === 'oled') setTheme(v);
              }}
              className="px-3 py-1.5 rounded-md bg-surface-tertiary hover:bg-surface-hover text-sm text-text-primary border border-border-secondary focus:outline-none focus:ring-2 focus:ring-interactive cursor-pointer"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="oled">OLED Black</option>
            </select>
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
                <ChevronDown className="w-4 h-4" />
              </button>
              <span className="text-sm text-text-secondary w-10 text-center">{uiScale.toFixed(1)}x</span>
              <button
                onClick={() => handleScaleChange(0.1)}
                disabled={uiScale >= 1.5}
                className="p-1 rounded-md bg-surface-tertiary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Terminal Shell (Windows only) */}
          {platform === 'win32' && (
            <div className="flex items-center justify-between p-4 bg-surface-secondary rounded-lg">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-text-secondary" />
                <span className="text-text-primary">Terminal Shell</span>
              </div>
              <select
                value={preferredShell}
                onChange={(e) => handleShellChange(e.target.value)}
                className="px-3 py-1.5 rounded-md border border-border-primary bg-surface-secondary text-text-primary text-sm focus:ring-2 focus:ring-interactive focus:border-interactive"
              >
                <option value="auto">Auto (Git Bash)</option>
                {availableShells.map(shell => (
                  <option key={shell.id} value={shell.id}>{shell.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Active Sessions */}
        {activeSessions.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-text-primary">Active Panes</h2>
            <div className="space-y-2">
              {activeSessions.slice(0, 5).map((session) => (
                <button
                  key={session.id}
                  onClick={() => setActiveSession(session.id)}
                  className="w-full flex items-center justify-between p-3 bg-surface-secondary rounded-lg hover:bg-surface-hover text-left"
                >
                  <span className="text-text-primary truncate">{session.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    session.status === 'waiting'
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-green-500/20 text-green-400'
                  }`}>
                    {session.status}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Fallback message */}
        <p className="text-center text-sm text-text-tertiary">
          Select a pane from the sidebar or create a new one to get started.
        </p>
      </div>
    </div>
  );
}
