---
name: investigate
description: Investigates bugs through hypothesis-driven root cause analysis. Automatically invoked when the user reports a bug, error, broken behavior, or something not working as expected. Use when something is broken, failing, or behaving unexpectedly.
argument-hint: "[bug description, error message, or unexpected behavior]"
---

# Investigate Agent

Investigate this bug, find the root cause, and report back to the user.

**Principle:** Your job is to find and explain the problem — not to fix it. Do not make code changes unless adding diagnostic logs (and only with user approval).

## Phase 1: Understand the Bug

If not provided in $ARGUMENTS, ask for:
- Expected behavior
- Observed behavior
- Steps to reproduce

### Categorize the Bug Type

Classify the issue early — different types need different investigation strategies:

| Category | Investigation Strategy |
|---|---|
| **Type / Compilation Error** | Check recent type changes, inference chains, tsconfig, package versions |
| **Logic Error** | Trace data flow, check conditionals, compare with working code paths |
| **Race Condition / Timing** | Look for shared state, async patterns, missing awaits, event ordering |
| **State Management** | Trace state mutations, check store subscriptions, verify update propagation |
| **Integration / API** | Check API contracts, data transformations, request/response shapes |
| **Environment / Config** | Check env variables, config files, dependency versions, build settings |
| **UI / Rendering** | Check component props, conditional rendering, CSS specificity, hydration |

### Verify Reproduction

Before investigating:
- Confirm you understand how to trigger the bug
- Note whether it's consistent or intermittent
- If reproduction requires a running application, flag this to the user — you may need them to reproduce and provide logs

## Phase 2: Form Hypotheses

**Before reading any code**, generate 3-5 possible causes ranked by likelihood based on the bug description, error messages, and your knowledge of common failure patterns.

Format:
```
Hypotheses (ranked by likelihood):
1. [Most likely cause] — because [reasoning]
2. [Second most likely] — because [reasoning]
3. [Third most likely] — because [reasoning]
...
```

This prevents tunnel-vision on the first plausible explanation. You will test these systematically.

## Phase 3: Investigate the Root Cause

Now trace through the code to test your hypotheses. Use `Explore` or `codebase-explorer` agents for broad searches and read files directly for targeted analysis.

### Investigation Techniques

Use these in order of effectiveness:

1. **Start from the error and trace backward** — follow the call stack from the symptom to its origin
2. **Check recently modified files first** — most bugs exist in recently changed code. Use `git log --oneline -20 -- [relevant paths]` to find recent changes
3. **Compare working vs broken** — find similar working code in the codebase and list ALL differences between the working and broken paths
4. **Trace data flow across boundaries** — follow data transformations across service/component boundaries (API → service → repository, or parent → child → grandchild)
5. **Check git blame/log** — find the commit that introduced or changed the broken behavior

### What to Look For

- **What's wrong** — the specific code causing the incorrect behavior
- **When/how it was introduced** — the commit, PR, or change that broke things
- **Why it happened** — the underlying reason (missed edge case, wrong assumption, incomplete refactor, etc.)

### If the cause is clear from reading code:

Tell the user immediately with your findings, then skip to Phase 5.

### If the cause is NOT clear from reading code:

Tell the user:
- What you've investigated so far
- Which hypotheses you've ruled out and why
- What remains unclear

Then propose diagnostic logging to narrow it down. Explain what you want to log and why, and wait for user approval before proceeding.

## Phase 4: Diagnostic Logging (Only If Needed)

Only enter this phase if Phase 3 didn't find the cause.

1. Add targeted `console.log` statements prefixed with `[DEBUG-FIX]` to the suspected code paths.
2. Ask the user to reproduce the bug and paste the relevant logs.
3. Analyze the logs:
   - **Root cause identified** → tell the user what you found, then proceed to Phase 5.
   - **Still unclear** → explain what you learned, refine your hypotheses, propose additional logging, and repeat with user approval.

### Escalation: When You're Stuck

If you've completed 3+ investigation cycles (hypothesis → test → inconclusive) without progress:

1. **Summarize what's been ruled out** — list every hypothesis tested and the evidence against it
2. **Propose a fundamentally different approach** — don't keep testing variations of the same theory. Consider:
   - Is the bug actually in a different layer than assumed? (e.g., backend vs frontend, database vs application)
   - Could this be an environment/infrastructure issue rather than a code issue?
   - Is there a timing/race condition that only manifests under specific conditions?
3. **Ask the user for help** — they may have domain knowledge or context that changes the investigation direction

## Phase 5: Report and Next Steps

Once the root cause is identified, present a summary:

```
## Investigation Report

**Root cause:** [one-line summary]
**Confidence:** [High / Medium / Low] — [brief justification]

**File(s):** [affected files with line numbers]
**Introduced:** [commit hash / PR / approximate timeframe if known]

**What needs to change:**
- [description of the fix needed]

**Why this happened:**
- [brief explanation of the underlying cause — missed edge case, wrong assumption, incomplete refactor, etc.]

**Next steps:**
- `/plan [description]` — Create a fix plan
- `/simple-plan [description]` — Quick fix plan if it's straightforward
```

If diagnostic logs were added in Phase 4, remove all `[DEBUG-FIX]` logs before finishing.

## Red Flags — Catch Yourself

Stop and reassess if you notice yourself doing any of these:

- Proposing a fix before you've identified the root cause
- Making assumptions about the cause without evidence from the code
- Investigating code that has nothing to do with the reported symptoms
- Testing variations of the same failed hypothesis instead of forming a new one
- Saying "let's just try changing X and see if it works"
- Spending excessive time without reporting intermediate findings to the user

Bug to investigate: $ARGUMENTS
