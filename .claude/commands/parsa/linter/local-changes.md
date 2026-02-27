---
allowed-tools: Read, Edit, Bash(git diff:*), Bash(npm run typecheck:*), Bash(npm run lint:*), Bash(npx nx typecheck:*), Bash(npx nx lint:*), Bash(npx tsc:*), Bash(npx eslint:*), TodoWrite, Grep
description: Fix linting and type errors in files changed on the current branch, with sequential resolution
---

Fix TypeScript type errors and ESLint warnings in files that have been modified on the current branch. This is a focused alternative to `/fix-issues` that only processes local changes and fixes issues sequentially.

## 1. Identify Changed Files

First, get the list of files modified on the current branch:

```bash
# Get files changed compared to main branch
git diff --name-only main...HEAD

# Also check unstaged/staged changes
git diff --name-only
git diff --cached --name-only
```

Combine and deduplicate the results. Filter to only TypeScript/TSX files:
- `apps/webapp/src/**/*.{ts,tsx}`
- `apps/api/src/**/*.{ts,tsx}`
- `libs/shared/src/**/*.{ts,tsx}`

If there are no TypeScript files changed, inform the user and exit.

## 2. Run Diagnostics on Changed Files

For each changed file, run diagnostics:

**TypeScript Type Checking:**

IMPORTANT: Use the TypeScript compiler (`tsc`) rather than relying on VS Code's language server, as it's more authoritative and doesn't have caching issues.

```bash
# For webapp files - run full project check, then filter to changed files
npx tsc --noEmit --project apps/webapp/tsconfig.json 2>&1 | grep -E "error TS"

# For API files - run full project check, then filter to changed files
npx tsc --noEmit --project apps/api/tsconfig.json 2>&1 | grep -E "error TS"

# For shared library files
npx tsc --noEmit --project libs/shared/tsconfig.json 2>&1 | grep -E "error TS"
```

Parse the TypeScript output to extract errors. Each error line follows this format:
```
path/to/file.ts(line,col): error TS####: Error message
```

Filter the errors to only include files from the changed files list.

**ESLint:**
```bash
# Run eslint on specific files
npx eslint <file1> <file2> <file3> --max-warnings=0
```

Collect all issues with:
- File path
- Line number
- Error code (TS2xxx, eslint rule name)
- Error message
- Severity (error vs warning)

**Note:** The TypeScript compiler output is the source of truth. VS Code's inline diagnostics can show false positives due to caching issues with dynamic imports and path aliases.

## 3. Create Resolution Plan

Use TodoWrite to create a structured plan with one todo per issue (or group related issues):

```
Example todos:
- Fix TS2532 error in file.ts:42 - 'foo' is possibly undefined
- Remove unused import 'Bar' in file.ts:5
- Fix React Hook dependency array in component.tsx:89
- Add proper type annotation to function in service.ts:123
```

Order todos by:
1. Critical type errors first
2. Then other TypeScript errors
3. Then ESLint warnings
4. Group issues in the same file together when possible

## 4. Sequential Resolution

**DO NOT use subagents or parallel execution.** Fix issues one by one:

### For Each Todo:
1. **Mark as in_progress** using TodoWrite
2. **Read the file** to understand context
3. **Apply the fix** using Edit tool
4. **Verify the fix** by running typecheck/lint on that specific file
5. **If successful**: Mark todo as completed and move to next
6. **If failed**: Try alternative fix or mark with error note

### Fix Strategies by Issue Type:

**Type Errors (TS2xxx):**
- TS2532 (possibly undefined): Add null checks, optional chaining, or type guards
- TS2339 (property does not exist): Fix typos, add properties to interface, or use type assertion if valid
- TS2345 (wrong type): Convert to correct type, update interface, or fix the value
- TS2554 (wrong number of arguments): Add missing arguments or make them optional
- TS7006 (implicit any): Add explicit type annotations

**ESLint Issues:**
- Unused imports: Remove the import statement
- Unused variables: Remove if truly unused, or prefix with `_` if intentionally unused
- React hooks deps: Add missing dependencies or disable rule with explanation comment if intentional
- Formatting: Let prettier handle (don't fix manually)

**Common Patterns:**
- When adding null checks, prefer optional chaining: `foo?.bar` over `foo && foo.bar`
- When fixing types, maintain type safety - avoid using `any` or `as any`
- Preserve existing functionality - don't change behavior to fix types

## 5. Verification Phase

After all issues are fixed:

```bash
# Run full typecheck for affected projects using TypeScript compiler (source of truth)
npx tsc --noEmit --project apps/webapp/tsconfig.json 2>&1 | grep -E "error TS"
npx tsc --noEmit --project apps/api/tsconfig.json 2>&1 | grep -E "error TS"

# Alternative: Use nx typecheck commands
npx nx typecheck @doozy/webapp
npx nx typecheck @doozy/api

# Run lint on changed files
npx eslint <all-changed-files> --max-warnings=0
```

Report:
- Total issues fixed
- Files modified
- Any remaining issues that couldn't be fixed (from `tsc` output, not VS Code)
- Suggestions for manual review if needed
- Note: VS Code may still show red underlines due to language server caching - advise user to restart TS server

## 6. Summary Report

Provide a concise summary:
```
✓ Fixed 15 issues across 8 files:
  - 7 TypeScript type errors
  - 5 unused imports removed
  - 3 React Hook dependency warnings

Modified files:
  - apps/webapp/src/components/TodoCard.tsx
  - apps/webapp/src/hooks/useStartTodoConversation.ts
  ...

✓ All files now pass typecheck and lint (verified with tsc compiler)

Note: If VS Code still shows red underlines, restart the TypeScript server:
  Ctrl+Shift+P → "TypeScript: Restart TS Server"
```

## Arguments Support

Handle optional arguments if provided:
- `--errors-only`: Only fix TypeScript errors, skip ESLint warnings
- `--dry-run`: Show issues without fixing them
- `--file=<path>`: Only check specific file

## Important Notes

1. **Only touch changed files** - Don't scan entire codebase
2. **Sequential execution** - Fix one issue at a time, verify each fix
3. **Preserve functionality** - Don't break working code to satisfy types
4. **Use TodoWrite** - Keep user informed of progress
5. **Verify incrementally** - Run typecheck/lint after each fix to catch new issues early
6. **Be conservative** - If unsure how to fix, skip and report for manual review

Execute this focused fix strategy now, resolving all issues in locally changed files.
