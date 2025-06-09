# Variable Context Creation Analysis

This document analyzes the patterns and reasoning behind variable context creation in HttpCraft, based on the investigation of the plugin parameterized function bug fix.

## Overview

Variable contexts in HttpCraft are created at different stages of request execution with carefully curated sets of available variables. The design follows a principle of **progressive context enrichment** - starting with basic contexts and gradually adding more specific variables as they become available.

## Context Creation Locations

### 1. API Command (`src/cli/commands/api.ts`)

#### Initial Context (Line 141-147)
```typescript
const initialVariableContext = variableResolver.createContext(
  args.variables || {},     // CLI vars - available immediately
  mergedProfileVars,        // Profile vars - resolved from config
  api.variables,            // API vars - from config
  endpoint.variables,       // Endpoint vars - from config
  undefined,                // No plugin variables yet - plugins not loaded
  config.globalVariables   // Global vars - from variable files
);
```

**Reasoning:**
- **CLI vars**: User input has highest precedence, always available
- **Profile vars**: Merged profile data available after profile resolution
- **API/Endpoint vars**: Static configuration data available immediately
- **Plugin vars**: `undefined` because plugins haven't been loaded yet
- **Global vars**: Static global configuration available immediately
- **Parameterized plugins**: `undefined` (missing from parameters) because plugins haven't been loaded

**Purpose:** Used for resolving variables in global plugin configurations before plugin loading.

#### Final Context (Line 198-206)
```typescript
const variableContext = variableResolver.createContext(
  args.variables || {},           // CLI vars
  mergedProfileVars,             // Profile vars
  api.variables,                 // API vars
  endpoint.variables,            // Endpoint vars
  pluginVariableSources,         // Plugin vars - NOW available from loaded plugins
  config.globalVariables,        // Global vars
  parameterizedPluginSources     // Parameterized plugins - NOW available
);
```

**Reasoning:**
- All previous variables remain available
- **Plugin vars**: Now populated from loaded API-specific plugin manager
- **Parameterized plugins**: Now populated from loaded API-specific plugin manager

**Purpose:** Used for final variable resolution in API/endpoint configurations before HTTP execution.

### 2. Chain Executor (`src/core/chainExecutor.ts`)

#### Initial Context (Line 183-189)
```typescript
const initialVariableContext = variableResolver.createContext(
  cliVariables,        // CLI vars - from chain execution
  profiles,            // Profile vars - from chain execution
  undefined,           // No API variables yet - haven't processed step
  undefined,           // No endpoint variables yet - haven't processed step
  undefined,           // No plugin variables yet - plugins not loaded for this step
  config.globalVariables
);
```

**Reasoning:**
- **CLI/Profile vars**: Available from chain execution context
- **API/Endpoint vars**: `undefined` because we haven't processed the step call yet
- **Plugin vars**: `undefined` because step-specific plugins not loaded yet
- **Chain-specific additions**: Chain variables and previous steps added separately

**Purpose:** Used for resolving API-level plugin configurations for the specific step.

#### Final Context (Line 213-220)
```typescript
const variableContext = variableResolver.createContext(
  cliVariables,                    // CLI vars
  profiles,                       // Profile vars
  api.variables,                  // API vars - NOW available from parsed step
  endpoint.variables,             // Endpoint vars - NOW available from parsed step
  pluginVariableSources,          // Plugin vars - from step-specific plugin manager
  config.globalVariables,         // Global vars
  parameterizedPluginSources      // Parameterized plugins - from step-specific plugin manager
);
```

**Purpose:** Used for final variable resolution in step execution with all context available.

### 3. Plugin Manager (`src/core/pluginManager.ts`)

#### Fallback Context (Line 184-191) - BEFORE FIX
```typescript
context = variableResolver.createContext(
  {}, // No CLI variables during plugin loading
  {}, // No profile variables at this stage  
  {}, // No API variables
  {}, // No endpoint variables
  {}, // No plugin variables yet
  {}  // No global variables at this stage
);
```

**Reasoning for Empty Context:**
- **CLI vars**: `{}` because plugin loading shouldn't depend on runtime CLI input
- **Profile vars**: `{}` because plugins should work across different profiles  
- **API/Endpoint vars**: `{}` because plugins should be reusable across APIs
- **Plugin vars**: `{}` because we're in the process of loading plugins
- **Global vars**: `{}` to avoid circular dependencies during loading

#### Enhanced Context (After Fix)
```typescript
// When variableContext provided - merge with global plugin sources
context = {
  ...variableContext,                    // Preserve provided context
  pluginVariables: {
    ...(variableContext.pluginVariables || {}),
    ...this.getVariableSources()         // Add global plugin variables
  },
  parameterizedPluginSources: {
    ...(variableContext.parameterizedPluginSources || {}),
    ...this.getParameterizedVariableSources() // Add global parameterized functions
  }
};
```

**Purpose:** Ensure global plugin functions are available when resolving API-level plugin configurations.

## Design Principles

### 1. Progressive Enrichment
Contexts start minimal and grow as more information becomes available:
- Initial contexts have only static/known variables
- Final contexts include all dynamic/runtime variables

### 2. Dependency Ordering
Variables are included based on when their dependencies are resolved:
- CLI/Profile vars: Available immediately after config loading
- Plugin vars: Available only after plugin loading
- API/Endpoint vars: Available only after parsing the request call

### 3. Scope Isolation
Each execution context (API command, chain step) gets its own plugin manager:
- Prevents plugin state leakage between requests
- Allows API-specific plugin configurations
- Enables proper resource cleanup

### 4. Circular Dependency Prevention
Plugin loading contexts are intentionally minimal:
- Prevents plugins from depending on variables that depend on plugins
- Exception: Global plugin sources are safe to include (bug fix)

## The Bug and Fix

### Root Cause
The bug occurred because the `loadApiPlugins` method was not including global plugin parameterized functions in the context used to resolve API-level plugin configurations. This meant that when an API-level plugin config tried to use `{{plugins.globalPlugin.someFunction()}}`, the function wasn't available.

### Solution
The fix ensures that when a variable context is provided to `loadApiPlugins`, it's enhanced with global plugin sources while preserving all other context data. This allows API-level plugin configurations to use parameterized functions from global plugins while maintaining the proper scoping and dependency order.

### Key Insight
The original empty context approach was correct for the fallback case (when no context is provided), but when a rich context IS provided by the caller, that context should be enhanced rather than ignored.

## Testing Strategy

The comprehensive test suite verifies:

1. **Basic functionality**: Global plugin parameterized functions work in API-level configs
2. **Context merging**: Provided contexts are properly enhanced, not replaced
3. **Fallback behavior**: Empty context still works when no context provided
4. **Real-world scenario**: The exact bug scenario from the user report
5. **Error handling**: Proper errors for non-existent functions
6. **Integration**: End-to-end functionality through the CLI

## Best Practices

1. **Context Creation**: Always provide the richest context available at creation time
2. **Plugin Loading**: Enhance provided contexts rather than creating minimal ones
3. **Variable Precedence**: Maintain the established precedence chain in all contexts
4. **Testing**: Test both individual components and integration scenarios
5. **Documentation**: Document the reasoning behind context decisions for future maintenance 