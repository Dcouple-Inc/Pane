---
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git rev-parse:*), Bash(git branch:*), Read, Grep, Glob, TodoWrite
description: Check for documentation standards violations
---

# /review:documentation - Documentation Standards Checker

You are reviewing code changes for violations of **documentation standards**.

## The Principle

All major files, classes, and functionality must have documentation. Documentation helps both humans and LLMs understand code purpose and usage.

**Key requirements:**
- File-level comments explaining purpose
- JSDoc for complex functions/hooks
- Inline comments for non-obvious logic
- TODOs with context

## Phase 1: Gather Context

```bash
# Get current branch
git rev-parse --abbrev-ref HEAD

# Get changed files
git diff main...HEAD --name-only

# Get new files (these MUST have documentation)
git diff main...HEAD --name-status | grep "^A"

# Get full diff
git diff main...HEAD
```

Use TodoWrite to track files needing documentation review.

## Phase 2: Check Documentation Standards

### 2.1 File-Level Documentation

**Every new file should have a top comment:**

```typescript
// CORRECT - Service with purpose
/**
 * FeedService handles all feed-related operations including
 * fetching, filtering, and updating feed items.
 */
export class FeedService extends BaseService {
  // ...
}

// CORRECT - Hook with purpose and usage
/**
 * useFeedPage orchestrates the feed page state and actions.
 *
 * Combines feed data fetching, filtering, and user actions
 * into a single hook for the FeedPage component.
 *
 * @example
 * const { items, isLoading, handleRefresh } = useFeedPage();
 */
export function useFeedPage() {
  // ...
}

// CORRECT - Component with purpose
/**
 * DictationButton provides voice-to-text input functionality.
 *
 * Displays a microphone button that starts/stops dictation,
 * shows a waveform during recording, and handles errors.
 *
 * Sizes: 'sm' (compact), 'md' (default), 'lg' (prominent)
 */
export function DictationButton({ size = 'md', ...props }) {
  // ...
}

// WRONG - No file documentation
export class FeedService extends BaseService {
  // ...
}
```

### 2.2 Complex Function Documentation

**Functions with non-obvious behavior need JSDoc:**

```typescript
// CORRECT - Complex function documented
/**
 * Calculates the optimal batch size for audio processing.
 *
 * Uses a heuristic based on available memory and audio duration
 * to prevent OOM errors while maximizing throughput.
 *
 * @param audioDuration - Duration in seconds
 * @param availableMemory - Available memory in bytes
 * @returns Optimal batch size (1-100)
 */
function calculateBatchSize(audioDuration: number, availableMemory: number): number {
  // Complex calculation...
}

// WRONG - Complex logic without explanation
function calculateBatchSize(audioDuration: number, availableMemory: number): number {
  return Math.min(100, Math.max(1, Math.floor(availableMemory / (audioDuration * 1024 * 1024))));
}
```

### 2.3 Inline Comments for Non-Obvious Logic

**Explain the "why", not the "what":**

```typescript
// CORRECT - Explains why
// Wait 150ms for final WebSocket transcript update before completing
await new Promise(resolve => setTimeout(resolve, 150));

// Use mutex ref to prevent rapid double-clicks from starting multiple sessions
if (startingRef.current) return;
startingRef.current = true;

// WRONG - States the obvious
// Set loading to true
setLoading(true);

// Call the API
const result = await api.fetch();
```

### 2.4 TODO Standards

**TODOs must have context:**

```typescript
// CORRECT - TODO with context
// TODO(#123): Add retry logic for network failures
// TODO(@username): Refactor after API v2 migration

// WRONG - Orphaned TODO
// TODO: fix this
// TODO: do something
```

### 2.5 Hook Documentation

**Hooks should document their purpose and return values:**

```typescript
// CORRECT
/**
 * useDictation manages voice dictation recording and transcription.
 *
 * Handles:
 * - Microphone access and MediaStream management
 * - WebSocket connection for real-time transcription
 * - Recording state machine (idle → connecting → recording → stopping)
 *
 * @param options.workspaceId - Workspace for transcription context
 * @param options.onComplete - Called with final transcript when stopped
 *
 * @returns {Object} Dictation controls and state
 * @returns {boolean} isRecording - Whether actively recording
 * @returns {boolean} isConnecting - Whether establishing connection
 * @returns {Function} start - Begin dictation
 * @returns {Function} stop - End dictation and trigger onComplete
 */
export function useDictation(options: UseDictationOptions): UseDictationReturn {
  // ...
}
```

### 2.6 Component Props Documentation

**Complex props should be documented:**

```typescript
// CORRECT
interface DictationButtonProps {
  /** Button size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Workspace ID for transcription context */
  workspaceId: string;
  /** Called when dictation completes with transcript */
  onComplete?: (transcript: string) => void;
  /** Whether the button is disabled */
  disabled?: boolean;
}

// Also acceptable - inline comments
interface DictationButtonProps {
  size?: 'sm' | 'md' | 'lg';  // Button size variant
  workspaceId: string;         // Workspace for transcription
  onComplete?: (transcript: string) => void;
  disabled?: boolean;
}
```

## Phase 3: Generate Report

```markdown
# Documentation Standards Report

**Branch:** {branch}
**Status:** {PASS | WARN | FAIL}

## Summary

{One sentence assessment of documentation quality}

## Files Checked

- **New files:** {count}
- **Modified files:** {count}
- **Files needing documentation:** {count}

## Documentation Issues

### Critical (Must Fix)

| File | Issue |
|------|-------|
| {file} | New file missing file-level documentation |
| {file} | Complex function without JSDoc |

### Warnings

| Location | Issue | Suggestion |
|----------|-------|------------|
| {file:line} | {description} | {what to add} |

## New Files Missing Documentation

| File | Type | Required Documentation |
|------|------|------------------------|
| {file} | {service/hook/component} | File-level JSDoc explaining purpose |

## Complex Code Lacking Comments

| Location | Complexity | Suggestion |
|----------|------------|------------|
| {file:line} | {what's complex} | {what to document} |

## Orphaned TODOs

| Location | Current | Should Be |
|----------|---------|-----------|
| {file:line} | `// TODO: fix` | `// TODO(#issue): description` |

## Good Documentation Examples

{List any well-documented files in this PR as examples}

## Recommendations

1. {specific action with file reference}
2. {specific action with file reference}

## Documentation Templates

**Service:**
```typescript
/**
 * {ServiceName} handles {domain} operations including
 * {list main responsibilities}.
 */
```

**Hook:**
```typescript
/**
 * {hookName} manages {what it manages}.
 *
 * @param options.{param} - {description}
 * @returns {description of return object}
 */
```

**Component:**
```typescript
/**
 * {ComponentName} renders {what it displays}.
 *
 * {Additional context about variants, states, etc.}
 */
```
```

## Phase 4: Output

1. Save report to `tmp/review-documentation-{branch}.md`
2. Present summary:
   - PASS/WARN/FAIL status
   - Count of undocumented files
   - Most critical gaps

## Scoring Criteria

- **PASS**: All new files have file-level documentation, complex logic explained
- **WARN**: Some documentation gaps but major files covered
- **FAIL**: New files missing documentation, complex code unexplained

## What Requires Documentation

| File Type | Required | Optional |
|-----------|----------|----------|
| New service | File-level JSDoc | Method JSDoc |
| New hook | File-level JSDoc with returns | Usage example |
| New component | File-level comment | Props JSDoc |
| Complex function | JSDoc with params/returns | - |
| Non-obvious logic | Inline comment | - |
| TODO | Issue number or context | - |

## Why Documentation Matters

1. **LLM Context**: Claude Code uses documentation to understand code purpose
2. **Onboarding**: New developers understand code faster
3. **Maintenance**: Future you will thank present you
4. **Code Review**: Reviewers understand intent quickly
5. **Pattern Recognition**: Documented code shows what patterns to follow

Run this analysis now on the current branch.
