---
thinking-mode: on
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
argument-hint: <bug-description>
description: Systematically debug issues through hypothesis-driven logging, analysis, and PRP generation.
---

# Fix Bug

I will systematically debug this issue using a hypothesis-driven logging approach.

## Workflow

### Phase 1: Understand the Bug
If not provided in $ARGUMENTS, I will ask for:
- Expected behavior
- Observed behavior  
- Steps to reproduce

### Phase 2: Hypothesis & Logging Plan
Based on the bug description, I will:
1. Form a hypothesis about the root cause
2. Identify files that need diagnostic logging
3. Present my plan:

**Hypothesis:** [My theory about what's causing the bug]

**Files to instrument:**
- `[file]` - [what I'll log and why]

I will wait for your confirmation before adding logs.

### Phase 3: Add Diagnostic Logs
Once approved, I will add targeted `console.log` statements prefixed with `[DEBUG-FIX]` for easy identification and removal.

### Phase 4: Reproduce & Analyze
I will ask you to:
1. Reproduce the issue
2. Paste the relevant logs here

When you provide logs, I will analyze them:
- **If root cause is identified** → proceed to Phase 5
- **If unclear** → refine hypothesis and add more logging (repeat Phases 2-4)

### Phase 5: Create PRP
Once I have concrete evidence from logs, I will create a PRP containing:
- Root cause (with log evidence)
- Proposed fix
- Files to modify
- Implementation approach

### Phase 6: Clean Up
After the PRP is created, I will remove all `[DEBUG-FIX]` diagnostic logs.

---

**Principle:** Never guess at fixes. Every PRP must be backed by evidence from logs.

Bug to investigate: $ARGUMENTS