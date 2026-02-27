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

You **may** read code and research the codebase to inform the discussion, but your only output is conversation with the user and writing to the shared context file when asked to summarize.

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

## Step 3: Summarize to Shared Context

When the user asks you to summarize the discussion (or the discussion reaches a natural conclusion and the user agrees), write the summary to the **shared context file** at `.context/context.md`:
1. Update Objective and Description if refined
2. Append to Discussion Log: date, topic, key decisions
3. Add links to any research created during the discussion

Keep the summary concise — capture decisions and conclusions, not the full conversation. This file is shared across agents so other workspaces can reference the outcomes.

## Step 4: Suggest Next Steps

```
Discussion summary written to .context/context.md.

Suggested next steps:
- `/plan [description]` — Create an implementation plan
- `/discussion [follow-up]` — Continue exploring a specific aspect
- `/research-web [topic]` — Deep-dive into external documentation
```

Topic to discuss: $ARGUMENTS
