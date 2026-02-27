---
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git rev-parse:*), Bash(git branch:*), Read, Grep, Glob, TodoWrite
description: Check for violations of the Self-Contained Components principle
---

# /review:self-contained - Self-Contained Components Checker

You are reviewing code changes for violations of the **Self-Contained Components** principle.

## The Principle

Temporary, optional, or removable UI elements should be self-contained. Removing or adding the component should only require touching ONE file (the parent that renders it).

**Problems with non-self-contained components:**
- Removing a feature requires changes across multiple files
- Easy to forget to revert all related changes
- Creates hidden dependencies between files
- Makes A/B testing or feature flags harder
- Increases risk of regressions when removing temporary features

**Self-contained = easy to add, easy to remove.**

## Common Violations

### 1. Hardcoded Positioning Offsets

**BAD:** Banner component requires manual navbar offset changes
```tsx
// Banner.tsx
export function Banner() {
  return <div className="fixed top-0">...</div>;
}

// Navbar.tsx - MANUALLY changed from top-0 to top-10
<nav className="fixed top-10">...</nav>

// Layout.tsx - MANUALLY changed padding
<div className="pt-28">...</div>
```

**GOOD:** Banner sets CSS variable, other components use fallback
```tsx
// Banner.tsx
useEffect(() => {
  document.documentElement.style.setProperty('--banner-height', '2.5rem');
  return () => document.documentElement.style.removeProperty('--banner-height');
}, []);

return (
  <>
    <div className="fixed top-0 z-[60]">...</div>
    <div style={{ height: '2.5rem' }} /> {/* Spacer */}
  </>
);

// Navbar.tsx - Uses fallback, no changes needed to add/remove banner
<nav style={{ top: 'var(--banner-height, 0px)' }}>...</nav>
```

### 2. Scattered Configuration

**BAD:** Feature requires constants in multiple files
```tsx
// constants.ts
export const PROMO_BANNER_HEIGHT = 40;

// Navbar.tsx
import { PROMO_BANNER_HEIGHT } from './constants';
// Uses PROMO_BANNER_HEIGHT

// Layout.tsx
import { PROMO_BANNER_HEIGHT } from './constants';
// Uses PROMO_BANNER_HEIGHT
```

**GOOD:** Component owns its own configuration
```tsx
// PromoBanner.tsx
const BANNER_HEIGHT = '2.5rem'; // Contained here
// Sets CSS variable for other components to optionally read
```

### 3. Required Prop Threading

**BAD:** Parent must pass banner state through multiple levels
```tsx
// Layout.tsx
const [hasBanner] = useState(true);
return <Navbar hasBanner={hasBanner} />;

// Navbar.tsx
function Navbar({ hasBanner }) {
  return <nav className={hasBanner ? 'top-10' : 'top-0'}>...</nav>;
}
```

**GOOD:** Components read shared state independently
```tsx
// Components read CSS variable with fallback - no props needed
<nav style={{ top: 'var(--banner-height, 0px)' }}>...</nav>
```

## Phase 1: Gather Context

```bash
# Get current branch
git rev-parse --abbrev-ref HEAD

# Get changed files
git diff main...HEAD --name-only

# Look for temporary/promotional components
git diff main...HEAD | grep -i -E "(banner|promo|temporary|feature.?flag|announcement)"
```

## Phase 2: Analyze Changes

### 2.1 Identify Temporary/Optional Components

Look for:
- Promotional banners
- Announcement bars
- Feature flags/toggles
- A/B test components
- Seasonal/event UI
- Beta/alpha badges
- Temporary notices

### 2.2 Check for Cross-File Dependencies

For each temporary component, ask:
- Does adding this component require changes to other files?
- If removed, how many files need to be reverted?
- Are there hardcoded offsets, paddings, or margins in other files?
- Are there imported constants from the component used elsewhere?

### 2.3 Evaluate Removal Complexity

Simulate removal:
1. If you deleted this component file, what would break?
2. How many files reference this component directly?
3. Are there CSS/style changes in unrelated files that depend on this?

## Phase 3: Generate Report

```markdown
# Self-Contained Components Report

**Branch:** {branch}
**Status:** {PASS | WARN | FAIL}

## Summary

{One sentence assessment}

## Temporary/Optional Components Found

| Component | File | Purpose |
|-----------|------|---------|
| {name} | {path} | {what it does} |

## Self-Containment Analysis

### {Component Name}

**Files that would need changes if removed:**
- {file1}: {what would need reverting}
- {file2}: {what would need reverting}

**Removal complexity:** {1 file | 2-3 files | 4+ files}

**Issues Found:**
| Issue | Location | Fix |
|-------|----------|-----|
| Hardcoded offset | Navbar.tsx:45 | Use CSS variable with fallback |
| Manual padding | Layout.tsx:23 | Component should include spacer |

## Recommendations

### Required Changes

{List specific changes to make component self-contained}

### Pattern to Follow

{Show the correct pattern for this type of component}

## Verdict

{Clear statement: Are temporary components properly self-contained?}
```

## Phase 4: Output

1. Save report to `tmp/review-self-contained-{branch}.md`
2. Present summary:
   - PASS/WARN/FAIL status
   - Number of non-self-contained components found
   - Files that would need cleanup on removal

## Scoring Criteria

- **PASS**: All temporary components can be removed by deleting one file/import
- **WARN**: Minor dependencies exist but are documented and manageable
- **FAIL**: Removing temporary component requires changes to 3+ files

## Self-Containment Techniques

### CSS Variables with Fallbacks
```tsx
// Component sets variable
document.documentElement.style.setProperty('--component-height', '40px');

// Other components use fallback
style={{ top: 'var(--component-height, 0px)' }}
```

### Spacer Elements
```tsx
// Component includes its own spacer
<>
  <div className="fixed top-0">Content</div>
  <div style={{ height: COMPONENT_HEIGHT }} aria-hidden="true" />
</>
```

### Cleanup on Unmount
```tsx
useEffect(() => {
  document.documentElement.style.setProperty('--my-var', value);
  return () => {
    document.documentElement.style.removeProperty('--my-var');
  };
}, []);
```

## Important Notes

- Temporary features should be trivial to remove
- "Remove the component" should be a one-line change in the parent
- Other files should gracefully handle the absence of the component
- CSS variable fallbacks (e.g., `var(--x, 0px)`) are your friend
- Document removal steps if complexity is unavoidable

Run this analysis now on the current branch.
