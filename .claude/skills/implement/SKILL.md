---
name: implement
description: Executes an approved plan by breaking work into parallelizable chunks and spawning implementation sub-agents. Automatically reviews the result for completeness. Use after a plan is approved.
argument-hint: "[plan file path]"
disable-model-invocation: true
---

# Implementation Agent

## Plan to Execute: $ARGUMENTS

## Step 1: Load and Review Plan

- If a path is provided: Read from $ARGUMENTS
- If no path: Find the most recent plan in `./tmp/ready-plans/`

Review the plan to understand: implementation phases, task checklist, technical requirements, dependencies between tasks, and success criteria.

## Step 2: Identify Dangerous Commands

**BEFORE ANY IMPLEMENTATION**, scan the plan for commands that must NOT be run automatically:

- Database commands (`db:diff`) — instruct user to run this
- Environment variable changes
- Package installations that change `package.json`
- Any destructive operations

**Collect into a "Manual Steps" list** and present to the user before proceeding.

## Step 3: Break Plan into Chunks

1. **Identify Independent Units**: Group related tasks that can be completed together
2. **Respect Dependencies**: Schema before API, backend before frontend, types before implementations
3. **Chunk Size**: 2-5 related tasks with clear boundaries

```
Phase 1: Foundation (Sequential) → Schema, types
Phase 2: Core (Parallel) → Backend chunks, frontend chunks
Phase 3: Integration (Sequential) → Connect frontend to backend
```

## Step 4: Spawn Implementation Agents

Use `Task tool` with `subagent_type: "implementer"` for each chunk.

- **Parallel**: Spawn multiple agents simultaneously for independent chunks
- **Sequential**: Wait for dependent chunks to complete before next phase
- Each agent prompt must include: specific tasks, relevant context, file paths, success criteria

## Step 5: Automatic Implementation Review

After all implementation agents complete, **automatically spawn an implementation-reviewer**:

```
Task tool:
  subagent_type: "implementation-reviewer"
  prompt: "Review the implementation against the plan at [path].
    Run npm run typecheck and npm run lint.
    Check every task in the plan was completed.
    Flag any gaps, missing integrations, or convention violations.
    Report completeness status for each plan task."
```

## Step 6: Move Plan to Done

Once all tasks pass review and the implementation is complete, move the plan file from `./tmp/ready-plans/` to `./tmp/done-plans/`:

```bash
mv ./tmp/ready-plans/<plan-file>.md ./tmp/done-plans/
```

Create `./tmp/done-plans/` if it doesn't exist. Only move the plan when all tasks are confirmed complete — if the reviewer found unresolved issues, wait until they are fixed.

## Step 7: Present Results

Present the implementation-reviewer's findings to the user:

```
Implementation complete.

Quality checks:
  typecheck: PASS/FAIL
  lint: PASS/FAIL

Completeness: X/Y tasks done
[List any MISSING or PARTIAL items]

Issues found: [count]
[Summarize key issues if any]

Manual steps remaining:
- [ ] [Dangerous commands from Step 2]

Plan moved to: ./tmp/done-plans/<plan-file>.md

Next steps:
- Fix any issues flagged above
- `/prepare-pr` — Commit, build, and open/update a PR
```

If the reviewer found issues, offer to fix them before the user commits. Only move the plan to `done-plans/` after all issues are resolved.
