name: "Base Plan Template v2 - Context-Rich with Validation Loops" description: |

## Purpose

Template optimized for AI agents to implement features with sufficient context
and self-validation capabilities to achieve working code through iterative
refinement.

## Core Principles

1. **Context is King**: Include ALL necessary documentation, examples, and caveats
2. **Validation Loops**: Provide executable lints the AI can run and fix
3. **Information Dense**: Use keywords and patterns from the codebase
4. **Progressive Success**: Start simple, validate, then enhance
5. **Global rules**: Follow all rules in CLAUDE.md

---

## Goal

[What needs to be built - be specific about the end state and desires]

## Why

- [Business value and user impact]
- [Integration with existing features]
- [Problems this solves and for whom]

## What

[User-visible behavior and technical requirements]

### Success Criteria

- [ ] [Specific measurable outcomes]

## All Needed Context

### Documentation & References

```yaml
# MUST READ - Include these in your context window
- url: [Official API docs URL]
  why: [Specific sections/methods you'll need]

- file: [path/to/example.ts]
  why: [Pattern to follow, gotchas to avoid]

- doc: [Library documentation URL]
  section: [Specific section about common pitfalls]
  critical: [Key insight that prevents common errors]
```

### Current Codebase Tree

```bash
```

### Desired Codebase Tree

```bash
```

### Known Gotchas & Library Quirks

```typescript
// CRITICAL: [Library name] requires [specific setup]
```

## Implementation Blueprint

### Data Models and Structure

```typescript
Examples:
 - Drizzle schema definitions (apps/api/src/shared/db/schema.ts)
 - Zod validators (apps/api/src/modules/<feature>/validator.ts)
 - TypeScript interfaces (libs/shared/src/lib/)
 - API request/response types
```

### Tasks (in implementation order)

```yaml
Task 1:
MODIFY apps/api/src/services/existing-service.ts:
  - FIND pattern: "export class ExistingService"
  - INJECT new method following existing patterns
  - PRESERVE error handling with ApiError

Task 2:
CREATE apps/api/src/controllers/new-feature.controller.ts:
  - FOLLOW pattern from existing controllers
  - USE validator middleware for request validation
  - RETURN standardized ApiResponse format

Task N:
...
```

### Per-Task Pseudocode (as needed)

```typescript
// Pseudocode with CRITICAL details - don't write entire code
```

### Integration Points

```yaml
DATABASE:
  - schema: "Add table definition to apps/api/src/shared/db/schema.ts"
  - diff: "User runs: cd apps/api && npm run db:diff (then applies SQL manually in DataGrip)"

ROUTES:
  - add to: apps/api/src/routes/index.ts
  - create: apps/api/src/routes/feature.routes.ts

FRONTEND:
  - api client: apps/webapp/src/lib/api/feature.ts
  - hook: apps/webapp/src/app/<route>/_hooks/use-feature.ts
  - component: apps/webapp/src/app/<route>/_components/
```

## Validation Loop

```bash
# Run these FIRST - fix any errors before proceeding
npm run lint               # ESLint and Prettier
npm run typecheck          # TypeScript compilation
# Expected: No errors. If errors, READ the error and fix.
```

## Final Validation Checklist

- [ ] No linting errors: `npm run lint`
- [ ] No type errors: `npm run typecheck`
- [ ] Error cases handled gracefully
- [ ] Shared types exported from @doozy/shared if used across apps

## Anti-Patterns to Avoid

- Don't create new patterns when existing ones work
- Don't skip validation because "it should work"
- Don't mix async/await with callbacks
- Don't hardcode values that should be in .env
- Don't catch all errors — be specific with error types
- Don't create new files when editing existing ones works
- Don't forget 'use client' directive for Next.js client components
