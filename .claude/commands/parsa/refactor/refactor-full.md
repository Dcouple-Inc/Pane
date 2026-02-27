# Refactor Full

**Comprehensive refactor analysis that runs all refactor commands and merges results.**

Safe to run anytime. Runs multiple analysis passes and creates unified refactor plan without modifying files.

## What This Does

Orchestrates a complete refactor analysis by:
1. **Running all 3 analyses in parallel** using specialized agents:
   - `/medium` for quick classification
   - `/simple` for focused analysis
   - `/deep` for comprehensive analysis
2. Collecting results from all parallel agents
3. Reading and parsing all output files
4. Intelligently merging insights into one unified refactor plan
5. Writing merged plan to `./tmp/refactor-full-plan-[timestamp].md`

**Key advantage:** Much faster than running sequentially - all analyses run simultaneously!

## When to Use

- **Complex changes** requiring multiple perspectives
- **Pre-PR comprehensive validation** with all analysis types
- **Large features** that benefit from layered analysis
- **Learning refactoring patterns** by seeing different analysis depths

For simple changes, just use `/simple` instead.

## Process

### Phase 1: Run Analysis Commands in Parallel

**CRITICAL: Launch all three agents in parallel using a SINGLE message with multiple Task tool calls.**

This runs all analyses simultaneously for maximum performance:

1. **Refactor Check Agent** - Quick classification and pattern check
2. **Simple Refactor Agent** - Focused analysis with refactor plan
3. **Deep Refactor Agent** - Comprehensive analysis

**Use the Task tool with three parallel invocations:**

```typescript
// In a SINGLE message, make 3 Task tool calls:

Task({
  subagent_type: "general-purpose",
  description: "Run refactor-check analysis",
  prompt: "Execute the /medium slash command to perform quick classification and pattern checking. Return the complete console output including classification, quality score, issues found, and recommendations."
})

Task({
  subagent_type: "general-purpose",
  description: "Run simple-refactor analysis",
  prompt: "Execute the /simple slash command to perform focused refactor analysis. This will generate a plan file in ./tmp/simple-refactor-plan-[timestamp].md. Return the path to the generated plan file."
})

Task({
  subagent_type: "general-purpose",
  description: "Run deep-refactor analysis",
  prompt: "Execute the /deep slash command to perform comprehensive refactor analysis. This will generate a plan file in ./tmp/deep-refactor-plan-[timestamp].md. Return the path to the generated plan file."
})
```

**Show progress to user:**
```
🔍 Running comprehensive refactor analysis in parallel...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚡ Launching 3 parallel analysis agents:
  [1] refactor-check (quick classification)
  [2] simple-refactor (focused analysis)
  [3] deep-refactor (comprehensive analysis)

⏳ All agents running in parallel...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ All analyses complete!

Results:
  [1] Refactor Check: Complete (console output captured)
  [2] Simple Refactor: ./tmp/simple-refactor-plan-[TS].md
  [3] Deep Refactor: ./tmp/deep-refactor-plan-[TS].md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Phase 2: Collect Agent Results

**Agent results will include:**

1. **Refactor Check Agent** → Returns complete console output with classification and quality score
2. **Simple Refactor Agent** → Returns path to generated plan file
3. **Deep Refactor Agent** → Returns path to generated plan file

**If agents don't return paths explicitly, locate the most recent output files:**

```bash
# Find most recent simple refactor plan
ls -t ./tmp/simple-refactor-plan-*.md | head -1

# Find most recent deep refactor plan
ls -t ./tmp/deep-refactor-plan-*.md | head -1
```

**Note:** `/refactor-check` outputs to console only (no file), captured from agent output.

### Phase 3: Read and Parse Reports

**Read both plan files:**
- `./tmp/simple-refactor-plan-[timestamp].md`
- `./tmp/deep-refactor-plan-[timestamp].md`

**Extract from each:**
- Classification metrics
- Quality scores
- Critical issues
- Warnings
- Info/suggestions
- Auto-fixable issues
- Manual fixes required
- Pattern compliance matrix
- Recommendations

### Phase 4: Merge Reports Intelligently

**Merging strategy:**

**1. Use Deep Refactor as Base**
- Deep refactor is most comprehensive
- Provides the fullest pattern compliance matrix
- Has detailed cross-cutting concerns

**2. Enhance with Simple Refactor Insights**
- Add any unique issues simple refactor found
- Include any simpler explanations or references
- Merge quick-fix recommendations

**3. Add Refactor Check Summary**
- Include high-level classification from check
- Add any unique pattern detections

**4. Deduplicate Issues**
- Same file:line issues → Keep most detailed description
- Similar issues → Combine insights
- Different perspectives on same issue → Note both viewpoints

**5. Prioritize Issues Consistently**
- Critical (all sources agree) → Must fix
- Critical (one source) + Warning (another) → Should fix
- Warning + Info → Nice to have
- Deduplicate and merge reasoning

**6. Merge Auto-Fixable Lists**
- Combine all auto-fixable issues
- Remove duplicates
- Count total across all sources

**7. Merge Manual Fix Lists**
- Group by priority (P0, P1, P2)
- Combine similar issues
- Add context from multiple analyses

**8. Create Unified Quality Score (Orchestrator-Specific)**
- Show all three raw scores for comparison (these use the individual command thresholds)
- Calculate orchestrator's own weighted average (Deep 50%, Simple 30%, Check 20%)
- The orchestrator uses its own pass threshold (9.0) separate from individual commands (9.8)
- This allows the orchestrator to provide a holistic view without being influenced by individual command targets

**9. Consolidate Recommendations**
- Merge next steps from all sources
- Order by dependency and priority
- Remove duplicate suggestions

### Phase 5: Generate Merged Plan

Write unified plan to `./tmp/refactor-full-plan-[timestamp].md`:

```markdown
# Comprehensive Refactor Plan (Full Analysis)

**Generated by:** /refactor-full
**Date:** [timestamp]
**Sources:** refactor-check, simple-refactor, deep-refactor

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Classification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- **Size:** [X] ([details])
- **Type:** [X]
- **Complexity:** [X]
- **Layers:** [Backend/Frontend/Both]
- **Modules:** [List]
- **Files Changed:** X added, Y modified, Z deleted
- **Lines Changed:** +X -Y

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Quality Scores
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Analysis Type | Score | Focus |
|---------------|-------|-------|
| Refactor Check | X/10 | Quick classification & patterns |
| Simple Refactor | Y/10 | Focused analysis |
| Deep Refactor | Z/10 | Comprehensive validation |

**Unified Score:** **W/10** (orchestrator weighted average)

**Orchestrator Target:** ≥ 9.0/10 (independent from individual command thresholds)
**Current Status:** [Ready / Needs work]

> **Note:** Individual commands (`/refactor-check`, `/simple-refactor`, `/deep-refactor`) each use their own 9.8 threshold when run standalone. The orchestrator uses its own 9.0 threshold for the unified weighted score to provide a holistic assessment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Issues Found (Merged from All Sources)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Critical Issues (Must Fix Before Merge)

**Backend:**
- [file:line] Issue description
  → **Fix:** Detailed fix instructions
  → **Pattern:** Reference to CLAUDE.md section
  → **Source:** deep-refactor, simple-refactor
  → **Auto-fixable:** Yes/No

**Frontend:**
- [file:line] Issue description
  → **Fix:** Detailed fix instructions
  → **Exemplar:** Path to similar implementation
  → **Source:** deep-refactor
  → **Auto-fixable:** Yes/No

### Warnings (Should Fix)

**Architecture:**
- [file:line] Issue description
  → **Suggestion:** Improvement recommendation
  → **Impact:** Why this matters
  → **Source:** simple-refactor, refactor-check
  → **Auto-fixable:** Yes/No

**Organization:**
- [file:line] Issue description
  → **Suggestion:** Better organization approach
  → **Source:** deep-refactor
  → **Auto-fixable:** Yes/No

### Info (Nice to Have)

**Code Quality:**
- [file:line] Suggestion
  → **Benefit:** What this improves
  → **Source:** simple-refactor

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Auto-Fixable Issues: X (Total across all sources)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Convert relative imports to @/ aliases (X files)
  → Files: [List]
  → Detected by: refactor-check, simple-refactor, deep-refactor

- Remove unused imports (Y files)
  → Files: [List]
  → Detected by: simple-refactor, deep-refactor

- Fix import organization (Z files)
  → Files: [List]
  → Detected by: all sources

- Add missing 'use client' directives (W files)
  → Files: [List]
  → Detected by: deep-refactor

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Manual Fixes Required: Y
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Priority 0 (Blocking - All sources critical):**
1. [file:line] - Issue flagged as critical by all analyses
   → **Why critical:** [Combined reasoning from all sources]
   → **Fix:** [Merged fix instructions]
   → **Detected by:** All sources

**Priority 1 (Critical - At least 2 sources):**
1. [file:line] - Issue flagged by multiple analyses
   → **Fix:** [Instructions]
   → **Detected by:** deep-refactor, simple-refactor

**Priority 2 (Important - Single source or warnings):**
1. [file:line] - Pattern violation or code smell
   → **Fix:** [Instructions]
   → **Detected by:** deep-refactor

**Priority 3 (Nice to Have):**
1. [file:line] - Code quality improvement
   → **Detected by:** simple-refactor

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Pattern Compliance Matrix (Merged)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Backend
✓/✗ Import conventions: [Status] - [Details from multiple sources]
✓/✗ Controller pattern: [Status] - [Consensus or differences noted]
✓/✗ Service pattern: [Status]
✓/✗ BaseService usage: [Status]
✓/✗ ApiError usage: [Status]
✓/✗ Validator pattern: [Status]

### Frontend
✓/✗ Import conventions: [Status]
✓/✗ Thin pages: [Status]
✓/✗ Orchestration hooks: [Status]
✓/✗ TanStack Query: [Status]
✓/✗ Underscore-prefix locality: [Status]
✓/✗ Component organization: [Status]

### Cross-Cutting
✓/✗ SRP compliance: [Status]
✓/✗ DRY compliance: [Status]
✓/✗ Documentation: [Status]
✓/✗ Error handling: [Status]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Unified Recommendations
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Immediate Actions (Merged from all sources)

1. **Apply Auto-Fixes:**
   ```bash
   /refactor-apply --plan=./tmp/refactor-full-plan-[TS].md --auto-only
   ```

2. **Address Priority 0 Issues (Blocking):**
   - [List P0 issues]

3. **Address Priority 1 Issues (Critical):**
   - [List P1 issues]

4. **Address Priority 2 Issues (Important):**
   - [List P2 issues]

### Study These Patterns

**Exemplar implementations to reference:**
- Backend: [Merged exemplar list from all sources]
- Frontend: [Merged exemplar list]
- Hooks: [Merged exemplar list]

### Documentation to Review

- Backend patterns: `apps/api/CLAUDE.md`
- Frontend patterns: `apps/webapp/CLAUDE.md`
- Hook patterns: `apps/webapp/src/hooks/CLAUDE.md`
- Component patterns: `apps/webapp/src/components/CLAUDE.md`
- Import conventions: `CLAUDE.md`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Analysis Insights
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### Consistency Across Analyses

**Where all sources agree:**
- [List issues/patterns all three analyses found]

**Where analyses differ:**
- [List differences and explain why]
- Example: Simple refactor flagged X as warning, Deep refactor flagged as critical

### Unique Insights by Source

**From Refactor Check:**
- [Quick wins or high-level patterns only check found]

**From Simple Refactor:**
- [Focused insights or practical quick fixes]

**From Deep Refactor:**
- [Architectural issues or complex patterns only deep found]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Quality Score Breakdown
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Category | Check | Simple | Deep | Weighted |
|----------|-------|--------|------|----------|
| Imports | X/10 | Y/10 | Z/10 | W/10 |
| Architecture | - | Y/10 | Z/10 | W/10 |
| Organization | - | Y/10 | Z/10 | W/10 |
| Documentation | X/10 | Y/10 | Z/10 | W/10 |
| Error handling | X/10 | Y/10 | Z/10 | W/10 |
| Code quality | - | Y/10 | Z/10 | W/10 |

**Overall:** [X]/10

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Next Steps
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ✓ Review this comprehensive merged plan
2. ⏩ Run: `/refactor-apply --plan=./tmp/refactor-full-plan-[TS].md --auto-only`
3. 🔧 Fix Priority 0 issues (blocking)
4. 🔧 Fix Priority 1 issues (critical)
5. 🔧 Fix Priority 2 issues (important)
6. 🔍 Re-run `/refactor-check` for quick validation
7. ✅ If unified score ≥ 9.0, ready to create PR
8. 🔄 If unified score < 9.0, fix remaining issues and re-check

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Source Files Referenced
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Refactor Check: Console output
- Simple Refactor: `./tmp/simple-refactor-plan-[TS].md`
- Deep Refactor: `./tmp/deep-refactor-plan-[TS].md`
```

### Phase 6: Show Completion Summary

```bash
✅ Comprehensive Refactor Analysis Complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Analysis Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Analyses Run:       3 (check, simple, deep)
Files Analyzed:     X
Critical Issues:    Y (merged from all sources)
Warnings:           Z
Auto-fixable:       W

📈 Quality Scores:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Refactor Check:     X/10
Simple Refactor:    Y/10
Deep Refactor:      Z/10
Unified Score:      W/10 ⭐

📄 Merged Plan Written To:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
./tmp/refactor-full-plan-[timestamp].md

🎯 Next Steps:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Review the merged comprehensive plan
2. Run: /refactor-apply --plan=./tmp/refactor-full-plan-[TS].md --auto-only
3. Fix Priority 0 and Priority 1 issues
4. Re-run /refactor-full to verify unified score ≥ 9.0/10
```

## Merge Strategy Details

### Issue Deduplication

**When same issue found by multiple sources:**

1. **Identical file:line + similar description:**
   - Merge into single issue
   - Combine fix instructions (take most detailed)
   - Note all sources that detected it
   - Use highest severity across sources

2. **Same file, different lines, related issue:**
   - Keep as separate issues
   - Add note linking related issues
   - Group under same category

3. **Different perspectives on same problem:**
   - Keep both viewpoints if they add value
   - Note "See also: [other issue]"
   - Explain why multiple perspectives matter

### Severity Reconciliation

**Priority matrix when merging:**

| Check | Simple | Deep | Final Priority |
|-------|--------|------|----------------|
| Critical | Critical | Critical | P0 (Blocking) |
| Critical | Critical | Warning | P1 (Critical) |
| Critical | Warning | Info | P1 (Critical) |
| Warning | Warning | Warning | P2 (Important) |
| Warning | Warning | - | P2 (Important) |
| Warning | Info | Info | P3 (Nice to have) |
| Info | Info | Info | P3 (Nice to have) |

### Score Calculation

**Unified score formula (orchestrator-specific):**

```
Unified = (Check * 0.2) + (Simple * 0.3) + (Deep * 0.5)
```

**Reasoning:**
- Deep refactor is most comprehensive (50% weight)
- Simple refactor is focused and practical (30% weight)
- Refactor check is quick classification (20% weight)

**Important: Independent Scoring**

The orchestrator's unified score uses its own pass threshold (9.0) that is separate from the individual command thresholds (9.8). This separation exists because:
1. The weighted average naturally produces different scores than individual analyses
2. The orchestrator provides a holistic view, not a replacement for individual checks
3. Individual commands remain the authoritative source for their specific analysis type
4. Running `/refactor-full` gives you a comprehensive overview; running individual commands gives you focused validation

## Success Checklist

- [ ] Refactor check executed
- [ ] Simple refactor executed
- [ ] Deep refactor executed
- [ ] All output files located
- [ ] Reports parsed successfully
- [ ] Issues deduplicated intelligently
- [ ] Severity prioritized correctly
- [ ] Auto-fixable issues merged
- [ ] Manual fixes prioritized
- [ ] Pattern compliance merged
- [ ] Unified score calculated
- [ ] Recommendations consolidated
- [ ] Merged plan written to ./tmp/
- [ ] No files modified (read-only)
- [ ] Next steps clearly shown

## Command Arguments

- `--skip-check`: Skip `/refactor-check` (only run simple + deep)
- `--skip-simple`: Skip `/simple-refactor` (only run check + deep)
- `--skip-deep`: Skip `/deep-refactor` (only run check + simple)
- `--strict`: Pass --strict to all commands

## Examples

**Standard usage:**
```bash
/refactor-full
```

**Skip quick check (if already run):**
```bash
/refactor-full --skip-check
```

**Only run focused analyses:**
```bash
/refactor-full --skip-deep
```

## Important Notes

1. **Fast parallel execution** - Runs three separate analyses simultaneously using parallel agents
2. **Read-only** - No files are modified, only analysis and merging
3. **Best for complex changes** - Overkill for tiny bug fixes
4. **Reduces noise** - Deduplicates issues found by multiple analyses
5. **Actionable output** - Single merged plan ready for `/refactor-apply`
6. **CRITICAL: Single message** - All three Task tool calls MUST be in a single message for parallel execution

---

**Use this when you want the most thorough analysis possible.** It runs all refactor commands and intelligently merges their insights into one actionable plan.

For simpler workflows:
- Small changes → `/simple-refactor`
- Large features → `/deep-refactor`
- Quick check → `/refactor-check`
- Comprehensive → `/refactor-full` (this command)
