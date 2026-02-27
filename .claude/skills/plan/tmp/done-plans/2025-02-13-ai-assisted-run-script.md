# Plan: AI-Assisted Run Script Generation in New Project Dialog

## Overview

Add an AI-assisted run script generation feature to the "Add New Repository" dialog in `ProjectSessionList.tsx`. When enabled (default), after project creation, the app will navigate to the project and open a Claude or Codex panel with a pre-filled prompt to generate a `crystal-run.sh` script.

## Problem Statement

With git worktrees, each worktree needs a run script that:
1. Works from any worktree directory (not just the main repo)
2. Handles finding dependencies (node_modules) in parent directories
3. Uses dynamic port allocation so multiple worktrees can run simultaneously
4. Safely handles existing running instances

Currently, users must manually configure run scripts, which is error-prone for worktree setups.

## Solution

Add a checkbox (enabled by default) in the New Repository dialog:
- "Help me create a run script"
- Toggle pills to select Claude or Codex (using existing TogglePillImproved component)
- After project creation, navigate to project view and open AI panel with pre-filled prompt

## Key Files

- **Dialog**: `frontend/src/components/ProjectSessionList.tsx`
- **Project View**: `frontend/src/components/ProjectView.tsx`
- **Claude Panel**: `frontend/src/components/panels/claude/ClaudePanel.tsx`
- **Codex Panel**: `frontend/src/components/panels/codex/CodexPanel.tsx`
- **Panel API**: `frontend/src/services/panelApi.ts`
- **Navigation Store**: `frontend/src/stores/navigationStore.ts`
- **UI Component**: `frontend/src/components/ui/TogglePillImproved.tsx`

## The Run Script Prompt

Generic but descriptive about how crystal-run.sh works with foozol/foozol:

```typescript
const RUN_SCRIPT_PROMPT = `I'm using foozol (foozol), a tool that manages multiple AI coding sessions using git worktrees. Each session runs in its own worktree directory.

Please analyze this project and create a **crystal-run.sh** script. This script needs to:

1. **Work from any git worktree** - Detect if running from a worktree subdirectory and resolve paths correctly. The main repo might be at ../.. or similar relative to the worktree.

2. **Dynamic port allocation** - Generate a unique port based on the current directory path (e.g., hash the path and use: base_port + (hash % 1000)). This allows multiple worktrees to run the same project simultaneously without port conflicts.

3. **Find dependencies intelligently** - For Node.js projects, check for node_modules locally first, then in parent directories. For Python, check for venv/virtualenv. Handle monorepo structures.

4. **Safe process management** - Before starting, check if something is already running on the calculated port and offer to kill it or pick a different port.

5. **Auto-detect project type** - Look for package.json, requirements.txt, Cargo.toml, go.mod, etc. and use the appropriate start command.

6. **Clear output** - Print the URL/port being used so the user knows where to access the running app.

First, analyze the project structure to understand what type of project this is, then create the crystal-run.sh script with clear comments.`;
```

## Implementation

### Task 1: Add state and imports to ProjectSessionList.tsx

**File**: `frontend/src/components/ProjectSessionList.tsx`

Add imports at the top:
```typescript
import { Brain, Code2 } from 'lucide-react';
import { TogglePillImproved } from './ui/TogglePillImproved';
```

Add to existing useNavigationStore import (around line 4):
```typescript
const navigateToProject = useNavigationStore(s => s.navigateToProject);
```

Add state variables after line 32 (after `showValidationErrors`):
```typescript
// AI-assisted run script state
const [generateRunScript, setGenerateRunScript] = useState(true);
const [selectedAiTool, setSelectedAiTool] = useState<'claude' | 'codex'>('claude');
```

Add the prompt constant after imports (before the component):
```typescript
const RUN_SCRIPT_PROMPT = `I'm using foozol (foozol), a tool that manages multiple AI coding sessions using git worktrees. Each session runs in its own worktree directory.

Please analyze this project and create a **crystal-run.sh** script. This script needs to:

1. **Work from any git worktree** - Detect if running from a worktree subdirectory and resolve paths correctly. The main repo might be at ../.. or similar relative to the worktree.

2. **Dynamic port allocation** - Generate a unique port based on the current directory path (e.g., hash the path and use: base_port + (hash % 1000)). This allows multiple worktrees to run the same project simultaneously without port conflicts.

3. **Find dependencies intelligently** - For Node.js projects, check for node_modules locally first, then in parent directories. For Python, check for venv/virtualenv. Handle monorepo structures.

4. **Safe process management** - Before starting, check if something is already running on the calculated port and offer to kill it or pick a different port.

5. **Auto-detect project type** - Look for package.json, requirements.txt, Cargo.toml, go.mod, etc. and use the appropriate start command.

6. **Clear output** - Print the URL/port being used so the user knows where to access the running app.

First, analyze the project structure to understand what type of project this is, then create the crystal-run.sh script with clear comments.`;
```

### Task 2: Add UI for AI run script option

**File**: `frontend/src/components/ProjectSessionList.tsx`

Add after the Detected Branch section (around line 475, before `</div>` closing ModalBody):

```tsx
{/* AI-Assisted Run Script */}
<div className="pt-4 border-t border-border-primary">
  <FieldWithTooltip
    label="Run Script Setup"
    tooltip="Let AI analyze your project and create a crystal-run.sh script that works with git worktrees and handles dynamic port allocation."
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
```

### Task 3: Modify handleCreateProject

**File**: `frontend/src/components/ProjectSessionList.tsx`

Replace the existing `handleCreateProject` function (around line 215):

```typescript
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
      runScript: generateRunScript ? './crystal-run.sh' : newProject.runScript
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
```

### Task 4: Handle pending prompt in ProjectView.tsx

**File**: `frontend/src/components/ProjectView.tsx`

Add import at top:
```typescript
import { useErrorStore } from '../stores/errorStore';
```

Add state after line 31 (after existing state declarations):
```typescript
const [pendingAiPrompt, setPendingAiPrompt] = useState<{ aiTool: 'claude' | 'codex'; prompt: string } | null>(null);
const { showError } = useErrorStore();
```

Add effect to check for pending prompt (after the panels loading useEffect, around line 140):
```typescript
// Check for pending AI prompt from project creation
useEffect(() => {
  if (mainRepoSessionId && !isLoadingSession) {
    const pendingKey = `pending-ai-prompt-${projectId}`;
    const pendingData = localStorage.getItem(pendingKey);

    if (pendingData) {
      try {
        const parsed = JSON.parse(pendingData);
        // Validate the parsed data
        if (parsed && (parsed.aiTool === 'claude' || parsed.aiTool === 'codex') && typeof parsed.prompt === 'string') {
          setPendingAiPrompt(parsed as { aiTool: 'claude' | 'codex'; prompt: string });
        }
        localStorage.removeItem(pendingKey);
      } catch (e) {
        console.error('Failed to parse pending AI prompt:', e);
        localStorage.removeItem(pendingKey);
      }
    }
  }
}, [mainRepoSessionId, projectId, isLoadingSession]);

// Cleanup pending prompt on unmount
useEffect(() => {
  return () => {
    // If we unmount before processing, clean up the pending prompt
    const pendingKey = `pending-ai-prompt-${projectId}`;
    localStorage.removeItem(pendingKey);
  };
}, [projectId]);

// Create AI panel when pending prompt is set
useEffect(() => {
  if (pendingAiPrompt && mainRepoSessionId && !isLoadingSession) {
    const createAiPanel = async () => {
      try {
        // Create new AI panel (always create new, don't reuse)
        const newPanel = await panelApi.createPanel({
          sessionId: mainRepoSessionId,
          type: pendingAiPrompt.aiTool,
          title: pendingAiPrompt.aiTool === 'claude' ? 'Claude' : 'Codex'
        });

        // Add panel to store
        addPanel(newPanel);

        // Activate the panel
        setActivePanelInStore(mainRepoSessionId, newPanel.id);
        await panelApi.setActivePanel(mainRepoSessionId, newPanel.id);

        // Store the pending input for the panel to pick up
        localStorage.setItem(`pending-panel-input-${newPanel.id}`, pendingAiPrompt.prompt);

        // Clear the pending prompt
        setPendingAiPrompt(null);
      } catch (error) {
        console.error('Failed to create AI panel:', error);
        showError({
          title: 'Failed to Create AI Panel',
          error: 'Could not create AI panel for run script generation. You can manually add a Claude or Codex panel.'
        });
        setPendingAiPrompt(null);
      }
    };

    createAiPanel();
  }
}, [pendingAiPrompt, mainRepoSessionId, isLoadingSession, addPanel, setActivePanelInStore, showError]);
```

### Task 5: Handle pending input in ClaudePanel.tsx

**File**: `frontend/src/components/panels/claude/ClaudePanel.tsx`

Find where `setInput` is used (from the useClaudePanel hook) and add effect:
```typescript
// Check for pending input from project creation
useEffect(() => {
  if (panel?.id) {
    const pendingKey = `pending-panel-input-${panel.id}`;
    const pendingInput = localStorage.getItem(pendingKey);

    if (pendingInput) {
      setInput(pendingInput);
      localStorage.removeItem(pendingKey);
    }
  }
}, [panel?.id, setInput]);
```

### Task 6: Handle pending input in CodexPanel.tsx

**File**: `frontend/src/components/panels/codex/CodexPanel.tsx`

Find where `setInput` is used (from the useCodexPanel hook) and add effect:
```typescript
// Check for pending input from project creation
useEffect(() => {
  if (panel?.id) {
    const pendingKey = `pending-panel-input-${panel.id}`;
    const pendingInput = localStorage.getItem(pendingKey);

    if (pendingInput) {
      setInput(pendingInput);
      localStorage.removeItem(pendingKey);
    }
  }
}, [panel?.id, setInput]);
```

## Validation Gates

1. `pnpm typecheck` passes
2. `pnpm lint` passes (or only pre-existing warnings)
3. Manual testing:
   - Create new project with "Help me create a run script" checked
   - Verify navigation to project view
   - Verify Claude/Codex panel is created and active
   - Verify input field is pre-filled with the prompt
   - User can review, modify, and send the prompt

## Deprecated Code to Remove

None - this is a new feature addition.

## Risk Assessment

- **Low risk**: Uses localStorage for state passing (simple, no complex async)
- **Mitigated**: Race conditions handled by checking `isLoadingSession`
- **Mitigated**: Cleanup on unmount prevents stale localStorage data
- **Mitigated**: Error feedback shown to user if panel creation fails

## Confidence Score: 9/10

The approach is straightforward, uses existing UI components, and has proper error handling and cleanup.
