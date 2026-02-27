---
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git rev-parse:*), Bash(git branch:*), Read, Grep, Glob, TodoWrite
description: Check for circular dependencies and late imports
---

# /review:circular-deps - Circular Dependency Checker

You are reviewing code changes for **circular dependencies** indicated by late imports.

## The Principle

Imports should appear at the top of files (typically within the first 40 lines). Late imports indicate:

1. **Circular dependencies** - Module A imports B, B imports A
2. **Missing constructor injection** - Dependencies should be injected, not imported mid-code
3. **Architectural smell** - Code structure needs refactoring

**This codebase has ZERO tolerance for late imports.** Any import after line 40 is a critical issue.

## What Counts as a Late Import

**ES6 imports after line 40:**
```typescript
// Line 45 - CRITICAL
import { SomeService } from '@/services/some.service';
```

**CommonJS require after line 40:**
```typescript
// Line 50 - CRITICAL
const { helper } = require('@/utils/helper');
```

**Dynamic imports (context-dependent):**
```typescript
// ACCEPTABLE - Lazy loading for code splitting
const Modal = dynamic(() => import('@/components/Modal'));

// ACCEPTABLE - React.lazy
const Chart = React.lazy(() => import('@/components/Chart'));

// CRITICAL - Non-lazy dynamic import mid-code
async function process() {
  const { parser } = await import('@/utils/parser');  // Line 75 - BAD
}
```

## Phase 1: Gather Context

```bash
# Get current branch
git rev-parse --abbrev-ref HEAD

# Get changed files
git diff main...HEAD --name-only

# Get full diff
git diff main...HEAD
```

Use TodoWrite to track files to analyze.

## Phase 2: Scan for Late Imports

### 2.1 Read Each Changed File

For each file in the diff, read the entire file and scan line by line.

### 2.2 Detect Late Imports

**After line 40, flag any:**

1. **ES6 static imports:**
   ```
   /^import\s+.*\s+from\s+['"].*['"];?$/
   ```

2. **CommonJS require:**
   ```
   /require\s*\(['"].*['"]\)/
   ```

3. **Dynamic imports (non-lazy):**
   ```
   /await\s+import\s*\(/
   /import\s*\(/  (not in React.lazy or Next.js dynamic context)
   ```

### 2.3 Exceptions (Do NOT Flag)

**Acceptable late imports:**

```typescript
// Next.js dynamic imports for code splitting
const Modal = dynamic(() => import('@/components/Modal'), { ssr: false });

// React.lazy for code splitting
const Chart = React.lazy(() => import('@/components/Chart'));

// Type-only imports (don't affect runtime)
import type { SomeType } from '@/types';
```

### 2.4 Diagnose Root Cause

For each late import found:

**1. Check if inside a constructor:**
```typescript
class MyService {
  constructor() {
    // Line 55 - Circular dependency!
    const { OtherService } = require('@/services/other.service');
    this.other = new OtherService();
  }
}
```
→ **Root cause:** Circular dependency. Service A needs B, B needs A.

**2. Check if conditional:**
```typescript
async function handleRequest() {
  if (needsParser) {
    // Line 60 - Architectural smell
    const { parser } = await import('@/utils/parser');
  }
}
```
→ **Root cause:** Dependency should be injected or imported at top.

**3. Check call site context:**
```typescript
// Inside a function, not at module level
function processData() {
  // Line 70 - Wrong
  const { transform } = require('@/utils/transform');
}
```
→ **Root cause:** Should be a top-level import.

## Phase 3: Generate Report

```markdown
# Circular Dependency Report

**Branch:** {branch}
**Status:** {PASS | WARN | FAIL}

## Summary

{One sentence assessment}

## Late Imports Found

### Critical (Must Fix)

| File | Line | Import | Root Cause |
|------|------|--------|------------|
| {file} | {line} | `{import statement}` | {circular dep / missing DI / architectural smell} |

### Acceptable (Lazy Loading)

| File | Line | Import | Reason Acceptable |
|------|------|--------|-------------------|
| {file} | {line} | `{import}` | {Next.js dynamic / React.lazy} |

## Circular Dependency Analysis

### Detected Cycles

```
{file A} → imports → {file B} → imports → {file A}
```

### How to Fix

**Option 1: Dependency Injection**
```typescript
// Before (circular)
class ServiceA {
  constructor() {
    const { ServiceB } = require('./service-b');  // Late import!
    this.b = new ServiceB();
  }
}

// After (injected)
class ServiceA {
  constructor(private readonly serviceB: ServiceB) {}
}

// In bootstrap/services.ts
const serviceB = new ServiceB();
const serviceA = new ServiceA(serviceB);
```

**Option 2: Extract Shared Code**
```typescript
// Before: A imports from B, B imports from A
// After: Both import from shared module C

// shared/types.ts
export interface SharedInterface { ... }

// service-a.ts
import { SharedInterface } from './shared/types';

// service-b.ts
import { SharedInterface } from './shared/types';
```

**Option 3: Lazy Resolution**
```typescript
// Use a resolver pattern
class ServiceA {
  private getServiceB() {
    return container.resolve(ServiceB);
  }
}
```

## Reference

**Proper dependency injection pattern:**
See `apps/api/src/bootstrap/services.ts` for how services are wired together.

## Files to Refactor

| File | Issue | Recommended Fix |
|------|-------|-----------------|
| {file} | {late import description} | {specific fix approach} |

## Recommendations

1. {specific action with file reference}
2. {specific action with file reference}
```

## Phase 4: Output

1. Save report to `tmp/review-circular-deps-{branch}.md`
2. Present summary:
   - PASS/WARN/FAIL status
   - Count of late imports
   - Identified circular dependencies

## Scoring Criteria

- **PASS**: No late imports found (excluding acceptable lazy loading)
- **WARN**: Late imports found but in test files or non-critical paths
- **FAIL**: Late imports in production code indicating circular dependencies

## Quick Detection Commands

**Find potential late imports in changed files:**
```bash
# Get changed files and check for imports after line 40
for file in $(git diff main --name-only | grep -E '\.(ts|tsx|js|jsx)$'); do
  awk 'NR > 40 && /^import .* from|require\(/' "$file" && echo "^^^ $file"
done
```

## Why This Matters

1. **Runtime errors**: Circular dependencies can cause undefined imports
2. **Build issues**: Bundlers may fail or produce incorrect output
3. **Testing problems**: Mocking becomes difficult with circular deps
4. **Performance**: Late dynamic imports add latency
5. **Maintainability**: Circular deps indicate tangled architecture

**The fix is always architectural** - either inject dependencies, extract shared code, or restructure modules.

Run this analysis now on the current branch.
