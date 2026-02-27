---
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git rev-parse:*), Bash(git branch:*), Read, Grep, Glob, TodoWrite
description: Check for violations of the Correct Scope principle
---

# /review:scope - Correct Scope Checker

You are reviewing code changes for violations of the **Correct Scope** principle.

## The Principle

A PR should address ONE thing, not three bundled together.

**Problems with multi-objective PRs:**
- Harder to review
- Confusing intent
- Difficult to revert if needed
- Masks the impact of individual changes

**One objective = clearer, more reviewable.**

## Phase 1: Gather Context

```bash
# Get current branch
git rev-parse --abbrev-ref HEAD

# Get changed files with stats
git diff main...HEAD --stat

# Get list of changed files
git diff main...HEAD --name-only

# Get commit messages
git log main...HEAD --oneline
```

## Phase 2: Categorize Changes

### 2.1 List All Changed Files

Group files by type:
- **Feature files**: New functionality
- **Bug fix files**: Fixing existing issues
- **Refactor files**: Code restructuring without behavior change
- **Config files**: Configuration changes
- **Test files**: Test additions/modifications
- **Documentation**: Docs changes

### 2.2 Identify Distinct Objectives

For each changed file, ask:
- What is the purpose of this change?
- What feature/fix/improvement does this support?

List each distinct objective found.

### 2.3 Check for Scope Creep

Red flags:
- **"While I was in here..."** changes unrelated to main objective
- **Opportunistic refactors** mixed with feature work
- **Multiple unrelated bug fixes** in one PR
- **Feature + refactor + bugfix** combined
- **Changes to unrelated modules**

### 2.4 Analyze File Relationships

- Do all changed files relate to the same feature/module?
- Are there changes to completely separate parts of the codebase?
- Could this PR be split into independent, reviewable units?

## Phase 3: Generate Report

```markdown
# Correct Scope Report

**Branch:** {branch}
**Status:** {PASS | WARN | FAIL}

## Summary

{One sentence assessment of PR scope}

## PR Statistics

- **Files changed:** {count}
- **Insertions:** {count}
- **Deletions:** {count}
- **Modules touched:** {list}

## Objectives Identified

### Primary Objective
{Main purpose of this PR}

### Secondary Objectives (if any)
1. {objective 2}
2. {objective 3}

## Scope Assessment

### Files by Objective

**Objective 1: {name}**
- {file1}
- {file2}

**Objective 2: {name}** (if multiple objectives)
- {file3}
- {file4}

### Scope Issues Found

| Issue | Files Involved | Recommendation |
|-------|----------------|----------------|
| {issue type} | {files} | {what to do} |

## "While I Was In Here" Changes

{List any changes that appear unrelated to the main objective}

| File | Change | Belongs To |
|------|--------|------------|
| {file} | {what changed} | {which objective, or "unrelated"} |

## Recommendations

### If PR Should Be Split

Suggested split:
1. **PR 1: {objective}**
   - {file list}

2. **PR 2: {objective}**
   - {file list}

### If PR Is Fine

{Explanation of why the scope is acceptable}

## Verdict

{Clear statement: Is this PR correctly scoped or should it be split?}
```

## Phase 4: Output

1. Save report to `tmp/review-scope-{branch}.md`
2. Present summary:
   - PASS/WARN/FAIL status
   - Number of objectives found
   - Recommendation (merge as-is or split)

## Scoring Criteria

- **PASS**: PR addresses one clear objective, all changes are related
- **WARN**: Minor scope creep but still reviewable as one unit
- **FAIL**: Multiple unrelated objectives that should be separate PRs

## Important Notes

- Small, focused PRs are ALWAYS preferred
- A PR with 50 files touching one feature is better than a PR with 5 files touching 5 features
- Refactors should generally be separate from feature work
- Bug fixes should generally be separate from new features

Run this analysis now on the current branch.
