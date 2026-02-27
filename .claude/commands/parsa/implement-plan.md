---
thinking-mode: on
allowed-tools: "*"
argument-hint: <plan-file-path>
description: Execute implementation from plan file
---

# Implement Plan

## Plan to Execute: $ARGUMENTS

I will execute this implementation plan by breaking it into logical chunks and spawning implementation agents to work on each chunk in parallel where possible.

## Step 1: Load and Review Plan

First, I'll read the implementation plan from the specified file or find the most recent plan if no file is specified:
- If a path is provided: Read from $ARGUMENTS
- If no path: Find the most recent plan in ./tmp folder

## Step 2: Plan Analysis

Review the plan to understand:
- Implementation phases
- Task checklist
- Technical requirements
- Dependencies between tasks
- Success criteria

## Step 3: Break Plan into Logical Chunks

**CRITICAL**: Before implementation, decompose the plan into discrete, parallelizable chunks.

### Chunking Strategy

1. **Identify Independent Units**: Group related tasks that can be completed together without depending on other chunks.

2. **Respect Dependencies**: Tasks with dependencies on other chunks must wait. Common dependency patterns:
   - Database/Schema changes must complete before API endpoints
   - Backend APIs must exist before frontend integration
   - Types/interfaces should be defined before implementations that use them

3. **Chunk Size Guidelines**:
   - Each chunk should be completable in a single focused session
   - A chunk typically contains 2-5 related tasks
   - Chunks should have clear boundaries and deliverables

4. **Example Chunk Breakdown**:
   ```
   Chunk 1 (Sequential - Foundation):
   - Database schema changes
   - Shared types/interfaces

   Chunk 2 (Parallel - Backend):
   - API endpoint A
   - API endpoint B
   - Service layer changes

   Chunk 3 (Parallel - Frontend):
   - UI Component A
   - UI Component B
   - Hook implementations

   Chunk 4 (Sequential - Integration):
   - Connect frontend to backend
   - End-to-end testing
   ```

## Step 4: Pre-Implementation Setup

Before spawning agents:
1. Review current git status and create feature branch if needed
2. Verify all prerequisites are met
3. Check for any blocking dependencies
4. Set up the TodoWrite list with chunks as top-level items
5. Identify which chunks can run in parallel vs sequentially

## Step 5: Spawn Implementation Agents

**Use the Task tool with `subagent_type: "implementer"`** to spawn agents for each chunk.

### Agent Spawning Rules

1. **Parallel Execution**: Spawn multiple agents simultaneously for independent chunks using a single message with multiple Task tool calls.

2. **Sequential Execution**: Wait for dependent chunks to complete before spawning agents for chunks that depend on them.

3. **Agent Prompt Requirements**: Each agent prompt must include:
   - The specific chunk of tasks to implement
   - Relevant context from the plan
   - File paths and patterns to follow
   - Clear success criteria for the chunk
   - Instruction to follow existing codebase patterns

4. **Example Agent Spawn**:
   ```
   Task tool call:
   - subagent_type: "implementer"
   - description: "Implement user API endpoints"
   - prompt: "Implement the following tasks from the plan:
     1. Create GET /api/users endpoint
     2. Create POST /api/users endpoint
     Follow patterns in src/modules/auth/.
     Success: Both endpoints working with proper types."
   ```

### Execution Flow

```
Phase 1: Foundation (Sequential)
  └─> Spawn agent for database/schema chunk
  └─> Wait for completion

Phase 2: Core Implementation (Parallel)
  └─> Spawn agent for backend chunk A  ─┐
  └─> Spawn agent for backend chunk B  ─┼─> Wait for all
  └─> Spawn agent for frontend chunk   ─┘

Phase 3: Integration (Sequential)
  └─> Spawn agent for integration chunk
  └─> Wait for completion
```

## Step 6: Monitor and Coordinate

While agents are working:
- Track progress via TodoWrite
- Update plan file checkboxes (- [ ] to - [x]) as chunks complete
- Handle any conflicts or issues that arise between chunks
- Spawn next phase agents when dependencies are satisfied

## Step 7: Continuous Verification

After each chunk completes:
- Run `npm run lint:fix` to fix any linting issues
- Run `npm run typecheck` to catch type errors
- Verify the chunk meets its success criteria
- Commit changes at logical checkpoints

## Step 8: Completion Verification

After all agents complete:
1. Verify all checklist items are complete
2. Run full lint and typecheck
3. Ensure all success criteria are met
4. Review changes for consistency across chunks
5. Update any affected documentation

## Code Quality Standards

All agents must follow:
- Existing code conventions in the codebase
- Established patterns from similar implementations
- Consistent naming conventions
- Proper TypeScript types
- Architecture documented in ./docs

## Notes

- Break plans into the smallest reasonable chunks that can run independently
- Maximize parallel execution where dependencies allow
- Each agent should have clear, focused scope
- I will track all progress transparently through TodoWrite
- I will not add features beyond the plan's scope
- I will ask for clarification if chunk boundaries are unclear

Let me begin by loading and reviewing the implementation plan...