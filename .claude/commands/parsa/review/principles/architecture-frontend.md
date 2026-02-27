---
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git rev-parse:*), Bash(git branch:*), Read, Grep, Glob, TodoWrite
description: Check for frontend architecture pattern violations
---

# /review:architecture-frontend - Frontend Architecture Checker

You are reviewing code changes for violations of **frontend architecture patterns**.

## The Principles

### Thin Pages + Orchestration Hooks
Pages should be JSX composition only. All business logic, state management, and event handlers live in orchestration hooks (e.g., `usePageName`).

### Underscore-Prefix Locality
- `_components/` - Components used only by this page/feature
- `_hooks/` - Hooks used only by this page/feature
- `_types/` - Types used only by this page/feature
- `_providers/` - Providers used only by this page/feature
- `_utils/` - Utilities used only by this page/feature

**Shared code (2+ features) goes in `src/components/`, `src/hooks/`, etc.**

### TanStack Query Patterns
- Query keys must include ALL dependencies
- Mutations must invalidate related queries on success
- Use `enabled` option for conditional queries
- Never call hooks conditionally

### Hooks Never Return JSX
Hooks return data and functions only. Components render JSX.

## Phase 1: Gather Context

```bash
# Get current branch
git rev-parse --abbrev-ref HEAD

# Get changed files (frontend only)
git diff main...HEAD --name-only | grep "apps/webapp"

# Get full diff for frontend
git diff main...HEAD -- "apps/webapp/"
```

Read the frontend patterns:
- `apps/webapp/CLAUDE.md` - Complete frontend architecture
- `apps/webapp/src/hooks/CLAUDE.md` - Hook patterns, TanStack Query
- `apps/webapp/src/components/CLAUDE.md` - Component patterns
- `CLAUDE.md` - Import conventions

## Phase 2: Check Frontend Patterns

### 2.1 Page Pattern

For each page file (`page.tsx`) changed:

**Check for thin composition:**
```typescript
// CORRECT - Thin page
'use client';

export default function FeedPage() {
  const { items, isLoading, handleRefresh } = useFeedPage();

  if (isLoading) return <LoadingSpinner />;

  return (
    <PageLayout>
      <FeedList items={items} onRefresh={handleRefresh} />
    </PageLayout>
  );
}

// WRONG - Fat page with logic
'use client';

export default function FeedPage() {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/feed')
      .then(res => res.json())
      .then(data => {
        setItems(data);
        setIsLoading(false);
      });
  }, []);

  const handleRefresh = async () => {
    // 20 lines of logic...
  };

  return <div>...</div>;
}
```

**Check for 'use client' directive:**
- Most interactive pages need it
- Flag if missing when using hooks/state

**Study exemplar:** `apps/webapp/src/app/(protected)/workspaces/[workspaceId]/feed/page.tsx`

### 2.2 Orchestration Hook Pattern

For orchestration hooks (`usePage.ts`, `useFeature.ts`):

**Check for proper structure:**
```typescript
// CORRECT
export function useFeedPage() {
  // 1. Data hooks
  const { data: items, isLoading } = useFeed();

  // 2. State
  const [filter, setFilter] = useState('all');

  // 3. Mutations
  const { mutate: refreshFeed } = useRefreshFeed();

  // 4. Handlers
  const handleRefresh = useCallback(() => {
    refreshFeed();
  }, [refreshFeed]);

  // 5. Return object (NEVER JSX)
  return {
    items,
    isLoading,
    filter,
    setFilter,
    handleRefresh,
  };
}

// WRONG - Returns JSX
export function useFeedPage() {
  // ...
  return <div>This is wrong</div>;
}
```

**Study exemplar:** `apps/webapp/src/app/(protected)/workspaces/[workspaceId]/archive/useArchivePage.ts`

### 2.3 Underscore-Prefix Locality

**Check file locations:**

```
app/workspaces/[id]/feed/
  page.tsx
  _components/          # Local to feed page
    FeedList.tsx
    FeedItem.tsx
  _hooks/               # Local to feed page
    useFeedPage.ts

src/components/         # Shared across features
  Button.tsx
  Modal.tsx

src/hooks/              # Shared across features
  useFeed.ts
```

**Flag violations:**
- Shared component in `_components/` (used by 2+ features)
- Local component in `src/components/` (used by only 1 feature)
- Underscore folders in `src/` directory

### 2.4 TanStack Query Patterns

**Check query keys:**
```typescript
// CORRECT - All dependencies in key
const { data } = useQuery({
  queryKey: ['feed', workspaceId, filter],
  queryFn: () => fetchFeed(workspaceId, filter),
});

// WRONG - Missing dependency
const { data } = useQuery({
  queryKey: ['feed'],
  queryFn: () => fetchFeed(workspaceId, filter),
});
```

**Check mutation invalidation:**
```typescript
// CORRECT - Invalidates related queries
const { mutate } = useMutation({
  mutationFn: createItem,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['feed'] });
  },
});

// WRONG - No invalidation
const { mutate } = useMutation({
  mutationFn: createItem,
});
```

**Check conditional queries:**
```typescript
// CORRECT - Use enabled option
const { data } = useQuery({
  queryKey: ['item', itemId],
  queryFn: () => fetchItem(itemId),
  enabled: !!itemId,
});

// WRONG - Conditional hook call
if (itemId) {
  const { data } = useQuery(...);
}
```

### 2.5 Hook Return Values

**Check that hooks never return JSX:**
```typescript
// CORRECT
export function useModal() {
  const [isOpen, setIsOpen] = useState(false);
  return { isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) };
}

// WRONG
export function useModal() {
  const [isOpen, setIsOpen] = useState(false);
  return isOpen ? <Modal /> : null;  // Never do this
}
```

## Phase 3: Generate Report

```markdown
# Frontend Architecture Report

**Branch:** {branch}
**Status:** {PASS | WARN | FAIL}

## Summary

{One sentence assessment of frontend architecture compliance}

## Patterns Checked

- [x] Thin pages (JSX only)
- [x] Orchestration hooks
- [x] Underscore-prefix locality
- [x] TanStack Query patterns
- [x] Hooks return data only
- [x] 'use client' directives

## Violations Found

### Critical (Must Fix)

| Location | Pattern Violated | Fix |
|----------|------------------|-----|
| {file:line} | {pattern} | {how to fix} |

### Warnings

| Location | Issue | Recommendation |
|----------|-------|----------------|
| {file:line} | {description} | {suggestion} |

## Page Issues

| Page | Issue | Fix |
|------|-------|-----|
| {file} | {business logic in page / missing orchestration hook} | {fix} |

## Hook Issues

| Hook | Issue | Fix |
|------|-------|-----|
| {file} | {returns JSX / missing query invalidation / wrong query keys} | {fix} |

## Locality Issues

| File | Current Location | Should Be |
|------|------------------|-----------|
| {file} | {current path} | {correct path based on usage} |

## TanStack Query Issues

| Location | Issue | Fix |
|----------|-------|-----|
| {file:line} | {missing dependency in key / no invalidation / conditional call} | {fix} |

## Exemplars to Study

- Page pattern: `apps/webapp/src/app/(protected)/workspaces/[workspaceId]/feed/page.tsx`
- Orchestration hook: `apps/webapp/src/app/(protected)/workspaces/[workspaceId]/archive/useArchivePage.ts`
- Shared hook: `apps/webapp/src/hooks/feed/useFeed.ts`
- Locality: Compare `_components/` vs `src/components/`

## Recommendations

1. {specific action with file reference}
2. {specific action with file reference}
```

## Phase 4: Output

1. Save report to `tmp/review-architecture-frontend-{branch}.md`
2. Present summary:
   - PASS/WARN/FAIL status
   - Count of violations by pattern
   - Most critical issues

## Scoring Criteria

- **PASS**: All frontend patterns followed correctly
- **WARN**: Minor deviations (e.g., slightly fat page, but logic could stay)
- **FAIL**: Core patterns violated (business logic in pages, hooks returning JSX, wrong locality)

## Pattern Quick Reference

| Pattern | Correct | Wrong |
|---------|---------|-------|
| Page logic | In orchestration hook | In page component |
| Hook returns | `{ data, handlers }` | `<JSX />` |
| Local component | `page/_components/Foo.tsx` | `src/components/Foo.tsx` (if only used once) |
| Shared component | `src/components/Foo.tsx` | `page/_components/Foo.tsx` (if used 2+ places) |
| Query key | `['feed', workspaceId, filter]` | `['feed']` (missing deps) |
| Conditional query | `enabled: !!id` | `if (id) { useQuery(...) }` |
| Mutation | Has `onSuccess` invalidation | Missing invalidation |

Run this analysis now on the current branch.
