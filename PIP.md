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
  - **T10.15:** Implement parameterized plugin functions to support function call syntax with arguments like `{{plugins.myPlugin.getKey("keyName", "environment")}}` for enhanced plugin flexibility and reusability.
  - **T10.16:** Implement profile name completion for `--profile` option in ZSH tab completion.
    - _Testable Outcome:_ `httpcraft --profile <TAB>` completes with available profile names from configuration.

---

## Phase 11: OAuth2 Authentication (V1 Addition)

- **Goal:** Implement comprehensive OAuth2 authentication support as a built-in plugin for HttpCraft v1 release.
- **Tasks:**
  - **T11.1:** Research OAuth2 specification and common provider implementations (Auth0, Azure AD, Google, Okta).
    - _Testable Outcome:_ OAuth2 flows and provider requirements documented.
  - **T11.2:** Design OAuth2 plugin architecture compatible with existing plugin system.
    - _Testable Outcome:_ Plugin interface supports OAuth2 requirements.
  - **T11.3:** Implement OAuth2 Client Credentials Grant flow for server-to-server authentication.
    - _Testable Outcome:_ Plugin can obtain access tokens using client credentials.
  - **T11.4:** Implement OAuth2 Authorization Code Grant flow with PKCE support for user authentication.
    - _Testable Outcome:_ Plugin can exchange authorization codes for access tokens.
  - **T11.5:** Implement OAuth2 Refresh Token Grant flow for automatic token renewal.
    - _Testable Outcome:_ Plugin can refresh expired access tokens.
  - **T11.6:** Implement intelligent token caching with expiration handling.
    - _Testable Outcome:_ Tokens are cached and automatically renewed before expiration.
  - **T11.7:** Add support for multiple authentication methods (Basic and POST).
    - _Testable Outcome:_ Plugin supports both client authentication methods.
  - **T11.8:** Integrate OAuth2 plugin with variable system for manual token access.
    - _Testable Outcome:_ Tokens accessible via `{{plugins.oauth2.accessToken}}` syntax.
  - **T11.9:** Implement parameterized functions for dynamic scope management.
    - _Testable Outcome:_ `{{plugins.oauth2.getTokenWithScope('scope')}}` works correctly.
  - **T11.10:** Add security features including token masking in verbose output.
    - _Testable Outcome:_ Tokens are masked in logs and dry-run output.
  - **T11.11:** Create comprehensive documentation and examples for major OAuth2 providers.
    - _Testable Outcome:_ Documentation covers Auth0, Azure AD, Google, Okta configurations.
  - **T11.12:** Implement comprehensive unit and integration tests for OAuth2 plugin.
    - _Testable Outcome:_ 45+ test cases covering all OAuth2 flows and error scenarios.
  - **T11.13:** Ensure seamless integration with existing HttpCraft features (chains, profiles, API-level config).
    - _Testable Outcome:_ OAuth2 works correctly with all existing features.

---

This more detailed breakdown provides a comprehensive OAuth2 implementation that addresses enterprise authentication needs while maintaining HttpCraft's plugin-driven architecture. The OAuth2 plugin is production-ready and supports the most common authentication scenarios required by modern API consumers.

---

This more detailed breakdown should provide clearer, individually testable steps. The multiple profile loading logic is now integrated into Phase 4. Remember that some tasks might spawn sub-tasks as you get into the implementation details. Good luck!

## Phase 12: Test Reliability & Production Readiness

- **Goal:** Fix remaining test failures and improve test reliability for production readiness.
- **Tasks:**
  - **T12.1:** **[HIGH PRIORITY]** Replace external HTTP service dependencies with local mock server for integration tests.
    - _Issue:_ 20+ integration tests failing due to httpbin.org returning HTTP 503 errors instead of expected JSON responses.
    - _Testable Outcome:_ All integration tests pass consistently without relying on external services.
  - **T12.2:** **[HIGH PRIORITY]** Fix YAML configuration generation in parameterized plugin function tests.
    - _Issue:_ Tests generating malformed YAML configs with quote escaping and indentation problems.
    - _Testable Outcome:_ Dynamic test configurations generate valid YAML that passes parsing.
  - **T12.3:** **[MEDIUM PRIORITY]** Improve chain execution test reliability and error handling expectations.
    - _Issue:_ Chain tests have inconsistent exit code expectations and service-dependent failures.
    - _Testable Outcome:_ Chain execution tests pass reliably with proper error handling scenarios.
  - **T12.4:** **[MEDIUM PRIORITY]** Fix exit-on-http-error test expectations and error message patterns.
    - _Issue:_ Tests expecting specific error message formats that don't match actual output.
    - _Testable Outcome:_ Exit-on-http-error functionality tests pass with correct error expectations.
  - **T12.5:** **[MEDIUM PRIORITY]** Implement robust test cleanup and isolation for integration tests.
    - _Issue:_ Some integration tests may interfere with each other due to temp file cleanup issues.
    - _Testable Outcome:_ All integration tests run independently without side effects.
  - **T12.6:** **[LOW PRIORITY]** Add retry logic and fallback handling for external service availability in tests.
    - _Issue:_ Tests fail when external services are temporarily unavailable.
    - _Testable Outcome:_ Tests have graceful fallback when external services are unreachable.
  - **T12.7:** **[LOW PRIORITY]** Optimize test execution performance and reduce external dependencies.
    - _Issue:_ Test suite takes considerable time due to real HTTP requests.
    - _Testable Outcome:_ Test suite runs faster with improved mocking strategies.
  - **T12.8:** **[CLEANUP]** Code review, cleanup, and minor performance optimizations.
    - _Issue:_ Final code quality improvements before v1.0 release.
    - _Testable Outcome:_ Code meets production quality standards.
  - **T12.9:** **[RELEASE]** Prepare for V1.0 release with version bump and changelog.
    - _Issue:_ Final release preparation tasks.
    - _Testable Outcome:_ V1.0 release is ready for distribution.

---

## Phase 13: Enhanced Profile Merging & User Experience Improvements

- **Goal:** Improve profile handling by combining default profiles with CLI-specified profiles for a more intuitive and user-friendly experience.
- **Tasks:**
  - **T13.1:** **[ENHANCEMENT]** Implement additive profile merging behavior.
    - _Current Issue:_ CLI `--profile` completely overrides `config.defaultProfile`, requiring users to specify all needed profiles explicitly
    - _User Impact:_ Users must remember to include base profiles (e.g., `--profile kaos --profile me`) even when they just want to add user-specific variables
    - _Implementation:_ Modify profile loading logic to combine default profiles with CLI profiles
    - _Logic Flow:_
      1. Start with profiles from `config.defaultProfile` (if any)
      2. Add profiles specified via CLI `--profile` flags
      3. Merge all profiles using existing precedence rules (later profiles override earlier ones for conflicting keys)
    - _Testable Outcome:_ `httpcraft --profile me myapi endpoint` loads both default `kaos` profile (base config) and `me` profile (user config), with `me` taking precedence for conflicts
  - **T13.2:** **[IMPLEMENTATION]** Update CLI command handlers for additive profile behavior.
    - _Files to Modify:_
      - `src/cli/commands/api.ts`: Update profile loading logic around lines 67-95
      - `src/cli/commands/chain.ts`: Update profile loading logic around lines 51-94
    - _Current Code Pattern:_
      ```typescript
      let profileNames: string[] = [];
      if (args.profiles && args.profiles.length > 0) {
        // Use profiles specified via CLI
        profileNames = args.profiles;
      } else if (config.config?.defaultProfile) {
        // Use default profile(s) from config
        profileNames = Array.isArray(config.config.defaultProfile) 
          ? config.config.defaultProfile 
          : [config.config.defaultProfile];
      }
      ```
    - _Enhanced Code Pattern:_
      ```typescript
      let profileNames: string[] = [];
      
      // Always start with default profiles (if any)
      if (config.config?.defaultProfile) {
        profileNames = Array.isArray(config.config.defaultProfile) 
          ? [...config.config.defaultProfile] 
          : [config.config.defaultProfile];
      }
      
      // Add CLI-specified profiles (unless --no-default-profile is used)
      if (args.profiles && args.profiles.length > 0) {
        if (args.noDefaultProfile) {
          // Override: use only CLI profiles
          profileNames = args.profiles;
        } else {
          // Additive: combine default + CLI profiles
          profileNames = [...profileNames, ...args.profiles];
        }
      }
      ```
    - _Testable Outcome:_ Profile loading logic correctly combines default and CLI profiles in the expected order
  - **T13.3:** **[CLI OPTION]** Add `--no-default-profile` flag for explicit override behavior.
    - _Purpose:_ Allow users to explicitly ignore default profiles when they want only specific profiles
    - _Interface Changes:_
      - Add `noDefaultProfile?: boolean` to `ApiCommandArgs` and `ChainCommandArgs` interfaces
      - Add `--no-default-profile` to yargs CLI configuration
      - Update help text to explain the flag's behavior
    - _Use Cases:_
      - Testing with isolated profile configurations
      - Temporary override of default environment for specific requests
      - Migration scenarios where default profiles conflict with new configurations
    - _Testable Outcome:_ `httpcraft --no-default-profile --profile me myapi endpoint` loads only `me` profile, completely ignoring default profiles
  - **T13.4:** **[TESTING]** Implement comprehensive test coverage for enhanced profile behavior.
    - _Unit Tests:_ (`tests/unit/cli/commands/`)
      - Test profile merging logic with various combinations of default and CLI profiles
      - Test `--no-default-profile` flag behavior
      - Test edge cases: missing profiles, empty profiles, conflicting variable names
      - Test backward compatibility with existing profile configurations
    - _Integration Tests:_ (`tests/integration/`)
      - Test real HTTP requests with combined default + CLI profile configurations
      - Test variable resolution with layered profile variables
      - Test error scenarios: undefined profiles in default or CLI specifications
      - Test verbose output showing profile merging process
    - _Example Test Scenarios:_
      ```typescript
      // Test additive behavior
      it('should combine default profiles with CLI profiles', async () => {
        config.config.defaultProfile = ['base', 'env'];
        args.profiles = ['user'];
        // Expected: ['base', 'env', 'user'] merged in order
      });
      
      // Test override behavior  
      it('should ignore default profiles with --no-default-profile', async () => {
        config.config.defaultProfile = ['base', 'env'];
        args.profiles = ['user'];
        args.noDefaultProfile = true;
        // Expected: only ['user'] loaded
      });
      ```
    - _Testable Outcome:_ 100% test coverage for profile merging scenarios with clear test documentation
  - **T13.5:** **[DOCUMENTATION]** Update all documentation for enhanced profile behavior.
    - _README.md Updates:_
      - Update profile section to explain additive behavior
      - Add examples showing default + CLI profile combinations
      - Document `--no-default-profile` flag usage
      - Update CLI options table with new flag
    - _Examples to Add:_
      ```yaml
      # Example: Base configuration
      config:
        defaultProfile: ["development", "auth"]
      
      profiles:
        development:
          apiUrl: "https://dev-api.example.com"
          debug: true
        auth:
          clientId: "dev-client-id"
          authUrl: "https://dev-auth.example.com"
        user_alice:
          userId: "alice"
          email: "alice@example.com"
      ```
      ```bash
      # Enhanced behavior: gets development + auth + user_alice
      httpcraft --profile user_alice myapi getUser
      
      # Override behavior: gets only user_alice  
      httpcraft --no-default-profile --profile user_alice myapi getUser
      ```
    - _Migration Guide:_
      - Explain how existing configurations will behave with new profile merging
      - Provide guidance for users who might be affected by the behavior change
      - Show how to achieve old behavior using `--no-default-profile` if needed
    - _Testable Outcome:_ Clear, comprehensive documentation with working examples
  - **T13.6:** **[DEBUGGING]** Enhance verbose output and error handling for profile operations.
    - _Verbose Output Enhancements:_
      - Show which profiles are being loaded (default vs CLI)
      - Display profile merging process and final merged variables
      - Indicate when profiles are missing or have conflicts
    - _Error Message Improvements:_
      - Clear error when default profiles reference non-existent profiles
      - Clear error when CLI profiles reference non-existent profiles  
      - Helpful suggestions when profile merging fails
    - _Example Verbose Output:_
      ```
      [VERBOSE] Loading profiles:
      [VERBOSE]   Default profiles: kaos
      [VERBOSE]   CLI profiles: me
      [VERBOSE]   Final profile order: kaos, me
      [VERBOSE] Merged profile variables:
      [VERBOSE]   cognito-auth-stage: kaos (from kaos profile)
      [VERBOSE]   baseMpUrl: https://api-gateway.nib-cf-test.com (from kaos profile)
      [VERBOSE]   contactNumber: 66298778 (from me profile)
      [VERBOSE]   email: 66298778@members.nib-cf-test.com (from me profile)
      ```
    - _Testable Outcome:_ Enhanced debugging output helps users understand profile merging and troubleshoot issues

---

This more detailed breakdown provides a comprehensive OAuth2 implementation that addresses enterprise authentication needs while maintaining HttpCraft's plugin-driven architecture. The OAuth2 plugin is production-ready and supports the most common authentication scenarios required by modern API consumers.

---

This comprehensive profile enhancement addresses the real-world usability issue discovered in production use and provides a much more intuitive user experience while maintaining full backward compatibility.

---

## Phase 14: Custom Secret Resolver System

- **Goal:** Implement on-demand secret resolution system to solve plugin dependency ordering issues and enable API-specific secret management.
- **Priority:** **HIGH** - Addresses critical production workflow where Plugin A needs secrets from Plugin B's provider
- **User Impact:** Enables API-specific secret mappings and eliminates plugin loading order dependencies
- **Tasks:**
  - **T14.1:** **[CORE ARCHITECTURE]** Design SecretResolver interface and integration points.
    - _Interface Design:_ Define `SecretResolver` type as async function `(secretName: string) => Promise<string | undefined>`
    - _Plugin Context:_ Add `registerSecretResolver(resolver: SecretResolver)` method to PluginContext interface
    - _Integration Points:_ Identify where in VariableResolver to inject custom secret resolution
    - _Precedence Design:_ Custom resolvers tried before environment variable fallback
    - _Testable Outcome:_ SecretResolver interface defined and PluginContext enhanced
  - **T14.2:** **[PLUGIN MANAGER]** Implement secret resolver registration in PluginManager.
    - _Registration Storage:_ Add private `secretResolvers: SecretResolver[]` array to PluginManager
    - _Registration Method:_ Implement `registerSecretResolver(resolver: SecretResolver)` in PluginContext
    - _Resolver Access:_ Add `getSecretResolvers(): SecretResolver[]` public method to PluginManager
    - _API-Level Support:_ Ensure API-specific plugin managers can have different secret resolvers
    - _Testable Outcome:_ Plugins can register secret resolvers that are accessible from PluginManager
  - **T14.3:** **[VARIABLE RESOLVER]** Integrate custom secret resolvers into variable resolution.
    - _Core Integration:_ Modify `VariableResolver.resolveScopedVariable()` for "secret" scope
    - _Resolution Logic:_ Try custom resolvers first, fall back to environment variables
    - _Async Support:_ Handle async secret resolver functions properly
    - _Secret Tracking:_ Ensure resolved secrets are added to secretVariables Set and secretValues Map for masking
    - _Error Handling:_ Proper error handling when secret resolvers fail or timeout
    - _Testable Outcome:_ {{secret.NAME}} syntax uses custom resolvers before environment variables
  - **T14.4:** **[SECRET MASKING]** Ensure custom resolver secrets participate in masking system.
    - _Automatic Tracking:_ Custom resolver results added to VariableResolver.secretValues Map
    - _Masking Integration:_ maskSecrets() method automatically handles custom resolver secrets
    - _Verbose Output:_ Secret values from custom resolvers masked in verbose/dry-run output
    - _Chain Execution:_ Secret masking works in chain step data and outputs
    - _Testable Outcome:_ Secrets from custom resolvers are automatically masked in all output
  - **T14.5:** **[PLUGIN INTEGRATION]** Integrate secret resolvers with API-level plugin overrides.
    - _API-Specific Resolvers:_ API-level plugin configurations can override secret mappings
    - _Plugin Context Creation:_ API-specific plugin managers get API-specific secret resolvers
    - _Configuration Merging:_ Secret resolver configs merged with global → API precedence
    - _Variable Resolution:_ API-level secret mappings resolved using full variable context
    - _Testable Outcome:_ Different APIs can have different secret mappings using same plugin
  - **T14.6:** **[COMPREHENSIVE TESTING]** Implement comprehensive test coverage for secret resolver system.
    - _Unit Tests:_ Test SecretResolver registration, resolution logic, and error handling
    - _Integration Tests:_ Test real secret resolution with API-level configurations
    - _Plugin Tests:_ Test plugin registration and resolution workflows
    - _Masking Tests:_ Test secret masking with custom resolver secrets
    - _API Override Tests:_ Test API-specific secret mappings and precedence
    - _Error Scenario Tests:_ Test failure modes, timeouts, and fallback behavior
    - _Testable Outcome:_ 95%+ test coverage for secret resolver functionality
  - **T14.7:** **[EXAMPLE IMPLEMENTATION]** Create comprehensive secret provider plugin examples.
    - _RQP-Secrets Plugin:_ Create examples/plugins/rqp-secrets.js demonstrating the ideal pattern
    - _Vault Integration:_ Example with HashiCorp Vault KV v1/v2 support
    - _AWS Integration:_ Example with AWS Secrets Manager integration
    - _Azure Integration:_ Example with Azure Key Vault integration
    - _Configuration Examples:_ Complete YAML examples showing global + API-specific usage
    - _Testable Outcome:_ Working plugin examples that demonstrate real-world secret management
  - **T14.8:** **[DOCUMENTATION]** Create comprehensive documentation for secret resolver system.
    - _Plugin Development Guide:_ Document how to create secret provider plugins
    - _API Configuration Guide:_ Document API-specific secret mapping patterns
    - _Migration Guide:_ Help users migrate from environment-only secrets
    - _Security Best Practices:_ Document security considerations and recommendations
    - _Troubleshooting Guide:_ Common issues and debugging approaches
    - _README Integration:_ Add secret resolver section to main README.md
    - _Testable Outcome:_ Complete documentation covering all aspects of secret resolver system
  - **T14.9:** **[PERFORMANCE OPTIMIZATION]** Optimize secret resolver performance and caching.
    - _Caching Strategy:_ Plugin-level caching with configurable TTL
    - _Request Deduplication:_ Avoid multiple requests for same secret within single execution
    - _Async Optimization:_ Parallel secret fetching where possible
    - _Memory Management:_ Proper cache cleanup and memory leak prevention
    - _Testable Outcome:_ Secret resolution performance optimized with intelligent caching
  - **T14.10:** **[ERROR HANDLING]** Implement robust error handling and fallback mechanisms.
    - _Graceful Degradation:_ Fallback to environment variables when custom resolvers fail
    - _Timeout Handling:_ Configurable timeouts for secret resolver operations
    - _Retry Logic:_ Configurable retry attempts for transient failures
    - _Error Propagation:_ Clear error messages indicating secret resolution failures
    - _Partial Failure Handling:_ Continue execution when some secrets fail but others succeed
    - _Testable Outcome:_ Robust error handling with graceful degradation
- **Implementation Details:**
  - **SecretResolver Interface:**
    ```typescript
    type SecretResolver = (secretName: string) => Promise<string | undefined>;
    ```
  - **PluginContext Enhancement:**
    ```typescript
    interface PluginContext {
      // ... existing methods ...
      registerSecretResolver(resolver: SecretResolver): void;
    }
    ```
  - **Variable Resolution Integration:**
    ```typescript
    // In VariableResolver.resolveScopedVariable() for "secret" scope
    if (this.pluginManager) {
      const resolvers = this.pluginManager.getSecretResolvers();
      for (const resolver of resolvers) {
        const result = await resolver(variableName);
        if (result !== undefined) {
          this.secretVariables.add(fullVariableName);
          this.secretValues.set(fullVariableName, result);
          return result;
        }
      }
    }
    // Fall back to environment variable
    const envValue = process.env[variableName];
    if (envValue !== undefined) {
      this.secretVariables.add(fullVariableName);
      this.secretValues.set(fullVariableName, envValue);
      return envValue;
    }
    ```
- **Benefits:**
  - **No Dependency Ordering:** ✅ Plugin loading order no longer matters for secret providers
  - **API-Specific Secrets:** ✅ Different APIs can have different secret mappings
  - **On-Demand Fetching:** ✅ Only fetches secrets for the API being used
  - **Automatic Masking:** ✅ Maintains built-in secret masking through {{secret.*}} syntax
  - **Multiple Providers:** ✅ Can use different secret providers for different APIs
  - **Performance:** ✅ Plugin-level caching avoids repeated secret fetching
  - **Unix Piping Compatible:** ✅ Authentication messages to stderr, response body to stdout for seamless tool integration
- **Real-World Usage:**
  ```yaml
  # Global plugin definition
  plugins:
    - path: "./plugins/rqp-secrets.js"
      name: "rqp-secrets"
      config:
        provider: "vault"
        baseUrl: "{{env.VAULT_URL}}"
        token: "{{env.VAULT_TOKEN}}"
  
  # API-specific secret mappings
  apis:
    userAPI:
      plugins:
        - name: "rqp-secrets"
          config:
            secretMapping:
              USER_API_KEY: "user-service/api#key"
              USER_DB_PASSWORD: "user-service/db#password"
      headers:
        Authorization: "Bearer {{secret.USER_API_KEY}}"  # Fetched on-demand
    
    paymentAPI:
      plugins:
        - name: "rqp-secrets"
          config:
            secretMapping:
              PAYMENT_API_KEY: "payment-service/api#key"
              STRIPE_SECRET: "payment-service/stripe#secret"
      headers:
        Authorization: "Bearer {{secret.PAYMENT_API_KEY}}"  # Different secrets
  ```
- **V1+ Ready:** ✅ Secret resolver system addresses critical production workflow issues while maintaining full backward compatibility and automatic secret masking.

---

## Phase 15: Interactive OAuth2 Browser Authentication

- **Goal:** Enhance the existing OAuth2 plugin with interactive browser-based Authorization Code flow similar to Insomnia, enabling automatic browser authentication with secure token storage.
- **Status:** [ ] **PLANNED**
- **Priority:** **HIGH** - Enables modern OAuth2 user authentication workflows
- **User Impact:** Provides seamless browser-based authentication similar to modern API clients
- **Tasks:**
  - **T15.1:** **[CONFIGURATION ENHANCEMENT]** Enhance OAuth2Config interface for interactive flow.
    - _New Configuration Options:_
      - `authorizationUrl`: OAuth2 authorization endpoint URL
      - `audience`: Optional audience parameter for token requests
      - `usePKCE`: Boolean to enable/disable PKCE (default: true)
      - `codeChallengeMethod`: PKCE challenge method ('S256' | 'plain', default: 'S256')
      - `interactive`: Boolean to enable interactive browser flow (auto-detected if not specified)
      - `tokenStorage`: Storage method ('keychain' | 'filesystem' | 'memory', default: auto-detect)
      - `callbackPort`: Optional specific port for callback server (default: auto-select)
      - `callbackPath`: Optional callback path (default: '/callback')
    - _Backward Compatibility:_ All existing OAuth2 configurations continue to work unchanged
    - _Auto-Detection Logic:_ Interactive mode automatically enabled when `grantType: 'authorization_code'`, no `authorizationCode` provided, `authorizationUrl` configured, and running in interactive terminal
    - _Testable Outcome:_ Enhanced OAuth2Config interface supports all interactive flow parameters with proper defaults
  - **T15.2:** **[TOKEN STORAGE SYSTEM]** Implement secure token persistence system.
    - _Storage Implementations:_
      - **Keychain Storage:** Use `keytar` library for secure OS keychain integration (macOS Keychain, Windows Credential Manager, Linux Secret Service)
      - **Filesystem Storage:** Encrypted JSON file storage with user-only permissions as fallback
      - **Memory Storage:** Current in-memory cache as final fallback
    - _Storage Interface:_ Create `TokenStorage` interface with `store()`, `retrieve()`, `remove()` methods
    - _Storage Key Generation:_ Generate unique storage keys based on OAuth2 provider, client ID, and scope
    - _Token Data Structure:_ Store access tokens, refresh tokens, expiration times, token type, and scope
    - _Automatic Fallback:_ Gracefully fallback from keychain → filesystem → memory based on availability
    - _Testable Outcome:_ Tokens are securely stored and retrieved across HttpCraft sessions with proper fallback handling
  - **T15.3:** **[LOCAL CALLBACK SERVER]** Implement temporary HTTP server for OAuth2 callback handling.
    - _Server Implementation:_ Create lightweight HTTP server using Node.js built-in `http` module
    - _Port Management:_ Automatic port selection starting from 8080, incrementing until available port found
    - _Callback Handling:_ Extract authorization code and state parameters from callback URL
    - _Success/Error Pages:_ Serve user-friendly HTML pages indicating authentication success or failure
    - _Security:_ Validate state parameter to prevent CSRF attacks
    - _Timeout:_ Automatic server shutdown after 5 minutes or successful callback
    - _Error Handling:_ Handle port conflicts, server start failures, and malformed callback requests
    - _Testable Outcome:_ Local callback server successfully receives OAuth2 authorization codes with proper security validation
  - **T15.4:** **[BROWSER INTEGRATION]** Implement automatic browser launching and URL generation.
    - _Browser Launching:_ Use `open` npm package to launch system default browser
    - _Authorization URL Generation:_ Build complete authorization URL with all required parameters:
      - PKCE challenge (`code_challenge`, `code_challenge_method`)
      - Random state parameter for security
      - Redirect URI pointing to local callback server
      - All user-configured parameters (scope, audience, client_id)
    - _PKCE Implementation:_ Generate cryptographically secure code verifier and challenge using Node.js crypto
    - _URL Validation:_ Validate authorization URL format and required parameters
    - _Fallback Instructions:_ If browser launch fails, display authorization URL for manual copy/paste
    - _Testable Outcome:_ Browser automatically opens with correct authorization URL containing all required OAuth2 parameters
  - **T15.5:** **[ENHANCED AUTHORIZATION CODE FLOW]** Enhance existing authorization code flow for interactive mode.
    - _Flow Detection:_ Automatically detect when interactive flow is needed based on configuration
    - _Token Exchange:_ Exchange authorization code for access/refresh tokens with full PKCE support
    - _Parameter Support:_ Support all Insomnia-compatible parameters including audience
    - _Error Handling:_ Handle authorization denials, invalid codes, and token exchange failures
    - _Token Caching:_ Integrate with enhanced token storage system
    - _Refresh Integration:_ Seamlessly integrate with existing refresh token flow
    - _Testable Outcome:_ Complete authorization code flow from browser launch to token storage works seamlessly
  - **T15.6:** **[AUTOMATIC TOKEN MANAGEMENT]** Implement intelligent token lifecycle management.
    - _Token Priority:_ Check stored tokens in order: valid access token → refresh token → interactive flow
    - _Automatic Refresh:_ Use stored refresh tokens to renew access tokens before expiration
    - _Storage Integration:_ Persist refreshed tokens to configured storage backend
    - _Expiration Handling:_ Handle token expiration with appropriate grace periods
    - _Cleanup:_ Remove invalid/expired tokens from storage
    - _Cache Synchronization:_ Keep in-memory cache synchronized with persistent storage
    - _Testable Outcome:_ Token lifecycle is fully automated with minimal user interaction required
  - **T15.7:** **[INTERACTIVE FLOW ORCHESTRATION]** Implement complete interactive authentication workflow.
    - _Flow Triggers:_ Automatically trigger interactive flow when needed (no valid tokens available)
    - _User Communication:_ Clear console output indicating authentication status and next steps
    - _Output Channels:_ All authentication status messages and progress indicators sent to `stderr` to maintain Unix piping compatibility (response body goes to `stdout`)
    - _Workflow Steps:_
      1. Check for valid stored access token
      2. Try refresh token if access token expired
      3. Launch interactive flow if no valid tokens
      4. Start local callback server
      5. Generate authorization URL with PKCE
      6. Open browser to authorization URL
      7. Wait for callback with timeout
      8. Exchange code for tokens
      9. Store tokens securely
      10. Proceed with original request
    - _Error Recovery:_ Handle failures at each step with appropriate fallbacks
    - _Testable Outcome:_ Complete end-to-end interactive authentication workflow functions smoothly with proper stderr/stdout separation
  - **T15.8:** **[ENVIRONMENT DETECTION]** Implement automatic detection of interactive capabilities.
    - _Terminal Detection:_ Detect if running in interactive terminal vs CI/automated environment
    - _Environment Variables:_ Check common CI environment variables (CI, CONTINUOUS_INTEGRATION, etc.)
    - _TTY Detection:_ Use Node.js `process.stdout.isTTY` to detect terminal capabilities
    - _Browser Availability:_ Detect if browser launch is possible in current environment
    - _Graceful Degradation:_ Fall back to traditional authorization code flow in non-interactive environments
    - _Configuration Override:_ Allow explicit `interactive: false` to disable browser flow
    - _Testable Outcome:_ Interactive mode is automatically enabled/disabled based on environment capabilities
  - **T15.9:** **[COMPREHENSIVE ERROR HANDLING]** Implement robust error handling for all interactive flow scenarios.
    - _Browser Launch Failures:_ Handle cases where browser cannot be opened (headless environments, etc.)
    - _Callback Server Failures:_ Handle port conflicts, server start failures, and network issues
    - _Authorization Failures:_ Handle user denial, invalid client configuration, and provider errors
    - _Token Exchange Failures:_ Handle network errors, invalid codes, and malformed responses
    - _Storage Failures:_ Handle keychain access denied, filesystem permissions, and storage corruption
    - _Timeout Handling:_ Handle authorization timeout scenarios with appropriate cleanup
    - _Error Messages:_ Provide clear, actionable error messages for each failure scenario
    - _Fallback Instructions:_ Offer manual alternatives when automated flow fails
    - _Testable Outcome:_ All error scenarios are handled gracefully with helpful user guidance
  - **T15.10:** **[TESTING AND DOCUMENTATION]** Implement comprehensive testing and documentation.
    - _Unit Tests:_ Test all new components (storage, server, browser integration, flow orchestration)
    - _Integration Tests:_ Test complete interactive flow with mock OAuth2 provider
    - _Mock Components:_ Create test mocks for browser launching, keychain access, and HTTP servers
    - _Error Scenario Tests:_ Test all error handling paths and fallback mechanisms
    - _Documentation Updates:_
      - Update `docs/oauth2-plugin.md` with interactive flow section
      - Add interactive flow examples to README.md
      - Create troubleshooting guide for common interactive flow issues
      - Update configuration schema with new parameters
    - _Example Configurations:_ Create complete working examples for popular OAuth2 providers
    - _Security Documentation:_ Document security considerations for token storage and callback handling
    - _Testable Outcome:_ Comprehensive test coverage and clear documentation for interactive OAuth2 flow
- **Implementation Details:**
  - **Enhanced OAuth2Config Interface:**
    ```typescript
    interface OAuth2Config {
      // Existing options...
      grantType: 'client_credentials' | 'authorization_code' | 'refresh_token';
      
      // New interactive flow options
      authorizationUrl?: string;           // OAuth2 authorization endpoint
      audience?: string;                   // Optional audience parameter
      usePKCE?: boolean;                   // Enable PKCE (default: true)
      codeChallengeMethod?: 'S256' | 'plain'; // PKCE method (default: 'S256')
      interactive?: boolean;               // Enable interactive browser flow (auto-detected)
      tokenStorage?: 'keychain' | 'filesystem' | 'memory'; // Storage method (auto-detect)
      callbackPort?: number;               // Specific callback port (optional)
      callbackPath?: string;               // Callback path (default: '/callback')
      
      // Enhanced redirect URI handling
      redirectUri?: string;                // Custom redirect URI (optional)
    }
    ```
  - **Token Storage Architecture:**
    ```typescript
    interface StoredTokenData {
      accessToken: string;
      refreshToken?: string;
      idToken?: string;
      expiresAt: number;
      tokenType?: string;
      scope?: string;
      audience?: string;
    }

    interface TokenStorage {
      store(key: string, tokens: StoredTokenData): Promise<void>;
      retrieve(key: string): Promise<StoredTokenData | null>;
      remove(key: string): Promise<void>;
      isAvailable(): Promise<boolean>;
    }
    ```
  - **Interactive Flow Detection:**
    ```typescript
    function shouldUseInteractiveFlow(config: OAuth2Config): boolean {
      // Explicit configuration takes precedence
      if (config.interactive !== undefined) {
        return config.interactive;
      }
      
      // Auto-detect conditions
      return (
        config.grantType === 'authorization_code' &&
        !config.authorizationCode &&              // No pre-obtained code
        config.authorizationUrl &&                // Authorization URL provided
        process.stdout.isTTY &&                   // Interactive terminal
        !isCI() &&                                // Not in CI environment
        isBrowserAvailable()                      // Browser can be launched
      );
    }
    ```
- **User Experience Examples:**
  - **Configuration (Insomnia-Compatible):**
    ```yaml
    plugins:
      - name: "oauth2"
        config:
          grantType: "authorization_code"
          
          # All your requested parameters
          authorizationUrl: "https://auth.example.com/oauth2/authorize"
          tokenUrl: "https://auth.example.com/oauth2/token"
          clientId: "{{env.OAUTH2_CLIENT_ID}}"
          clientSecret: "{{env.OAUTH2_CLIENT_SECRET}}"
          redirectUri: "http://localhost:8080/callback"  # Optional, auto-generated if not provided
          scope: "openid profile email api:read"
          audience: "https://api.example.com"
          usePKCE: true
          codeChallengeMethod: "S256"
          
          # Interactive flow automatically detected
          # tokenStorage: "keychain"  # Optional, auto-detected
    ```
  - **First-Time Authentication:**
    ```bash
    $ httpcraft myapi getUser
    🔐 Authentication required for myapi                        # stderr
    🌐 Opening browser for OAuth2 authentication...            # stderr
    ⏳ Waiting for authorization (timeout: 5 minutes)...        # stderr
    ✅ Authentication successful! Tokens stored securely.      # stderr
    {"user": {"id": 123, "name": "John Doe"}}                  # stdout (for piping)
    ```
  - **Subsequent Requests:**
    ```bash
    $ httpcraft myapi getUser
    🔑 Using stored access token                               # stderr
    {"user": {"id": 123, "name": "John Doe"}}                  # stdout (for piping)
    ```
  - **Automatic Token Refresh:**
    ```bash
    $ httpcraft myapi getUser
    🔄 Access token expired, refreshing...                     # stderr
    ✅ Token refreshed successfully                            # stderr
    {"user": {"id": 123, "name": "John Doe"}}                  # stdout (for piping)
    ```
  - **Unix Piping Compatibility:**
    ```bash
    # Pipe response to jq for processing
    $ httpcraft myapi getUser | jq '.user.name'
    🔐 Authentication required for myapi                        # stderr (visible to user)
    🌐 Opening browser for OAuth2 authentication...            # stderr (visible to user)
    ✅ Authentication successful! Tokens stored securely.      # stderr (visible to user)
    "John Doe"                                                 # stdout (from jq processing)
    
    # Pipe to other Unix tools
    $ httpcraft myapi getUsers | grep -c '"active": true'
    🔑 Using stored access token                               # stderr (visible to user)  
    5                                                          # stdout (grep count result)
    ```
- **New Dependencies:**
  - `