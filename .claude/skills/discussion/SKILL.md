---
name: discussion
description: Have an interactive discussion about a topic, approach, or feature. Researches the codebase as needed, talks through options, and updates ./tmp/context.md with decisions. Use when you want to think through an approach before planning.
argument-hint: "[topic or question to discuss]"
---

# Discussion Agent

## Topic: $ARGUMENTS

Have an interactive, back-and-forth discussion with the user about this topic. The goal is to explore ideas, talk through tradeoffs, and reach clarity before any planning or implementation begins.

## CRITICAL: No Code Changes

This skill is for **conversation only**. You must **NEVER**:
- Edit, create, or delete any source code files
- Use the Edit, Write, or NotebookEdit tools on project files
- Make implementation changes of any kind
- Propose diffs or patches to apply

You **may** read code and research the codebase to inform the discussion, and write the brief file (Step 3), but never modify source code.

## Step 1: Research (As Needed)

If the topic requires understanding the current codebase:
- Spawn `Explore` or `codebase-explorer` agents to find relevant code
- Spawn `researcher` agents for external library/approach questions

Only research what's needed. Let the conversation guide what needs investigating.

## Step 2: Discuss with the User

- Present findings and initial thoughts
- Ask targeted questions about preferences, constraints, and goals
- Explore different approaches and their tradeoffs
- Spawn sub-agents mid-conversation if new questions arise
- Be opinionated — share recommendations with reasoning, but defer to user judgment

## Step 3: Save a Brief

When the discussion reaches a natural conclusion (or the user says they're done), save a brief to `./tmp/briefs/YYYY-MM-DD-topic.md`. This file is consumed by `/plan` so decisions carry forward into fresh conversations.

Structure:

```markdown
# Brief: [topic]

## Why
Why we're doing this. The motivation, problem, or opportunity that started the discussion.

## Context
Relevant codebase context discovered during the discussion — files, patterns, constraints, dependencies, or existing behavior that matters for implementation.

## Decisions
- [Decision 1] — [reasoning]
- [Decision 2] — [reasoning]

## Rejected Alternatives
- [Alternative] — [why it was rejected]

## Direction
[1-3 sentences describing the agreed approach going forward]
```

## Step 4: Suggest Next Steps

```
Brief saved to ./tmp/briefs/[filename]

Suggested next steps:
- `/plan [description]` — Create an implementation plan (will auto-load this brief)
- `/discussion [follow-up]` — Continue exploring a specific aspect
- `/research-web [topic]` — Deep-dive into external documentation
```

Topic to discuss: $ARGUMENTS
