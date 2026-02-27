---
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git rev-parse:*), Bash(git branch:*), Read, Grep, Glob, TodoWrite
description: Check for violations of the Reuse Over Recreation principle
---

# /review:reuse - Reuse Over Recreation Checker

You are reviewing code changes for violations of the **Reuse Over Recreation** principle.

## The Principle

Minimize lines of code. Reuse existing patterns. Avoid duplicating functionality.

**Why it matters:** More code = larger maintenance surface area.

**Key question:** "Did we implement with the least amount of lines?"

## Red Flags to Find

- New utility functions that duplicate existing ones
- Reimplemented patterns that exist elsewhere in codebase
- Copy-pasted code blocks
- New abstractions when existing ones would work
- New hooks that do what existing hooks already do
- New components similar to existing ones

## Phase 1: Gather Context

```bash
# Get current branch
git rev-parse --abbrev-ref HEAD

# Get changed files
git diff main...HEAD --name-only

# Get full diff
git diff main...HEAD
```

Use TodoWrite to track files to analyze.

## Phase 2: Analyze for Duplication

For each new function, hook, component, or utility in the diff:

### 2.1 Search for Similar Implementations

1. Extract the function/hook/component name
2. Use Grep to search for similar names in codebase
3. Use Grep to search for similar functionality (key terms from the implementation)
4. Check these locations specifically:
   - `libs/shared/` - shared utilities
   - `apps/webapp/src/hooks/` - existing hooks
   - `apps/webapp/src/components/` - existing components
   - `apps/api/src/shared/` - API utilities

### 2.2 Check for Copy-Paste

1. Look for blocks of code > 10 lines that appear elsewhere
2. Search for distinctive string literals or patterns from the new code
3. Flag any near-identical implementations

### 2.3 Evaluate Abstractions

For each new abstraction (class, hook, utility):
- Could an existing abstraction be extended instead?
- Is this solving a problem already solved elsewhere?
- Could this live in `libs/shared/` for reuse?

## Phase 3: Generate Report

```markdown
# Reuse Over Recreation Report

**Branch:** {branch}
**Status:** {PASS | WARN | FAIL}

## Summary

{One sentence assessment}

## Violations Found

### Critical (Must Fix)

| Location | Issue | Existing Alternative |
|----------|-------|---------------------|
| {file:line} | {description} | {what to use instead} |

### Warnings

| Location | Issue | Recommendation |
|----------|-------|----------------|
| {file:line} | {description} | {suggestion} |

## Existing Patterns That Should Be Used

1. **{pattern name}** at `{path}`
   - What it does: {description}
   - Should be used for: {use case from this PR}

## Code That Could Be Shared

{List any new code that should move to libs/shared/}

## Recommendations

1. {specific action}
2. {specific action}
```

## Phase 4: Output

1. Save report to `tmp/review-reuse-{branch}.md`
2. Present summary:
   - PASS/WARN/FAIL status
   - Count of violations
   - Top issues to address

## Scoring Criteria

- **PASS**: No new code duplicates existing functionality
- **WARN**: Minor duplication or missed opportunities for reuse
- **FAIL**: Significant duplication or reimplemented existing patterns

Run this analysis now on the current branch.
