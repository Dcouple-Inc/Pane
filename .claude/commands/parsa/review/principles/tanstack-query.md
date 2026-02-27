---
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git rev-parse:*), Bash(git branch:*), Read, Grep, Glob, TodoWrite
description: Check for TanStack Query pattern violations (query keys, optimistic updates, cache seeding)
---

# /review:tanstack-query - TanStack Query Patterns Checker

You are reviewing code changes for violations of **TanStack Query patterns** established in this codebase.

**Canonical reference:** `tmp/research/tanstack-query-guidelines.md` — read this first for full context.

## The Principles

### 1. Global Configuration — No Per-Query Overrides

The global `QueryClient` defaults handle freshness. Do NOT add per-query overrides.

**Global defaults (in `providers/QueryProvider.tsx`):**
- `staleTime: 0` — always stale, always refetch on mount/focus/reconnect
- `refetchOnWindowFocus: true`
- `refetchOnReconnect: true`
- `retry: 3` with exponential backoff

**Rules:**
- Do NOT add per-query `staleTime` unless data is truly immutable (write-once, content-addressed). The only valid constant is `STALE_TIME.IMMUTABLE` (`Infinity`).
- Do NOT add per-query `refetchOnWindowFocus` or `refetchOnReconnect` — global defaults apply.
- Do NOT add `retry` overrides unless the query has special failure semantics.

### 2. Domain-Specific Hierarchical Query Key Factories

Every domain gets its own `<domain>Keys.ts` factory with hierarchical, self-referential keys. Never use raw string arrays. Never add domain keys to the flat `qk` object.

**Gold standard exemplars:**
- `apps/webapp/src/hooks/feed/feedKeys.ts`
- `apps/webapp/src/hooks/conversations/conversationKeys.ts`
- `apps/webapp/src/hooks/todos/todoKeys.ts`

**Required structure:**
```typescript
export const domainKeys = {
  all: ['domain'] as const,
  lists: (workspaceId, params?) => [...domainKeys.all, 'list', workspaceId ?? null, normalizeParams(params)] as const,
  detail: (id) => [...domainKeys.all, 'detail', id ?? null] as const,
};
```

**Key properties:**
- Self-referential: all keys spread from `...domainKeys.all`
- Param normalization: dedicated function, `undefined` → `null`, sorted arrays, Dates → ISO strings
- `as const` on all keys for type inference
- Co-located with hooks in `src/hooks/<domain>/`

### 3. Cache Invalidation — Predicate Helpers for Parameterized Lists

TanStack Query's `invalidateQueries({ queryKey })` uses **prefix matching**. Calling a factory with no params still produces a full key with trailing defaults, which is **narrower** than the base prefix.

**The trap:**
```typescript
// BAD: Factory call includes default params, misses other param variants
queryClient.invalidateQueries({ queryKey: conversationKeys.lists(workspaceId) });
// Produces ['conversations', 'list', workspaceId, {}] — misses { includeMessages: true }

// GOOD: Use the predicate helper
invalidateWorkspaceConversations(queryClient, workspaceId);
```

**Rule:** Any domain with parameterized list queries must have an invalidation helper (`<domain>Invalidation.ts`) that uses a predicate to match all variants. Use the predicate helper in all mutations, not raw factory calls.

**When to use what:**

| Scenario | Approach |
|----------|----------|
| All list variants for a workspace | Predicate helper |
| Specific detail query | Exact key: `domainKeys.detail(id)` |
| Everything in a domain | Base prefix: `domainKeys.all` |
| Simple key with no params | Factory call is fine |
| All variants of a parameterized parent | Prefix only, no trailing params: `['workspaces']` |

### 4. Optimistic Updates via `onMutate`

All optimistic state changes happen inside `useMutation`'s `onMutate` with snapshot + rollback. Never mutate cache from component handlers.

**Exemplar:** `apps/webapp/src/hooks/todos/useTodo.ts` (`useUpdateTodoTitle`)

**Required 6-step pattern:**
1. `cancelQueries` — prevent race conditions
2. Snapshot current state
3. Optimistically update cache
4. Return context for rollback
5. `onError` — restore from snapshot
6. `onSettled` — invalidate to ensure server truth

**When NOT to use optimistic updates:**
- Server response determines new state (AI generation, complex transforms) → use `onSuccess` invalidation
- Destructive operations (delete) → prefer invalidation + loading state

**`setQueryData` in `onSuccess` is acceptable** for caching server responses to detail queries (this is NOT an optimistic update).

### 5. Instant Loading via `initialData` Cache Seeding

List-to-detail navigation uses `initialData` to pull from list cache. Eliminates loading spinners.

**Exemplars:**
- `apps/webapp/src/hooks/todos/useTodo.ts` (`findTodoInCache` + `useTodoDetail`)
- `apps/webapp/src/hooks/feed/useFeedItem.ts` (`findFeedItemInCache`)
- `apps/webapp/src/hooks/conversations/useConversation.ts` (`findConversationInCache`)

**Required pattern:**
- `findXInCache` helper searches `domainKeys.all` across all query shapes
- Handles both flat and infinite query structures (iterate `data.pages` for infinite queries)
- Used as `initialData: () => findXInCache(queryClient, id)`
- Use `initialData` not `placeholderData` — `initialData` caches and counts as "real" data

### 6. WebSocket Cache Updates

WebSocket handlers can update cache directly via `setQueryData` — this is server-sourced data, NOT an optimistic update. Always pair with debounced invalidation.

**Rule:** On WebSocket reconnect, invalidate all workspace caches using predicate-based helpers (not specific key variants).

### 7. `qk` vs Domain Factories

The flat `qk` object is for simple, non-parameterized keys. Anything with parameterized lists, multiple query shapes, or invalidation complexity gets a domain factory.

**Move a key from `qk` to a domain factory when:**
1. It has 3+ query key usages
2. Lists have filter/sort/pagination params
3. You need predicate-based invalidation to match all variants
4. There's a list → detail navigation pattern (cache seeding)

### 8. ESLint Suppressions

The `@tanstack/query/exhaustive-deps` rule requires all `queryFn` variables in `queryKey`. Suppress when `workspaceId` is for API auth only (detail queries keyed by globally unique ID).

**Rule:** Always include a `--` explanation in suppression comments:
```typescript
// eslint-disable-next-line @tanstack/query/exhaustive-deps -- workspaceId is for API auth only; todoId is globally unique
```

### 9. Prefetching Key Matching

Prefetch keys must be **identical** to what the page hook uses. If they don't match, TanStack Query treats them as separate caches — the prefetch is wasted.

---

## Phase 1: Gather Context

```bash
# Get current branch
git rev-parse --abbrev-ref HEAD

# Get changed files
git diff main...HEAD --name-only

# Get full diff
git diff main...HEAD
```

Read the guidelines doc for full context:
- `tmp/research/tanstack-query-guidelines.md`

Use TodoWrite to track each violation to investigate.

## Phase 2: Check Global Config Violations

### 2.1 Per-Query `staleTime` Overrides

Search changed files for `staleTime` usage:

```
staleTime
```

For each occurrence:
1. Is it `STALE_TIME.IMMUTABLE` for truly immutable data? → OK
2. Is it any other value? → **FAIL**: remove it, global `staleTime: 0` handles freshness

### 2.2 Per-Query `refetchOnWindowFocus` / `refetchOnReconnect`

Search changed files for:
```
refetchOnWindowFocus
refetchOnReconnect
```

Any per-query override → **FAIL**: these are set globally. Remove the override.

### 2.3 Per-Query `retry` Overrides

Search for `retry:` in query options. Flag unless the query has documented special failure semantics.

## Phase 3: Check Query Key Violations

### 3.1 Raw String Query Keys

Search the diff for raw query key arrays that bypass factories:

```
queryKey: ['
```

For each raw key found:
1. Check if a factory key exists for this domain
2. If factory exists → FAIL: should use factory
3. If no factory exists → WARN: factory should be created

### 3.2 Using `qk` for Domain-Owned Keys

Check if changed files import `qk` and use it for keys that belong to a domain factory.

**Known domain factories (all 6):**

| Factory | Owns | Base Key |
|---------|------|----------|
| `feedKeys` | all `['feed', ...]` keys | `['feed']` |
| `conversationKeys` | all `['conversations', ...]` keys | `['conversations']` |
| `todoKeys` | all `['todos', ...]` keys | `['todos']` |
| `skillKeys` | all `['skills', ...]` keys | `['skills']` |
| `templateKeys` | all `['skill-templates', ...]` keys | `['skill-templates']` |
| `toolkitKeys` | all `['toolkits', ...]` keys | `['toolkits']` |

If code uses `qk.conversations*`, `qk.todos*`, `qk.feed*`, `qk.skills*`, etc. when a domain factory exists → **FAIL**.

### 3.3 Missing Domain Factory

If new hooks are introduced for a domain that doesn't have its own `<domain>Keys.ts`:
1. Check if the domain has 3+ query key usages
2. If yes → WARN: should create a domain factory
3. Check if keys follow the hierarchical pattern (`all` → `lists` → `detail`)

### 3.4 Key Structure Consistency

For each query key in changed files:
1. Does it spread from a base `all` key?
2. Does it normalize params (undefined → null)?
3. Does it use `as const`?
4. Are arrays sorted for deterministic keys?

## Phase 4: Check Cache Invalidation Violations

### 4.1 Factory Calls for Parameterized List Invalidation (PREFIX MATCHING TRAP)

This is the most dangerous pattern. Search for `invalidateQueries` in changed files. For each call:

1. Does the target key come from a factory call with params (e.g., `domainKeys.lists(workspaceId)`)?
2. Does that factory produce trailing default params (e.g., `['todos', 'list', wsId, {}]`)?
3. If yes → **FAIL**: this misses other param variants. Use a predicate-based invalidation helper instead.

### 4.2 Missing Predicate Helper

For domains with parameterized lists: does a `<domain>Invalidation.ts` file exist with predicate-based helpers? If mutations invalidate parameterized lists without using a predicate → **FAIL**.

### 4.3 Invalidation Scope

Check mutation `onSuccess`/`onSettled` callbacks:
- Not too broad (invalidating everything when only one list changed)
- Not too narrow (missing param variants)
- Use factory hierarchical keys for scoped invalidation

### 4.4 Mismatched Keys (CRITICAL)

The most dangerous bug: invalidation targeting a different key structure than what the query uses. For each invalidation call:
1. What key does `invalidateQueries` target?
2. What key does the corresponding `useQuery`/`useInfiniteQuery` use?
3. Do they share a common prefix so the invalidation actually hits?

## Phase 5: Check Optimistic Update Violations

### 5.1 Cache Mutations Outside `onMutate`

Search for `queryClient.setQueryData` or `queryClient.setQueriesData` in changed files. Verify each usage is:
- Inside an `onMutate` callback, OR
- Inside a shared helper called from `onMutate`, OR
- Inside `onSuccess` caching a server response (acceptable), OR
- Inside a WebSocket event handler (acceptable — server-sourced data)

Flag any cache mutations in:
- Component event handlers
- `useEffect` callbacks (except initial cache seeding)
- Standalone functions called outside mutation/WS lifecycle

### 5.2 Missing Rollback

For each `onMutate` in changed files, verify all 6 steps:
1. `cancelQueries` before reading cache
2. Snapshot current state
3. Optimistic update
4. Return context for rollback
5. `onError` restores from snapshot
6. `onSettled` invalidates queries

### 5.3 Missing `cancelQueries`

For each `onMutate`, verify it calls `cancelQueries` before reading cache state.

## Phase 6: Check Cache Seeding Violations

### 6.1 Detail Hooks Without `initialData`

For new detail query hooks (`useQuery` fetching a single entity):
1. Does a list query exist for this domain?
2. If yes, does the detail hook use `initialData` from list cache?
3. Is there a `findXInCache` helper?

### 6.2 Cache Search Using Wrong Keys

For `findXInCache` helpers, verify they use `domainKeys.all` (not raw strings) to search across all query shapes.

### 6.3 `placeholderData` Instead of `initialData`

If a detail hook uses `placeholderData` instead of `initialData` for cache seeding → **WARN**: `initialData` is preferred because it caches and counts as "real" data.

## Phase 7: Check ESLint Suppression Format

Search for `eslint-disable.*tanstack` in changed files. For each suppression:
1. Does it include a `--` explanation? → OK
2. Missing explanation? → **WARN**: add `-- reason` to the comment

## Phase 8: Check Prefetching Key Matching

Search for `prefetchQuery` or `prefetchInfiniteQuery` in changed files. For each:
1. What key does the prefetch use?
2. What key does the corresponding page hook use?
3. Are they **identical**? If not → **FAIL**: mismatched keys waste the prefetch

## Phase 9: Check WebSocket Cache Update Patterns

Search for `setQueryData` usage in WebSocket handlers. For each:
1. Is it paired with a debounced invalidation? → OK
2. Missing invalidation pairing? → **WARN**

Check WebSocket reconnect handlers:
1. Do they use predicate-based invalidation helpers? → OK
2. Do they use specific key variants that might miss param variants? → **FAIL**

## Phase 10: Generate Report

```markdown
# TanStack Query Patterns Report

**Branch:** {branch}
**Status:** {PASS | WARN | FAIL}

## Summary

{One sentence assessment of TanStack Query pattern adherence}

## Global Config Violations

### Per-Query Overrides (should use global defaults)

| Location | Override | Rule |
|----------|---------|------|
| {file:line} | `staleTime: 30000` | Remove — global `staleTime: 0` handles freshness |
| {file:line} | `refetchOnWindowFocus: false` | Remove — global default is `true` |

## Query Key Violations

### Raw String Keys (should use factory)

| Location | Raw Key | Should Use |
|----------|---------|------------|
| {file:line} | `['domain', id]` | `domainKeys.detail(id)` |

### Wrong Factory (using `qk` instead of domain factory)

| Location | Current | Should Use |
|----------|---------|------------|
| {file:line} | `qk.conversations(wsId)` | `conversationKeys.lists(wsId)` |

### Missing Domain Factory

| Domain | Key Count | Keys Used |
|--------|-----------|-----------|
| {domain} | {count} | {list of keys} |

### Key Structure Issues

| Location | Issue | Fix |
|----------|-------|-----|
| {file:line} | {missing normalization/as const/etc} | {how to fix} |

## Cache Invalidation Violations

### Prefix Matching Trap (CRITICAL)

| Location | Invalidation Key | Misses |
|----------|-----------------|--------|
| {file:line} | `domainKeys.lists(wsId)` → `['domain', 'list', wsId, {}]` | Variants with non-default params |

### Mismatched Keys (CRITICAL)

| Invalidation | Targets | Query Uses | Match? |
|-------------|---------|------------|--------|
| {file:line} | {key} | {key} | {yes/no} |

### Missing Predicate Helper

| Domain | Has Parameterized Lists? | Has Invalidation Helper? |
|--------|-------------------------|------------------------|
| {domain} | {yes/no} | {yes/no} |

## Optimistic Update Violations

### Cache Mutations Outside `onMutate`

| Location | Issue |
|----------|-------|
| {file:line} | {setQueryData called from handler/useEffect/etc} |

### Missing Rollback/Cancel

| Location | Missing |
|----------|---------|
| {file:line} | {no snapshot/no onError rollback/no cancelQueries} |

## Cache Seeding Violations

### Detail Hooks Missing `initialData`

| Hook | Has List Query? | Has `initialData`? |
|------|-----------------|-------------------|
| {hook name} | {yes/no} | {yes/no} |

### Cache Search Using Raw Keys

| Location | Current | Should Use |
|----------|---------|------------|
| {file:line} | `queryKey: ['domain']` | `domainKeys.all` |

## ESLint Suppression Issues

| Location | Issue |
|----------|-------|
| {file:line} | Missing `--` explanation in suppression comment |

## Prefetching Issues

| Prefetch Location | Prefetch Key | Hook Key | Match? |
|-------------------|-------------|----------|--------|
| {file:line} | {key} | {key} | {yes/no} |

## WebSocket Cache Update Issues

| Location | Issue |
|----------|-------|
| {file:line} | {missing debounced invalidation / using specific keys instead of predicate helpers on reconnect} |

## Recommendations

### Must Fix (Before Merge)

1. {action} - {reason}

### Should Fix (Technical Debt)

1. {action} - {reason}

### Pattern Health

- Query key factory coverage: {X}/{Y} domains have dedicated factories
- Optimistic update compliance: {X}/{Y} mutations follow full 6-step pattern
- Cache seeding coverage: {X}/{Y} detail hooks use initialData
- Global config compliance: {X}/{Y} queries use global defaults (no per-query overrides)
- Invalidation safety: {X}/{Y} parameterized domains use predicate helpers
```

## Phase 11: Output

1. Save report to `tmp/review-tanstack-query-{branch}.md`
2. Present summary:
   - PASS/WARN/FAIL status
   - Count of violations by category
   - Most critical issues (prefix matching trap, mismatched invalidation keys)

## Scoring Criteria

- **PASS**: All TanStack Query patterns followed correctly
- **WARN**: Minor deviations (missing `as const`, missing `initialData` on low-traffic hook, ESLint suppression without explanation)
- **FAIL**: Per-query staleTime/refetchOnWindowFocus overrides, raw string keys, cache mutations outside `onMutate`, mismatched invalidation keys, using `qk` for domain-owned keys, factory calls for parameterized list invalidation (prefix matching trap)

## Why This Matters

- **Per-query staleTime overrides** add unnecessary complexity and silently cause stale data when the wrong tier is chosen
- **Raw string keys** cause silent cache invalidation failures — data appears stale with no errors
- **Duplicate key structures** (e.g., `qk.conversations` vs `conversationKeys.lists`) mean invalidation hits one cache but misses the other
- **Prefix matching trap** — calling `domainKeys.lists(wsId)` for invalidation produces trailing default params that miss other param variants
- **Missing `onMutate` rollback** causes UI to show stale optimistic state after server errors
- **Mismatched prefetch keys** waste network requests and still show loading spinners
- These bugs are invisible in development and only surface under real-world latency/failure conditions

Run this analysis now on the current branch.
