---
allowed-tools: Task, Read, Glob, Grep, Bash(git log:*), Bash(git diff:*), Edit, MultiEdit, TodoWrite
description: Validate and update documentation by comparing against current codebase and recent changes using parallel agents
---

# Validate and Update Documentation

This command orchestrates multiple specialized agents to systematically validate documentation against the current codebase and recent changes, then updates outdated content automatically.

## 1. Initial Discovery Phase

First, gather information about the documentation landscape and recent changes:

```bash
# Get list of all documentation files
ls -la docs/

# Review recent changes that might affect docs
git log --oneline -30

# Check for any pending changes
git status
```

Create a comprehensive list of all markdown files in the docs folder, categorizing them by:
- Technical documentation (architecture, API, database)
- Guidelines and principles
- PRDs and feature specs
- Testing documentation
- Third-party integrations

## 2. Multi-Agent Parallel Validation Strategy

Launch multiple specialized agents IN PARALLEL to validate and update different aspects of documentation. Use the Task tool to launch ALL agents simultaneously for maximum efficiency.

### Agent Task Definitions

**Documentation Analyzer Agent (per doc file):**
```
Focus: Extract and catalog all verifiable claims from documentation
Input: Specific documentation file path
Tasks:
1. Read the documentation file thoroughly
2. Extract all technical claims:
   - File paths and directory structures
   - Component and service names
   - API endpoints and routes
   - Database schemas and tables
   - Command examples
   - Dependencies and package versions
   - Configuration file references
3. Create a structured validation checklist
4. Return list of claims to validate
```

**Codebase Structure Validator Agent:**
```
Focus: Verify all file paths and structural claims
Input: List of file paths and structures from docs
Tasks:
1. Check each referenced file path exists
2. Verify directory structures match documentation
3. Validate component and service locations
4. Check for moved or renamed files
5. Identify new files not documented
6. Return validation results with corrections
```

**API & Routes Validator Agent:**
```
Focus: Validate API endpoints and route definitions
Input: List of API endpoints from documentation
Tasks:
1. Read current route definitions from:
   - apps/api/src/routes/
   - apps/api/src/controllers/
   - apps/webapp/app/api/
2. Compare documented endpoints with actual implementation
3. Check HTTP methods match (GET, POST, etc.)
4. Verify request/response schemas if documented
5. Identify new endpoints not documented
6. Return list of discrepancies and updates needed
```

**Database Schema Validator Agent:**
```
Focus: Verify database schemas and models
Input: Database documentation references
Tasks:
1. Read current schema from apps/api/src/db/schema.ts
2. Compare with documented tables and fields
3. Check for new tables or columns
4. Verify relationships and constraints
5. Validate migration references
6. Return schema updates needed
```

**Dependencies & Commands Validator Agent:**
```
Focus: Validate package dependencies and CLI commands
Input: List of dependencies and commands from docs
Tasks:
1. Check package.json files for mentioned dependencies
2. Verify version numbers if specified
3. Test documented npm/npx commands for validity
4. Check for deprecated packages
5. Identify new dependencies not documented
6. Return list of updates needed
```

**Changelog Cross-Reference Agent:**
```
Focus: Identify recent changes requiring doc updates
Tasks:
1. Analyze git log for last 30-50 commits
2. Review merged PRs and their descriptions
3. Identify major features and breaking changes:
   - Authentication system changes
   - New workspace features
   - AI agent implementations
   - Audio recording improvements
   - Dashboard architecture changes
4. Check if these are reflected in docs
5. Return list of missing documentation
```

## 3. Documentation Update Phase

After validation completes, launch update agents for each category of changes:

**File Path Updater Agent:**
```
Focus: Fix all file path and structure references
Tasks:
1. Update moved or renamed file references
2. Correct directory structure descriptions
3. Add new important files to listings
4. Mark deprecated paths with notes
```

**API Documentation Updater Agent:**
```
Focus: Update API and endpoint documentation
Tasks:
1. Update endpoint URLs and methods
2. Add newly created endpoints
3. Mark deprecated endpoints
4. Update request/response examples
5. Fix authentication requirements
```

**Technical Content Updater Agent:**
```
Focus: Update technical details and features
Tasks:
1. Update architecture descriptions
2. Add new features from changelog
3. Update technology stack sections
4. Fix command examples
5. Update configuration examples
```

**CLAUDE.md Synchronization Agent:**
```
Focus: Ensure consistency with CLAUDE.md
Tasks:
1. Read CLAUDE.md as source of truth
2. Update other docs to match CLAUDE.md
3. Propagate command changes
4. Sync environment setup instructions
5. Ensure deployment procedures match
```

## 4. Validation Rules

### Must Validate:
- **File Existence**: Every file path must exist or be marked as deprecated
- **Command Validity**: All shell commands must be executable
- **Import Paths**: Package imports must resolve correctly
- **API Consistency**: Endpoints must match implementation
- **Schema Accuracy**: Database descriptions must match current schema

### Update Guidelines:
- **Preserve Intent**: Keep the original purpose and structure of docs
- **Add Timestamps**: Mark sections with last validated date
- **Deprecation Over Deletion**: Mark outdated content rather than removing
- **Changelog References**: Link to relevant commits/PRs for changes
- **Human Review Flags**: Mark complex changes needing human verification

## 5. Report Generation

After all validation and updates complete, generate comprehensive report:

### Summary Report Structure:
```markdown
# Documentation Validation Report - [DATE]

## Files Analyzed
- Total documents: X
- Documents needing updates: Y
- Documents up-to-date: Z

## Validation Results

### Outdated References Found:
- [List of outdated file paths, endpoints, etc.]

### Missing Documentation:
- [Features from changelog not documented]
- [New components/services not mentioned]

### Updates Applied:
- [List of all automatic updates made]

### Manual Review Required:
- [Complex architectural changes]
- [Breaking changes needing detailed explanation]
- [Deprecated features requiring migration guides]

## Change Details
[Detailed list of changes by document]
```

## 6. Execution Workflow

1. **Phase 1: Discovery** (1 agent)
   - Catalog all documentation files
   - Gather recent changes from git

2. **Phase 2: Parallel Validation** (6+ agents running simultaneously)
   - Launch all validator agents at once
   - Each analyzes their specific domain
   - Collect all validation results

3. **Phase 3: Parallel Updates** (4+ agents running simultaneously)
   - Launch updater agents for identified changes
   - Each updates their category of issues
   - Ensure no conflicting edits

4. **Phase 4: Verification**
   - Re-run validators on updated docs
   - Ensure all issues resolved
   - Flag remaining problems

5. **Phase 5: Reporting**
   - Generate comprehensive report
   - Create PR-ready summary
   - List any manual interventions needed

## 7. Special Handling

### For Different Doc Types:

**Architecture Docs** (backend-architecture.md, frontend-architecture.md):
- Focus on structural accuracy
- Validate technology stack
- Update directory structures
- Verify service boundaries

**PRD/Feature Docs** (in-progress/*, archived-complete/*):
- Check implementation status
- Update with actual implementation details
- Move completed items to archived
- Add implementation notes

**Guidelines** (UI-GUIDELINES.md, UX-PRINCIPLES.md):
- Verify referenced components exist
- Update example code
- Check for consistency with current practices

**Integration Docs** (audio-recording-architecture.md, authentication.md):
- Validate API endpoints
- Update configuration examples
- Check third-party SDK versions
- Verify environment variables

### Handling Conflicts:
- If CLAUDE.md conflicts with other docs, CLAUDE.md wins
- If multiple docs describe the same thing differently, update all to match the most recent accurate version
- Flag major discrepancies for human review

## 8. Arguments Support

Handle optional arguments as $ARGUMENTS:
- `--docs=<pattern>`: Only validate specific documents matching pattern
- `--no-update`: Validate only, don't make changes
- `--full`: Re-validate all claims, even recently checked
- `--quick`: Skip deep validation, focus on obvious issues
- `--pr`: Generate PR-ready summary for documentation updates

## Important Notes

1. **Parallel Execution**: Always launch agents in parallel for speed
2. **Source of Truth**: CLAUDE.md is authoritative for development setup
3. **Preserve History**: Don't delete old information, mark as deprecated
4. **Atomic Updates**: Use MultiEdit for multiple changes to same file
5. **Verification**: Always verify changes don't break existing references

Execute this comprehensive documentation validation and update strategy now, ensuring all documentation accurately reflects the current state of the codebase through efficient parallel agent execution.