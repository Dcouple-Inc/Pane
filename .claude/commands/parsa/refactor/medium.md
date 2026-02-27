# Refactor Check

**Read-only quality check - determines if refactor is needed.**

Safe to run anytime. Reports issues without modifying files.

## What This Does

Analyzes changed files against codebase patterns and provides a quality score with actionable recommendations.

## Process

### 1. Classify Changes

```bash
git diff main --name-status
git diff main --numstat
git diff main --stat
```

**Determine:**
- Size: Tiny (<50 lines) | Small (50-200) | Medium (200-500) | Large (500-1000) | Huge (>1000)
- Type: Bug Fix | Refactor | Enhancement | New Feature
- Complexity: Trivial | Simple | Moderate | Complex
- Layers: Backend | Frontend | Both

**Select pattern level:**
- Tiny/Bug Fix → Universal only
- Small/Enhancement → Universal + Basic architecture
- Medium → Universal + Architecture + Documentation
- Large/Feature → All patterns
- Huge/Feature → All patterns strictly

### 2. Analyze Files

**Read changed files and check patterns from:**
- `CLAUDE.md` (import conventions, shared library)
- `apps/api/CLAUDE.md` (backend patterns)
- `apps/webapp/CLAUDE.md` (frontend patterns)
- `apps/webapp/src/hooks/CLAUDE.md` (hook patterns)

**Study exemplar files:**
- Controllers: `apps/api/src/modules/feed/controllers/feed.controller.ts`
- Services: `apps/api/src/modules/feed/services/feed.service.ts`
- Pages: `apps/webapp/src/app/(protected)/workspaces/[workspaceId]/feed/page.tsx`
- Hooks: `apps/webapp/src/app/(protected)/workspaces/[workspaceId]/archive/useArchivePage.ts`

**Check for patterns based on classification:**

**Universal (always):**
- Relative imports (any `../` is a bug)
- Late imports (any `import`/`require()` after line 40 signals circular dependency or missing constructor injection)
- Unused imports
- Missing error handling
- Commented-out code

**Architecture (Medium+):**
- Controllers use authenticatedHandler
- Services extend BaseService
- Hooks use TanStack Query
- Pages are thin composition
- Query mutations invalidate cache

**Organization (Large+):**
- Underscore-prefix locality
- Orchestration hooks for complex pages
- Complex service organization
- File-level documentation

**How to detect late imports:**

Scan each file line-by-line. After line 40, check for:
- ES6 imports: `/^import\s+.*\s+from\s+['"].*['"];?$/`
- CommonJS: `/require\s*\(['"].*['"]\)/`
- Dynamic imports: `/await\s+import\s*\(/` or `/import\s*\(/`

**When to flag as critical:**
- Any import/require statement found after line 40
- Exception: Dynamic imports in lazy-loading contexts (e.g., Next.js `dynamic()`, React.lazy())

**Root cause diagnosis:**
1. Check if the late import is inside a constructor → Likely circular dependency
2. Check if the late import is conditional → Architectural smell (dependency should be injected)
3. Provide fix: Reference `apps/api/src/bootstrap/services.ts` for proper dependency injection pattern

### 3. Generate Report

**Output:**
```markdown
# Refactor Check Report

## 📊 Classification
- Size: Medium (7 files, 342 lines)
- Type: New Feature
- Complexity: Moderate
- Patterns Applied: Universal + Architecture + Documentation

## 🎯 Quality Score: 6/10

## 🔍 Issues Found

### Critical (Must Fix)
- [file:line] Relative import: import { X } from '../../utils'
  → Fix: Use @/ path alias
  → Auto-fixable: Yes

- [file:45] Late import: require('@/shared/services/notification.service')
  → Root cause: Circular dependency - service loaded inside constructor
  → Fix: Use constructor injection (see apps/api/src/bootstrap/services.ts)
  → Auto-fixable: No

- [file:line] Controller has business logic
  → Fix: Move to service
  → Auto-fixable: No

### Warnings (Should Fix)
- [file:line] Missing file documentation
  → Fix: Add top comment explaining purpose
  → Auto-fixable: No

- [file:line] Hook not using TanStack Query
  → Fix: Use useQuery for server state
  → Auto-fixable: No

### Info (Nice to Have)
- [file:line] Function is 85 lines (consider splitting)
  → Suggestion: Extract helper functions

## 📈 Pattern Compliance

✓ Import conventions: 2 issues (auto-fixable)
✗ Controller-service: 1 violation (manual fix)
✓ BaseService usage: Correct
✗ File documentation: 3 files missing (manual fix)
✓ TanStack Query: Mostly correct

## ✅ Auto-Fixable Issues: 2
- Convert relative imports to @/ aliases
- Remove unused imports

## ⚠️ Manual Fixes Required: 4
- Move business logic to service
- Add file documentation (3 files)

## 💡 Recommendations

1. Run `/refactor-apply --auto-only` to fix imports
2. Manually move business logic from controller to service
3. Add file-level documentation to new files
4. Re-run `/refactor-check` to verify improvements

## 🎓 References

Similar patterns to study:
- Controller pattern: apps/api/src/modules/feed/controllers/feed.controller.ts
- Service pattern: apps/api/src/modules/feed/services/feed.service.ts

Documentation:
- Backend patterns: apps/api/CLAUDE.md
- Frontend patterns: apps/webapp/CLAUDE.md
```

### 4. Show Classification First

Before detailed analysis, show user what patterns apply:

```
📊 Change Classification:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Size:       Medium (7 files, 342 lines)
Type:       New Feature
Complexity: Moderate
Layers:     Backend + Frontend

📋 Patterns to Check:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Universal (imports, errors)
✓ Architecture (controller-service, hooks)
✓ Documentation (new files)
✗ Complex organization (not required)

Analyzing...
```

## Critical Patterns (Always Checked)

These are verified from your codebase and always enforced:

1. **Zero relative imports** - Any `../` is a bug
2. **No late imports** - `import`/`require()` after line 40 indicates architectural debt (circular dependencies, missing constructor injection)
3. **authenticatedHandler in controllers** - No try/catch blocks
4. **BaseService for DB services** - Provides this.db
5. **TanStack Query for server state** - No direct API calls in components
6. **Thin pages + orchestration hooks** - Pages are JSX only
7. **Underscore-prefix locality** - Local code in `_folders/`
8. **Configuration Object Pattern** - Similar functions/hooks/services should be consolidated

## Configuration Object Pattern (Options Pattern)

**Detect opportunities to consolidate similar code into a single function with options.**

### What to Look For

**Consolidation Candidates (Flag as Warning):**
- Multiple functions with similar names doing almost the same thing:
  - `formatTime()` and `formatTimeCompact()` → consolidate to `formatTime(date, { compact?: boolean })`
  - `useGetItems()` and `useGetArchivedItems()` → consolidate to `useGetItems({ archived?: boolean })`
  - `sendEmail()` and `sendEmailWithAttachment()` → consolidate to `sendEmail({ attachment?: File })`
- Importing multiple similar utilities from same library when one could work:
  - Using both `formatDistanceToNow` and custom `formatRelativeTime` for same purpose
- Duplicate type/interface definitions across files (should be single source of truth)

**Detection Patterns:**
```typescript
// ❌ BAD - Multiple similar functions
function formatTime(date: Date): string { ... }
function formatTimeShort(date: Date): string { ... }
function formatTimeCompact(date: Date): string { ... }

// ✅ GOOD - Single function with options
function formatTime(date: Date, options?: {
  format?: 'full' | 'short' | 'compact'
}): string { ... }

// ❌ BAD - Similar hooks with slight variations
function useGetUsers() { ... }
function useGetActiveUsers() { ... }
function useGetArchivedUsers() { ... }

// ✅ GOOD - Single hook with options
function useGetUsers(options?: {
  status?: 'active' | 'archived' | 'all'
}) { ... }

// ❌ BAD - Duplicate interface in multiple files
// file1.ts: interface ToolEditState { ... }
// file2.ts: interface ToolEditState { ... }
// file3.ts: interface ToolEditState { ... }

// ✅ GOOD - Single source of truth, imported elsewhere
// types.ts: export interface ToolEditState { ... }
// file1.ts: import type { ToolEditState } from './types';
```

**When NOT to Flag (Correct Usage):**
- Same utility called with different options: `formatTime(date, { compact: true })` vs `formatTime(date)`
- Functions that are genuinely different in purpose (not just variations)
- Options imported from external libraries used correctly

### Report Format

```markdown
### Warnings (Should Fix)

**Configuration Object Pattern Opportunities:**
- [file:line] Similar functions detected: `formatTime`, `formatTimeCompact`, `formatTimeShort`
  → Consolidate to single `formatTime(date, options?)` with format option
  → Pattern: Configuration Object Pattern
  → Auto-fixable: No

- [files] Duplicate interface `ToolEditState` in 3 files
  → Consolidate to single source of truth and import
  → Auto-fixable: No
```

## Command Arguments

- `--strict`: Use stricter thresholds (treat Medium as Large)
- `--force-all-patterns`: Check all patterns regardless of size
- `--json`: Output as JSON for parsing

## Success Checklist

- [ ] Changes classified (size/type/complexity shown)
- [ ] Applicable patterns selected
- [ ] Files analyzed against patterns
- [ ] Issues categorized (Critical/Warning/Info)
- [ ] Auto-fixable vs manual identified
- [ ] Quality score calculated
- [ ] Recommendations provided
- [ ] No files modified (read-only check)

---

**Use this as your pre-PR quality gate. Run it constantly - it's read-only and safe.**

Target: Score ≥ 9.8
Run `/refactor-full` for final PR readiness assessment
