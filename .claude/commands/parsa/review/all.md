---
description: Run comprehensive code review spawning parallel agents for each of the 11 core principles
---

# /review:all - Comprehensive Code Review

You are orchestrating a code review that checks 11 core principles in parallel. Each principle is checked by a dedicated subagent.

**Individual principle commands** (can be run standalone):
- `/review:principles:reuse` - Reuse Over Recreation
- `/review:principles:clarity` - Clarity & Readability
- `/review:principles:scope` - Correct Scope
- `/review:principles:antipatterns` - No Anti-Patterns
- `/review:principles:single-pattern` - Single Way to Do Things (MOST IMPORTANT)
- `/review:principles:architecture-backend` - Backend Architecture
- `/review:principles:architecture-frontend` - Frontend Architecture
- `/review:principles:documentation` - Documentation Standards
- `/review:principles:circular-deps` - Circular Dependencies
- `/review:principles:self-contained` - Self-Contained Components
- `/review:principles:tanstack-query` - TanStack Query Patterns

## Step 1: Gather Branch Context

First, get the current branch and diff:

```bash
# Get current branch name
git rev-parse --abbrev-ref HEAD

# Get list of changed files
git diff main...HEAD --name-only

# Get diff stat for summary
git diff main...HEAD --stat
```

Store the branch name and changed files list for the agents.

## Step 2: Spawn 11 Review Agents in Parallel

Use the Task tool to spawn 11 agents simultaneously (in a single message with multiple tool calls). Each agent checks one principle.

**CRITICAL**: All 11 agents must be spawned in parallel using a single message with 11 Task tool calls.

### Agent 1: Reuse Over Recreation
```
subagent_type: "reviewer"
description: "Check reuse principle"
prompt: |
  Review branch '{branch}' for violations of the REUSE OVER RECREATION principle.

  Changed files: {file_list}

  ## The Principle
  Minimize lines of code. Reuse existing patterns. Avoid duplicating functionality.
  More code = larger maintenance surface area.
  Key question: "Did we implement with the least amount of lines?"

  ## What to Check
  1. Get the full diff: git diff main...HEAD
  2. For each new function/hook/component, search the codebase for similar existing implementations
  3. Check libs/shared/ for utilities that could have been reused
  4. Look for copy-pasted code blocks
  5. Identify new abstractions where existing ones would work

  ## Output Format
  Return a structured report:
  - PASS/WARN/FAIL status
  - List of violations with file:line references
  - Existing patterns that should have been used
  - Recommendations
```

### Agent 2: Clarity & Readability
```
subagent_type: "reviewer"
description: "Check clarity principle"
prompt: |
  Review branch '{branch}' for violations of the CLARITY & READABILITY principle.

  Changed files: {file_list}

  ## The Principle
  Code should be easy to understand. Good code feels clean.
  Single 200-line function with nested if-statements = bad code.
  Look for "hot spots" (ugly-feeling code) that need rethinking.
  Junior engineers sometimes blame themselves; often the code is just bad.

  ## What to Check
  1. Get the full diff: git diff main...HEAD
  2. Read each changed file fully
  3. Flag functions over 50 lines (warning) or 100 lines (critical)
  4. Flag nested conditionals > 3 levels deep
  5. Identify unclear variable/function names
  6. Find magic numbers/strings without explanation
  7. Look for complex logic without comments

  ## Output Format
  Return a structured report:
  - PASS/WARN/FAIL status
  - Hot spots identified with file:line references
  - Specific readability issues
  - Recommendations for improvement
```

### Agent 3: Correct Scope
```
subagent_type: "reviewer"
description: "Check scope principle"
prompt: |
  Review branch '{branch}' for violations of the CORRECT SCOPE principle.

  Changed files: {file_list}

  ## The Principle
  A PR should address ONE thing, not three bundled together.
  Multiple unrelated files = harder to review, confusing intent.
  One objective = clearer, more reviewable.

  ## What to Check
  1. Get the full diff: git diff main...HEAD
  2. Analyze each changed file and categorize the change type
  3. List all distinct features/fixes/refactors in this PR
  4. Check if changes are cohesive (all related to one goal)
  5. Flag "while I was in here..." changes
  6. Flag mixed feature + refactor + bugfix

  ## Output Format
  Return a structured report:
  - PASS/WARN/FAIL status
  - List of distinct objectives found in this PR
  - Assessment: Are these related or should this be split?
  - Recommendations
```

### Agent 4: No Anti-Patterns
```
subagent_type: "reviewer"
description: "Check anti-patterns"
prompt: |
  Review branch '{branch}' for ANTI-PATTERNS.

  Changed files: {file_list}

  ## The Principle
  Avoid async imports mid-code, unused conventions, established pattern violations.
  Anti-patterns change as codebase evolves; hard to codify in static docs.
  Better caught through active research.

  ## What to Check
  1. Get the full diff: git diff main...HEAD
  2. Read CLAUDE.md files for established patterns
  3. Check import style (should use @/ aliases, not relative paths)
  4. Verify error handling follows existing patterns
  5. Look for dynamic imports that should be static
  6. Check for inconsistent async/callback patterns
  7. Verify file structure conventions are followed

  ## Codebase Conventions to Check
  - Imports must use @/ path aliases (not ../../../)
  - Shared code goes in libs/shared/
  - API follows MVC with service layer pattern
  - Frontend uses TanStack Query for data fetching

  ## Output Format
  Return a structured report:
  - PASS/WARN/FAIL status
  - Anti-patterns found with file:line references
  - Convention violations
  - Recommendations
```

### Agent 5: Single Way to Do Things (MOST IMPORTANT)
```
subagent_type: "reviewer"
description: "Check single-pattern principle"
prompt: |
  Review branch '{branch}' for violations of the SINGLE WAY TO DO THINGS principle.
  THIS IS THE MOST IMPORTANT PRINCIPLE.

  Changed files: {file_list}

  ## The Principle
  Only ONE implementation pattern per feature/behavior in codebase.
  LLMs default to creating new patterns when they see multiple ways to solve same problem.
  If two hooks exist for audio recording, LLM will create a third for next feature.
  If one unified hook exists in multiple places, LLM reuses it.
  Critical for scaling codebase and reducing proliferation of similar code.

  ## What to Check
  1. Get the full diff: git diff main...HEAD
  2. For EACH new pattern introduced (hook, component, utility, API endpoint):
     a. Search the entire codebase for similar functionality
     b. List all existing approaches to the same problem
     c. Flag if multiple ways to do the same thing now exist
  3. Specific checks:
     - New hooks: Do similar hooks already exist?
     - New API patterns: Is this consistent with other endpoints?
     - New component patterns: How do similar components work?
     - New utilities: Check libs/shared/ and local utils

  ## Output Format
  Return a structured report:
  - PASS/WARN/FAIL status
  - New patterns introduced (list each one)
  - Existing alternatives that should have been used
  - Pattern proliferation risk assessment
  - Recommendations
```

### Agent 6: Backend Architecture
```
subagent_type: "reviewer"
description: "Check backend architecture"
prompt: |
  Review branch '{branch}' for violations of BACKEND ARCHITECTURE patterns.

  Changed files: {file_list}

  ## The Principles
  1. authenticatedHandler Pattern: Controllers must use authenticatedHandler wrapper, no try/catch
  2. BaseService Pattern: Services using DB must extend BaseService to get this.db
  3. ApiError Pattern: Throw ApiError with status codes, not generic Error
  4. Controller-Service Separation: Controllers delegate to services, no business logic

  ## What to Check
  1. Get the full diff: git diff main...HEAD -- "apps/api/"
  2. Read apps/api/CLAUDE.md for backend patterns
  3. For each controller: verify authenticatedHandler usage, no try/catch, no business logic
  4. For each service: verify BaseService extension, ApiError usage, single responsibility
  5. Check validators use Zod schemas

  ## Exemplars
  - Controller: apps/api/src/modules/feed/controllers/feed.controller.ts
  - Service: apps/api/src/modules/feed/services/feed.service.ts

  ## Output Format
  Return a structured report:
  - PASS/WARN/FAIL status
  - Controller issues (missing wrapper, try/catch, business logic)
  - Service issues (not extending BaseService, throwing Error)
  - Recommendations
```

### Agent 7: Frontend Architecture
```
subagent_type: "reviewer"
description: "Check frontend architecture"
prompt: |
  Review branch '{branch}' for violations of FRONTEND ARCHITECTURE patterns.

  Changed files: {file_list}

  ## The Principles
  1. Thin Pages: Pages are JSX composition only, all logic in orchestration hooks
  2. Underscore-Prefix Locality: _components/, _hooks/ = local only; src/ = shared
  3. TanStack Query: Query keys include all deps, mutations invalidate on success
  4. Hooks Never Return JSX: Hooks return data/functions only

  ## What to Check
  1. Get the full diff: git diff main...HEAD -- "apps/webapp/"
  2. Read apps/webapp/CLAUDE.md and apps/webapp/src/hooks/CLAUDE.md
  3. For each page: verify thin composition, uses orchestration hook
  4. For each hook: verify returns data not JSX, proper query patterns
  5. Check locality: local code in _folders/, shared code in src/

  ## Exemplars
  - Page: apps/webapp/src/app/(protected)/workspaces/[workspaceId]/feed/page.tsx
  - Hook: apps/webapp/src/app/(protected)/workspaces/[workspaceId]/archive/useArchivePage.ts

  ## Output Format
  Return a structured report:
  - PASS/WARN/FAIL status
  - Page issues (business logic in pages, missing orchestration hooks)
  - Hook issues (returning JSX, wrong query patterns)
  - Locality issues (wrong placement of components/hooks)
  - Recommendations
```

### Agent 8: Documentation Standards
```
subagent_type: "reviewer"
description: "Check documentation standards"
prompt: |
  Review branch '{branch}' for violations of DOCUMENTATION STANDARDS.

  Changed files: {file_list}

  ## The Principle
  All major files must have documentation. Helps humans and LLMs understand code.

  ## What to Check
  1. Get the full diff: git diff main...HEAD
  2. Get new files: git diff main...HEAD --name-status | grep "^A"
  3. For each NEW file: verify file-level JSDoc comment exists
  4. For complex functions: verify JSDoc with params/returns
  5. For non-obvious logic: verify inline comments explain "why"
  6. Check TODOs have context (issue number or explanation)

  ## Required Documentation
  - New service: File-level JSDoc explaining purpose
  - New hook: File-level JSDoc with usage example
  - New component: File-level comment describing what it renders
  - Complex logic: Inline comments explaining why

  ## Output Format
  Return a structured report:
  - PASS/WARN/FAIL status
  - New files missing documentation
  - Complex code lacking explanation
  - Orphaned TODOs without context
  - Recommendations
```

### Agent 9: Circular Dependencies
```
subagent_type: "reviewer"
description: "Check circular dependencies"
prompt: |
  Review branch '{branch}' for CIRCULAR DEPENDENCIES indicated by late imports.

  Changed files: {file_list}

  ## The Principle
  Imports should appear at top of files (within first 40 lines).
  Late imports indicate: circular dependencies, missing DI, architectural smell.
  This codebase has ZERO tolerance for late imports.

  ## What to Check
  1. Get the full diff: git diff main...HEAD
  2. Read each changed file completely
  3. Scan for imports AFTER line 40:
     - ES6: import ... from '...'
     - CommonJS: require('...')
     - Dynamic: await import('...')
  4. EXCEPTION: React.lazy() and Next.js dynamic() are acceptable
  5. For each late import, diagnose root cause:
     - Inside constructor = circular dependency
     - Conditional import = should be injected
     - Mid-function = should be top-level

  ## Reference
  Proper DI pattern: apps/api/src/bootstrap/services.ts

  ## Output Format
  Return a structured report:
  - PASS/WARN/FAIL status
  - Late imports found with file:line
  - Root cause analysis for each
  - Circular dependency chains identified
  - Recommendations for fixing
```

### Agent 10: Self-Contained Components
```
subagent_type: "reviewer"
description: "Check self-contained components"
prompt: |
  Review branch '{branch}' for violations of the SELF-CONTAINED COMPONENTS principle.

  Changed files: {file_list}

  ## The Principle
  Temporary, optional, or removable UI elements should be self-contained.
  Removing or adding the component should only require touching ONE file.

  Problems with non-self-contained components:
  - Removing a feature requires changes across multiple files
  - Easy to forget to revert all related changes
  - Creates hidden dependencies between files

  ## What to Check
  1. Get the full diff: git diff main...HEAD
  2. Identify temporary/optional components (banners, promos, announcements, feature flags)
  3. For each: check if adding it required changes to other files (navbar positioning, layout padding, etc.)
  4. Simulate removal: how many files would need changes?
  5. Look for hardcoded offsets/padding that depend on optional components

  ## Good Patterns
  - CSS variables with fallbacks: var(--banner-height, 0px)
  - Spacer elements included in component
  - useEffect cleanup for CSS variables
  - Components own their own configuration

  ## Bad Patterns
  - Hardcoded navbar top-10 to account for banner
  - Manual layout padding changes
  - Constants imported from temporary component
  - Props threading banner state through components

  ## Output Format
  Return a structured report:
  - PASS/WARN/FAIL status
  - Temporary components found
  - Self-containment issues with file:line
  - Number of files that would need changes on removal
  - Recommendations
```

### Agent 11: TanStack Query Patterns
```
subagent_type: "reviewer"
description: "Check TanStack Query patterns"
prompt: |
  Review branch '{branch}' for violations of TANSTACK QUERY PATTERNS.

  Changed files: {file_list}

  ## The Principles
  1. Domain-Specific Hierarchical Query Key Factories: Every domain gets its own `<domain>Keys.ts` with `all` → `lists()` → `detail()`. Self-referential (spread from `...keys.all`), param normalization, `as const`. Never raw string arrays. Never add domain keys to the flat `qk` object.
  2. Optimistic Updates via `onMutate`: All optimistic state changes inside `onMutate` with snapshot + rollback. Never mutate cache from component handlers.
  3. Instant Loading via `initialData`: List-to-detail navigation uses `initialData` from list cache via `findXInCache` helpers.
  4. Correct Invalidation: Invalidation keys must structurally match query keys (same prefix hierarchy).

  ## Gold Standard Exemplars
  - Query key factory: apps/webapp/src/hooks/feed/feedKeys.ts
  - Query key factory: apps/webapp/src/hooks/conversations/conversationKeys.ts
  - Optimistic update: apps/webapp/src/hooks/todos/useTodo.ts (useUpdateTodoTitle)
  - Cache seeding: apps/webapp/src/hooks/feed/useFeedItem.ts (findFeedItemInCache)
  - Full infinite query: apps/webapp/src/hooks/feed/useFeed.ts

  ## What to Check
  1. Get the full diff: git diff main...HEAD
  2. Search for raw string query keys: `queryKey: ['`
  3. Search for `qk.` usage — check if domain factory should be used instead
  4. Check new mutations for `onMutate` with snapshot/rollback pattern
  5. Check new detail hooks for `initialData` cache seeding
  6. Verify invalidation keys match query keys structurally
  7. Check for `setQueryData`/`setQueriesData` outside of `onMutate`

  ## Known Issues (for context, don't re-report)
  - `qk` has duplicate conversation keys that conflict with `conversationKeys` — this is a known tech debt item

  ## Output Format
  Return a structured report:
  - PASS/WARN/FAIL status
  - Raw string key violations with file:line
  - Wrong factory usage (qk vs domain factory) with file:line
  - Missing optimistic update patterns
  - Missing cache seeding opportunities
  - Mismatched invalidation keys (CRITICAL)
  - Recommendations
```

## Step 3: Aggregate Results

After all 11 agents complete, aggregate their reports into a final summary:

```markdown
# Code Review Report: {branch}

## Overall Status: {PASS/WARN/FAIL}

## Principle Scores

| Principle | Status | Issues |
|-----------|--------|--------|
| 1. Reuse Over Recreation | {status} | {count} |
| 2. Clarity & Readability | {status} | {count} |
| 3. Correct Scope | {status} | {count} |
| 4. No Anti-Patterns | {status} | {count} |
| 5. Single Way to Do Things | {status} | {count} |
| 6. Backend Architecture | {status} | {count} |
| 7. Frontend Architecture | {status} | {count} |
| 8. Documentation Standards | {status} | {count} |
| 9. Circular Dependencies | {status} | {count} |
| 10. Self-Contained Components | {status} | {count} |
| 11. TanStack Query Patterns | {status} | {count} |

## Critical Issues (Must Fix)

{Aggregate critical issues from all agents}

## Warnings

{Aggregate warnings from all agents}

## Detailed Reports

### Principle 1: Reuse Over Recreation
{Agent 1 report}

### Principle 2: Clarity & Readability
{Agent 2 report}

### Principle 3: Correct Scope
{Agent 3 report}

### Principle 4: No Anti-Patterns
{Agent 4 report}

### Principle 5: Single Way to Do Things
{Agent 5 report}

### Principle 6: Backend Architecture
{Agent 6 report}

### Principle 7: Frontend Architecture
{Agent 7 report}

### Principle 8: Documentation Standards
{Agent 8 report}

### Principle 9: Circular Dependencies
{Agent 9 report}

### Principle 10: Self-Contained Components
{Agent 10 report}

### Principle 11: TanStack Query Patterns
{Agent 11 report}
```

## Step 4: Save and Present

1. Save full report to: `tmp/code-review-{branch}.md`
2. Present summary to user with:
   - Overall pass/fail status
   - Score for each principle
   - Top issues to address
   - Link to full report

## Execution Notes

- All 11 agents MUST be spawned in parallel (single message, 11 Task tool calls)
- Wait for all agents to complete before aggregating
- If any principle fails, overall status is FAIL
- If any principle warns (but none fail), overall status is WARN
- Principle 5 (Single Way) violations should be weighted most heavily
- Principle 11 (TanStack Query) mismatched invalidation keys are CRITICAL severity
- Principles 6-9 (Architecture/Documentation/Circular Deps) catch specific technical issues
