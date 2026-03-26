# HttpCraft Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two user-facing skills, `authoring-httpcraft-configs` and `using-httpcraft-cli`, with clear boundaries, practical examples, and cross-skill handoffs.

**Architecture:** Introduce a new in-repo `skills/` tree with one self-contained `SKILL.md` file per skill. Keep each skill focused on a single user intent (authoring vs CLI usage), and enforce boundary clarity with explicit "when not to use" and handoff sections.

**Tech Stack:** Markdown documentation, existing HttpCraft docs (`README.md`, `examples/`), OpenCode skill frontmatter conventions.

---

### Task 1: Create Skill File Structure

**Files:**

- Create: `skills/authoring-httpcraft-configs/SKILL.md`
- Create: `skills/using-httpcraft-cli/SKILL.md`
- Modify: none
- Test: manual verification in `skills/authoring-httpcraft-configs/SKILL.md` and `skills/using-httpcraft-cli/SKILL.md`

- [ ] **Step 1: Create skills directories**

Run: `mkdir -p skills/authoring-httpcraft-configs skills/using-httpcraft-cli`
Expected: directories exist and are empty.

- [ ] **Step 2: Add frontmatter skeletons to both SKILL files**

Use this exact skeleton for each file:

```markdown
---
name: <skill-name>
description: Use when ...
---

# <Skill Title>

## Overview

...
```

Expected: both files have valid frontmatter and top-level sections.

- [ ] **Step 3: Verify naming and description constraints**

Check:

- names are exactly `authoring-httpcraft-configs` and `using-httpcraft-cli`
- descriptions start with `Use when`
- descriptions are trigger-focused (not workflow summaries)

Expected: both files satisfy skill discovery requirements.

- [ ] **Step 4: Commit structure-only scaffold**

Run:

```bash
git add skills/authoring-httpcraft-configs/SKILL.md skills/using-httpcraft-cli/SKILL.md
git commit -m "docs(skills): scaffold httpcraft skill files"
```

Expected: one commit with empty/skeleton skill docs.

### Task 2: Implement `authoring-httpcraft-configs`

**Files:**

- Modify: `skills/authoring-httpcraft-configs/SKILL.md`
- Reference: `README.md`, `examples/`
- Test: manual verification via checklist in this task

- [ ] **Step 1: Write the failing review test (content checklist before writing body)**

Define these required sections in a local checklist and mark all as initially missing:

- Overview
- When to use
- When not to use
- Authoring workflow (minimal config, variables, profiles, chains)
- Quick reference snippets
- Common mistakes and fixes
- Validation checks (`describe` and/or `--dry-run`)
- Handoff to `using-httpcraft-cli`

Expected: checklist starts in failing state (sections absent or incomplete).

- [ ] **Step 2: Write minimal content to satisfy section requirements**

Add concise content covering:

- minimal config-first approach
- introduce variables only when duplication appears
- profiles for environment/user context
- chains only for true multi-step workflows

Expected: every required section exists with concrete guidance.

- [ ] **Step 3: Add runnable YAML snippets aligned with repo docs**

Add 2-3 concise snippets:

- minimal API + endpoint
- profile-driven base URL/auth header
- small chain-oriented structural example (if chain syntax is shown, keep it consistent with repository examples)

Expected: snippets are realistic and not contradictory with `README.md`.

- [ ] **Step 4: Add config-validation guidance with concrete commands**

Add a short validation subsection that includes at least one concrete command example from documented behavior, for example:

```bash
httpcraft describe endpoint myapi getUser --profile dev --var userId=123
httpcraft --dry-run myapi getUser --var userId=123
```

Expected: authoring skill explicitly teaches lightweight validation checks before execution.

- [ ] **Step 5: Add boundaries and handoff language**

Add explicit "not this skill when..." bullet(s), then handoff:

- use `using-httpcraft-cli` for running, discovering, and output-mode decisions.

Expected: boundary between skills is explicit.

- [ ] **Step 6: Validate with quick grep checks**

Run:

```bash
rg "^## " skills/authoring-httpcraft-configs/SKILL.md
rg "Use when|When not to use|Common mistakes|Quick reference" skills/authoring-httpcraft-configs/SKILL.md
```

Expected: required headings/phrases are present.

- [ ] **Step 7: Commit authoring skill**

Run:

```bash
git add skills/authoring-httpcraft-configs/SKILL.md
git commit -m "docs(skills): add authoring-httpcraft-configs guidance"
```

Expected: focused commit for this skill only.

### Task 3: Implement `using-httpcraft-cli`

**Files:**

- Modify: `skills/using-httpcraft-cli/SKILL.md`
- Reference: `README.md`, `examples/`
- Test: manual verification via checklist in this task

- [ ] **Step 1: Write the failing review test (content checklist before writing body)**

Define required sections and mark missing:

- Overview
- When to use
- When not to use
- Command anatomy
- Discovery flow (`list`, `describe`)
- Execute flow (`httpcraft <api> <endpoint>`, `httpcraft chain <chain_name>`)
- Runtime overrides (`--profile`, `--var`, `--no-default-profile`)
- Output modes (`--json`, `--verbose`, `--dry-run`)
- Quick reference
- Common mistakes and fixes
- Handoff to `authoring-httpcraft-configs`

Expected: checklist starts failing until content is added.

- [ ] **Step 2: Add minimal command-first workflow**

Write workflow:

1. discover targets
2. inspect resolved endpoint
3. execute request/chain
4. apply overrides
5. choose output mode for purpose

Expected: users can follow the steps without prior repository context.

- [ ] **Step 3: Add concrete command cookbook examples**

Include concise commands drawn from repository docs, such as:

- `httpcraft list apis`
- `httpcraft describe endpoint <api> <endpoint> --profile <name> --var key=value`
- `httpcraft <api> <endpoint> --var key=value`
- `httpcraft chain <chain_name> --chain-output full`

Expected: examples are consistent with documented command surface.

- [ ] **Step 4: Add skill boundary and handoff**

Add explicit boundary:

- if user needs to restructure YAML, switch to `authoring-httpcraft-configs`.

Expected: overlap is minimized and retrieval intent is clear.

- [ ] **Step 5: Validate with quick grep checks**

Run:

```bash
rg "list|describe|--profile|--var|--json|--verbose|--dry-run" skills/using-httpcraft-cli/SKILL.md
rg "When not to use|Common mistakes|Quick reference" skills/using-httpcraft-cli/SKILL.md
```

Expected: required command guidance is present.

- [ ] **Step 6: Commit CLI skill**

Run:

```bash
git add skills/using-httpcraft-cli/SKILL.md
git commit -m "docs(skills): add using-httpcraft-cli workflow"
```

Expected: focused commit for CLI usage skill.

### Task 4: Cross-Skill Consistency Pass

**Files:**

- Modify: `skills/authoring-httpcraft-configs/SKILL.md`
- Modify: `skills/using-httpcraft-cli/SKILL.md`
- Test: manual diff/read verification

- [ ] **Step 1: Check overlap and contradictions**

Run:

```bash
git diff -- skills/authoring-httpcraft-configs/SKILL.md skills/using-httpcraft-cli/SKILL.md
```

Expected: no contradictory claims or duplicated long workflows.

- [ ] **Step 2: Align terminology and handoff phrasing**

Ensure both files consistently use:

- API / endpoint / chain
- profile / variable override
- explicit handoff sentence to the sibling skill

Expected: consistent vocabulary and clean handoff points.

- [ ] **Step 3: Run final quick acceptance checks**

Run:

```bash
rg "^name: authoring-httpcraft-configs|^name: using-httpcraft-cli" skills/*/SKILL.md
rg "^description: Use when" skills/*/SKILL.md
```

Expected: both frontmatters are valid and discoverable.

- [ ] **Step 4: Commit consistency updates**

Run:

```bash
git add skills/authoring-httpcraft-configs/SKILL.md skills/using-httpcraft-cli/SKILL.md
git commit -m "docs(skills): refine boundaries and cross-skill handoffs"
```

Expected: final cleanup commit with only cross-skill consistency changes.

### Task 5: Verification and Handoff

**Files:**

- Modify: none (unless fixing issues)
- Test: repository status and file presence checks

- [ ] **Step 1: Verify files and status**

Run:

```bash
git status --short
ls skills/authoring-httpcraft-configs skills/using-httpcraft-cli
```

Expected: both directories contain `SKILL.md`; working tree is clean or only intended changes remain.

- [ ] **Step 2: Optional smoke-check by loading skill names (environment-dependent)**

If the runtime supports local skill discovery immediately, load each skill by name and confirm no parse/frontmatter errors.

Expected: skills load without schema or frontmatter issues.

- [ ] **Step 3: Prepare merge/PR summary**

Summarize:

- what each skill covers
- boundary line between them
- where examples came from (`README.md` / `examples/`)

Expected: reviewer can quickly verify scope and intent.
