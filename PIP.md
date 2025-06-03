# HttpCraft: Phased Implementation Plan (V1)

**Version:** 1.0
**Date:** October 26, 2023

## Guiding Principles

- **Incremental Value:** Each task, where feasible, should aim for a small, testable increment.
- **Testability:** The output of each task/sub-phase should be runnable and verifiable.
- **Core First:** Build foundational elements before complex features.
- **Iterative Refinement:** Early architectural decisions might be revisited.

---

## Phase 0: Project Setup & Core Shell

- **Goal:** Establish the project structure, basic CLI argument parsing, and a minimal runnable application.
- **Tasks:**
  - **T0.1:** Initialize TypeScript project with `npm init`, install `typescript`, `ts-node`, `@types/node`.
    - _Testable Outcome:_ `npx ts-node src/index.ts` runs without error (empty file).
  - **T0.2:** Configure `tsconfig.json` for compilation options (outDir, rootDir, target, module).
    - _Testable Outcome:_ `npx tsc` compiles successfully.
  - **T0.3:** Setup basic linting and formatting (ESLint, Prettier).
    - _Testable Outcome:_ Linting and formatting commands run successfully.
  - **T0.4:** Setup a testing framework (Vitest).
    - _Testable Outcome:_ A simple dummy test passes.
  - **T0.5:** Create basic project directory structure (`src/`, `src/cli/`, `src/core/`, `tests/`, `docs/`, `config_examples/`).
    - _Testable Outcome:_ Directory structure exists.
  - **T0.6:** Implement a CLI entry point (`src/index.ts` or `src/cli/main.ts`) with a shebang and make it executable.
    - _Testable Outcome:_ `./dist/index.js` (after build) or `npx ts-node src/index.ts` can be run.
  - **T0.7:** Integrate a CLI argument parsing library (e.g., `yargs`).
    - _Testable Outcome:_ Basic argument parsing works for a test command.
  - **T0.8:** Implement a `--version` command.
    - _Testable Outcome:_ `httpcraft --version` displays a hardcoded version string.
  - **T0.9:** Implement a basic `--help` output via the CLI library.
    - _Testable Outcome:_ `httpcraft --help` displays usage for `--version`.

---

## Phase 1: Core HTTP Request & Basic Output

- **Goal:** Enable sending a single, hardcoded HTTP GET request and displaying its raw body.
- **Tasks:**
  - **T1.1:** Integrate an HTTP client library (e.g., `axios`).
    - _Testable Outcome:_ Can make a request to a public API programmatically in a test script.
  - **T1.2:** Create a new command (e.g., `httpcraft request <url>`) that takes a URL argument.
    - _Testable Outcome:_ `httpcraft request https://jsonplaceholder.typicode.com/todos/1` is recognized.
  - **T1.3:** Implement the logic for the `request` command to make a GET request to the provided URL.
    - _Testable Outcome:_ The command makes the HTTP call.
  - **T1.4:** Implement basic output: print the raw response body to `stdout`.
    - _Testable Outcome:_ Response body from the test URL is printed to `stdout`.
  - **T1.5:** Implement basic error handling for network issues (e.g., host not found, timeout).
    - _Testable Outcome:_ Errors are printed to `stderr`, and the tool exits with a non-zero code.
  - **T1.6:** Implement basic error handling for HTTP error statuses (e.g., 404, 500). For now, print body to `stdout` and error info to `stderr`, exit 0.
    - _Testable Outcome:_ Requesting a non-existent URL (404) still prints body (if any) and shows error info.

---

## Phase 2: Basic YAML Configuration & Single Endpoint Invocation

- **Goal:** Load API and endpoint definitions from a YAML file and invoke a specific endpoint. No variable substitution yet.
- **Tasks:**
  - **T2.1:** Integrate a YAML parsing library (e.g., `js-yaml`).
    - _Testable Outcome:_ Can parse a simple YAML string/file in a test.
  - **T2.2:** Define a basic YAML structure for `apis.<api_name>.baseUrl` and `apis.<api_name>.endpoints.<endpoint_name>.path` and `apis.<api_name>.endpoints.<endpoint_name>.method`.
    - _Testable Outcome:_ Schema draft exists.
  - **T2.3:** Implement logic to load and parse a specified YAML configuration file (e.g., via `--config myconfig.yaml`). If no config is specified, search in order: 1) `./.httpcraft.yaml` or `./.httpcraft.yml` in current directory, 2) `$HOME/.config/httpcraft/config.yaml` as the default global location.
    - _Testable Outcome:_ Tool can load a sample config file without errors and follows the correct search order.
  - **T2.4:** Implement the primary command structure: `httpcraft <api_name> <endpoint_name>`.
    - _Testable Outcome:_ CLI parser recognizes this command pattern.
  - **T2.5:** Implement logic to find the specified `api_name` and `endpoint_name` in the loaded config.
    - _Testable Outcome:_ Given a config and command, the correct endpoint data (URL parts, method) is retrieved internally.
  - **T2.6:** Construct the full URL from `baseUrl` and `endpoint.path`.
    - _Testable Outcome:_ Full URL is correctly assembled.
  - **T2.7:** Execute the HTTP request based on the retrieved method and constructed URL.
    - _Testable Outcome:_ `httpcraft myapi get_item` (with a sample config) invokes the correct URL.
  - **T2.8:** Support defining static `headers` (map) in API and endpoint config; merge them (endpoint overrides API).
    - _Testable Outcome:_ Requests include headers defined in config.
  - **T2.9:** Support defining static `params` (query parameters, map) in API and endpoint config; merge them.
    - _Testable Outcome:_ Requests include query params defined in config.
  - **T2.10:** Handle errors for malformed config, or if API/endpoint is not found.
    - _Testable Outcome:_ Informative errors are shown, non-zero exit code.

---

## Phase 3: Basic Variable Substitution (Environment & CLI)

- **Goal:** Introduce basic variable substitution from OS environment variables and CLI arguments.
- **Tasks:**
  - **T3.1:** Implement a simple templating function for `{{variable}}` substitution in strings (URL, path, header values, query param values).
    - _Testable Outcome:_ A test function can substitute `{{name}}` in "hello {{name}}" with "world".
  - **T3.2:** Implement support for `{{env.VAR_NAME}}` substitution.
    - _Testable Outcome:_ `{{env.USER}}` in a config string is replaced by the OS environment variable `USER`.
  - **T3.3:** Implement support for the `--var <key>=<value>` CLI option (can be specified multiple times).
    - _Testable Outcome:_ Variables passed via CLI are available for substitution.
  - **T3.4:** Define initial variable precedence: CLI (`--var`) > Environment (`env.*`).
    - _Testable Outcome:_ A `--var` overrides an `env.*` variable with the same effective name.
  - **T3.5:** Apply variable substitution to `baseUrl`, `endpoint.path`, header values, and query parameter values.
    - _Testable Outcome:_ Variables are correctly substituted in all these locations.
  - **T3.6:** Implement substitution for path parameters (e.g., `path: /users/{{userId}}`).
    - _Testable Outcome:_ `httpcraft myapi get_user --var userId=123` calls `/users/123`.
  - **T3.7:** Implement error handling for unresolved variables (throw error, halt execution, informative message).
    - _Testable Outcome:_ Using `{{undefined_var}}` causes a clear error.
  - **T3.8:** Support basic stringified body definition in endpoint config and apply variable substitution to it.
    - _Testable Outcome:_ `body: "{\"name\": \"{{username}}\"}"` with `--var username=test` sends the correct JSON string.

---

## Phase 4: Profiles & Expanded Variable Scopes

- **Goal:** Implement profiles and variables at API/Endpoint levels, refining precedence, and support for multiple profile application.
- **Tasks:**
  - **T4.1:** Enhance YAML config to support a top-level `profiles` section, where each profile is a key-value map of variables.
    - _Testable Outcome:_ Config with profiles can be parsed.
  - **T4.2:** Implement the `--profile <name>` CLI option. Allow it to be specified multiple times (e.g., `--profile env_dev --profile user_A`).
    - _Testable Outcome:_ CLI parser accepts multiple `--profile` flags.
  - **T4.3:** Implement logic to load variables from all specified profiles. Define merge strategy if multiple profiles define the same variable (e.g., last profile specified wins for that key).
    - _Testable Outcome:_ Variables from specified profiles are correctly aggregated.
  - **T4.4:** Implement `config.defaultProfile` in the global `config` section of YAML (can be a single profile name or a list of names). If `--profile` is not used, default profiles are loaded.
    - _Testable Outcome:_ Default profile variables are loaded if no `--profile` flag is given.
  - **T4.5:** Enhance YAML config for `apis.<api_name>` and `apis.<api_name>.endpoints.<endpoint_name>` to include their own `variables` sections (key-value maps).
    - _Testable Outcome:_ Config with API/endpoint variables can be parsed.
  - **T4.6:** Implement the updated variable precedence: CLI (`--var`) > Endpoint `variables` > API `variables` > Profile `variables` (merged) > Environment (`env.*`).
    - _Testable Outcome:_ Variables from different scopes override each other correctly according to precedence.
  - **T4.7:** Support YAML objects for request bodies in endpoint config (for JSON). Apply variable substitution to string values within these objects.
    - _Testable Outcome:_ `body: { "name": "{{username}}" }` sends correct JSON with substituted username.

---

## Phase 5: Verbose Output, Dry Run & Exit Code Control

- **Goal:** Implement enhanced output options for debugging and scripting.
- **Tasks:**
  - **T5.1:** Implement the `--verbose` flag.
    - _Testable Outcome:_ Flag is recognized.
  - **T5.2:** Capture request details (resolved URL, method, resolved headers, resolved stringified body) before sending.
    - _Testable Outcome:_ These details are available internally.
  - **T5.3:** If `--verbose`, print captured request details to `stderr`.
    - _Testable Outcome:_ Correct request details appear on `stderr`.
  - **T5.4:** If `--verbose`, print response details (status code, headers, timing information) to `stderr`.
    - _Testable Outcome:_ Correct response details appear on `stderr`.
  - **T5.5:** Implement the `--dry-run` flag. If present, print captured request details (as in T5.3) and do NOT send the HTTP request.
    - _Testable Outcome:_ Request details printed, no actual HTTP call made (verify with network tools or mock).
  - **T5.6:** Implement the `--exit-on-http-error <codes>` flag (e.g., `<codes>` could be "4xx", "5xx", "401,403", or specific codes).
    - _Testable Outcome:_ Tool exits with non-zero code if response status matches criteria and flag is used. Otherwise, exits 0 for HTTP errors.

---

## Phase 6: ZSH Tab Completion (Core)

- **Goal:** Provide basic ZSH tab completion for API and endpoint names.
- **Tasks:**
  - **T6.1:** Research ZSH completion script generation for Node.js CLIs (e.g., using `yargs`'s built-in capabilities if sufficient, or custom script logic).
  - **T6.2:** Implement the `httpcraft completion zsh` command to output a ZSH completion script.
    - _Testable Outcome:_ Command outputs a string that looks like a ZSH script.
  - **T6.3:** The generated script should include logic to call `httpcraft --get-api-names` (new hidden command) to fetch available API names from the current config.
    - _Testable Outcome:_ Hidden command returns a list of API names.
  - **T6.4:** The generated script should complete `api_name` arguments based on the output of `--get-api-names`.
    - _Testable Outcome:_ After sourcing, `httpcraft <TAB>` completes API names.
  - **T6.5:** The generated script should include logic to call `httpcraft --get-endpoint-names <api_name>` (new hidden command) to fetch available endpoint names for a given API.
    - _Testable Outcome:_ Hidden command returns endpoint names for the specified API.
  - **T6.6:** The generated script should complete `endpoint_name` arguments based on the output of `--get-endpoint-names <api_name>`.
    - _Testable Outcome:_ `httpcraft <api_name> <TAB>` completes endpoint names for that API.
  - **T6.7:** Add completion for basic CLI options defined so far (e.g., `--profile`, `--var`, `--verbose`).
    - _Testable Outcome:_ Options are suggested on tab.

---

## Phase 7: Basic Plugin System (Pre-request Hook & Custom Vars)

- **Goal:** Implement a foundational plugin system allowing JS plugins to modify requests and expose variables.
- **Tasks:**
  - **T7.1:** Define the `Plugin` interface (e.g., `setup(context: PluginContext)` method). `PluginContext` would have methods like `registerPreRequestHook`, `registerVariableSource`.
  - **T7.2:** Implement a plugin loader that can import local JS files specified in a `plugins` section of the config (e.g., `plugins: [{path: './my-plugin.js', name: 'myPlugin'}]`).
    - _Testable Outcome:_ A simple plugin file can be loaded, and its `setup` method called.
  - **T7.3:** Implement the "pre-request" hook mechanism. Plugins can register async functions that receive a mutable request object (URL, method, headers, body) and can modify it before sending.
    - _Testable Outcome:_ A test plugin can add/modify a header, and the change is reflected in the actual request.
  - **T7.4:** Implement a mechanism for plugins to register custom variable sources (e.g., `{{plugins.myPlugin.getToken()}}`). These are functions (can be async) that are called during variable resolution.
    - _Testable Outcome:_ `{{plugins.myPlugin.someValue}}` resolves to a value provided by the plugin.
  - **T7.5:** Integrate plugin variable resolution into the main variable substitution logic, defining its precedence (e.g., just above `env.*` or `secret.*`).
    - _Testable Outcome:_ Plugin variables are resolved correctly according to precedence.
  - **T7.6:** Ensure multiple pre-request hooks execute in the order plugins are defined.
    - _Testable Outcome:_ Two plugins modifying the same header apply their changes sequentially.
  - **T7.7:** Implement basic configuration passing to plugins (e.g., `plugins: [{path: '...', name: 'myPlugin', config: {apiKey: '123'}}]`). Plugin can access its config in `setup`.
    - _Testable Outcome:_ Plugin can access its specific config.

---

## Phase 8: Chains (Core Logic & Basic Data Passing)

- **Goal:** Implement core functionality for chained requests, including step execution and data passing.
- **Tasks:**
  - **T8.1:** Define YAML structure for top-level `chains` section. Each chain has `vars` and `steps`. Each step has `id`, `call` (`api_name.endpoint_name`), and optional `with` (for `headers`, `params`, `pathParams`, `body` overrides).
    - _Testable Outcome:_ Sample chain config can be parsed.
  - **T8.2:** Implement the `httpcraft chain <chain_name>` command.
    - _Testable Outcome:_ CLI recognizes the command and identifies the target chain.
  - **T8.3:** Implement sequential execution of steps defined in a chain. For each step, resolve its `call` to an API/endpoint definition.
    - _Testable Outcome:_ Steps are iterated; endpoint lookups are performed.
  - **T8.4:** Implement `chain.vars` and their integration into variable resolution (precedence: CLI > Step `with` > `chain.vars` > Endpoint > ...).
    - _Testable Outcome:_ `chain.vars` are available within step configurations.
  - **T8.5:** Implement `step.with` overrides for request parts (headers, params, pathParams, body). These use the full variable resolution context.
    - _Testable Outcome:_ A step's `with` block can override an endpoint's default body using a `chain.var`.
  - **T8.6:** Store the fully resolved request (URL, method, headers, body) and the full response (status, headers, body) for each executed step.
    - _Testable Outcome:_ This data is accessible internally after a step runs.
  - **T8.7:** Integrate a JSONPath library (e.g., `jsonpath-plus`).
    - _Testable Outcome:_ Can extract data from a JSON object using JSONPath expressions in tests.
  - **T8.8:** Implement variable substitution for `{{steps.<step_id>.response.body.<JSONPath>}}`, `{{steps.<step_id>.response.headers['<Name>']}}`, `{{steps.<step_id>.response.status_code}}`.
    - _Testable Outcome:_ Data from a previous step's response can be used in a subsequent step's `with` block.
  - **T8.9:** Implement variable substitution for `{{steps.<step_id>.request...}}` to access previous step's sent request data.
    - _Testable Outcome:_ Data from a previous step's _request_ can be used.
  - **T8.10:** If a step fails (HTTP error, variable resolution error, JSONPath error), the entire chain halts immediately, and an error is reported.
    - _Testable Outcome:_ Chain stops on first error; subsequent steps are not run.
  - **T8.11:** Default output for a successful chain is the raw response body of the _last_ step.
    - _Testable Outcome:_ Correct output for a successful chain.

---

## Phase 9: Advanced Configuration & Remaining Variables

- **Goal:** Implement remaining configuration aspects like modular imports, global var files, secrets, dynamic variables, and finalize variable precedence.
- **Tasks:**
  - **T9.1:** Implement modular imports for API definitions from a directory (e.g., `apis: - "directory:./apis/"`).
    - _Testable Outcome:_ API files in a directory are loaded and merged.
  - **T9.2:** Implement modular imports for chain definitions from a directory.
    - _Testable Outcome:_ Chain files in a directory are loaded.
  - **T9.3:** Implement loading of global variable files (specified in `variables` list in main config) and integrate into precedence (e.g., below Profiles).
    - _Testable Outcome:_ Variables from global files are resolved.
  - **T9.4:** Implement `{{secret.VAR_NAME}}` resolution. Default provider: OS environment variables.
    - _Testable Outcome:_ `{{secret.API_KEY}}` resolves from `process.env.API_KEY`.
  - **T9.5:** Ensure `{{secret.*}}` variables are masked in `--verbose` and `--dry-run` outputs.
    - _Testable Outcome:_ Secret values are replaced with a placeholder like `[SECRET]` in logs.
  - **T9.6:** Implement built-in dynamic variables: `{{$timestamp}}`, `{{$isoTimestamp}}`, `{{$randomInt}}`, `{{$guid}}`.
    - _Testable Outcome:_ These variables produce expected dynamic values.
  - **T9.7:** Finalize and thoroughly test the full variable precedence order: CLI > Step `with` > `chain.vars` > Endpoint > API > Profile > Global Files > `plugins.*` > `secret.*` > `env.*` > `$dynamic`. (Adjust plugin var precedence as needed).
    - _Testable Outcome:_ Complex scenarios with overriding variables work as expected.

---

## Phase 10: Polish & Remaining V1 Features

- **Goal:** Complete all remaining V1 features, refine documentation, and improve overall polish.
- **Tasks:**
  - **T10.1:** Implement "post-response" plugin hook. Plugins can register async functions that receive the response object and can transform it (e.g., XML to JSON) or its properties before further processing/output.
    - _Testable Outcome:_ A plugin can convert an XML response body to JSON.
  - **T10.2:** Implement API-level plugin configuration. Enhance YAML config to support `plugins` section within API definitions for overriding global plugin configurations.
    - _Testable Outcome:_ API definitions can include plugin configuration overrides that are parsed correctly.
  - **T10.3:** Implement plugin configuration merging. When an API defines plugin configuration, merge it with global plugin config (API-level overwrites global keys).
    - _Testable Outcome:_ Plugin receives merged configuration with API-level values taking precedence over global values.
  - **T10.4:** Implement variable substitution in API-level plugin configurations using the same `{{variable}}` syntax as other configuration elements.
    - _Testable Outcome:_ Variables in API-level plugin configs are resolved using the current variable context.
  - **T10.5:** Implement validation for API-level plugin references. If an API references a plugin name not defined globally, report error and halt execution.
    - _Testable Outcome:_ Tool exits with informative error when API references undefined plugin.
  - **T10.6:** Update YAML schema to include API-level plugin configuration with validation rules for plugin name references and configuration structure.
    - _Testable Outcome:_ Schema validates API-level plugin configurations and rejects invalid references.
  - **T10.7:** Implement plugin loading from npm (e.g., `plugins: [{npmPackage: 'httpcraft-s3-auth', name: 's3Auth'}]`). This involves `npm install` mechanics or dynamic import.
    - _Testable Outcome:_ A simple npm-published plugin can be loaded and used.
  - **T10.8:** Implement chain verbose output: an optional flag (e.g., `--chain-output full`) to output a structured JSON object of all steps' resolved requests and responses to `stdout`.
    - _Testable Outcome:_ Flag produces detailed JSON output for chain debugging.
  - **T10.9:** Refine ZSH completion: Add completion for chain names (`httpcraft chain <TAB>`). Add completion for more CLI options.
    - _Testable Outcome:_ Chain names and all relevant options are completable.
  - **T10.10:** Write comprehensive README.md: installation, quick start, detailed usage, configuration file structure, variable precedence, chain examples, plugin development guide.
    - _Testable Outcome:_ Documentation is clear and covers all features.
  - **T10.11:** Create/document the YAML schema for configuration files.
    - _Testable Outcome:_ Schema file exists and is usable with YAML linters/editors.
  - **T10.12:** Conduct thorough end-to-end testing of diverse scenarios, including edge cases for all features.
    - _Testable Outcome:_ High test coverage, major bugs identified and fixed.
  - **T10.13:** Code review, cleanup, and minor performance optimizations if identified as necessary.
    - _Testable Outcome:_ Code quality meets standards.
  - **T10.14:** Prepare for V1 release (e.g., version bump, changelog).

---

This more detailed breakdown should provide clearer, individually testable steps. The multiple profile loading logic is now integrated into Phase 4. Remember that some tasks might spawn sub-tasks as you get into the implementation details. Good luck!
