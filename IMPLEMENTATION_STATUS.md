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
- **Status:** [x]
- **Tasks:**
  - [x] **T1.1:** Integrate an HTTP client library (e.g., `axios`).
  - [x] **T1.2:** Create a new command (e.g., `httpcraft request <url>`).
  - [x] **T1.3:** Implement logic for the `request` command to make a GET request.
  - [x] **T1.4:** Implement basic output: print raw response body to `stdout`.
  - [x] **T1.5:** Implement basic error handling for network issues.
  - [x] **T1.6:** Implement basic error handling for HTTP error statuses.
- **Notes/Blockers:** All tasks completed successfully. Integrated axios v1.9.0, implemented `httpcraft request <url>` command with proper error handling. Network errors exit with code 1, HTTP errors print to stderr but exit with code 0 as specified. All tests passing.

---

## Phase 2: Basic YAML Configuration & Single Endpoint Invocation

- **Goal:** Load API and endpoint definitions from a YAML file and invoke a specific endpoint.
- **Status:** [x]
- **Tasks:**
  - [x] **T2.1:** Integrate a YAML parsing library.
  - [x] **T2.2:** Define basic YAML structure for APIs/endpoints.
  - [x] **T2.3:** Implement logic to load and parse a specified YAML config file with search hierarchy: --config override, ./.httpcraft.yaml in current directory, $HOME/.config/httpcraft/config.yaml as global default.
  - [x] **T2.4:** Implement `httpcraft <api_name> <endpoint_name>` command structure.
  - [x] **T2.5:** Implement logic to find API/endpoint in loaded config.
  - [x] **T2.6:** Construct the full URL.
  - [x] **T2.7:** Execute HTTP request based on config.
  - [x] **T2.8:** Support static `headers` in config.
  - [x] **T2.9:** Support static `params` (query parameters) in config.
  - [x] **T2.10:** Handle errors for malformed config or not found API/endpoint.
- **Notes/Blockers:** All tasks completed successfully. Integrated js-yaml for YAML parsing, created TypeScript types for configuration structure, implemented ConfigLoader with complete search hierarchy for file loading (local .httpcraft.yaml/.httpcraft.yml takes precedence over global ~/.config/httpcraft/config.yaml), UrlBuilder for URL construction and header/param merging, updated HttpClient with new interface, and integrated everything into the CLI with proper error handling. The command `httpcraft <api_name> <endpoint_name> --config <path>` works correctly and can execute real HTTP requests to configured endpoints. Configuration file search hierarchy fully implemented as per T2.3 specification. All tests passing.

---

## Phase 3: Basic Variable Substitution (Environment & CLI)

- **Goal:** Introduce basic variable substitution from OS environment variables and CLI arguments.
- **Status:** [x]
- **Tasks:**
  - [x] **T3.1:** Implement simple templating function for `{{variable}}`.
  - [x] **T3.2:** Implement support for `{{env.VAR_NAME}}`.
  - [x] **T3.3:** Implement support for `--var <key>=<value>` CLI option.
  - [x] **T3.4:** Define initial variable precedence: CLI > Environment.
  - [x] **T3.5:** Apply variable substitution to URL, path, headers, query params.
  - [x] **T3.6:** Implement substitution for path parameters.
  - [x] **T3.7:** Implement error handling for unresolved variables.
  - [x] **T3.8:** Support basic stringified body definition and variable substitution.
- **Notes/Blockers:** All tasks completed successfully. Implemented VariableResolver class with support for `{{variable}}` and `{{env.VAR_NAME}}` syntax. Added `--var key=value` CLI option with proper parsing (handles values containing '='). Implemented variable precedence (CLI > Environment) and comprehensive error handling with informative messages. Variable substitution works in URLs, paths, headers, query parameters, and request bodies (both string and object formats). Created comprehensive unit tests and integration tests covering all Phase 3 requirements. All 46 tests passing.

---

## Phase 4: Profiles & Expanded Variable Scopes

- **Goal:** Implement profiles, variables at API/Endpoint levels, and multiple profile application.
- **Status:** [x]
- **Tasks:**
  - [x] **T4.1:** Enhance YAML config for `profiles` section.
  - [x] **T4.2:** Implement `--profile <name>` (multiple allowed).
  - [x] **T4.3:** Implement logic to load and merge variables from multiple specified profiles.
  - [x] **T4.4:** Implement `config.defaultProfile`.
  - [x] **T4.5:** Enhance YAML for API/Endpoint `variables` sections.
  - [x] **T4.6:** Implement updated variable precedence.
  - [x] **T4.7:** Support YAML objects for JSON request bodies with variable substitution.
- **Notes/Blockers:** All tasks completed successfully. Enhanced configuration types to support profiles, config section, and variables at API/endpoint levels. Updated VariableResolver with new precedence order (CLI > Step with > Chain vars > Endpoint > API > Profile > Environment) and support for scoped variables ({{profile.key}}, {{api.key}}, {{endpoint.key}}). Added --profile CLI option with support for multiple profiles. Implemented profile merging with later profiles taking precedence. Added comprehensive validation for profile existence. Enhanced CLI to support default profiles from configuration. All Phase 4 tests passing (50 unit tests + 8 integration tests).

---

## Phase 5: Verbose Output, Dry Run & Exit Code Control

- **Goal:** Implement enhanced output options for debugging and scripting.
- **Status:** [x]
- **Tasks:**
  - [x] **T5.1:** Implement `--verbose` flag.
  - [x] **T5.2:** Capture request details before sending.
  - [x] **T5.3:** If `--verbose`, print request details to `stderr`.
  - [x] **T5.4:** If `--verbose`, print response details to `stderr`.
  - [x] **T5.5:** Implement `--dry-run` flag.
  - [x] **T5.6:** Implement `--exit-on-http-error <codes>` flag.
- **Notes/Blockers:** All tasks completed successfully. Added `--verbose`, `--dry-run`, and `--exit-on-http-error` CLI options. Verbose mode prints detailed request and response information to stderr including timing. Dry-run mode displays request details without making HTTP calls and gracefully handles unresolved variables. Exit-on-http-error supports patterns like "4xx", "5xx", and specific codes like "401,403". All Phase 5 tests passing (16 unit tests + 9 integration tests).

---

## Phase 6: ZSH Tab Completion (Core)

- **Goal:** Provide basic ZSH tab completion for API and endpoint names.
- **Status:** [x]
- **Tasks:**
  - [x] **T6.1:** Research ZSH completion script generation.
  - [x] **T6.2:** Implement `httpcraft completion zsh` command.
  - [x] **T6.3:** Hidden command `--get-api-names`.
  - [x] **T6.4:** ZSH script completes `api_name` arguments.
  - [x] **T6.5:** Hidden command `--get-endpoint-names <api_name>`.
  - [x] **T6.6:** ZSH script completes `endpoint_name` arguments.
  - [x] **T6.7:** Add completion for basic CLI options.
- **Notes/Blockers:** All tasks completed successfully. Implemented custom ZSH completion script generation using yargs command structure. Created `httpcraft completion zsh` command that outputs a complete ZSH completion script. Added hidden `--get-api-names` and `--get-endpoint-names` commands that dynamically fetch completion values from configuration files. The completion script supports all CLI options (--config, --var, --profile, --verbose, --dry-run, --exit-on-http-error) and provides contextual completion for API names and endpoint names. Error handling is graceful - completion commands silently fail if config is missing or malformed to avoid breaking tab completion. All Phase 6 tests passing (11 unit tests + 11 integration tests).

---

## Phase 7: Basic Plugin System (Pre-request Hook & Custom Vars)

- **Goal:** Implement a foundational plugin system.
- **Status:** [x]
- **Tasks:**
  - [x] **T7.1:** Define `Plugin` interface and `PluginContext`.
  - [x] **T7.2:** Implement local JS plugin loader.
  - [x] **T7.3:** Implement "pre-request" hook mechanism.
  - [x] **T7.4:** Implement mechanism for plugins to register custom variable sources.
  - [x] **T7.5:** Integrate plugin variable resolution into precedence.
  - [x] **T7.6:** Ensure multiple pre-request hooks execute in order.
  - [x] **T7.7:** Implement basic configuration passing to plugins.
- **Notes/Blockers:** All tasks completed successfully. Implemented complete plugin system with TypeScript interfaces for Plugin and PluginContext, PluginManager class for loading and managing plugins from local JavaScript files, pre-request hook mechanism integrated into HttpClient, custom variable source registration with {{plugins.name.variable}} syntax, full integration into variable resolution precedence system, sequential execution of multiple pre-request hooks, and configuration passing to plugins during setup. Created comprehensive unit tests (14 for PluginManager + 13 for variable integration) and working example plugin (dummyAuthPlugin.js). Plugin system is fully functional and ready for use. All 27 Phase 7 tests passing.

---

## Phase 8: Chains (Core Logic & Basic Data Passing)

- **Goal:** Implement core functionality for chained requests, including step execution and data passing.
- **Status:** [x]
- **Tasks:**
  - [x] **T8.1:** Define YAML structure for top-level `chains` section. Each chain has `vars` and `steps`. Each step has `id`, `call` (`api_name.endpoint_name`), and optional `with` (for `headers`, `params`, `pathParams`, `body` overrides).
  - [x] **T8.2:** Implement the `httpcraft chain <chain_name>` command.
  - [x] **T8.3:** Implement sequential execution of steps defined in a chain. For each step, resolve its `call` to an API/endpoint definition.
  - [x] **T8.4:** Implement `chain.vars` and their integration into variable resolution (precedence: CLI > Step `with` > `chain.vars` > Endpoint > ...).
  - [x] **T8.5:** Implement `step.with` overrides for `headers`, `params`, `pathParams`, and `body`. Step overrides have highest precedence and support variable resolution. PathParams enable URL parameter substitution (e.g., `{{userId}}` → actual values).
  - [x] **T8.6:** Store full request/response for each step.
  - [x] **T8.7:** Integrate a JSONPath library.
  - [x] **T8.8:** Implement variable substitution for `{{steps.*.response...}}`.
  - [x] **T8.9:** Implement variable substitution for `{{steps.*.request...}}`.
  - [x] **T8.10:** Chain halts on step failure.
  - [x] **T8.11:** Default output for successful chain is last step's body.
- **Notes/Blockers:** All Phase 8 tasks completed successfully! Implemented complete chain execution system with:
  - **JSONPath Integration (T8.7):** Added jsonpath-plus library for powerful data extraction
  - **Step Variable Resolution (T8.8 & T8.9):** Full support for {{steps.stepId.response.*}} and {{steps.stepId.request.*}} with automatic JSON parsing
  - **Request/Response Storage (T8.6):** Complete request and response data stored for each step for future reference
  - **Chain Failure Handling (T8.10):** Chains halt immediately on any step failure (HTTP 4xx/5xx errors)
  - **Chain Output (T8.11):** Successful chains output the last step's response body
  - Enhanced ChainExecutor with step data passing to variable resolution, proper error handling, and comprehensive test coverage. Variable resolver now handles complex JSONPath expressions including array access (e.g., {{steps.getUsers.response.body[0].name}}) and nested object access. All chain functionality working correctly with 90+ tests passing. Ready to proceed to Phase 9.

---

## Phase 9: Advanced Configuration & Remaining Variables

- **Goal:** Implement remaining configuration aspects and finalize variable system.
- **Status:** [~]
- **Tasks:**
  - [x] **T9.1:** Implement modular imports for API definitions from a directory.
  - [x] **T9.2:** Implement modular imports for chain definitions from a directory.
  - [x] **T9.3:** Implement loading of global variable files.
  - [ ] **T9.4:** Implement `{{secret.VAR_NAME}}` resolution (default: OS env).
  - [ ] **T9.5:** Ensure `{{secret.*}}` variables are masked.
  - [ ] **T9.6:** Implement built-in dynamic variables.
  - [ ] **T9.7:** Finalize and thoroughly test full variable precedence.
- **Notes/Blockers:** T9.1, T9.2, and T9.3 completed successfully. Implemented comprehensive modular import system for APIs and chains, plus global variable file loading with proper precedence integration. All functionality working correctly with extensive test coverage.

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
