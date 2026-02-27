---
name: simple-plan
description: Creates a focused plan with root cause analysis, code references, and task list for straightforward changes. Spawns implementer agent after user approval. Use for quick fixes and small features.
argument-hint: "[feature description or issue]"
allowed-tools: Read, Grep, Glob, WebFetch
---

# Simple Plan

I will respond with a detailed plan about how to address the query. Before responding, I must investigate the situation by researching necessary files. I will follow relevant documentation in `./docs/`.

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
