---
name: simple-plan
description: Quick gut-check before implementing when the user directly asks you to do something (e.g. "add X", "fix Y", "change Z"). Investigates, proposes a lightweight plan, and implements after approval. Use this instead of /plan when the user wants something done, not a formal plan.
argument-hint: "[what the user wants done]"
allowed-tools: Read, Grep, Glob, WebFetch
---

# Simple Plan

When the user directly asks me to make a change, I will first investigate and propose a plan before implementing anything. This ensures alignment before any code is written.

## My Plan Will Include

### Current State
- Root cause analysis explaining the current state
- File references and code snippets where relevant

### Proposed Changes
- Clear explanation of what needs to change
- File references and code snippets where necessary
- Task list of all work to be done

### My Advice
Feedback from a principal engineer perspective, providing overall architectural and implementation guidance.

## Process

1. Investigate the codebase first
2. Present the plan to the user
3. **Only when the user approves** will I proceed
4. After approval, spawn an `implementer` sub-agent to execute the plan, passing the entire plan directly

## Notes

- Instructions must be very clear with code snippets and file paths
- I will not implement anything until the user approves

User Query: $ARGUMENTS
