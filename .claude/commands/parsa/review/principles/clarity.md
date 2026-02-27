---
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git rev-parse:*), Bash(git branch:*), Read, Grep, Glob, TodoWrite
description: Check for violations of the Clarity and Readability principle
---

# /review:clarity - Clarity & Readability Checker

You are reviewing code changes for violations of the **Clarity & Readability** principle.

## The Principle

Code should be easy to understand. Good code feels clean.

**What bad code looks like:**
- Single 200-line function with nested if-statements
- Unclear variable names
- Complex conditionals without explanation
- Magic numbers/strings

**Look for "hot spots":** Code that feels ugly or confusing needs rethinking. Junior engineers sometimes blame themselves; often the code is just bad.

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

## Phase 2: Analyze Each Changed File

Read each changed file fully and check for:

### 2.1 Function Length

- **Warning**: Functions over 50 lines
- **Critical**: Functions over 100 lines
- **Severe**: Functions over 200 lines

For long functions, note:
- Could this be broken into smaller functions?
- Are there distinct logical sections?

### 2.2 Nesting Depth

- **Warning**: Conditionals nested > 3 levels deep
- **Critical**: Conditionals nested > 4 levels deep

Look for:
- Nested if/else chains
- Nested ternaries
- Callbacks within callbacks

### 2.3 Naming Quality

Flag unclear names:
- Single letter variables (except loop indices)
- Abbreviations that aren't obvious
- Generic names (data, info, temp, stuff)
- Misleading names (name doesn't match behavior)

### 2.4 Magic Values

Find hardcoded values without explanation:
- Magic numbers (e.g., `if (count > 42)`)
- Magic strings (e.g., `if (status === 'xyz')`)
- Unexplained timeouts/delays
- Arbitrary limits

### 2.5 Complex Logic

Identify code that's hard to follow:
- Complex boolean expressions without explanation
- Multiple operations on one line
- Implicit type coercion
- Unclear data transformations

### 2.6 Hot Spots

Use your judgment to identify code that "feels wrong":
- Dense blocks that are hard to scan
- Inconsistent formatting
- Mixed abstraction levels
- Code that makes you re-read it multiple times

## Phase 3: Generate Report

```markdown
# Clarity & Readability Report

**Branch:** {branch}
**Status:** {PASS | WARN | FAIL}

## Summary

{One sentence assessment of overall code clarity}

## Hot Spots Identified

### Critical (Must Fix)

| Location | Issue | Severity |
|----------|-------|----------|
| {file:line} | {description} | {critical/severe} |

### Warnings

| Location | Issue | Suggestion |
|----------|-------|------------|
| {file:line} | {description} | {how to improve} |

## Function Length Issues

| Function | File | Lines | Recommendation |
|----------|------|-------|----------------|
| {name} | {file} | {count} | {suggestion} |

## Nesting Issues

| Location | Depth | Suggestion |
|----------|-------|------------|
| {file:line} | {depth} | {how to flatten} |

## Naming Issues

| Current Name | Location | Suggested Name |
|--------------|----------|----------------|
| {name} | {file:line} | {better name} |

## Magic Values

| Value | Location | Should Be |
|-------|----------|-----------|
| {value} | {file:line} | {named constant or comment} |

## Recommendations

1. {specific action with file reference}
2. {specific action with file reference}
```

## Phase 4: Output

1. Save report to `tmp/review-clarity-{branch}.md`
2. Present summary:
   - PASS/WARN/FAIL status
   - Count of hot spots
   - Most critical readability issues

## Scoring Criteria

- **PASS**: Code is clear, well-named, and easy to follow
- **WARN**: Some readability issues but nothing severe
- **FAIL**: Significant clarity problems (very long functions, deep nesting, or many hot spots)

Run this analysis now on the current branch.
