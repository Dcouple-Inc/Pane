---
thinking-mode: on
allowed-tools: Read, Grep, Glob, WebFetch
argument-hint: <plan-file-or-description>
description: Review an implementation plan for simplification opportunities, gaps, bugs, and better approaches.
---

# Review Plan

I will review the provided plan and provide feedback across four key areas.

Before providing my review, I will investigate the codebase to understand the
current state and relevant context. I will check the ./docs/ folder for any
documentation related to the plan's scope.

## My Review Will Cover

### 1. Simplification Opportunities
- Are there unnecessary steps or over-engineering?
- Can any steps be combined or eliminated?
- Is there existing code or utilities that could be reused?
- Are there simpler alternatives to proposed approaches?

### 2. Gaps and Missing Items
- Are there edge cases not addressed?
- Is error handling complete?
- Are there missing tests or validation steps?
- Are there integration points that were overlooked?

### 3. Potential Bugs
- Are there race conditions or timing issues?
- Could any step fail silently?
- Are there type safety concerns?
- Are there security vulnerabilities?

### 4. Better Approaches
- Are there more idiomatic solutions for this codebase?
- Could different tools or libraries simplify the work?
- Are there architectural patterns that would fit better?
- What would a principal engineer suggest differently?

## Format

I will provide my feedback in a clear, actionable format with specific
references to the plan and codebase. Each suggestion will include reasoning
and, where helpful, code snippets showing the recommended approach.

Plan to Review: $ARGUMENTS
