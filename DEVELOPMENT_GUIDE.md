# HttpCraft: Development Guide

Welcome to the HttpCraft development guide! This document provides information on how to set up your development environment, build the project, run tests, and understand the core architecture.

## 1. Prerequisites

- Node.js (LTS version recommended, e.g., v18.x or v20.x)
- npm (usually comes with Node.js)
- Git

## 2. Getting Started

### 2.1. Clone the Repository

If you haven't already, clone the project repository:

```bash
git clone <repository_url> httpcraft
cd httpcraft
```

Replace `<repository_url>` with the actual URL of your Git repository.

### 2.2. Install Dependencies

Navigate to the project root directory and install the necessary Node.js dependencies:

```bash
npm install
```

This command reads the `package.json` file and installs all listed dependencies, including TypeScript, CLI parsing libraries, HTTP clients, YAML parsers, testing frameworks, linters, etc.

## 3. Project Structure (High-Level)

A well-organized project structure is key to maintainability. Here's a proposed layout:

```
httpcraft/
├── src/                      # Source code for the application
│   ├── cli/                  # CLI specific logic (argument parsing, command handlers, output formatting)
│   ├── core/                 # Core engine (HTTP client, variable resolution, chains, plugins, config loading)
│   ├── types/                # Custom TypeScript type definitions for the project
│   └── index.ts              # Main entry point for the CLI application (often calls CLI handler)
├── tests/                    # Unit and integration tests
│   ├── unit/                 # Unit tests for individual modules/functions
│   └── integration/          # Integration tests for features spanning multiple modules
│   └── fixtures/             # Test configuration files, mock data, sample API responses
├── examples/                 # Example HttpCraft YAML configuration files (as in EXAMPLES.md)
│   └── plugins/              # Example local plugins for demonstration and testing
├── schemas/                  # JSON Schemas for validating HttpCraft YAML configuration files
├── docs/                     # Project documentation (PRD.md, PIP.md, this guide, etc.)
├── .eslintrc.js              # ESLint configuration file (for code linting rules)
├── .prettierrc.json          # Prettier configuration file (for code formatting rules)
├── vitest.config.js            # Vitest configuration file for the testing framework
├── tsconfig.json             # TypeScript compiler options
├── package.json              # NPM package manifest: project metadata, scripts, dependencies
├── package-lock.json         # Lockfile for precise dependency versions
└── README.md                 # Main project README with overview and basic usage
```

## 4. Common Development Tasks

### 4.1. Building the Project

HttpCraft is written in TypeScript and needs to be compiled into JavaScript to be run by Node.js.

```bash
npm run build
```

This command typically executes `tsc` (the TypeScript Compiler) based on the settings in `tsconfig.json`. The compiled JavaScript files are usually output to a `dist/` directory.

### 4.2. Running the CLI (During Development)

There are several ways to run the CLI while developing:

- **Using `ts-node` (for quick execution without an explicit build step):**
  `ts-node` allows you to run TypeScript files directly.

  ```bash
  npx ts-node ./src/index.ts <your_httpcraft_commands_and_args>
  # Example:
  npx ts-node ./src/index.ts --config examples/01_basic_config.yaml jsonplaceholder getTodo --verbose
  ```

- **Running the built version:**
  First, build the project, then run the JavaScript output.

  ```bash
  npm run build
  node ./dist/index.js <your_httpcraft_commands_and_args>
  ```

- **Linking for global-like access (optional but convenient):**
  This makes your local development version of `httpcraft` runnable directly from any directory, just like a globally installed CLI tool.
  1.  Build the project:
      ```bash
      npm run build
      ```
  2.  In the project root directory, run:
      ```bash
      npm link
      ```
      This creates a global symbolic link pointing to your local project.
  3.  Now you can run `httpcraft` from anywhere:
      ```bash
      httpcraft --config examples/01_basic_config.yaml jsonplaceholder getTodo
      ```
  4.  To remove the global link when you're done or want to switch projects:
      ```bash
      npm unlink
      ```
      (You might need to run `npm unlink httpcraft` if you specified a package name during link).

### 4.3. Running Tests

Automated tests are crucial for ensuring code quality and preventing regressions.

```bash
npm test # Runs all tests defined in the project
npm run test:watch # Runs tests in watch mode, re-running them when files change
npm run test:coverage # Runs tests and generates a code coverage report
```

You can often run specific test files or suites by passing additional arguments to the test runner (e.g., `npm test -- src/core/variableResolver.test.ts` when using Vitest).

### 4.4. Linting and Formatting

Maintaining a consistent code style and catching potential errors early is important.

- **Linting (e.g., ESLint):**
  ```bash
  npm run lint     # Check for linting errors
  npm run lint:fix # Attempt to automatically fix linting errors
  ```
- **Formatting (e.g., Prettier):**
  `bash
npm run format     # Check for formatting issues
npm run format:fix # Automatically format code
`
  It's highly recommended to set up your code editor to automatically lint and format your code on save, using the project's ESLint and Prettier configurations.

## 5. Core Architectural Concepts

For detailed feature specifications, always refer to the **[Product Requirements Document (PRD.md)](./PRD.md)** and the **[Phased Implementation Plan (PIP.md)](./PIP.md)**.

Key components of the HttpCraft architecture will likely include:

- **CLI Parser (`src/cli/parser.ts` or similar):**

  - Responsible for defining and parsing command-line arguments, options, and subcommands.
  - Dispatches execution to appropriate command handlers based on parsed input.
  - Libraries like `yargs` or `commander` are commonly used for this.

- **Configuration Loader (`src/core/configLoader.ts`):**

  - Handles finding, loading, and parsing HttpCraft's YAML configuration files.
  - Manages merging configurations from multiple sources (main file, imported files, profiles, variables).
  - Validates the configuration structure (potentially against a JSON Schema).

- **Variable Resolver (`src/core/variableResolver.ts`):**

  - Implements the logic for substituting `{{variable}}` syntax in strings.
  - Manages the defined variable precedence order.
  - Sources variables from CLI arguments, environment variables, profiles, API/endpoint/chain definitions, plugins, secrets, and dynamic generators.

- **HTTP Client Wrapper (`src/core/httpClient.ts`):**

  - An abstraction layer over the chosen low-level HTTP client library (e.g., `axios`, `node-fetch`).
  - Standardizes how HTTP requests are made and how responses (and errors) are initially handled.
  - May include features like retry logic or default timeouts if specified.

- **Chain Processor (`src/core/chainProcessor.ts`):**

  - Orchestrates the execution of chained requests as defined in the configuration.
  - Manages the flow of data between steps in a chain (e.g., extracting a value from one response to use in the next request).
  - Handles error propagation within chains.

- **Plugin Manager (`src/core/pluginManager.ts`):**

  - Responsible for discovering, loading, and initializing plugins (both local and from npm).
  - Manages the registration and invocation of plugin hooks (e.g., pre-request, post-response).
  - Facilitates plugins exposing custom variables or functions to the variable resolver.

- **Output Formatter (`src/cli/output.ts` or integrated into command handlers):**
  - Controls how data (response bodies, verbose logs, error messages, dry-run information) is presented to the user on `stdout` and `stderr`.
  - Ensures output is pipe-friendly where appropriate.

## 6. Debugging

- **`console.log`:** The simplest way to inspect variables and flow during development.
- **Node.js Debugger:** Utilize the built-in Node.js debugger, often integrated with IDEs like VS Code.
  - You can launch `ts-node` scripts with debug flags.
  - Example `launch.json` configuration for VS Code (place in `.vscode/launch.json`):
    ```json
    {
      "version": "0.2.0",
      "configurations": [
        {
          "type": "node",
          "request": "launch",
          "name": "Debug HttpCraft CLI",
          "runtimeArgs": [
            "-r",
            "ts-node/register" // Register ts-node for TypeScript execution
          ],
          "args": [
            "${workspaceFolder}/src/index.ts" // Path to your main CLI entry point
            // Add your HttpCraft arguments here for testing a specific command
            // e.g., "--config", "examples/01_basic_config.yaml", "jsonplaceholder", "getTodo"
          ],
          "cwd": "${workspaceFolder}", // Set current working directory to project root
          "internalConsoleOptions": "openOnSessionStart",
          "skipFiles": [
            "<node_internals>/**", // Skip stepping into Node.js internal files
            "node_modules/**" // Skip stepping into node_modules
          ]
        }
      ]
    }
    ```
    With this, you can set breakpoints in your TypeScript code and step through execution.

## 7. Contribution Guidelines (General Placeholder)

When contributing code (whether human or agent):

- **Follow Code Style:** Adhere to the existing code style, which should be largely enforced by Prettier and ESLint.
- **Write Tests:** New features and bug fixes should be accompanied by unit tests and, where appropriate, integration tests.
- **Ensure Tests Pass:** All tests must pass before code is considered complete for a task. `npm test` should be green.
- **Update Documentation:** If changes affect user-facing features, configuration options, or internal architecture significantly, update relevant documents (`README.md`, `PRD.md`, `EXAMPLES.md`, this guide).
- **Keep Commits Focused:** Make small, atomic commits that address a single concern or task.
- **Clear Commit Messages:** Write clear and descriptive commit messages (e.g., "feat(core): Implement profile variable loading" or "fix(cli): Correctly parse multi-word var values").

## 8. Key Dependencies (Examples - Actuals in `package.json`)

The `package.json` file will be the source of truth for dependencies. Common ones you might expect for this project include:

- **Core:**
  - `typescript`: For TypeScript language support.
  - `ts-node`: To execute TypeScript files directly during development.
- **CLI:**
  - `yargs` or `commander`: For robust command-line argument parsing and help generation.
- **HTTP:**
  - `axios` or `node-fetch` (or similar): For making HTTP/S requests.
- **Configuration:**
  - `js-yaml`: For parsing YAML configuration files.
- **Utilities:**
  - `jsonpath-plus`: For JSONPath expressions used in chains.
  - Possibly a lightweight templating engine if simple regex isn't sufficient for `{{var}}`.
- **Development & Testing:**
  - `vitest`: Testing framework.
  - `eslint` and associated plugins (e.g., `@typescript-eslint/eslint-plugin`): For code linting.
  - `prettier` and associated plugins: For code formatting.
  - `@types/node`: Type definitions for Node.js built-in modules.

---

This development guide aims to provide a comprehensive starting point. As the project evolves, keep this document updated with any new conventions, tools, or architectural decisions.
