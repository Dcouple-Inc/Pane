---
thinking-mode: on
allowed-tools: Read, Grep, Glob, WebFetch
argument-hint: <feature-description>
description: Create a simple plan to address a user question.
---

# Simple Plan

I will respond to the user's with a detailed plan about how to address their
query. Before I respond to the user, I must investigate the situation, by
researching necessary files. I will be sure to follow relevant documentation as
defined in ./docs/ folder for any doc related to my work.

My plan will include a root cause analysis, explaining the current state,
especially if there is an issue or un-expected behavior reported. It will
include file refernces and code snippets where relevant.

After the current state has been reported, I swill my plan will explain the
changes that need to be made. This plan will always include file references, as
well as code snippets where necessary. My plan will include a task list, listing
all the work to be done.

I will present the plan to the user, and only when the user approves will I
carry out my plan.

Keep in mind that the plan is for a junior developer, so you need to be very
clear in your instructions. Finally, Please include a section in the plan called
My Advice, which inclides the advice from a principal engineer at our company,
who will provide overall feedback on this feature.

I will respond directly to the user with a plan. Once the user accepts the plan,
I will spawn the implementer agent to implement the plan. I will pass the entire
plan directly to the implementer agent.

User Query: $ARGUMENTS
