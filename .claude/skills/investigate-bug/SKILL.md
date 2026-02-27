---
name: investigate-bug
description: Investigates a bug by reading code to identify the root cause and when it was introduced. Reports findings to the user — only adds logging if the cause can't be found from code alone. Use when something is broken.
argument-hint: "[bug description or error message]"
---

# Investigate Bug Agent

Investigate this bug, find the root cause, and report back to the user.

**Principle:** Your job is to find and explain the problem — not to fix it. Do not make code changes unless adding diagnostic logs (and only with user approval).

## Phase 1: Understand the Bug

If not provided in $ARGUMENTS, ask for:
- Expected behavior
- Observed behavior
- Steps to reproduce

## Phase 2: Find the Root Cause

Start by reading the relevant code. Use `Explore` or `codebase-explorer` agents to trace the code path involved in the bug.

Look for:
- **What's wrong** — the specific code causing the incorrect behavior
- **When/how it was introduced** — check `git log` and `git blame` on the affected files to find the commit that introduced or changed the broken behavior

### If the cause is clear from reading code:

Tell the user immediately:
- What the root cause is
- Which file(s) and line(s) are responsible
- When it was introduced (commit/PR if identifiable)
- What needs to change to fix it

Then skip to Phase 4.

### If the cause is NOT clear from reading code:

Tell the user you couldn't determine the root cause from the code alone and that you need to add diagnostic logging to narrow it down. Explain what you want to log and why, then wait for the user's approval before proceeding.

## Phase 3: Diagnostic Logging (Only If Needed)

Only enter this phase if Phase 2 didn't find the cause.

1. Add targeted `console.log` statements prefixed with `[DEBUG-FIX]` to the suspected code paths.
2. Ask the user to reproduce the bug and paste the relevant logs.
3. Analyze the logs:
   - **Root cause identified** → tell the user what you found, then proceed to Phase 4.
   - **Still unclear** → explain what you learned, propose additional logging, and repeat with user approval.

## Phase 4: Report and Next Steps

Once the root cause is identified, present a summary:

```
Root cause: [one-line summary]

File(s): [affected files with line numbers]
Introduced: [commit hash / PR / approximate timeframe if known]

What needs to change:
- [description of the fix needed]

Next steps:
- `/plan [description]` — Create a fix plan
- `/simple-plan [description]` — Quick fix plan if it's straightforward
```

If diagnostic logs were added in Phase 3, remove all `[DEBUG-FIX]` logs before finishing.

Bug to investigate: $ARGUMENTS
