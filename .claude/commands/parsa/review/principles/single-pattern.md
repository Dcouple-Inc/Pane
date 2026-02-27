---
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git rev-parse:*), Bash(git branch:*), Read, Grep, Glob, TodoWrite
description: Check for violations of the Single Way to Do Things principle (MOST IMPORTANT)
---

# /review:single-pattern - Single Way to Do Things Checker

You are reviewing code changes for violations of the **Single Way to Do Things** principle.

**THIS IS THE MOST IMPORTANT PRINCIPLE.**

## The Principle

There should be only ONE implementation pattern per feature/behavior in the codebase.

**Why this is critical:**
- LLMs default to creating new patterns when they see multiple ways to solve the same problem
- If two hooks exist for audio recording, an LLM will create a third for the next feature
- If one unified hook exists in multiple places, the LLM reuses it

**This is critical for scaling the codebase and reducing proliferation of similar code.**

## Phase 1: Gather Context

```bash
# Get current branch
git rev-parse --abbrev-ref HEAD

# Get changed files
git diff main...HEAD --name-only

# Get full diff
git diff main...HEAD
```

Use TodoWrite to track each new pattern to investigate.

## Phase 2: Identify New Patterns

For each changed file, identify:

### 2.1 New Hooks

Search the diff for:
- `function use[A-Z]` - Custom hook definitions
- `const use[A-Z]` - Custom hook definitions
- `export.*use[A-Z]` - Exported hooks

For each new hook found:
1. Note its purpose/functionality
2. Search codebase for existing hooks with similar purpose
3. Flag if multiple hooks now do similar things

### 2.2 New Components

Search for:
- New `.tsx` files in components directories
- New component definitions

For each new component:
1. Note what it renders/does
2. Search for existing similar components
3. Flag if this could have extended an existing component

### 2.3 New Utilities/Helpers

Search for:
- New functions in `utils/`, `helpers/`, `lib/` directories
- New exported functions that could be utilities

For each:
1. Note the functionality
2. Search `libs/shared/` for existing utilities
3. Search local utils for similar functions
4. Flag duplication

### 2.4 New API Patterns

For backend changes, check:
- New endpoint patterns
- New service patterns
- New middleware patterns

Compare to existing patterns in the same module.

### 2.5 New State Management Patterns

Check for:
- New ways of managing state
- New context providers
- New store patterns

## Phase 3: Deep Pattern Analysis

For EACH new pattern identified:

### 3.1 Search for Existing Alternatives

```
1. Grep for similar function/component names
2. Grep for similar functionality (key terms)
3. Read similar files to understand existing patterns
4. Check libs/shared/ for shared implementations
```

### 3.2 Document Pattern Proliferation Risk

For each new pattern, answer:
- Does this introduce a second way to do something?
- Will future LLM-assisted development create a third way?
- Should this pattern be unified with an existing one?

## Phase 4: Generate Report

```markdown
# Single Way to Do Things Report

**Branch:** {branch}
**Status:** {PASS | WARN | FAIL}
**Risk Level:** {LOW | MEDIUM | HIGH | CRITICAL}

## Summary

{Assessment of pattern proliferation risk}

## New Patterns Introduced

### Pattern 1: {name}

**Type:** {hook | component | utility | API | state}
**Location:** {file:line}
**Purpose:** {what it does}

**Existing Alternatives Found:**
| Alternative | Location | Similarity |
|-------------|----------|------------|
| {name} | {path} | {how similar} |

**Assessment:** {Should this use existing pattern? Should patterns be unified?}

### Pattern 2: {name}
{Same structure}

## Pattern Proliferation Risks

### Critical (Multiple Ways Now Exist)

| Feature/Behavior | Implementations | Risk |
|------------------|-----------------|------|
| {what it does} | {list of implementations} | {assessment} |

**Impact:** Future development will likely create MORE implementations.

### Warnings (Potential Duplication)

| New Pattern | Similar To | Recommendation |
|-------------|------------|----------------|
| {new} | {existing} | {unify/keep separate/other} |

## Existing Patterns That Should Have Been Used

1. **{pattern name}** at `{path}`
   - Already handles: {functionality}
   - New code should: {how to use it instead}

## Recommended Actions

### Must Do (Before Merge)

1. {action} - {reason}

### Should Do (Technical Debt if Skipped)

1. {action} - {reason}

### Consider (Pattern Unification)

1. {action} - {reason}

## Pattern Inventory

After this PR, here are the ways to do {common thing}:

| Implementation | Location | Notes |
|----------------|----------|-------|
| {impl 1} | {path} | {original/new/should deprecate} |
| {impl 2} | {path} | {original/new/should deprecate} |

**Recommendation:** {Which should be the canonical pattern?}
```

## Phase 5: Output

1. Save report to `tmp/review-single-pattern-{branch}.md`
2. Present summary:
   - PASS/WARN/FAIL status
   - Pattern proliferation risk level
   - New patterns introduced
   - Critical unification recommendations

## Scoring Criteria

- **PASS**: No new patterns introduced, or new patterns don't duplicate existing functionality
- **WARN**: New pattern introduced where existing alternative exists, but not critical
- **FAIL**: Multiple ways to do the same thing now exist in codebase

## Risk Levels

- **LOW**: New pattern is truly unique, no existing alternatives
- **MEDIUM**: Similar patterns exist but serve different use cases
- **HIGH**: New pattern duplicates existing functionality
- **CRITICAL**: This PR creates a second/third way to do something already handled

## Why This Matters

Every duplicate pattern:
1. Confuses future developers (human and AI)
2. Increases maintenance burden
3. Leads to inconsistent behavior
4. Makes refactoring harder
5. Causes LLMs to create even MORE patterns

**One way to do things = scalable, maintainable codebase.**

Run this analysis now on the current branch.
