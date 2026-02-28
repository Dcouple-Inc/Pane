---
name: plan
description: Creates an implementation plan with thorough codebase and web research. Auto-reviews the plan after creation and iterates with user feedback. Use when planning a new feature or significant change.
argument-hint: "[feature description or ticket reference]"
allowed-tools: Read, Grep, Glob, WebFetch, WebSearch, Write, Task
---

# Plan Agent

## Feature: $ARGUMENTS

Generate a complete plan for feature implementation with thorough research. The plan must contain enough context for an AI agent to implement the feature in a single pass.

## Step 0: Load Discussion Briefs

Check `./tmp/briefs/` for any existing brief files. If briefs exist, read them all. These contain prior decisions, rejected alternatives, context, and direction from `/discussion` sessions. Incorporate them as **settled decisions** — do not re-litigate what was already decided unless you spot a clear technical problem.

If no briefs exist, skip this step.

## Step 1: Research (Only If Needed)

If the approach is **genuinely unclear** (and not already covered by briefs), ask the user 1-3 targeted design questions. Otherwise, proceed directly.

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

- **Required Sections** (never leave empty): Files Being Changed (tree with ← NEW / ← MODIFIED markers), Architecture Overview (proportional to complexity), Key Pseudocode (hot spots and tricky logic only), and Tasks (concrete file-level steps in order).

- **No Backwards Compatibility**: Replace things completely. No shims, fallbacks, re-exports, or compatibility layers unless user explicitly requests it.
- **Deprecated Code**: Include a section at the end to remove code we no longer use as a result of this plan.
- **No Unit/Integration Tests**: Do not include test creation in the plan.
- **Flag Uncertainty**: When uncertain about a requirement, design decision, or implementation detail, do NOT guess or assume. Insert a `[NEEDS CLARIFICATION]` marker with a brief explanation of what's unclear and why it matters. These markers must be resolved with the user before the plan is finalized.

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

2. **Present the review summary to the user.** When the reviewer finishes, provide the user with:

   **a) Plan Summary** — Summarize the key points of the plan in 3-5 bullet points so the user can quickly recall what the plan covers without re-reading it.

   **b) Reviewer Feedback with Context** — For each recommendation the reviewer raises, explain:
   - The reviewer's question or concern
   - **Context**: What the surrounding functionality does and why this matters. Reference specific files, patterns, or behaviors in the codebase so the user understands the implications.

   **c) Plan Link** — Provide the plan path so the user can open it:
   ```
   Plan: ./tmp/ready-plans/[filename]
   ```

   **d) Questions** — Ask the user whether they want to incorporate, skip, or modify each recommendation.

3. **Update the plan** based on the user's decisions. Save the updated file.

4. **Check with the user**: Ask if the plan is ready or if they want another review pass.
   - If ready → exit the loop, proceed to Step 5.
   - Otherwise → go back to step 1 with a fresh plan-reviewer.

### Important:
- Each review pass uses a **fresh plan-reviewer** so it evaluates the current state without bias.

## Step 5: Explain Next Steps

Once the user confirms the plan is ready, tell them:

```
Plan finalized! To implement, run:

/implement ./tmp/ready-plans/[filename]
```

## Quality Checklist

- [ ] All necessary context included
- [ ] Validation gates are executable by AI
- [ ] References existing patterns
- [ ] Clear implementation path
- [ ] Error handling documented
- [ ] Files Being Changed trees are filled in
- [ ] Architecture overview explains the big picture
- [ ] Key pseudocode covers hot spots
- [ ] No unresolved [NEEDS CLARIFICATION] markers

Score the plan 1-10 (confidence for one-pass implementation success).

## Plan Lifecycle

- **Active plans**: `./tmp/ready-plans/`
- **Completed plans**: `./tmp/done-plans/` (moved after successful implementation)
- **Cancelled plans**: `./tmp/cancelled-plans/` (moved if abandoned)
