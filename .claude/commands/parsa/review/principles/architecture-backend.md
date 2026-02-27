---
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git rev-parse:*), Bash(git branch:*), Read, Grep, Glob, TodoWrite
description: Check for backend architecture pattern violations
---

# /review:architecture-backend - Backend Architecture Checker

You are reviewing code changes for violations of **backend architecture patterns**.

## The Principles

### authenticatedHandler Pattern
Controllers must use `authenticatedHandler` wrapper for authenticated routes. This wrapper:
- Handles authentication
- Provides `req.user`
- Catches errors automatically

**Controllers should NEVER have try/catch blocks.**

### BaseService Pattern
Services accessing the database must extend `BaseService` to get `this.db`.

### ApiError Pattern
Backend code must throw `ApiError` with proper status codes, not generic `Error`.

### Controller-Service Separation
- Controllers: Extract params, delegate to services, return response
- Services: Contain ALL business logic, database queries, validation

**No business logic in controllers. No database queries in controllers.**

## Phase 1: Gather Context

```bash
# Get current branch
git rev-parse --abbrev-ref HEAD

# Get changed files (backend only)
git diff main...HEAD --name-only | grep "apps/api"

# Get full diff for backend
git diff main...HEAD -- "apps/api/"
```

Read the backend patterns:
- `apps/api/CLAUDE.md` - Complete backend architecture
- `CLAUDE.md` - Import conventions

## Phase 2: Check Backend Patterns

### 2.1 Controller Pattern

For each controller file changed:

**Check for authenticatedHandler:**
```typescript
// CORRECT
router.get('/', authenticatedHandler(async (req, res) => {
  const userId = req.user.id;
  // ...
}));

// WRONG - Missing wrapper
router.get('/', async (req, res) => {
  try {
    // ...
  } catch (e) {
    // ...
  }
});
```

**Check for try/catch blocks:**
- Controllers should NOT have try/catch
- authenticatedHandler handles errors

**Check for business logic:**
- Controllers should only: extract params, call service, return response
- Flag any: database queries, complex logic, data transformations

**Study exemplar:** `apps/api/src/modules/feed/controllers/feed.controller.ts`

### 2.2 Service Pattern

For each service file changed:

**Check for BaseService extension:**
```typescript
// CORRECT
export class FeedService extends BaseService {
  async getItems() {
    const items = await this.db.query...
  }
}

// WRONG - Direct db import
import { db } from '@/shared/db';
export class FeedService {
  async getItems() {
    const items = await db.query...
  }
}
```

**Check for ApiError usage:**
```typescript
// CORRECT
throw new ApiError(404, 'Item not found');

// WRONG
throw new Error('Item not found');
```

**Check for single responsibility:**
- Each service should handle one domain concept
- Flag services doing unrelated things

**Study exemplar:** `apps/api/src/modules/feed/services/feed.service.ts`

### 2.3 Validator Pattern

For validator files:

**Check for Zod usage:**
```typescript
// CORRECT
import { z } from 'zod';

export const createItemSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['A', 'B']),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;

// WRONG - Manual validation in controller/service
if (!name || name.length < 1) {
  throw new Error('Invalid name');
}
```

**Study exemplar:** `apps/api/src/modules/feed/validators/feed-tag.validator.ts`

### 2.4 Complex Service Organization

For large services:

**Check folder structure:**
```
services/
  recording/
    index.ts           # Main service, re-exports
    recording.service.ts
    helpers/
      audio-processor.ts
```

## Phase 3: Generate Report

```markdown
# Backend Architecture Report

**Branch:** {branch}
**Status:** {PASS | WARN | FAIL}

## Summary

{One sentence assessment of backend architecture compliance}

## Patterns Checked

- [x] authenticatedHandler usage
- [x] No try/catch in controllers
- [x] Controller-service separation
- [x] BaseService extension
- [x] ApiError usage
- [x] Zod validators
- [x] Single responsibility

## Violations Found

### Critical (Must Fix)

| Location | Pattern Violated | Fix |
|----------|------------------|-----|
| {file:line} | {pattern} | {how to fix} |

### Warnings

| Location | Issue | Recommendation |
|----------|-------|----------------|
| {file:line} | {description} | {suggestion} |

## Controller Issues

| Controller | Issue | Fix |
|------------|-------|-----|
| {file} | {try/catch found / business logic / missing wrapper} | {fix} |

## Service Issues

| Service | Issue | Fix |
|---------|-------|-----|
| {file} | {not extending BaseService / throwing Error / multiple responsibilities} | {fix} |

## Exemplars to Study

- Controller pattern: `apps/api/src/modules/feed/controllers/feed.controller.ts`
- Service pattern: `apps/api/src/modules/feed/services/feed.service.ts`
- Validator pattern: `apps/api/src/modules/feed/validators/feed-tag.validator.ts`
- Complex service: `apps/api/src/modules/audio/services/recording/`

## Recommendations

1. {specific action with file reference}
2. {specific action with file reference}
```

## Phase 4: Output

1. Save report to `tmp/review-architecture-backend-{branch}.md`
2. Present summary:
   - PASS/WARN/FAIL status
   - Count of violations by pattern
   - Most critical issues

## Scoring Criteria

- **PASS**: All backend patterns followed correctly
- **WARN**: Minor deviations (e.g., missing documentation, but patterns correct)
- **FAIL**: Core patterns violated (try/catch in controller, business logic in controller, not extending BaseService)

## Pattern Quick Reference

| Pattern | Correct | Wrong |
|---------|---------|-------|
| Controller auth | `authenticatedHandler(async (req, res) => ...)` | `async (req, res) => { try {...} catch {...} }` |
| Controller logic | Delegates to service | Contains business logic |
| Service DB | `extends BaseService`, uses `this.db` | Direct `db` import |
| Service errors | `throw new ApiError(404, 'msg')` | `throw new Error('msg')` |
| Validation | Zod schemas in validators/ | Manual validation in controller |

Run this analysis now on the current branch.
