# HttpCraft: Implementation Status

**Version:** 1.0 (as per PRD)
**Last Updated:** 2024-01-XX

This document tracks the implementation progress of HttpCraft based on the [Phased Implementation Plan (PIP.md)](./PIP.md).

## Legend

- [ ] Not Started
- [~] In Progress
- [x] Completed
- [!] Blocked / Needs Attention

---

## Phase 0: Project Setup & Core Shell

- **Goal:** Establish the project structure, basic CLI argument parsing, and a minimal runnable application.
- **Status:** [x]
- **Tasks:**
  - [x] **T0.1:** Initialize TypeScript project with `npm init`, install `typescript`, `ts-node`, `@types/node`.
  - [x] **T0.2:** Configure `tsconfig.json` for compilation options.
  - [x] **T0.3:** Setup basic linting and formatting (ESLint, Prettier).
  - [x] **T0.4:** Setup a testing framework (Vitest).
  - [x] **T0.5:** Create basic project directory structure.
  - [x] **T0.6:** Implement a CLI entry point with a shebang.
  - [x] **T0.7:** Integrate a CLI argument parsing library (e.g., `yargs`).
  - [x] **T0.8:** Implement a `--version` command.
  - [x] **T0.9:** Implement a basic `--help` output.
- **Notes/Blockers:** All tasks completed successfully. CLI is functional with basic commands.

---

## Phase 1: Core HTTP Request & Basic Output

- **Goal:** Enable sending a single, hardcoded HTTP GET request and displaying its raw body.
- **Status:** [ ]
- **Tasks:**
  - [ ] **T1.1:** Integrate an HTTP client library (e.g., `axios`).
  - [ ] **T1.2:** Create a new command (e.g., `httpcraft request <url>`).
  - [ ] **T1.3:** Implement logic for the `request` command to make a GET request.
  - [ ] **T1.4:** Implement basic output: print raw response body to `stdout`.
  - [ ] **T1.5:** Implement basic error handling for network issues.
  - [ ] **T1.6:** Implement basic error handling for HTTP error statuses.
- **Notes/Blockers:**

---

## Phase 2: Basic YAML Configuration & Single Endpoint Invocation

- **Goal:** Load API and endpoint definitions from a YAML file and invoke a specific endpoint.
- **Status:** [ ]
- **Tasks:**
  - [ ] **T2.1:** Integrate a YAML parsing library.
  - [ ] **T2.2:** Define basic YAML structure for APIs/endpoints.
  - [ ] **T2.3:** Implement logic to load and parse a specified YAML config file.
  - [ ] **T2.4:** Implement `httpcraft <api_name> <endpoint_name>` command structure.
  - [ ] **T2.5:** Implement logic to find API/endpoint in loaded config.
  - [ ] **T2.6:** Construct the full URL.
  - [ ] **T2.7:** Execute HTTP request based on config.
  - [ ] **T2.8:** Support static `headers` in config.
  - [ ] **T2.9:** Support static `params` (query parameters) in config.
  - [ ] **T2.10:** Handle errors for malformed config or not found API/endpoint.
- **Notes/Blockers:**

---

## Phase 3: Basic Variable Substitution (Environment & CLI)

- **Goal:** Introduce basic variable substitution from OS environment variables and CLI arguments.
- **Status:** [ ]
- **Tasks:**
  - [ ] **T3.1:** Implement simple templating function for `{{variable}}`.
  - [ ] **T3.2:** Implement support for `{{env.VAR_NAME}}`.
  - [ ] **T3.3:** Implement support for `--var <key>=<value>` CLI option.
  - [ ] **T3.4:** Define initial variable precedence: CLI > Environment.
  - [ ] **T3.5:** Apply variable substitution to URL, path, headers, query params.
  - [ ] **T3.6:** Implement substitution for path parameters.
  - [ ] **T3.7:** Implement error handling for unresolved variables.
  - [ ] **T3.8:** Support basic stringified body definition and variable substitution.
- **Notes/Blockers:**

---

## Phase 4: Profiles & Expanded Variable Scopes

- **Goal:** Implement profiles, variables at API/Endpoint levels, and multiple profile application.
- **Status:** [ ]
- **Tasks:**
  - [ ] **T4.1:** Enhance YAML config for `profiles` section.
  - [ ] **T4.2:** Implement `--profile <name>` (multiple allowed).
  - [ ] **T4.3:** Implement logic to load and merge variables from multiple specified profiles.
  - [ ] **T4.4:** Implement `config.defaultProfile`.
  - [ ] **T4.5:** Enhance YAML for API/Endpoint `variables` sections.
  - [ ] **T4.6:** Implement updated variable precedence.
  - [ ] **T4.7:** Support YAML objects for JSON request bodies with variable substitution.
- **Notes/Blockers:**

---

## Phase 5: Verbose Output, Dry Run & Exit Code Control

- **Goal:** Implement enhanced output options for debugging and scripting.
- **Status:** [ ]
- **Tasks:**
  - [ ] **T5.1:** Implement `--verbose` flag.
  - [ ] **T5.2:** Capture request details before sending.
  - [ ] **T5.3:** If `--verbose`, print request details to `stderr`.
  - [ ] **T5.4:** If `--verbose`, print response details to `stderr`.
  - [ ] **T5.5:** Implement `--dry-run` flag.
  - [ ] **T5.6:** Implement `--exit-on-http-error <codes>` flag.
- **Notes/Blockers:**

---

## Phase 6: ZSH Tab Completion (Core)

- **Goal:** Provide basic ZSH tab completion for API and endpoint names.
- **Status:** [ ]
- **Tasks:**
  - [ ] **T6.1:** Research ZSH completion script generation.
  - [ ] **T6.2:** Implement `httpcraft completion zsh` command.
  - [ ] **T6.3:** Hidden command `--get-api-names`.
  - [ ] **T6.4:** ZSH script completes `api_name` arguments.
  - [ ] **T6.5:** Hidden command `--get-endpoint-names <api_name>`.
  - [ ] **T6.6:** ZSH script completes `endpoint_name` arguments.
  - [ ] **T6.7:** Add completion for basic CLI options.
- **Notes/Blockers:**

---

## Phase 7: Basic Plugin System (Pre-request Hook & Custom Vars)

- **Goal:** Implement a foundational plugin system.
- **Status:** [ ]
- **Tasks:**
  - [ ] **T7.1:** Define `Plugin` interface and `PluginContext`.
  - [ ] **T7.2:** Implement local JS plugin loader.
  - [ ] **T7.3:** Implement "pre-request" hook mechanism.
  - [ ] **T7.4:** Implement mechanism for plugins to register custom variable sources.
  - [ ] **T7.5:** Integrate plugin variable resolution into precedence.
  - [ ] **T7.6:** Ensure multiple pre-request hooks execute in order.
  - [ ] **T7.7:** Implement basic configuration passing to plugins.
- **Notes/Blockers:**

---

## Phase 8: Chains (Core Logic & Basic Data Passing)

- **Goal:** Implement core functionality for chained requests.
- **Status:** [ ]
- **Tasks:**
  - [ ] **T8.1:** Define YAML structure for `chains` and `steps`.
  - [ ] **T8.2:** Implement `httpcraft chain <chain_name>` command.
  - [ ] **T8.3:** Implement sequential execution of steps.
  - [ ] **T8.4:** Implement `chain.vars` and integration into precedence.
  - [ ] **T8.5:** Implement `step.with` overrides.
  - [ ] **T8.6:** Store full request/response for each step.
  - [ ] **T8.7:** Integrate a JSONPath library.
  - [ ] **T8.8:** Implement variable substitution for `{{steps.*.response...}}`.
  - [ ] **T8.9:** Implement variable substitution for `{{steps.*.request...}}`.
  - [ ] **T8.10:** Chain halts on step failure.
  - [ ] **T8.11:** Default output for successful chain is last step's body.
- **Notes/Blockers:**

---

## Phase 9: Advanced Configuration & Remaining Variables

- **Goal:** Implement remaining configuration aspects and finalize variable system.
- **Status:** [ ]
- **Tasks:**
  - [ ] **T9.1:** Implement modular imports for API definitions from a directory.
  - [ ] **T9.2:** Implement modular imports for chain definitions from a directory.
  - [ ] **T9.3:** Implement loading of global variable files.
  - [ ] **T9.4:** Implement `{{secret.VAR_NAME}}` resolution (default: OS env).
  - [ ] **T9.5:** Ensure `{{secret.*}}` variables are masked.
  - [ ] **T9.6:** Implement built-in dynamic variables.
  - [ ] **T9.7:** Finalize and thoroughly test full variable precedence.
- **Notes/Blockers:**

---

## Phase 10: Polish & Remaining V1 Features

- **Goal:** Complete all remaining V1 features, refine documentation, and improve overall polish.
- **Status:** [ ]
- **Tasks:**
  - [ ] **T10.1:** Implement "post-response" plugin hook.
  - [ ] **T10.2:** Implement plugin loading from npm.
  - [ ] **T10.3:** Implement chain verbose output (structured JSON).
  - [ ] **T10.4:** Refine ZSH completion (chains, options).
  - [ ] **T10.5:** Write comprehensive README.md and usage examples.
  - [ ] **T10.6:** Create/document YAML schema.
  - [ ] **T10.7:** Thorough end-to-end testing.
  - [ ] **T10.8:** Code review, cleanup, performance optimizations.
  - [ ] **T10.9:** Prepare for V1 release.
- **Notes/Blockers:**

---
