import React, { useCallback, memo, useState, useRef, useEffect, useMemo } from 'react';
import { Plus, X, Terminal, ChevronDown, MessageSquare, GitBranch, FileCode, MoreVertical, BarChart3, Code2, Edit2, PanelRight, FolderTree, TerminalSquare, Wrench, Play } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useHotkey } from '../../hooks/useHotkey';
import { PanelTabBarProps, PanelCreateOptions } from '../../types/panelComponents';
import { ToolPanel, ToolPanelType, PANEL_CAPABILITIES, LogsPanelState, BaseAIPanelState, PanelStatus } from '../../../../shared/types/panels';
import { Button } from '../ui/Button';
import { Dropdown } from '../ui/Dropdown';
import { useSession } from '../../contexts/SessionContext';
import { StatusDot } from '../ui/StatusDot';
import { StatusIndicator } from '../StatusIndicator';
import { useConfigStore } from '../../stores/configStore';
import { formatKeyDisplay } from '../../utils/hotkeyUtils';
import { Tooltip } from '../ui/Tooltip';

// Prompt for setting up intelligent dev command
export const SETUP_RUN_SCRIPT_PROMPT = `I use foozol to manage multiple AI coding sessions with git worktrees.
Each worktree needs its own dev server on a unique port.

Create scripts/foozol-run-script.js (Node.js, cross-platform) that:
1. Auto-detects git worktrees vs main repo
2. Assigns unique ports using hash(cwd) % 1000 + base_port
3. Checks port availability, auto-increments if in use
4. Auto-detects if deps need installing (package.json mtime > node_modules mtime)
5. Auto-detects if build is stale (src mtime > dist mtime)
6. Clean Ctrl+C termination (taskkill on Windows, SIGTERM on Unix)

PITFALLS TO WATCH OUT FOR:
- Port collisions between main repo and worktrees - use separate port ranges
- Electron apps need native module rebuilding after install (electron-rebuild)
- Cross-platform compatibility (Windows vs Unix process management)

Analyze this project and create the complete foozol-run-script.js.

IMPORTANT: After creating the script, test it by running 'node scripts/foozol-run-script.js' to ensure it works seamlessly. Then commit and merge to main so all future worktrees have it.`;

export const PanelTabBar: React.FC<PanelTabBarProps> = memo(({
  panels,
  activePanel,
  onPanelSelect,
  onPanelClose,
  onPanelCreate,
  context = 'worktree',  // Default to worktree for backward compatibility
  onToggleDetailPanel,
  detailPanelVisible
}) => {
  const sessionContext = useSession();
  const session = sessionContext?.session;
  const { gitBranchActions, isMerging } = sessionContext || {};
  const { config, fetchConfig, updateConfig } = useConfigStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [editingPanelId, setEditingPanelId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customCommand, setCustomCommand] = useState('');
  const customInputRef = useRef<HTMLInputElement>(null);
  const [, setFocusedDropdownIndex] = useState(-1);
  const dropdownItemsRef = useRef<(HTMLButtonElement | HTMLInputElement | null)[]>([]);

  const customCommands = config?.customCommands ?? [];

  // Load config on mount if not already loaded
  useEffect(() => {
    if (!config) {
      fetchConfig();
    }
  }, [config, fetchConfig]);

  const saveCustomCommand = useCallback(async (name: string, command: string) => {
    const existing = config?.customCommands ?? [];
    await updateConfig({
      customCommands: [...existing, { name, command }]
    });
  }, [config, updateConfig]);

  const deleteCustomCommand = useCallback(async (index: number) => {
    const existing = config?.customCommands ?? [];
    await updateConfig({
      customCommands: existing.filter((_, i) => i !== index)
    });
  }, [config, updateConfig]);
  
  // Memoize event handlers to prevent unnecessary re-renders
  const handlePanelClick = useCallback((panel: ToolPanel) => {
    onPanelSelect(panel);
  }, [onPanelSelect]);

  const handlePanelClose = useCallback((e: React.MouseEvent, panel: ToolPanel) => {
    e.stopPropagation();
    
    // Prevent closing logs panel while it's running
    if (panel.type === 'logs') {
      const logsState = panel.state?.customState as LogsPanelState;
      if (logsState?.isRunning) {
        alert('Cannot close logs panel while process is running. Please stop the process first.');
        return;
      }
    }
    
    onPanelClose(panel);
  }, [onPanelClose]);
  
  const handleAddPanel = useCallback((type: ToolPanelType, options?: PanelCreateOptions) => {
    onPanelCreate(type, options);
    setShowDropdown(false);
    setShowCustomInput(false);
    setCustomCommand('');
  }, [onPanelCreate]);
  
  const handleStartRename = useCallback((e: React.MouseEvent, panel: ToolPanel) => {
    e.stopPropagation();
    if (panel.type === 'diff') {
      return;
    }
    setEditingPanelId(panel.id);
    setEditingTitle(panel.title);
  }, []);
  
  const handleRenameSubmit = useCallback(async () => {
    if (editingPanelId && editingTitle.trim()) {
      try {
        // Update the panel title via IPC
        await window.electron?.invoke('panels:update', editingPanelId, {
          title: editingTitle.trim()
        });
        
        // Update the local panel in the store
        const panel = panels.find(p => p.id === editingPanelId);
        if (panel) {
          panel.title = editingTitle.trim();
        }
      } catch (error) {
        console.error('Failed to rename panel:', error);
      }
    }
    setEditingPanelId(null);
    setEditingTitle('');
  }, [editingPanelId, editingTitle, panels]);
  
  const handleRenameCancel = useCallback(() => {
    setEditingPanelId(null);
    setEditingTitle('');
  }, []);
  
  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      handleRenameCancel();
    }
  }, [handleRenameSubmit, handleRenameCancel]);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && event.target && event.target instanceof Node && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
        setShowCustomInput(false);
        setCustomCommand('');
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  // Auto-focus custom command input when shown
  useEffect(() => {
    if (showCustomInput && customInputRef.current) {
      customInputRef.current.focus();
    }
  }, [showCustomInput]);

  // Reset focus index when dropdown closes, focus first item when opens
  useEffect(() => {
    if (showDropdown) {
      setFocusedDropdownIndex(0);
      // Focus first item after render
      requestAnimationFrame(() => {
        dropdownItemsRef.current[0]?.focus();
      });
    } else {
      setFocusedDropdownIndex(-1);
      dropdownItemsRef.current = [];
    }
  }, [showDropdown]);

  // Handle keyboard navigation in dropdown
  const handleDropdownKeyDown = useCallback((e: React.KeyboardEvent) => {
    const items = dropdownItemsRef.current.filter(Boolean);
    const itemCount = items.length;

    if (itemCount === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedDropdownIndex(prev => {
          const next = prev < itemCount - 1 ? prev + 1 : 0;
          items[next]?.focus();
          return next;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedDropdownIndex(prev => {
          const next = prev > 0 ? prev - 1 : itemCount - 1;
          items[next]?.focus();
          return next;
        });
        break;
      case 'Escape':
        e.preventDefault();
        setShowDropdown(false);
        break;
      case 'Tab':
        // Allow tab to close dropdown and move to next element
        setShowDropdown(false);
        break;
    }
  }, []);
  
  // Focus input when editing starts
  useEffect(() => {
    if (editingPanelId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingPanelId]);
  
  // Ctrl+T: open Add Tool dropdown
  useHotkey({
    id: 'open-add-tool',
    label: 'Open Add Tool menu',
    keys: 'mod+t',
    category: 'tabs',
    action: () => setShowDropdown(true),
  });

  // Get available panel types (excluding permanent panels, logs, and enforcing singleton)
  const availablePanelTypes = (Object.keys(PANEL_CAPABILITIES) as ToolPanelType[])
    .filter(type => {
      const capabilities = PANEL_CAPABILITIES[type];

      // Filter based on context
      if (context === 'project' && !capabilities.canAppearInProjects) return false;
      if (context === 'worktree' && !capabilities.canAppearInWorktrees) return false;

      // Exclude permanent panels
      if (capabilities.permanent) return false;

      // Exclude logs panel - it's only created automatically when running scripts
      if (type === 'logs') return false;

      // Temporarily hide claude/codex panels - use Terminal (Claude) and Terminal (Codex) instead
      if (type === 'claude' || type === 'codex') return false;

      // Enforce singleton panels
      if (capabilities.singleton) {
        // Check if a panel of this type already exists
        return !panels.some(p => p.type === type);
      }

      return true;
    });
  
  const getPanelIcon = (type: ToolPanelType) => {
    switch (type) {
      case 'terminal':
        return <Terminal className="w-4 h-4" />;
      case 'claude':
        return <MessageSquare className="w-4 h-4" />;
      case 'codex':
        return <Code2 className="w-4 h-4" />;
      case 'diff':
        return <GitBranch className="w-4 h-4" />;
      case 'explorer':
        return <FolderTree className="w-4 h-4" />;
      case 'logs':
        return <FileCode className="w-4 h-4" />;
      case 'dashboard':
        return <BarChart3 className="w-4 h-4" />;
      // Add more icons as panel types are added
      default:
        return null;
    }
  };

  // Sort panels: explorer first, diff second, then by position
  const sortedPanels = useMemo(() => {
    const typeOrder = (type: string) => {
      if (type === 'explorer') return 0;
      if (type === 'diff') return 1;
      return 2;
    };
    return [...panels].sort((a, b) => {
      const orderDiff = typeOrder(a.type) - typeOrder(b.type);
      if (orderDiff !== 0) return orderDiff;
      return (a.metadata?.position ?? 0) - (b.metadata?.position ?? 0);
    });
  }, [panels]);

  // Get panel status indicator config for AI panels (claude/codex)
  const getPanelStatusConfig = (panel: ToolPanel): { status: 'running' | 'waiting' | 'info' | 'error' | 'default'; animated: boolean; pulse: boolean } | null => {
    // Only show status for AI panels
    if (panel.type !== 'claude' && panel.type !== 'codex') {
      return null;
    }

    const customState = panel.state?.customState as BaseAIPanelState | undefined;
    const panelStatus: PanelStatus | undefined = customState?.panelStatus;
    const hasUnviewedContent = customState?.hasUnviewedContent ?? false;
    const isActivePanel = activePanel?.id === panel.id;

    // Don't show status indicator if panel is active and doesn't have unviewed content
    // (user is actively viewing it)
    if (isActivePanel && !hasUnviewedContent && panelStatus !== 'running' && panelStatus !== 'waiting') {
      return null;
    }

    switch (panelStatus) {
      case 'running':
        return { status: 'running', animated: true, pulse: false };
      case 'waiting':
        return { status: 'waiting', animated: false, pulse: true };
      case 'error':
        return { status: 'error', animated: false, pulse: false };
      case 'completed_unviewed':
        // Show blue dot for completed with unviewed content
        return { status: 'info', animated: false, pulse: true };
      case 'stopped':
      case 'idle':
      default:
        // Only show if there's unviewed content and panel is not active
        if (hasUnviewedContent && !isActivePanel) {
          return { status: 'info', animated: false, pulse: true };
        }
        return null;
    }
  };

  return (
    <div className="panel-tab-bar bg-surface-secondary flex-shrink-0">
      {/* Flex container */}
      <div
        className="flex items-center min-h-[var(--panel-tab-height)] px-2 gap-x-1"
        role="tablist"
        aria-label="Panel Tabs"
      >
        {/* Session identity */}
        {session && (
          <div className="flex items-center gap-2 px-2 mr-1 flex-shrink-0 border-r border-border-primary">
            <StatusIndicator session={session} size="small" />
            <span className="text-sm text-text-secondary truncate min-w-0 select-none" style={{ maxWidth: '140px' }}>
              {sessionContext?.projectName || session.name}
            </span>
          </div>
        )}

        {/* Scrollable tab area */}
        <div className="flex items-center gap-x-1 overflow-x-auto scrollbar-none min-w-0 flex-1">
          {/* Render panel tabs */}
          {sortedPanels.map((panel, index) => {
          const isPermanent = panel.metadata?.permanent === true;
          const isEditing = editingPanelId === panel.id;
          const isDiffPanel = panel.type === 'diff';
          const displayTitle = isDiffPanel ? 'Diff' : panel.title;
          const statusConfig = getPanelStatusConfig(panel);
          const shortcutHint = index < 9 ? formatKeyDisplay(`alt+${index + 1}`) : undefined;

          const tab = (
            <div
              className={cn(
                "group relative inline-flex items-center h-9 px-3 text-sm whitespace-nowrap cursor-pointer select-none",
                activePanel?.id === panel.id
                  ? "bg-surface-primary text-text-primary"
                  : "text-text-tertiary hover:text-text-primary hover:bg-surface-hover"
              )}
              onClick={() => !isEditing && handlePanelClick(panel)}
              role="tab"
              aria-selected={activePanel?.id === panel.id}
              tabIndex={activePanel?.id === panel.id ? 0 : -1}
              onKeyDown={(e) => {
                if (isEditing) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handlePanelClick(panel);
                }
              }}
            >
              {/* Status indicator for AI panels */}
              {statusConfig && (
                <StatusDot
                  status={statusConfig.status}
                  size="sm"
                  animated={statusConfig.animated}
                  pulse={statusConfig.pulse}
                  className="mr-1"
                />
              )}
              {getPanelIcon(panel.type)}

              {isEditing ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  onBlur={handleRenameSubmit}
                  className="ml-2 px-1 text-sm bg-bg-primary border border-border-primary  rounded outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus text-text-primary"
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: `${Math.max(50, editingTitle.length * 8)}px` }}
                />
              ) : (
                <>
                  <span className="ml-2 text-sm">{displayTitle}</span>
                  {!isPermanent && !isDiffPanel && (
                    <button
                      className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity transition-colors text-text-muted hover:bg-surface-hover hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring-subtle"
                      onClick={(e) => handleStartRename(e, panel)}
                      title="Rename panel"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  )}
                </>
              )}

              {!isPermanent && !isEditing && (
                <button
                  className="ml-1 p-0.5 rounded transition-colors text-text-muted hover:bg-surface-hover hover:text-status-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring-subtle"
                  onClick={(e) => handlePanelClose(e, panel)}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );

          return shortcutHint ? (
            <Tooltip
              key={panel.id}
              content={<kbd className="px-1.5 py-0.5 text-xs font-mono bg-surface-tertiary rounded">{shortcutHint}</kbd>}
              side="bottom"
            >
              {tab}
            </Tooltip>
          ) : <React.Fragment key={panel.id}>{tab}</React.Fragment>;
        })}

        </div>

        {/* Add Panel dropdown button - outside overflow container so dropdown isn't clipped */}
        <div className="relative h-9 flex items-center ml-1 flex-shrink-0" ref={dropdownRef}>
          <button
            className="inline-flex items-center h-9 px-3 text-sm text-text-tertiary hover:text-text-primary hover:bg-surface-hover rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring-subtle"
            onClick={() => setShowDropdown(!showDropdown)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && !showDropdown) {
                e.preventDefault();
                setShowDropdown(true);
              }
            }}
            aria-haspopup="menu"
            aria-expanded={showDropdown}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Tool
            <ChevronDown className="w-3 h-3 ml-1" />
          </button>

          {showDropdown && (() => {
            // Track ref index for keyboard navigation
            let refIndex = 0;
            const menuItemClass = "flex items-center w-full px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus:bg-surface-hover focus:text-text-primary focus:outline-none text-left";

            return (
            <div
              className="absolute top-full left-0 mt-1 bg-surface-primary border border-border-primary rounded shadow-dropdown z-50 animate-dropdown-enter"
              role="menu"
              onKeyDown={handleDropdownKeyDown}
            >
              {/* Terminal with Claude CLI - first option */}
              {availablePanelTypes.includes('terminal') && (
                <button
                  ref={(el) => { dropdownItemsRef.current[refIndex++] = el; }}
                  role="menuitem"
                  className={menuItemClass}
                  onClick={() => handleAddPanel('terminal', {
                    initialCommand: 'claude --dangerously-skip-permissions',
                    title: 'Claude CLI'
                  })}
                >
                  <Terminal className="w-4 h-4" />
                  <span className="ml-2">Terminal (Claude)</span>
                </button>
              )}
              {/* Terminal with Codex CLI - second option */}
              {availablePanelTypes.includes('terminal') && (
                <button
                  ref={(el) => { dropdownItemsRef.current[refIndex++] = el; }}
                  role="menuitem"
                  className={menuItemClass}
                  onClick={() => handleAddPanel('terminal', {
                    initialCommand: 'codex',
                    title: 'Codex CLI'
                  })}
                >
                  <Terminal className="w-4 h-4" />
                  <span className="ml-2">Terminal (Codex)</span>
                </button>
              )}
              {/* Setup Run Script - creates intelligent dev command */}
              {availablePanelTypes.includes('terminal') && (
                <button
                  ref={(el) => { dropdownItemsRef.current[refIndex++] = el; }}
                  role="menuitem"
                  className={menuItemClass}
                  onClick={() => handleAddPanel('terminal', {
                    initialCommand: `claude --dangerously-skip-permissions "${SETUP_RUN_SCRIPT_PROMPT.replace(/\n/g, ' ')}"`,
                    title: 'Setup Run Script'
                  })}
                >
                  <Wrench className="w-4 h-4" />
                  <span className="ml-2">Setup Run Script</span>
                </button>
              )}
              {/* Saved custom commands */}
              {availablePanelTypes.includes('terminal') && customCommands.map((cmd, index) => {
                const currentRefIndex = refIndex++;
                return (
                <div key={`custom-${index}`} className="group/cmd flex items-center w-full text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-within:bg-surface-hover focus-within:text-text-primary">
                  <button
                    ref={(el) => { dropdownItemsRef.current[currentRefIndex] = el; }}
                    role="menuitem"
                    className="flex items-center flex-1 px-4 py-2 text-left min-w-0 focus:outline-none"
                    onClick={() => handleAddPanel('terminal', {
                      initialCommand: cmd.command,
                      title: cmd.name
                    })}
                    onKeyDown={(e) => {
                      // Delete or Backspace removes the custom command
                      if (e.key === 'Delete' || e.key === 'Backspace') {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteCustomCommand(index);
                      }
                    }}
                    title={`${cmd.name} (Delete/Backspace to remove)`}
                  >
                    <TerminalSquare className="w-4 h-4 flex-shrink-0" />
                    <span className="ml-2 truncate">{cmd.name}</span>
                  </button>
                </div>
              );})}
              {/* Add Custom Command input */}
              {availablePanelTypes.includes('terminal') && (
                showCustomInput ? (
                  <div className="px-3 py-2 border-b border-border-primary">
                    <label className="text-xs text-text-tertiary mb-1 block">Command to run:</label>
                    <input
                      ref={(el) => { customInputRef.current = el; dropdownItemsRef.current[refIndex++] = el; }}
                      type="text"
                      className="w-full px-2 py-1.5 text-sm bg-surface-secondary border border-border-primary rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus"
                      placeholder="e.g. aider, npm run dev, bash"
                      value={customCommand}
                      onChange={(e) => setCustomCommand(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && customCommand.trim()) {
                          const command = customCommand.trim();
                          const name = command.split(/\s+/).slice(0, 3).join(' ');
                          saveCustomCommand(name, command);
                          handleAddPanel('terminal', {
                            initialCommand: command,
                            title: name
                          });
                          setCustomCommand('');
                          setShowCustomInput(false);
                        }
                        if (e.key === 'Escape') {
                          setShowCustomInput(false);
                          setCustomCommand('');
                        }
                        // Let arrow keys propagate for dropdown navigation
                      }}
                    />
                  </div>
                ) : (
                  <button
                    ref={(el) => { dropdownItemsRef.current[refIndex++] = el; }}
                    role="menuitem"
                    className={`${menuItemClass} border-b border-border-primary`}
                    onClick={() => setShowCustomInput(true)}
                  >
                    <Plus className="w-4 h-4" />
                    <span className="ml-2">Add Custom Command...</span>
                  </button>
                )
              )}
              {/* Other panel types */}
              {availablePanelTypes.map((type) => {
                const currentRefIndex = refIndex++;
                return (
                <button
                  key={type}
                  ref={(el) => { dropdownItemsRef.current[currentRefIndex] = el; }}
                  role="menuitem"
                  className={menuItemClass}
                  onClick={() => handleAddPanel(type)}
                >
                  {getPanelIcon(type)}
                  <span className="ml-2 capitalize">{type}</span>
                </button>
              );})}
            </div>
            );
          })()}
        </div>

        {/* Run Dev Server button */}
        {session && (
          <Tooltip content="Run Dev Server" side="bottom">
            <button
              className="inline-flex items-center h-9 px-2 text-text-tertiary hover:text-status-success hover:bg-surface-hover transition-colors flex-shrink-0"
              onClick={async () => {
                // Check if foozol-run-script.js exists in this session's worktree
                const scriptExists = await window.electronAPI?.invoke('file:exists', {
                  sessionId: session.id,
                  filePath: 'scripts/foozol-run-script.js'
                });

                if (scriptExists) {
                  // Script exists - run it
                  handleAddPanel('terminal', {
                    initialCommand: 'node scripts/foozol-run-script.js',
                    title: 'Dev Server'
                  });
                } else {
                  // Script doesn't exist - trigger Claude to create it
                  handleAddPanel('terminal', {
                    initialCommand: `claude --dangerously-skip-permissions "${SETUP_RUN_SCRIPT_PROMPT.replace(/\n/g, ' ')}"`,
                    title: 'Setup Run Script'
                  });
                }
              }}
              title="Run Dev Server"
            >
              <Play className="w-4 h-4" />
            </button>
          </Tooltip>
        )}

        {/* Right side actions */}
        <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
          {/* Git Branch Actions - only in worktree context */}
          {context === 'worktree' && gitBranchActions && gitBranchActions.length > 0 && (
            <Dropdown
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-2 px-3 py-1 h-7"
                  disabled={isMerging}
                >
                  <GitBranch className="w-4 h-4" />
                  <span className="text-sm">Git Branch Actions</span>
                  <MoreVertical className="w-3 h-3" />
                </Button>
              }
              items={gitBranchActions}
              position="bottom-right"
            />
          )}

          {/* Detail panel toggle */}
          {onToggleDetailPanel && (
            <button
              onClick={onToggleDetailPanel}
              className={cn(
                "p-1.5 rounded transition-colors",
                detailPanelVisible
                  ? "text-text-primary bg-surface-hover"
                  : "text-text-tertiary hover:text-text-primary hover:bg-surface-hover"
              )}
              title={detailPanelVisible ? "Hide detail panel" : "Show detail panel"}
            >
              <PanelRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

PanelTabBar.displayName = 'PanelTabBar';
