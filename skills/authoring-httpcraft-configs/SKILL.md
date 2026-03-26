---
name: authoring-httpcraft-configs
description: Use when authoring or updating HttpCraft YAML configs, including requests, chains, profiles, and variable structures.
---

# Authoring HttpCraft Configs

## Overview

Design clear, reusable HttpCraft YAML configs for APIs, endpoints, profiles, and chains.
Start small, add structure only when duplication appears, and keep behavior explicit.

## When to use

- Creating a new `.httpcraft.yaml` from scratch
- Adding or reorganizing `apis`, `endpoints`, `profiles`, or `chains`
- Replacing repeated hardcoded values with variables
- Splitting environment-specific values into profiles

## When not to use

- You need broad command discovery/execution, runtime troubleshooting, or flag strategy
- You are troubleshooting command invocation or choosing runtime flag combinations

Use `using-httpcraft-cli` for terminal execution and command selection.

## Workflow

1. Start with one API and one endpoint that works.
2. Extract repeated values into variables.
3. Add profiles for environment or user-specific differences.
4. Add chains only for real multi-step request workflows.
5. Validate rendered request shape with `describe` or `--dry-run` before expanding.

## Minimal config first

```yaml
apis:
  jsonplaceholder:
    baseUrl: 'https://jsonplaceholder.typicode.com'
    endpoints:
      getTodo:
        method: GET
        path: '/todos/1'
```

## Add profiles when context changes

```yaml
profiles:
  dev:
    baseUrl: 'https://api-dev.example.com'
    apiKey: '{{secret.DEV_API_KEY}}'
  prod:
    baseUrl: 'https://api.example.com'
    apiKey: '{{secret.PROD_API_KEY}}'

apis:
  myapi:
    baseUrl: '{{profile.baseUrl}}'
    headers:
      Authorization: 'Bearer {{profile.apiKey}}'
    endpoints:
      getUser:
        method: GET
        path: '/users/{{userId}}'
```

## Add chains for multi-step flows

Assumes referenced endpoints (for example `createPost` and `getPost`) are already defined under the API.

```yaml
chains:
  createAndRetrieve:
    steps:
      - id: create
        call: jsonplaceholder.createPost
      - id: retrieve
        call: jsonplaceholder.getPost
        with:
          pathParams:
            postId: '{{steps.create.response.body.id}}'
```

## Validation checks

Use these lightweight checks before broadening config complexity:

```bash
httpcraft describe endpoint myapi getUser --profile dev --var userId=123
httpcraft --dry-run --profile dev myapi getUser --var userId=123
```

These commands are structure-validation checks only. For full command workflows, use `using-httpcraft-cli`.

## Quick reference

- Keep endpoint definitions small and explicit.
- Add variables when duplication appears in multiple places.
- Prefer `profile.*` for environment/user settings.
- Profile selection and merge behavior are runtime concerns; defer to `using-httpcraft-cli`.
- Keep chain steps narrowly scoped and data-linked.

## Common mistakes

- Adding profiles too early for one-off values.
- Mixing runtime concerns into YAML authoring decisions.
- Building chains for single calls that should stay endpoints.
- Expanding config without validating request resolution first.

## Handoff

After authoring or refactoring config structure, use `using-httpcraft-cli` to run requests, select command flags, and inspect outputs.
