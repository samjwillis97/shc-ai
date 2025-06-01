# HttpCraft: Example Configurations

This document provides example YAML configurations to illustrate various features of HttpCraft. These can be used for testing, documentation, and as a reference for development.

---

## 1. Basic Configuration

Defines a single API with simple GET and POST endpoints. No variables or profiles. This is a good starting point for testing basic request execution.

**File:** `examples/01_basic_config.yaml`

## 2. Configuration with Variables and Profiles

Demonstrates environment variables, profile variables, and API/endpoint specific variables, showcasing the variable precedence.

**File**: `examples/02_with_variables_and_profiles.yaml`

## 3. Multiple Profiles Applied

Illustrates how variables might be structured if multiple profiles (e.g., env=prod, user=userA) are active. The exact merging strategy for multiple profiles (e.g., last one specified for a given key wins) will be defined by the tool.

**File**: `examples/03_multiple_profiles_applied.yaml`

## 4. Simple Chain

A two-step chain: create a resource, then get it, demonstrating data passing from a response body.

**File**: `examples/04_simple_chain.yaml`

## 5. Chain Calling Different APIs

Demonstrates a chain that interacts with two different (hypothetical) services.

**File**: `examples/05_multi_api_chain.yaml`

## 6. Plugin Usage Example

Shows how a local plugin might be configured and its exposed variables/functions used.

**File**: `examples/06_with_plugins.yaml`

## 7. Secrets Usage

Illustrates referencing secrets, which would typically be sourced from environment variables.

**File**: `examples/07_with_secrets.yaml`

## 8. Dynamic Variables Usage

Shows built-in dynamic variables in action.

**File**: `examples/08_with_dynamic_variables.yaml`

## 9. Comprehensive Example (Modular Setup)

Illustrates a more complex setup with modular configuration files.

**Directory Structure:**

```
examples/09_modular_setup/
├── httpcraft.yaml         (main config, imports others)
├── apis/
│   ├── SsoService.yaml
│   └── ProductService.yaml
├── chains/
│   └── UserOnboarding.yaml
├── profiles/
│   ├── development.yaml
│   └── production.yaml
└── vars/
    └── global.yaml
```
