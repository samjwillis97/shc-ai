---
title: HttpCraft Skills Design
date: 2026-03-26
status: approved-by-user-in-chat
---

# Context

This design defines two user-facing skills for helping agents support general HttpCraft users:

1. `authoring-httpcraft-configs`
2. `using-httpcraft-cli`

The repository currently has no local `skills/` directory, so this work introduces a new skill structure in-repo.

# Goals

- Provide a clear skill for authoring and maintaining HttpCraft YAML configurations.
- Provide a clear skill for using the HttpCraft CLI to discover and execute requests.
- Keep responsibilities separate so retrieval is accurate and guidance is focused.
- Ground all examples in documented HttpCraft behavior from this repository.

# Non-Goals

- Building contributor-only workflows (build/test/lint internals) into these skills.
- Creating a dedicated debugging-only skill in this phase.
- Introducing undocumented CLI flags or speculative config capabilities.

# Audience

General users of HttpCraft (not primarily repository contributors).

# Skill Set and Boundaries

## Skill 1: `authoring-httpcraft-configs`

Use when creating, reorganizing, or extending HttpCraft YAML configs with APIs, endpoints, profiles, variables, or chains.

In scope:

- Designing minimal config structures.
- Adding/organizing APIs and endpoints.
- Introducing variables and profiles for reusable configuration.
- Adding chains for multi-step request flows.
- Showing config-oriented anti-patterns and corrections.

Out of scope:

- Detailed CLI execution workflows.
- Command-line output mode strategy.
- Terminal-first discovery (`list`, `describe`) as a primary topic.

## Skill 2: `using-httpcraft-cli`

Use when running HttpCraft commands to discover configuration, execute endpoint or chain requests, and control runtime inputs and output modes.

In scope:

- Command anatomy and invocation patterns.
- Discoverability commands (`list`, `describe`).
- Endpoint and chain execution.
- Runtime overrides (`--profile`, `--var`, `--no-default-profile`).
- Output mode selection (`--json`, `--verbose`, `--dry-run`).

Out of scope:

- Teaching full YAML architecture patterns.
- Deep config refactoring guidance (handoff to authoring skill).

# Cross-Skill Handoff Rules

- `authoring-httpcraft-configs` ends with a short handoff to `using-httpcraft-cli` for execution examples.
- `using-httpcraft-cli` includes a handoff to `authoring-httpcraft-configs` when user intent requires changing YAML structure.
- Both skills include a brief “When NOT to use this skill” section to reduce overlap.

# Content Contract

## File Layout

- `skills/authoring-httpcraft-configs/SKILL.md`
- `skills/using-httpcraft-cli/SKILL.md`

## Frontmatter Constraints

Each file includes YAML frontmatter with:

- `name`
- `description`

Descriptions use trigger-focused language beginning with “Use when...”, and avoid summarizing full workflows.

## Required Sections

Both skills include:

- Overview
- When to use / when not to use
- Step workflow
- Quick reference
- Common mistakes and fixes

`authoring-httpcraft-configs` additionally includes:

- Minimal config-first authoring sequence
- Variables/profiles/chains composition patterns
- Copy-paste YAML skeleton(s)

`using-httpcraft-cli` additionally includes:

- Command cookbook with concrete examples
- Discovery-first flow (`list`, `describe`, then execute)
- Runtime override guidance and output mode choices

# Workflow Design

## `authoring-httpcraft-configs` workflow

1. Start with smallest valid config (`apis` + one endpoint).
2. Add variables only where duplication appears.
3. Add profiles for environment/user context differences.
4. Add chains only for real multi-step workflows.
5. Validate config shape with lightweight describe/dry-run checks.

## `using-httpcraft-cli` workflow

1. Discover available targets via `list` commands.
2. Inspect resolved endpoint shape via `describe`.
3. Execute endpoint (`httpcraft <api> <endpoint>`) or chain (`httpcraft chain <chain_name>`).
4. Apply runtime overrides (`--profile`, `--var`, `--no-default-profile`) as needed.
5. Select output mode (`--json`, `--verbose`, `--dry-run`) based on use case.

# Source of Truth for Examples

Use examples and flags documented in:

- `README.md`
- existing examples under `examples/`

Prefer commands already represented in repository documentation such as:

- `httpcraft <api_name> <endpoint_name>`
- `httpcraft chain <chain_name>`
- `httpcraft list ...`
- `httpcraft describe ...`

# Quality Criteria

The implementation is considered complete when:

- Two skills exist at the agreed paths and names.
- Each skill has clear trigger-based frontmatter and scoped sections.
- No contradictory guidance appears between the two skills.
- Examples are executable in principle and aligned with repository docs.
- Cross-skill handoffs are explicit and concise.

# Risks and Mitigations

- Risk: overlap causing retrieval ambiguity.

  - Mitigation: explicit in/out-of-scope sections and handoff lines.

- Risk: drift from real CLI behavior.

  - Mitigation: constrain examples to existing README-documented commands/flags.

- Risk: overlong skills reducing usability.
  - Mitigation: concise quick references and practical examples only.

# Implementation Readiness

This design is approved in-chat by the user and is ready for implementation planning and authoring of the two skill files.
