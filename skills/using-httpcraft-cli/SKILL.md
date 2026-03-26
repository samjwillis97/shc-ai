---
name: using-httpcraft-cli
description: Use when executing HttpCraft from terminal against an existing config, including command discovery, request execution, and runtime flag selection.
---

# Using HttpCraft CLI

## Overview

Run HttpCraft commands confidently: discover what is configured, preview resolved requests, execute endpoints or chains, and select flags that match your goal.

## Assumptions

- Commands below assume HttpCraft can discover config from your current directory.
- If discovery fails or you need a specific file, pass `--config <path>`.
- When using multiple profiles, later profiles override earlier ones.
- If a command or flag behaves differently in your installed version, verify syntax with `httpcraft --help` and the relevant subcommand help.

## When to use

- You need to call an endpoint from an existing HttpCraft config
- You want to inspect available APIs, endpoints, or profiles from terminal
- You need runtime overrides (`--profile`, `--var`, `--no-default-profile`)
- You need output controls such as `--json`, `--verbose`, `--dry-run`

## When not to use

- You need to design or refactor YAML config structure (`apis`, `profiles`, `chains`)
- You are deciding data-model conventions inside configuration files

Use `authoring-httpcraft-configs` when the task is changing YAML structure.

## Command anatomy

```bash
httpcraft [global-options] <api_name> <endpoint_name> [request-options]
httpcraft [global-options] chain <chain_name> [request-options]
```

## Workflow

1. Discover available APIs/endpoints/profiles.
2. Inspect resolved endpoint details with `describe`.
3. Execute endpoint or chain.
4. Add runtime overrides (`--profile`, `--var`, `--no-default-profile`) only as needed.
5. Choose output mode (`--json`, `--verbose`, `--dry-run`) for your use case.

## Discovery flow

```bash
httpcraft --config ./.httpcraft.yaml list apis
httpcraft list apis
httpcraft list endpoints
httpcraft list endpoints jsonplaceholder
httpcraft list profiles
httpcraft describe endpoint myapi getUser
httpcraft describe endpoint myapi getUser --profile dev --profile alice
httpcraft describe endpoint myapi getUser --var userId=123 --json
```

## Execute flow

```bash
httpcraft --config ./.httpcraft.yaml myapi getUser
httpcraft myapi getUser
httpcraft myapi getUser --var userId=123 --var format=json
httpcraft chain createAndRetrieve
httpcraft chain createAndRetrieve --chain-output full
```

## Runtime overrides

```bash
httpcraft --profile prod myapi getUser --var userId=123
httpcraft --profile user-alice myapi getUser
httpcraft --no-default-profile --profile user-alice myapi getUser
```

## Output modes

```bash
httpcraft list apis --json
httpcraft --verbose myapi getUser --var userId=123
httpcraft --dry-run myapi getUser --var userId=123
```

## Quick reference

- `list` to discover, `describe` to inspect, execute only after both are clear.
- Prefer explicit `--var key=value` over hidden assumptions.
- Use `--no-default-profile` when default profile merging is not desired.
- Use `--json` for scripts; use `--verbose` for human inspection.

## Common mistakes and fixes

- Running endpoints before checking required variables; fix by running `describe endpoint` with needed `--var` values first.
- Assuming CLI profiles replace defaults; fix by using `--no-default-profile` when default merging is undesired.
- Using `--json` for request execution diagnostics; fix by using `--verbose` for human inspection.
- Skipping `describe` when profile order matters; fix by testing final resolution with exact profile order before execution.

## Handoff to authoring skill

If the command fails because config structure is incomplete or poorly organized, switch to `authoring-httpcraft-configs` to update YAML definitions before retrying.
