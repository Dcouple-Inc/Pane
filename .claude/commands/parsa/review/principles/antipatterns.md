---
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git rev-parse:*), Bash(git branch:*), Read, Grep, Glob, TodoWrite
description: Check for anti-patterns and convention violations
---

# /review:antipatterns - Anti-Pattern Checker

You are reviewing code changes for **anti-patterns** and convention violations.

## The Principle

Avoid async imports mid-code, unused conventions, established pattern violations.

**Note:** Anti-patterns change as codebase evolves. What was acceptable early may become problematic at scale. This is best caught through active research, not static documentation.

## Phase 1: Gather Context

```bash
# Get current branch
git rev-parse --abbrev-ref HEAD

# Get changed files
git diff main...HEAD --name-only

# Get full diff
git diff main...HEAD
```

Read the relevant CLAUDE.md files to understand established patterns:
- `/CLAUDE.md` - Root conventions
- `/apps/webapp/CLAUDE.md` - Frontend conventions
- `/apps/api/CLAUDE.md` - Backend conventions

## Phase 2: Check for Anti-Patterns

### 2.1 Import Anti-Patterns

**Check for:**
- Relative imports when `@/` aliases should be used
- Dynamic imports where static would work
- Circular import risks
- Importing from internal module paths instead of public exports

**This codebase requires:**
```typescript
// CORRECT
import { Something } from '@/modules/feature/service';
import { Shared } from '@doozy/shared';

// WRONG
import { Something } from '../../../modules/feature/service';
```

### 2.2 Async/Await Anti-Patterns

**Check for:**
- Mixed async/await and .then() chains
- Missing error handling on async operations
- Async functions that don't need to be async
- Promise.all where sequential would be safer (or vice versa)
- Fire-and-forget async calls without error handling

### 2.3 Error Handling Anti-Patterns

**Check for:**
- Empty catch blocks
- Catching and ignoring errors
- Inconsistent error handling patterns
- Missing try/catch on async operations
- Throwing generic errors instead of typed ones

### 2.4 State Management Anti-Patterns (Frontend)

**Check for:**
- Direct state mutation
- State stored in wrong location (local vs global)
- Missing loading/error states
- Stale closure issues in hooks
- Missing dependency arrays in useEffect/useCallback/useMemo

### 2.5 API Anti-Patterns (Backend)

**Check for:**
- Business logic in controllers (should be in services)
- Direct database access outside repository/service layer
- Missing input validation
- Inconsistent response formats
- Missing error responses

### 2.6 TypeScript Anti-Patterns

**Check for:**
- Using `any` type
- Type assertions (`as`) that could be avoided
- Missing return types on functions
- Overly complex generic types
- Using `!` non-null assertion excessively

### 2.7 File Structure Anti-Patterns

**Check for:**
- Files in wrong directories
- Naming inconsistencies
- Missing index exports
- Components in wrong folders

## Phase 3: Generate Report

```markdown
# Anti-Pattern Report

**Branch:** {branch}
**Status:** {PASS | WARN | FAIL}

## Summary

{One sentence assessment}

## Conventions Checked

- [x] Import style (@/ aliases)
- [x] Async/await patterns
- [x] Error handling
- [x] State management (if frontend)
- [x] API patterns (if backend)
- [x] TypeScript usage
- [x] File structure

## Anti-Patterns Found

### Critical (Must Fix)

| Location | Anti-Pattern | Fix |
|----------|--------------|-----|
| {file:line} | {description} | {how to fix} |

### Warnings

| Location | Anti-Pattern | Recommendation |
|----------|--------------|----------------|
| {file:line} | {description} | {suggestion} |

## Import Issues

| File | Current Import | Should Be |
|------|----------------|-----------|
| {file:line} | `{bad import}` | `{correct import}` |

## Async/Await Issues

| Location | Issue | Fix |
|----------|-------|-----|
| {file:line} | {description} | {how to fix} |

## Error Handling Issues

| Location | Issue | Fix |
|----------|-------|-----|
| {file:line} | {description} | {how to fix} |

## TypeScript Issues

| Location | Issue | Fix |
|----------|-------|-----|
| {file:line} | {description} | {how to fix} |

## Recommendations

1. {specific action with file reference}
2. {specific action with file reference}
```

## Phase 4: Output

1. Save report to `tmp/review-antipatterns-{branch}.md`
2. Present summary:
   - PASS/WARN/FAIL status
   - Count of anti-patterns by category
   - Most critical issues

## Scoring Criteria

- **PASS**: Code follows established patterns and conventions
- **WARN**: Minor deviations from conventions
- **FAIL**: Significant anti-patterns or convention violations

Run this analysis now on the current branch.
