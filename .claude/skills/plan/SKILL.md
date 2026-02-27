---
name: plan
description: Creates an implementation plan with thorough codebase and web research. Auto-reviews the plan after creation and iterates with user feedback. Use when planning a new feature or significant change.
argument-hint: "[feature description or ticket reference]"
---

# Plan Agent

## Feature: $ARGUMENTS

Generate a complete plan for feature implementation with thorough research. The plan must contain enough context for an AI agent to implement the feature in a single pass.

## Step 1: Research (Only If Needed)

If the approach is **genuinely unclear**, ask the user 1-3 targeted design questions. Otherwise, proceed directly.

### Codebase Analysis
- Search for similar features/patterns in the codebase
- Identify files to reference in the plan
- Note existing conventions to follow

### External Research
- Library documentation (include specific URLs)
- Implementation examples
- Best practices and common pitfalls

## Step 2: Write the Plan

Using `./plan_base.md` (in this skill's directory) as template.

### Critical Context to Include

The AI agent only gets the context in the plan plus codebase access. Include:
- **Documentation**: URLs with specific sections
- **Code Examples**: Real snippets from codebase
- **Gotchas**: Library quirks, version issues
- **Patterns**: Existing approaches to follow

### Implementation Blueprint

- Start with pseudocode showing approach
- Reference real files for patterns
- Include error handling strategy
- List tasks in implementation order

### Plan Guidelines

- **No Backwards Compatibility**: Replace things completely. No shims, fallbacks, re-exports, or compatibility layers unless user explicitly requests it.
- **Deprecated Code**: Include a section at the end to remove code we no longer use as a result of this plan.
- **No Unit/Integration Tests**: Do not include test creation in the plan.

## Step 3: Save the Plan

Save as: `./tmp/ready-plans/YYYY-MM-DD-description.md`

## Step 4: Iterative Review Loop

After saving the plan, enter an iterative review cycle. **Do not skip this step.** Repeat until the user confirms the plan is ready.

### Loop:

1. **Spawn a plan-reviewer sub-agent** to review the plan:

```
Task tool:
  subagent_type: "plan-reviewer"
  prompt: "Review the plan at [path]. Produce a numbered list of specific,
    actionable recommendations covering gaps, simplification opportunities,
    correctness issues, and better alternatives."
```

2. **Present the reviewer's recommendations to the user as questions.** For each recommendation, ask the user whether they want to incorporate it, skip it, or modify it.

3. **Update the plan** based on the user's decisions. Save the updated file.

4. **Check with the user**: Ask if the plan is ready or if they want another review pass.
   - If ready → exit the loop, proceed to Step 5.
   - Otherwise → go back to step 1 with a fresh plan-reviewer.

### Important:
- Each review pass uses a **fresh plan-reviewer** so it evaluates the current state without bias.

## Step 5: Explain Next Steps

Once the user confirms the plan is ready, tell them:

```
Plan finalized. Your options:
1. `/implement [path]` — Execute this plan with implementation agents
2. Edit the plan manually, then run /implement

The plan is at: ./tmp/ready-plans/[filename]
```

## Quality Checklist

- [ ] All necessary context included
- [ ] Validation gates are executable by AI
- [ ] References existing patterns
- [ ] Clear implementation path
- [ ] Error handling documented

Score the plan 1-10 (confidence for one-pass implementation success).

## Plan Lifecycle

- **Active plans**: `./tmp/ready-plans/`
- **Completed plans**: `./tmp/done-plans/` (moved after successful implementation)
- **Cancelled plans**: `./tmp/cancelled-plans/` (moved if abandoned)
