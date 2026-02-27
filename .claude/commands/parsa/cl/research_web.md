---
description: Conduct extensive web research on technical topics with validated references
model: opus
---

# Web Research

You are tasked with conducting comprehensive web research to investigate technical topics, compare approaches, extract documentation, and produce a validated guide with references.

## Use Cases

This command is designed for:
- Reviewing and extracting official documentation for libraries, APIs, or frameworks
- Researching and comparing different approaches to technical challenges
- Investigating best practices and common patterns for specific technologies
- Gathering implementation examples from authoritative sources
- Creating validated guides with citations and references

## Initial Response

When this command is invoked:

1. **Check if a topic was provided**:
   - If a topic or question was provided as a parameter, proceed immediately to Step 1
   - If NO topic provided, respond with:
   ```
   I'll help you conduct comprehensive web research. Please provide:

   1. The topic or technical question you want to research
   2. Any specific focus areas or constraints (optional)
   3. Preferred sources or domains to prioritize (optional)

   Examples:
   - "Best practices for WebSocket reconnection in React applications"
   - "Compare Drizzle ORM vs Prisma for PostgreSQL with Next.js"
   - "Deepgram API documentation for real-time transcription with Node.js"
   ```
   Then wait for user input.

## Process Steps

### Step 1: Analyze and Decompose the Research Question

1. **Break down the topic into research dimensions**:
   - Core concepts that need definition or explanation
   - Comparative aspects (if comparing technologies/approaches)
   - Implementation details needed
   - Best practices and common pitfalls
   - Version-specific considerations (check for latest versions)

2. **Identify authoritative source categories**:
   - Official documentation sites
   - GitHub repositories and discussions
   - Technical blogs from recognized experts
   - Stack Overflow answers with high votes
   - Conference talks or official tutorials

3. **Create a research plan** using TodoWrite:
   - List all dimensions to investigate
   - Note specific questions to answer
   - Identify comparison criteria if applicable

4. **Present your research plan to the user**:
   ```
   I'll research [topic] by investigating:

   1. [Dimension 1] - [what we'll learn]
   2. [Dimension 2] - [what we'll learn]
   3. [Dimension 3] - [what we'll learn]

   I'll prioritize sources from: [list of source types]

   Shall I proceed, or would you like to adjust the focus?
   ```

   Wait for confirmation before proceeding.

### Step 2: Spawn Parallel Research Tasks

Launch multiple **web-search-researcher** agents in parallel, each focused on a specific dimension:

1. **For each research dimension**, spawn a dedicated agent with:
   - Clear, specific search queries
   - Instructions to find authoritative sources
   - Request for URLs and citations with all findings
   - Focus on current/latest information (specify year if relevant)

2. **Example task distribution**:
   ```
   Task 1: Official documentation and API reference
   Task 2: Implementation patterns and code examples
   Task 3: Common issues and solutions (GitHub issues, Stack Overflow)
   Task 4: Comparison with alternatives (if applicable)
   Task 5: Performance considerations and best practices
   ```

3. **Agent instructions should include**:
   - Use WebSearch with specific, well-crafted queries
   - Use WebFetch to extract detailed content from promising pages
   - Return ALL source URLs with findings
   - Note version numbers and publication dates
   - Flag any conflicting information found

### Step 3: Synthesize and Validate Findings

1. **Wait for ALL research tasks to complete**

2. **Compile and cross-reference results**:
   - Group findings by theme/dimension
   - Identify consensus across multiple sources
   - Flag any contradictions or outdated information
   - Note which sources are most authoritative

3. **Validate critical claims**:
   - If findings conflict, spawn follow-up research to clarify
   - Check official documentation against blog posts
   - Verify version compatibility claims
   - Cross-reference code examples against current API

4. **Identify gaps**:
   - Note any questions that remain unanswered
   - Identify areas needing deeper investigation
   - Flag topics where information seems thin or outdated

### Step 4: Generate Research Document

Write the research document to: `thoughts/shared/research/YYYY-MM-DD-web-description.md`

**Document structure**:

```markdown
---
date: [Current date and time with timezone in ISO format]
researcher: [Researcher name]
topic: "[Research Topic]"
tags: [web-research, relevant-technology-names]
status: complete
sources_count: [Number of unique sources cited]
last_updated: [Current date in YYYY-MM-DD format]
---

# Web Research: [Topic]

**Date**: [Current date and time with timezone]
**Researcher**: [Researcher name]

## Research Question

[Original user query with any clarifications]

## Executive Summary

[2-3 paragraph summary of key findings, recommendations, and confidence level]

## Detailed Findings

### [Dimension 1: e.g., "Official API Documentation"]

[Findings with inline citations]

**Key Points**:
- [Point 1] ([Source Title](URL))
- [Point 2] ([Source Title](URL))

**Code Examples** (if applicable):
```[language]
// Example from [source]
```

### [Dimension 2: e.g., "Implementation Patterns"]

[Continue pattern for each dimension...]

## Comparison Table (if applicable)

| Criteria | Option A | Option B | Notes |
|----------|----------|----------|-------|
| [Criterion 1] | [Value] | [Value] | [Source] |

## Best Practices

[Synthesized recommendations based on research]

1. **[Practice 1]**: [Explanation] ([Source](URL))
2. **[Practice 2]**: [Explanation] ([Source](URL))

## Common Pitfalls

[Issues to avoid, based on GitHub issues, Stack Overflow, etc.]

- **[Pitfall 1]**: [Description and how to avoid] ([Source](URL))

## Version Considerations

[Note any version-specific information discovered]

- Version X.Y: [Relevant details]
- Breaking changes in X.Z: [Details]

## Confidence Assessment

| Finding | Confidence | Reason |
|---------|------------|--------|
| [Finding 1] | High/Medium/Low | [Based on N sources, official docs, etc.] |

## Sources

### Official Documentation
- [Title](URL) - [Brief description of what was extracted]

### Technical Articles
- [Title](URL) - [Brief description]

### Community Resources
- [Title](URL) - [Brief description]

### GitHub/Code Examples
- [Title](URL) - [Brief description]

## Open Questions

[Any areas that remain unclear or need further investigation]

## Related Research

[Links to other relevant research documents if they exist]
```

### Step 5: Present Findings and Iterate

1. **Present a summary to the user**:
   ```
   I've completed the research on [topic]. Here's what I found:

   **Key Findings:**
   - [Most important finding 1]
   - [Most important finding 2]
   - [Most important finding 3]

   **Recommendation:** [If applicable]

   The full research document is at: `thoughts/shared/research/[filename].md`

   Would you like me to:
   - Dive deeper into any specific area?
   - Research additional comparison points?
   - Look for more code examples?
   ```

2. **Handle follow-up requests**:
   - Spawn additional research tasks as needed
   - Update the research document with new sections
   - Update frontmatter (`last_updated`, add `last_updated_note`)

## Important Guidelines

1. **Source Quality**:
   - Prioritize official documentation over blog posts
   - Prefer recent content (check dates)
   - Value sources with code examples and explanations
   - Be skeptical of outdated or abandoned resources

2. **Citation Requirements**:
   - EVERY factual claim must have a source URL
   - Include source in the response, not just the document
   - Note when sources conflict

3. **Version Awareness**:
   - Always note software versions mentioned
   - Flag deprecated patterns or APIs
   - Check for recent breaking changes

4. **Parallel Efficiency**:
   - Spawn multiple research agents concurrently
   - Each agent should focus on one dimension
   - Wait for all to complete before synthesis

5. **Validation**:
   - Cross-reference findings across sources
   - Verify code examples are current
   - Flag low-confidence findings

6. **Transparency**:
   - Be clear about confidence levels
   - Acknowledge gaps in research
   - Note when information is sparse or conflicting

## Example Invocations

```
/research_web WebSocket reconnection best practices for React with exponential backoff
```

```
/research_web Compare audio recording APIs: Web Audio API vs MediaRecorder for capturing system audio
```

```
/research_web Deepgram real-time transcription API - Node.js implementation with error handling
```

```
/research_web Electron system audio capture on macOS - current approaches and limitations
```
