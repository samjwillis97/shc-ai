# Product Requirements Document: CLI HTTP Test Tool (Codename: HttpCraft)

**Version:** 1.0
**Date:** October 26, 2023
**Status:** Final

## 1. Introduction

HttpCraft is a command-line interface (CLI) tool designed to simplify testing and interacting with HTTP/S endpoints. It aims to provide a highly ergonomic, configurable, and extensible experience for developers, QA engineers, and DevOps professionals who need to make HTTP requests frequently. Key features include configuration-driven endpoint sets, robust variable management, ZSH tab completion, a plugin system for custom behaviors (like authentication), and support for chained requests to model complex workflows.

## 2. Goals

- **Ergonomics & Developer Experience:** Provide a fast, intuitive, and enjoyable CLI experience, significantly enhanced by ZSH tab completion and clear output.
- **Configuration as Code:** Enable users to define and manage their API interactions (endpoints, variables, profiles, chains) in easily editable and version-controllable YAML files.
- **Flexibility & Extensibility:** Support a wide range of use cases through powerful variable substitution, request chaining, and a plugin architecture for custom logic (e.g., authentication, response transformation).
- **Automation & Scripting:** Ensure the tool is easily scriptable, with predictable output that can be piped to other Unix utilities like `jq`, and controllable exit codes.
- **Workflow Efficiency:** Allow users to quickly switch between different contexts (e.g., development/production environments, user profiles) and execute complex multi-request sequences with ease.

## 3. Target Audience

- **Software Developers:** For API development, integration testing, and ad-hoc endpoint interaction.
- **QA Engineers:** For API test automation and validation.
- **DevOps Engineers:** For health checks, deployment scripts, and infrastructure interaction via APIs.
- **Technical Users:** Anyone who frequently interacts with HTTP APIs from the command line.

## 4. User Stories / Key Scenarios

- **US1 (Endpoint Definition):** As a developer, I want to define a set of related API endpoints (e.g., for a specific microservice) in a YAML file, specifying URL, method, default headers, and query parameters, so I can easily manage and invoke them.
- **US2 (CLI Invocation & Completion):** As a CLI user, I want to invoke a specific endpoint using `httpcraft <api_name> <endpoint_name>` and benefit from ZSH tab completion for both API and endpoint names, so I can work quickly and avoid typos.
- **US3 (Variable Management):** As a user, I want to define variables (e.g., `member_id`, `base_url`, `auth_token`) at different scopes (global, profile, API, endpoint, chain) and have them substituted into requests, so I can reuse configurations and avoid hardcoding values.
- **US4 (Profiles/Environments):** As a developer, I want to define "profiles" (e.g., `dev`, `staging`, `prod` or `user_A`, `user_B`) that set specific variables, and easily switch between them using a CLI flag, so I can test against different environments or user contexts without modifying my core endpoint definitions.
- **US5 (Chained Requests):** As a QA engineer, I want to define a sequence of HTTP requests where data from one request's response (e.g., an ID or token) is used in a subsequent request, so I can model and automate complex user workflows.
- **US6 (Custom Authentication):** As a developer working with a proprietary authentication scheme, I want to write a plugin that handles the authentication logic and automatically applies it to my requests, so I don't have to manually manage auth headers for every call.
- **US7 (Output Piping):** As a scripter, I want the default output of a successful request to be the raw response body sent to `stdout`, so I can easily pipe it to tools like `jq` for further processing.
- **US8 (Plugin Discovery):** As a user, I want to be able to load plugins from a package registry (like npm) or from my local filesystem, so I can extend the tool's functionality.
- **US9 (Secret Management):** As a security-conscious user, I want to reference secrets (like API keys) from environment variables or a secure store (via plugins) using a special syntax (e.g., `{{secret.API_KEY}}`) and have them masked in verbose logs.
- **US10 (Dynamic Data):** As a tester, I want to use built-in dynamic variables (e.g., `{{$timestamp}}`, `{{$randomInt}}`) in my requests, so I can generate unique test data on the fly.

## 5. Functional Requirements (V1)

### 5.1. Configuration Management

- **FR1.1 (Format):** All tool configuration shall be primarily in YAML format.
- **FR1.2 (Main Config File):** The tool shall support a main configuration file.
- **FR1.3 (Modular Imports):**
  - Allow importing API definitions, chain definitions, and global variable files from specified directories or individual files.
  - Path resolution for imports shall be relative to the file defining the import.
  - Conflict resolution for merged configurations: last one loaded wins.
- **FR1.4 (Structure):** The main config can contain top-level sections:
  - `config`: Global tool settings (e.g., `defaultProfile`).
  - `profiles`: Named sets of key-value variable pairs.
  - `variables`: List of paths to global variable files.
  - `secrets`: Configuration for the secret provider (default: OS environment).
  - `plugins`: Configuration for loading and setting up plugins.
  - `apis`: Definitions for different APIs.
  - `chains`: Definitions for multi-step request sequences.
- **FR1.5 (API Definition):** Each API definition within `apis` shall support:
  - A unique API name.
  - `baseUrl`.
  - Default `headers` (map).
  - Default `queryParams` (map).
  - API-level `variables` (map).
  - A list of `endpoints`.
- **FR1.6 (Endpoint Definition):** Each endpoint definition shall support:
  - A unique name within its API.
  - `method`: HTTP method (GET, POST, PUT, DELETE, etc.).
  - `path`: URL path, supporting `{{variable}}` substitution for path parameters (e.g., `/users/{{userId}}`).
  - `headers`: Endpoint-specific headers (map), overriding API defaults.
  - `params`: Endpoint-specific query parameters (map), overriding API defaults.
  - `body`: Request body (can be YAML object for JSON, string for other types).
  - Endpoint-level `variables` (map).
- **FR1.7 (Schema):** A YAML schema for the configuration files shall be provided to aid validation and editor integration.
- **FR1.8 (Descriptions):** The schema shall allow for optional `description` fields for APIs, endpoints, chains, etc., for documentation.

### 5.2. CLI (Command Line Interface)

- **FR2.1 (Invocation - Single Request):** `httpcraft [options] <api_name> <endpoint_name>`
- **FR2.2 (Invocation - Chain):** `httpcraft chain <chain_name> [options]`
- **FR2.3 (ZSH Tab Completion):**
  - Provide ZSH tab completion for commands (e.g., `chain`).
  - Provide ZSH tab completion for `<api_name>`.
  - Provide ZSH tab completion for `<endpoint_name>` (contextual to the selected `<api_name>`).
  - Provide ZSH tab completion for `<chain_name>`.
  - Provide ZSH tab completion for CLI options.
  - A command `httpcraft completion zsh` shall output the ZSH completion script.
- **FR2.4 (Options):**
  - `--var <key>=<value>`: Set/override a variable from the command line.
  - `--profile <name>`: Select a profile to use for this invocation.
  - `--verbose`: Output detailed request and response information (headers, status, timing) to `stderr`.
  - `--dry-run`: Resolve and display the request that would be sent (to `stdout` or `stderr`), without actually sending it. Sensitive values should be masked.
  - `--exit-on-http-error <codes>` (or similar): Optional flag to make the tool exit with a non-zero code if specified HTTP error status codes (e.g., "4xx", "5xx", "401,403") are received.

### 5.3. Variable System

- **FR3.1 (Syntax):** Variables shall be referenced using `{{variable_name}}` syntax within URLs, paths, headers, query parameters, and request bodies.
- **FR3.2 (Precedence - Highest to Lowest):**
  1.  CLI arguments (`--var`)
  2.  Step `with` overrides (in chain steps)
  3.  `chain.vars` (defined at the start of a chain definition)
  4.  Endpoint-specific variables
  5.  API-specific variables
  6.  Profile variables (from the active profile)
  7.  Dedicated/Global variable files
  8.  `{{secret.*}}` variables
  9.  `{{env.*}}` OS environment variables
  10. `{{$dynamic}}` built-in dynamic variables
- **FR3.3 (Resolution Failure):** If a variable cannot be resolved, the tool shall throw an error and halt execution, providing an informative error message.
- **FR3.4 (Data Types):** Variables resolved from YAML can be strings, numbers, or booleans, and should be stringified appropriately for HTTP contexts or used as native types for JSON bodies.
- **FR3.5 (Dynamic Variables):** Provide built-in dynamic variables (e.g., `{{$timestamp}}`, `{{$isoTimestamp}}`, `{{$randomInt}}`, `{{$guid}}`).
- **FR3.6 (Environment Variables):** Access OS environment variables using `{{env.VAR_NAME}}`.
- **FR3.7 (Secrets):**
  - Access secrets using `{{secret.SECRET_NAME}}`.
  - Default secrets provider shall be OS environment variables.
  - Secrets shall be masked in verbose logs and dry-run outputs.
  - The secrets provider mechanism should be extensible via plugins.

### 5.4. Chained Requests

- **FR4.1 (Definition):** Chains shall be defined in a top-level `chains` section in the configuration.
- **FR4.2 (Chain Structure):** Each chain definition shall support:
  - A unique chain name.
  - Optional `description`.
  - `vars`: Chain-specific variables.
  - `steps`: An ordered list of request steps.
- **FR4.3 (Step Structure):** Each step in a chain shall support:
  - `id`: A unique identifier for the step within the chain.
  - Optional `description`.
  - `call`: A reference to an endpoint in the format `<api_name>.<endpoint_name>`.
  - `with` (optional): An object to provide or override `headers`, `params` (query), `pathParams`, or `body` for the called endpoint specifically for this step.
- **FR4.4 (Data Flow - Implicit):**
  - Data from previous steps' requests or responses shall be accessible in subsequent steps.
  - Syntax examples:
    - `{{steps.<step_id>.response.body.<JSONPath>}}`
    - `{{steps.<step_id>.response.headers['<Header-Name>']}}`
    - `{{steps.<step_id>.response.status_code}}`
    - `{{steps.<step_id>.request.body.<JSONPath>}}` (for the sent request body)
    - `{{steps.<step_id>.request.url}}`
  - The tool must store the fully resolved request and full response for each step to enable this.
- **FR4.5 (Error Handling):** If any step in a chain fails (e.g., HTTP error, variable resolution error, JSONPath extraction failure), the entire chain shall halt immediately, and an error reported.

### 5.5. Plugin System

- **FR5.1 (Language):** Plugins shall be written in JavaScript or TypeScript (transpiled to JS).
- **FR5.2 (Loading):** Plugins can be loaded from:
  - A configured package registry (e.g., npm).
  - Local filesystem paths specified in the configuration.
- **FR5.3 (Hooks):** Plugins shall be able to hook into the request lifecycle:
  - **Pre-request:** Modify the request object (URL, headers, body, etc.) before it is sent. (e.g., for custom authentication).
  - **Post-response:** Access and potentially transform the response object (status, headers, body) before it's processed for output or chaining.
- **FR5.4 (Custom Variables/Functions):** Plugins shall be able to expose custom functions or variables accessible via the templating engine (e.g., `{{myAuthPlugin.getToken()}}`). These functions will be executed each time they are referenced.
- **FR5.5 (Configuration):** Plugins can have their own configuration sections within the main tool configuration.
- **FR5.6 (Execution Order):** If multiple plugins hook into the same event, they shall execute in the order they are defined in the configuration.
- **FR5.7 (Async Operations):** The plugin system and core tool must support asynchronous operations within plugins (e.g., fetching a token).

### 5.6. Output & Logging

- **FR6.1 (Default Output):** For a single successful request or the last successful step of a chain, the raw response body shall be sent to `stdout`. This output must be compatible with piping to Unix tools like `jq`.
- **FR6.2 (Verbose Output):** When `--verbose` is used, additional details (request sent, response status, headers, timing) shall be printed to `stderr`.
- **FR6.3 (Chain Verbose Output):** An optional flag shall allow a chain's output to be a structured JSON object sent to `stdout`, detailing the request and response of each step.
- **FR6.4 (Error Reporting):**
  - Tool errors (config parsing, plugin loading, etc.) and chain execution errors shall be reported to `stderr`.
  - HTTP non-2xx responses are considered valid responses by default and their body sent to `stdout`.
- **FR6.5 (Exit Codes):**
  - `0` for successful execution (including receiving non-2xx HTTP responses by default).
  - Non-zero for tool errors, configuration errors, or chain failures.
  - Non-zero if `--exit-on-http-error` is used and a matching HTTP error occurs.

### 5.7. Core Architecture

- **FR7.1 (Language):** The tool shall be implemented in TypeScript, transpiling to JavaScript for Node.js execution.
- **FR7.2 (Modularity):** The core "engine" or logic should be architected in a way that could potentially support other user interfaces (e.g., Neovim plugin, interactive REPL) in the future, though these are not part of V1.

## 6. Non-Functional Requirements (V1)

- **NFR1 (Usability):**
  - The CLI must be intuitive and easy to learn for users familiar with command-line tools.
  - ZSH completion must be responsive and accurate.
  - Error messages must be clear, informative, and help users troubleshoot issues.
  - Documentation (README, schema) must be comprehensive.
- **NFR2 (Performance):**
  - CLI startup time should be reasonably fast.
  - Request execution and variable processing should not introduce significant overhead compared to other common HTTP clients.
- **NFR3 (Reliability):**
  - The tool must consistently produce correct requests based on configuration.
  - Variable substitution and chain logic must be deterministic.
- **NFR4 (Extensibility):** The plugin API must be well-defined and stable enough for V1.
- **NFR5 (Maintainability):** Code should be well-structured, commented, and leverage TypeScript's type safety.

## 7. Out of Scope (for V1)

- Interactive REPL mode.
- Built-in response assertion/testing framework capabilities (e.g., `expect_status`).
- Advanced/UI-driven file upload handling (though basic body content from a file path might be considered if simple).
- Built-in complex authentication flows (e.g., full OAuth2 client credential grant UIs/prompts). Basic mechanisms or plugin-driven auth are in scope.
- Advanced output templating/formatting beyond raw body or verbose structured data.
- Concurrency within chain steps.
- Tool behavior profiles (distinct from variable profiles).
- Import/Export from/to other formats like Postman collections or OpenAPI specifications (though OpenAPI can inspire schema design).
- Graphical User Interface (GUI).

## 8. Future Considerations (Post-V1)

- Many items listed in "Out of Scope (for V1)" are prime candidates for future versions.
- Support for other shell completions (e.g., Bash, Fish).
- More sophisticated secret management plugin integrations (e.g., HashiCorp Vault, cloud provider secret managers).
- Conditional logic within chains (`run_if` conditions for steps).
- Looping/iteration constructs within chains.

## 9. Success Metrics (Examples)

- Adoption rate by target users.
- Positive feedback regarding ease of use and CLI ergonomics.
- Number of community-contributed plugins (long-term).
- Reduction in time spent by users on repetitive API testing tasks.

---
