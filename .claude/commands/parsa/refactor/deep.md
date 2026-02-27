# Deep Refactor

**Comprehensive read-only analysis for large features and architectural changes.**

Safe to run anytime. Performs deep analysis against codebase patterns and writes detailed refactor plan without modifying files.

## What This Does

Thorough, comprehensive code quality analysis that:
1. Classifies changes with detailed metrics
2. Deep analysis of backend and frontend architecture
3. Validates against ALL codebase patterns
4. Identifies architectural issues and violations
5. Generates comprehensive refactor plan
6. Writes detailed plan to `./tmp/` for review

## When to Use

- **Large features** (10-20 files, 500-1000 lines)
- **Huge features** (20+ files, >1000 lines)
- **Architectural changes** requiring comprehensive validation
- **Pre-PR comprehensive check** for complex work

For small/medium changes, use `/simple-refactor` instead.

## Process

### Phase 0: Classification & Pattern Selection

**Analyze change metrics:**
```bash
git diff main --name-status
git diff main --numstat
git diff main --stat
```

**Classify:**
- **Size**: Large (500-1000 lines) | Huge (>1000 lines)
- **Type**: New Feature | Major Refactor | Enhancement
- **Complexity**: Complex | Very Complex
- **Layers**: Backend | Frontend | Both
- **Modules**: List affected modules

**Pattern Selection Matrix:**

| Size | Type | Universal | Architecture | Organization | Documentation |
|------|------|-----------|--------------|--------------|---------------|
| Large | Feature | ✓ | ✓ | ✓ | Required |
| Huge | Feature | ✓ | ✓ | ✓ | Required |

**Show classification to user:**
```
📊 Change Classification:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Size:       Large (15 files, 742 lines changed)
Type:       New Feature (12 added, 3 modified)
Complexity: Complex (multiple modules)
Layers:     Backend (7 files), Frontend (8 files)
Modules:    feed, artifacts, workspace

📋 Patterns to Check:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Universal (imports, errors, basic patterns)
✓ Architecture (controller-service, hooks, TanStack Query)
✓ Organization (orchestration hooks, underscore-prefix locality)
✓ Documentation (all new files must have documentation)

Proceeding with comprehensive analysis...
```

### Phase 1: Backend Analysis

**Reference patterns from:**
- `apps/api/CLAUDE.md` - Complete backend architecture
- `CLAUDE.md` - Import conventions, shared library usage

**Exemplar files to study:**
- Controller: `apps/api/src/modules/feed/controllers/feed.controller.ts`
- Service: `apps/api/src/modules/feed/services/feed.service.ts`
- Validator: `apps/api/src/modules/feed/validators/feed-tag.validator.ts`
- Complex service: `apps/api/src/modules/audio/services/recording/` (folder pattern)

**Check patterns:**

**Controllers (apps/api/src/modules/*/controllers/):**
- ✓ Uses `authenticatedHandler` wrapper for auth routes
- ✓ Accesses `req.user` (provided by authenticatedHandler)
- ✓ Extracts params/query clearly at top
- ✓ Delegates to service methods (no business logic)
- ✓ Returns `{ success: true, data: ... }` format
- ✓ No database queries (in services)
- ✓ No try/catch blocks (authenticatedHandler handles)
- ✓ File-level documentation

**Services (apps/api/src/modules/*/services/):**
- ✓ Extends `BaseService` when using database
- ✓ Uses `this.db` for database access
- ✓ Contains ALL business logic
- ✓ Throws `ApiError` (not generic Error)
- ✓ Single responsibility (one domain concept)
- ✓ Complex services in subfolders with index.ts
- ✓ File-level documentation
- ✓ No controller logic leaking in

**Validators (apps/api/src/modules/*/validators/):**
- ✓ Uses Zod schemas
- ✓ Exports both schema and inferred types
- ✓ Validation NOT in controllers/services

**Import Patterns (Backend):**
- ✓ Uses `@/` for local API imports
- ✓ Uses `@doozy/shared` for shared types
- ✓ ZERO relative imports (`../`, `../../`)
- ✓ Imports organized: external, @doozy/shared, @/

**Database & Error Handling:**
- ✓ Drizzle ORM queries in services only
- ✓ ApiError thrown with proper status codes
- ✓ No raw SQL queries
- ✓ Proper transaction handling where needed

### Phase 2: Frontend Analysis

**Reference patterns from:**
- `apps/webapp/CLAUDE.md` - Complete frontend architecture
- `apps/webapp/src/hooks/CLAUDE.md` - Hook patterns, TanStack Query
- `apps/webapp/src/components/CLAUDE.md` - Component patterns
- `CLAUDE.md` - Import conventions

**Exemplar files to study:**
- Page: `apps/webapp/src/app/(protected)/workspaces/[workspaceId]/feed/page.tsx`
- Orchestration Hook: `apps/webapp/src/app/(protected)/workspaces/[workspaceId]/archive/useArchivePage.ts`
- Shared Hook: `apps/webapp/src/hooks/feed/useFeed.ts`
- Component: Study underscore-prefix `_components/` vs `src/components/`

**Check patterns:**

**Pages (apps/webapp/src/app/*/page.tsx):**
- ✓ Has `'use client'` directive (most pages need it)
- ✓ Has file-level documentation comment
- ✓ Thin composition layer (mostly JSX)
- ✓ ALL logic in orchestration hooks (e.g., `usePage`)
- ✓ Calls `getMobileBottomSpacing(true)` for mobile pages
- ✓ No direct API calls (uses hooks)
- ✓ No state management (uses hooks)
- ✓ No business logic

**Orchestration Hooks (*/_hooks/usePage.ts):**
- ✓ Has file-level JSDoc explaining purpose
- ✓ Combines multiple hooks
- ✓ Contains business logic & event handlers
- ✓ Returns object with data/functions (NEVER JSX)
- ✓ Uses TanStack Query for server state
- ✓ Proper error handling with toast
- ✓ Query mutations invalidate related queries

**Underscore-Prefix Locality Convention:**
- ✓ Code in `_components/` only used by this page/feature
- ✓ Code in `_hooks/` only used by this page/feature
- ✓ Code in `_types/` only used by this page/feature
- ✓ Code in `_providers/` only used by this page/feature
- ✓ Code in `_utils/` only used by this page/feature
- ✓ Shared code (2+ features) in `src/`
- ✓ No underscore folders in `src/`

**Hooks (Shared or Local):**
- ✓ Name starts with `use` prefix
- ✓ NEVER returns JSX (returns data/functions only)
- ✓ Uses TanStack Query for server state
- ✓ Query keys include ALL dependencies (e.g., `['notes', workspaceId]`)
- ✓ Mutations invalidate related queries on success
- ✓ Error handling with toast notifications
- ✓ Not called conditionally (uses `enabled` option)

**Components (Shared or Local):**
- ✓ No business logic (in hooks)
- ✓ No direct API calls (use hooks)
- ✓ Correct location (local vs shared)
- ✓ Has loading/error states
- ✓ Props drilling ≤2 levels

**Import Patterns (Frontend):**
- ✓ Uses `@/` for local webapp imports
- ✓ Uses `@doozy/shared` for shared types
- ✓ ZERO relative imports (`../`, `../../`)
- ✓ Imports organized: external, @doozy/shared, @/

**TanStack Query Patterns:**
- ✓ Query keys include all dependencies
- ✓ Mutations have `onSuccess` invalidation
- ✓ Uses `useQuery` for reads
- ✓ Uses `useMutation` for writes
- ✓ Proper `enabled` option for conditional queries
- ✓ Background refetch configured appropriately

### Phase 3: Cross-Cutting Concerns

**SOLID Principles:**

**SRP (Single Responsibility):**
- Each service has one clear domain purpose
- Each hook has one clear purpose
- Each function does one thing
- No "god" services/classes

**DRY (Don't Repeat Yourself):**
- No duplicate code blocks
- Shared logic in utilities or base classes
- Common types in `@doozy/shared`
- Reusable components/hooks in `src/`

**Configuration Object Pattern (CRITICAL):**
- ❌ Multiple similar functions → consolidate with options parameter
  - Bad: `formatTime()`, `formatTimeCompact()`, `formatTimeShort()`
  - Good: `formatTime(date, { format?: 'full' | 'compact' | 'short' })`
- ❌ Similar hooks with variations → consolidate with options
  - Bad: `useGetItems()`, `useGetArchivedItems()`
  - Good: `useGetItems({ archived?: boolean })`
- ❌ Importing multiple utilities for same purpose → use single utility with options
  - Bad: Using `formatDistanceToNow` AND custom `formatRelativeTime`
  - Good: Single `formatRelativeTime(date, { compact?, short? })`
- ❌ Duplicate interface/type definitions → single source of truth
  - Bad: Same interface defined in 3 files
  - Good: Export from one file, import everywhere else
- ❌ Similar services with minor config differences → consolidate with configuration
- ✅ Correct: Same function called with different options (not duplication)

**Documentation Standards:**
- All major files have top-of-file comment
- Complex services/hooks have detailed JSDoc
- Non-obvious logic has inline comments
- TODOs include context or issue number

**Error Handling:**
- Backend: `ApiError` with proper status codes
- Frontend: Toast notifications for user-facing errors
- Proper try/catch where needed
- No silent failures

### Phase 4: Generate Comprehensive Report

Write detailed refactor plan to `./tmp/deep-refactor-plan-[timestamp].md`:

```markdown
# Deep Refactor Plan

## Classification
- Size: [Large/Huge]
- Type: [X]
- Complexity: [Complex/Very Complex]
- Layers: [Backend/Frontend/Both]
- Modules: [List]
- Files Changed: X added, Y modified, Z deleted
- Lines Changed: +X -Y

## Quality Score: X/10

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Issues Found
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Critical Issues (Must Fix Before Merge)

**Backend:**
- [file:line] Issue description
  → Fix: Detailed fix instructions
  → Pattern: Reference to CLAUDE.md section
  → Auto-fixable: Yes/No

**Frontend:**
- [file:line] Issue description
  → Fix: Detailed fix instructions
  → Exemplar: Path to similar implementation
  → Auto-fixable: Yes/No

### Warnings (Should Fix)

**Architecture:**
- [file:line] Issue description
  → Suggestion: Improvement recommendation
  → Impact: Why this matters
  → Auto-fixable: Yes/No

**Organization:**
- [file:line] Issue description
  → Suggestion: Better organization approach
  → Auto-fixable: Yes/No

### Info (Nice to Have)

**Code Quality:**
- [file:line] Suggestion
  → Benefit: What this improves

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Auto-Fixable Issues: X
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Convert relative imports to @/ aliases (X files)
- Remove unused imports (Y files)
- Fix import organization (Z files)
- Add missing 'use client' directives (W files)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Manual Fixes Required: Y
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Priority 1 (Blocking):**
1. [file:line] - Specific issue requiring human judgment
2. [file:line] - Architectural decision needed

**Priority 2 (Important):**
1. [file:line] - Pattern violation requiring refactor
2. [file:line] - Documentation needed

**Priority 3 (Nice to Have):**
1. [file:line] - Code quality improvement

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Pattern Compliance Matrix
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Backend
✓ Import conventions: [Status] - [Details]
✓ Controller pattern: [Status] - [Details]
✓ Service pattern: [Status] - [Details]
✓ BaseService usage: [Status] - [Details]
✓ ApiError usage: [Status] - [Details]
✓ Validator pattern: [Status] - [Details]

### Frontend
✓ Import conventions: [Status] - [Details]
✓ Thin pages: [Status] - [Details]
✓ Orchestration hooks: [Status] - [Details]
✓ TanStack Query: [Status] - [Details]
✓ Underscore-prefix locality: [Status] - [Details]
✓ Component organization: [Status] - [Details]

### Cross-Cutting
✓ SRP compliance: [Status] - [Details]
✓ DRY compliance: [Status] - [Details]
✓ Documentation: [Status] - [Details]
✓ Error handling: [Status] - [Details]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Recommendations
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Immediate Actions
1. Run `/refactor-apply --plan=./tmp/deep-refactor-plan-[TS].md --auto-only`
2. Address Critical Issues (Priority 1)
3. Fix Warnings (Priority 2)

### Study These Patterns
Similar implementations to reference:
- Backend: [Exemplar file paths]
- Frontend: [Exemplar file paths]
- Hooks: [Exemplar file paths]

### Documentation to Review
- Backend patterns: `apps/api/CLAUDE.md`
- Frontend patterns: `apps/webapp/CLAUDE.md`
- Hook patterns: `apps/webapp/src/hooks/CLAUDE.md`
- Component patterns: `apps/webapp/src/components/CLAUDE.md`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Quality Score Breakdown
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Import conventions:     [X/10]
- Architecture:           [X/10]
- Organization:           [X/10]
- Documentation:          [X/10]
- Error handling:         [X/10]
- Code quality:           [X/10]

**Overall: X/10**

Target: ≥ 9.8/10
Current status: [Score status]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Next Steps
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Review this comprehensive plan
2. Run: `/refactor-apply --plan=./tmp/deep-refactor-plan-[TS].md --auto-only`
3. Address Priority 1 manual fixes (blocking)
4. Address Priority 2 manual fixes (important)
5. Re-run `/deep-refactor` to verify improvements
6. Continue fixing until score ≥ 9.8
7. Run `/refactor-full` for final PR readiness assessment
```

### Phase 5: Show Summary

**Show results:**
```bash
📊 Deep Analysis Complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Comprehensive plan written to:
./tmp/deep-refactor-plan-[timestamp].md

📈 Quality Score: X/10 (target: 9.8)

🔍 Analysis Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Files Analyzed:     X
Critical Issues:    Y
Warnings:           Z
Auto-fixable:       W

Key Issues:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- [Critical issues summary]
- [Warnings summary]

Would you like me to run `/refactor-apply` to implement the fixes?
(This will apply auto-fixable changes and guide you through manual fixes)
```

**IMPORTANT:** Always ask the user before proceeding with fixes. Do not automatically run refactor-apply.

## Critical Patterns (Always Enforced)

These patterns are verified from YOUR codebase and always enforced:

1. **Zero relative imports** - Verified via grep: codebase has ZERO `../` imports
2. **authenticatedHandler wrapper** - Controllers never have try/catch blocks
3. **BaseService extension** - Services using DB must extend BaseService
4. **TanStack Query for server state** - No direct API calls in components
5. **Thin pages + orchestration hooks** - Pages are JSX composition only
6. **Underscore-prefix locality** - `_folders/` = local only
7. **File-level documentation** - All major files have top comment
8. **ApiError for errors** - Backend throws ApiError, not generic Error

## Command Arguments

- `--force-all-patterns`: Check all patterns regardless of classification
- `--classify-as=<type>`: Override type classification
- `--size=<size>`: Override size classification
- `--strict`: Use strictest thresholds (require 9/10)

## Success Checklist

- [ ] Changes classified with detailed metrics
- [ ] All applicable patterns selected
- [ ] Backend analysis completed
- [ ] Frontend analysis completed
- [ ] Cross-cutting concerns checked
- [ ] Issues categorized by priority
- [ ] Auto-fixable vs manual identified
- [ ] Pattern compliance matrix generated
- [ ] Quality score calculated with breakdown
- [ ] Comprehensive plan written to ./tmp/
- [ ] No files modified (read-only)
- [ ] Next steps clearly shown

---

**This command is read-only and comprehensive.** It performs deep analysis against YOUR codebase's actual patterns (from CLAUDE.md files) and writes a detailed refactor plan for you to review.

Use this for large features and architectural changes. For smaller work, use `/simple-refactor` instead.

Run `/refactor-apply --plan=./tmp/deep-refactor-plan-[TS].md` after reviewing the plan to apply fixes.
