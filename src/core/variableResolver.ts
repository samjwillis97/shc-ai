/**
 * Variable resolution and substitution for HttpCraft
 * Supports {{variable}} syntax with precedence rules
 */

import { VariableSource, ParameterizedVariableSource, HttpResponse } from '../types/plugin.js';
import { JSONPath } from 'jsonpath-plus';
import type { StepExecutionResult } from './chainExecutor.js';
import dayjs from 'dayjs';

// T10.15: Types for parameterized function calls
export interface FunctionCall {
  pluginName: string;
  functionName: string;
  arguments: FunctionArgument[];
}

export interface FunctionArgument {
  type: 'string' | 'variable';
  value: string;
}

export interface VariableContext {
  cliVariables: Record<string, string>;
  profiles: Record<string, unknown>;
  apiVariables?: Record<string, unknown>;
  endpointVariables?: Record<string, unknown>;
  pluginVariables?: Record<string, Record<string, VariableSource>>;
  globalVariables?: Record<string, unknown>;
  parameterizedPluginSources?: Record<string, Record<string, ParameterizedVariableSource>>;
  chainVars?: Record<string, unknown>;
  steps?: import('./chainExecutor.js').StepExecutionResult[];
  stepWith?: Record<string, unknown>;
  env?: Record<string, string>;
  api?: Record<string, unknown>;
  endpoint?: Record<string, unknown>;
  plugins?: Record<string, Record<string, VariableSource>>;
}

export class VariableResolutionError extends Error {
  public variableName: string;

  constructor(
    message: string,
    public variableNameParam: string
  ) {
    super(message);
    this.variableName = variableNameParam;
    this.name = 'VariableResolutionError';
  }
}

export class VariableResolver {
  private secretVariables: Set<string> = new Set(); // T9.5: Track secret variables for masking
  private secretValues: Map<string, string> = new Map(); // T9.5: Track secret values for masking
  // T14.3: Add PluginManager reference for secret resolvers
  private pluginManager?: import('./pluginManager.js').PluginManager;

  /**
   * T14.3: Set PluginManager instance for secret resolution
   */
  setPluginManager(pluginManager: import('./pluginManager.js').PluginManager): void {
    this.pluginManager = pluginManager;
  }

  /**
   * T9.5: Reset secret tracking (useful for testing or between requests)
   */
  resetSecretTracking(): void {
    this.secretVariables.clear();
    this.secretValues.clear();
  }

  /**
   * T9.5: Get all tracked secret variables
   */
  getSecretVariables(): string[] {
    return Array.from(this.secretVariables);
  }

  /**
   * T9.5: Mask secret values in text for display purposes
   */
  maskSecrets(text: string): string {
    let maskedText = text;

    // For each tracked secret value, replace it with [SECRET]
    for (const [, secretValue] of this.secretValues) {
      if (secretValue && secretValue.length > 0) {
        // Replace all occurrences of the actual secret value with [SECRET]
        // Use a global regex to replace all occurrences
        const escapedValue = secretValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedValue, 'g');
        maskedText = maskedText.replace(regex, '[SECRET]');
      }
    }

    return maskedText;
  }

  /**
   * Resolves variables in a string using {{variable}} syntax
   * Phase 8 precedence: CLI > Step with > Chain vars > Endpoint > API > Profile > Plugins > Environment
   * T10.15: Enhanced to support parameterized plugin function calls
   * T10.16: Enhanced to support nested variable resolution
   */
  async resolve(template: string, context: VariableContext): Promise<string> {
    let resolvedTemplate = template;
    let iterationCount = 0;
    const maxIterations = 10; // Prevent infinite loops

    while (iterationCount < maxIterations) {
      const originalTemplate = resolvedTemplate;

      // T10.16: First pass - resolve any nested variables within variable names
      resolvedTemplate = await this.resolveNestedVariables(resolvedTemplate, context);

      // Process variables sequentially to handle async plugin variables
      const matches = this.extractVariableMatches(resolvedTemplate);

      for (const match of matches) {
        const variableName = match.content.trim();

        // Validate that variable name is not empty
        if (!variableName) {
          throw new VariableResolutionError('Variable name cannot be empty', variableName);
        }

        let resolvedValue: string;

        // T10.15: Check if this is a parameterized function call
        if (this.isParameterizedFunctionCall(variableName)) {
          resolvedValue = await this.resolveParameterizedFunctionCall(variableName, context);
        }
        // Handle scoped variables (e.g., env.VAR_NAME, profile.key, api.key, endpoint.key, plugins.name.variable, steps.stepId.*)
        else if (variableName.includes('.')) {
          resolvedValue = await this.resolveScopedVariable(variableName, context);
        } else {
          // T9.6: Handle built-in dynamic variables first (they start with $)
          if (variableName.startsWith('$')) {
            resolvedValue = this.resolveDynamicVariable(variableName, '', variableName);
          } else {
            // Handle unscoped variables with precedence
            const value = this.resolveUnscopedVariable(variableName, context);
            if (value !== undefined) {
              resolvedValue = this.stringifyValue(value);
            } else {
              throw new VariableResolutionError(
                `Variable '${variableName}' could not be resolved`,
                variableName
              );
            }
          }
        }

        // Replace this specific variable match
        resolvedTemplate = resolvedTemplate.replace(match.fullMatch, resolvedValue);
      }

      // T10.16: Check if the resolved template contains new variables to resolve
      // This handles cases where a variable's value is itself a variable reference
      const hasVariables = this.extractVariableMatches(resolvedTemplate).length > 0;

      // If no more variables or no change in this iteration, we're done
      if (!hasVariables || resolvedTemplate === originalTemplate) {
        break;
      }

      iterationCount++;
    }

    if (iterationCount >= maxIterations) {
      throw new VariableResolutionError(
        'Maximum variable resolution iterations reached. Check for circular references.',
        template
      );
    }

    return resolvedTemplate;
  }

  /**
   * T10.16: Resolves nested variables within variable names only
   * This handles constructs like {{steps.getRecentClaims.response.body.data.{{claimIndex}}.id}}
   */
  private async resolveNestedVariables(
    template: string,
    context: VariableContext
  ): Promise<string> {
    let resolvedTemplate = template;
    let changed = true;

    while (changed) {
      changed = false;

      // Find variables that contain other variables inside their names
      const matches = this.extractVariableMatches(resolvedTemplate);

      for (const match of matches) {
        const variableName = match.content.trim();

        // Check if this variable name contains nested variables (has {{ inside the variable name)
        if (this.containsNestedVariables(variableName)) {
          // Resolve inner variables first
          const resolvedVariableName = await this.resolveInnerVariables(variableName, context);

          // Replace the variable name with the resolved one
          const newVariableMatch = `{{${resolvedVariableName}}}`;
          resolvedTemplate = resolvedTemplate.replace(match.fullMatch, newVariableMatch);
          changed = true;
          break; // Process one at a time to avoid conflicts
        }
      }
    }

    return resolvedTemplate;
  }

  /**
   * T10.16: Checks if a variable name contains nested variables
   */
  private containsNestedVariables(variableName: string): boolean {
    // Look for {{ inside the variable name (excluding the outer braces)
    const innerMatches = this.extractVariableMatches(variableName);
    return innerMatches.length > 0;
  }

  /**
   * T10.16: Resolves inner variables within a variable name
   */
  private async resolveInnerVariables(
    variableName: string,
    context: VariableContext
  ): Promise<string> {
    let resolvedVariableName = variableName;

    // Find and resolve inner variables
    const innerMatches = this.extractVariableMatches(variableName);

    for (const innerMatch of innerMatches) {
      const innerVariableName = innerMatch.content.trim();

      let resolvedInnerValue: string;

      // T10.15: Check if this is a parameterized function call
      if (this.isParameterizedFunctionCall(innerVariableName)) {
        resolvedInnerValue = await this.resolveParameterizedFunctionCall(
          innerVariableName,
          context
        );
      }
      // Handle scoped variables
      else if (innerVariableName.includes('.')) {
        resolvedInnerValue = await this.resolveScopedVariable(innerVariableName, context);
      } else {
        // T9.6: Handle built-in dynamic variables first (they start with $)
        if (innerVariableName.startsWith('$')) {
          resolvedInnerValue = this.resolveDynamicVariable(
            innerVariableName,
            '',
            innerVariableName
          );
        } else {
          // Handle unscoped variables with precedence
          const value = this.resolveUnscopedVariable(innerVariableName, context);
          if (value !== undefined) {
            resolvedInnerValue = this.stringifyValue(value);
          } else {
            throw new VariableResolutionError(
              `Nested variable '${innerVariableName}' could not be resolved`,
              innerVariableName
            );
          }
        }
      }

      // Replace the inner variable with its resolved value
      resolvedVariableName = resolvedVariableName.replace(innerMatch.fullMatch, resolvedInnerValue);
    }

    return resolvedVariableName;
  }

  /**
   * T10.15: Extracts variable matches from a template, handling nested braces correctly
   * Returns array of matches with full match string and content
   */
  private extractVariableMatches(template: string): Array<{ fullMatch: string; content: string }> {
    const matches: Array<{ fullMatch: string; content: string }> = [];
    let i = 0;

    while (i < template.length) {
      // Look for opening {{
      if (i < template.length - 1 && template[i] === '{' && template[i + 1] === '{') {
        const startIndex = i;
        i += 2; // Skip the {{

        let braceCount = 1; // We've seen one opening {{
        let content = '';

        // Find the matching }}
        while (i < template.length && braceCount > 0) {
          if (i < template.length - 1 && template[i] === '{' && template[i + 1] === '{') {
            braceCount++;
            content += '{{';
            i += 2;
          } else if (i < template.length - 1 && template[i] === '}' && template[i + 1] === '}') {
            braceCount--;
            if (braceCount > 0) {
              content += '}}';
            }
            i += 2;
          } else {
            content += template[i];
            i++;
          }
        }

        if (braceCount === 0) {
          // Found a complete variable
          const fullMatch = template.substring(startIndex, i);
          matches.push({ fullMatch, content });
        } else {
          // Unclosed variable, treat as literal text
          i = startIndex + 1;
        }
      } else {
        i++;
      }
    }

    return matches;
  }

  /**
   * Resolves scoped variables like env.VAR_NAME, secret.VAR_NAME, profile.key, api.key, endpoint.key, plugins.name.variable, steps.stepId.*
   */
  private async resolveScopedVariable(
    variableName: string,
    context: VariableContext
  ): Promise<string> {
    const [scope, ...keyParts] = variableName.split('.');
    const key = keyParts.join('.');

    switch (scope) {
      case 'env':
        if (context.env && context.env[key] !== undefined) {
          return context.env[key];
        }
        throw new VariableResolutionError(
          `Environment variable '${key}' is not defined`,
          variableName
        );

      case 'secret':
        // T14.3: Try custom secret resolvers first, then fall back to environment variables
        if (this.pluginManager) {
          const secretResolvers = this.pluginManager.getSecretResolvers();

          for (const resolver of secretResolvers) {
            try {
              const resolvedValue = await resolver(key);
              if (resolvedValue !== undefined) {
                // T14.4: Add to secret tracking for masking
                this.secretVariables.add(variableName);
                this.secretValues.set(variableName, resolvedValue);
                return resolvedValue;
              }
            } catch (error) {
              // Log error but continue to next resolver or fall back to environment
              if (process.env.NODE_ENV === 'development') {
                process.stderr.write(
                  `[VariableResolver] Secret resolver failed for '${key}': ${error instanceof Error ? error.message : String(error)}\n`
                );
              }
            }
          }
        }

        // T9.4: Fall back to environment variable (original behavior)
        if (context.env && context.env[key] !== undefined) {
          this.secretVariables.add(variableName);
          this.secretValues.set(variableName, context.env[key]);
          return context.env[key];
        }
        throw new VariableResolutionError(`Secret variable '${key}' is not defined`, variableName);

      case 'profile':
        if (context.profiles && context.profiles[key] !== undefined) {
          return this.stringifyValue(context.profiles[key]);
        }
        throw new VariableResolutionError(`Profile variable '${key}' is not defined`, variableName);

      case 'api':
        if (context.api && context.api[key] !== undefined) {
          return this.stringifyValue(context.api[key]);
        }
        throw new VariableResolutionError(`API variable '${key}' is not defined`, variableName);

      case 'endpoint':
        if (context.endpoint && context.endpoint[key] !== undefined) {
          return this.stringifyValue(context.endpoint[key]);
        }
        throw new VariableResolutionError(
          `Endpoint variable '${key}' is not defined`,
          variableName
        );

      case 'plugins':
        if (context.plugins) {
          const [pluginName, ...variableKeyParts] = keyParts;
          const variableKey = variableKeyParts.join('.');

          if (context.plugins[pluginName] && context.plugins[pluginName][variableKey]) {
            const variableSource = context.plugins[pluginName][variableKey];
            try {
              const value = await variableSource();
              return this.stringifyValue(value);
            } catch (error) {
              throw new VariableResolutionError(
                `Plugin variable '${variableName}' failed to resolve: ${error instanceof Error ? error.message : String(error)}`,
                variableName
              );
            }
          }
        }
        throw new VariableResolutionError(
          `Plugin variable '${variableName}' is not defined`,
          variableName
        );

      case 'steps':
        // T8.8 & T8.9: Handle step variables
        if (context.steps) {
          return this.resolveStepVariable(keyParts, context.steps, variableName);
        }
        throw new VariableResolutionError(
          `Step variable '${variableName}' is not available (no steps in context)`,
          variableName
        );

      default:
        // T9.6: Handle built-in dynamic variables with $ prefix
        if (scope.startsWith('$')) {
          return this.resolveDynamicVariable(scope, key, variableName);
        }

        throw new VariableResolutionError(
          `Unknown variable scope '${scope}' in '${variableName}'`,
          variableName
        );
    }
  }

  /**
   * T8.8 & T8.9: Resolves step variables like steps.stepId.response.body.field or steps.stepId.request.url
   */
  private resolveStepVariable(
    keyParts: string[],
    steps: StepExecutionResult[],
    variableName: string
  ): string {
    if (keyParts.length < 2) {
      throw new VariableResolutionError(
        `Invalid step variable format '${variableName}'. Expected: steps.stepId.response.* or steps.stepId.request.*`,
        variableName
      );
    }

    const [stepId, dataType, ...pathParts] = keyParts;

    // Find the step by ID
    const step = steps.find((s) => s.stepId === stepId);
    if (!step) {
      throw new VariableResolutionError(
        `Step '${stepId}' not found in executed steps`,
        variableName
      );
    }

    let targetData: import('../types/plugin.js').HttpResponse | import('../types/plugin.js').HttpRequest;

    switch (dataType) {
      case 'response':
        targetData = step.response;
        break;
      case 'request':
        targetData = step.request;
        break;
      default:
        throw new VariableResolutionError(
          `Invalid step data type '${dataType}' in '${variableName}'. Expected: 'response' or 'request'`,
          variableName
        );
    }

    // If no path parts, return the entire object as string
    if (pathParts.length === 0) {
      return this.stringifyValue(targetData);
    }

    // Special handling for response.body and request.body - parse JSON if it's a string
    if (pathParts.length > 0 && pathParts[0].startsWith('body')) {
      if (typeof targetData.body === 'string') {
        try {
          // Parse the JSON string to an object for JSONPath processing
          targetData = { ...targetData, body: JSON.parse(targetData.body) };
        } catch {
          // If it's not valid JSON, treat it as a plain string
          // JSONPath will need to access it differently
        }
      }
    }

    // Use JSONPath to extract the value
    const jsonPath = `$.${pathParts.join('.')}`;

    try {
      const result = JSONPath({ path: jsonPath, json: targetData });

      if (result.length === 0) {
        throw new VariableResolutionError(
          `JSONPath '${jsonPath}' found no matches in step '${stepId}' ${dataType}`,
          variableName
        );
      }

      // Return the first match
      return this.stringifyValue(result[0]);
    } catch (error) {
      if (error instanceof VariableResolutionError) {
        throw error;
      }
      throw new VariableResolutionError(
        `JSONPath evaluation failed for '${variableName}': ${error instanceof Error ? error.message : String(error)}`,
        variableName
      );
    }
  }

  /**
   * Resolves unscoped variables using precedence order
   * PRD FR3.2 precedence (Highest to Lowest):
   * 1. CLI arguments (--var)
   * 2. Step with overrides (in chain steps)
   * 3. chain.vars (defined at the start of a chain definition)
   * 4. Endpoint-specific variables
   * 5. API-specific variables
   * 6. Profile variables (from the active profile)
   * 7. Dedicated/Global variable files
   * 8. {{secret.*}} variables (scoped access only)
   * 9. {{env.*}} OS environment variables (scoped access only)
   * 10. {{$dynamic}} built-in dynamic variables (scoped access only)
   * Note: Secret, env, and dynamic variables are only accessible via their scoped syntax
   */
  private resolveUnscopedVariable(variableName: string, context: VariableContext): unknown {
    // 1. CLI variables (highest precedence) - support both old and new names
    const cliVars = context.cliVariables || {};
    if (cliVars && cliVars[variableName] !== undefined) {
      return cliVars[variableName];
    }

    // 2. Step with overrides (for chains) - support both old and new names  
    const stepWith = context.stepWith || {};
    if (stepWith && stepWith[variableName] !== undefined) {
      return stepWith[variableName];
    }

    // 3. Chain variables (for chains)
    if (context.chainVars && context.chainVars[variableName] !== undefined) {
      return context.chainVars[variableName];
    }

    // 4. Endpoint-specific variables - support both old and new names
    const endpointVars = context.endpointVariables || context.endpoint || {};
    if (endpointVars && endpointVars[variableName] !== undefined) {
      return endpointVars[variableName];
    }

    // 5. API-specific variables - support both old and new names
    const apiVars = context.apiVariables || context.api || {};
    if (apiVars && apiVars[variableName] !== undefined) {
      return apiVars[variableName];
    }

    // 6. Profile variables (merged)
    if (context.profiles && context.profiles[variableName] !== undefined) {
      return context.profiles[variableName];
    }

    // 7. Global variables (T9.3)
    if (context.globalVariables && context.globalVariables[variableName] !== undefined) {
      return context.globalVariables[variableName];
    }

    // 8-10. Secret, env, and dynamic variables are only accessible via scoped syntax
    // (e.g., {{secret.VAR}}, {{env.VAR}}, {{$timestamp}})
    // They are not available as unscoped variables

    return undefined;
  }

  /**
   * Converts any value to string for HTTP contexts
   */
  private stringifyValue(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return JSON.stringify(value);
  }

  /**
   * Resolves variables in any value (string, object, or array)
   * For strings, applies template substitution
   * For objects/arrays, recursively processes string values
   */
  async resolveValue(value: unknown, context: VariableContext): Promise<unknown> {
    if (typeof value === 'string') {
      return this.resolve(value, context);
    }

    if (Array.isArray(value)) {
      const resolvedArray = [];
      for (const item of value) {
        resolvedArray.push(await this.resolveValue(item, context));
      }
      return resolvedArray;
    }

    if (value && typeof value === 'object') {
      const resolved: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        resolved[key] = await this.resolveValue(val, context);
      }
      return resolved;
    }

    return value;
  }

  /**
   * Creates a variable context from CLI arguments and environment variables
   * Enhanced for Phase 9 with global variables support
   * Enhanced for T10.15 with parameterized plugin support
   */
  createContext(
    cliVars: Record<string, string>,
    profiles?: Record<string, unknown>,
    api?: Record<string, unknown>,
    endpoint?: Record<string, unknown>,
    plugins?: Record<string, Record<string, VariableSource>>,
    globalVariables?: Record<string, unknown>, // T9.3: Global variables
    parameterizedPlugins?: Record<
      string,
      Record<string, import('../types/plugin.js').ParameterizedVariableSource>
    > // T10.15: Parameterized plugins
  ): VariableContext {
    return {
      cliVariables: cliVars ? { ...cliVars } : {},
      profiles: profiles ? { ...profiles } : {},
      apiVariables: api ? { ...api } : undefined,
      endpointVariables: endpoint ? { ...endpoint } : undefined,
      pluginVariables: plugins ? { ...plugins } : undefined,
      parameterizedPluginSources: parameterizedPlugins ? { ...parameterizedPlugins } : undefined, // T10.15
      globalVariables: globalVariables ? { ...globalVariables } : undefined, // T9.3
      env: { ...process.env } as Record<string, string>,
      // Also set the direct api/endpoint properties for scoped resolution
      api: api ? { ...api } : undefined,
      endpoint: endpoint ? { ...endpoint } : undefined,
      plugins: plugins ? { ...plugins } : undefined,
    };
  }

  /**
   * Merges multiple profiles into a single variables object
   * Later profiles override earlier ones for the same key
   * T13.6: Enhanced with verbose output for profile merging
   */
  mergeProfiles(
    profileNames: string[],
    profiles: Record<string, Record<string, unknown>>,
    verbose: boolean = false
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    const variableOrigins: Record<string, string> = {}; // Track which profile each variable comes from

    for (const profileName of profileNames) {
      const profile = profiles[profileName];
      if (profile) {
        for (const [key, value] of Object.entries(profile)) {
          merged[key] = value;
          variableOrigins[key] = profileName;
        }
      }
    }

    // T13.6: Show merged profile variables in verbose mode
    if (verbose && Object.keys(merged).length > 0) {
      process.stderr.write('[VERBOSE] Merged profile variables:\n');
      for (const [key, value] of Object.entries(merged)) {
        // T9.5: Mask secrets in verbose output
        const maskedValue = this.maskSecrets(String(value));
        const origin = variableOrigins[key];
        process.stderr.write(`[VERBOSE]   ${key}: ${maskedValue} (from ${origin} profile)\n`);
      }
    }

    return merged;
  }

  /**
   * T9.6: Resolves built-in dynamic variables ($timestamp, $isoTimestamp, $randomInt, $guid)
   */
  private resolveDynamicVariable(
    variableName: string,
    params: string,
    fullVariableName: string
  ): string {
    // Extract base variable name and parameters if they exist
    let baseVariableName = variableName;
    let extractedParams = params;

    // Check if variableName contains parameters (e.g., $randomInt(1,100))
    const paramMatch = variableName.match(/^(\$\w+)(\(.+\))$/);
    if (paramMatch) {
      baseVariableName = paramMatch[1];
      extractedParams = paramMatch[2];
    }

    switch (baseVariableName) {
      case '$timestamp':
        // Unix timestamp in seconds
        return Math.floor(Date.now() / 1000).toString();

      case '$customTimestamp':
        if (extractedParams) {
          // Strip parentheses from the format string
          const formatMatch = extractedParams.match(/^\((.+)\)$/);
          if (formatMatch) {
            const formatString = formatMatch[1];
            return dayjs().format(formatString);
          } else {
            throw new VariableResolutionError(
              `Invalid parameters for ${fullVariableName}. Use format: {{$customTimestamp(format)}}`,
              fullVariableName
            );
          }
        } else {
          // ISO 8601 timestamp by default
          return new Date().toISOString();
        }
      case '$isoTimestamp':
        // ISO 8601 timestamp
        return new Date().toISOString();
      case '$randomInt':
        // Random integer - supports optional range parameters like $randomInt(1,100)
        if (extractedParams) {
          // Try to parse range parameters from parentheses
          const rangeMatch = extractedParams.match(/^\((\d+),(\d+)\)$/);
          if (rangeMatch) {
            const min = parseInt(rangeMatch[1], 10);
            const max = parseInt(rangeMatch[2], 10);
            if (min >= max) {
              throw new VariableResolutionError(
                `Invalid range for ${fullVariableName}: min (${min}) must be less than max (${max})`,
                fullVariableName
              );
            }
            return (Math.floor(Math.random() * (max - min + 1)) + min).toString();
          } else {
            throw new VariableResolutionError(
              `Invalid parameters for ${fullVariableName}. Use format: {{$randomInt(min,max)}}`,
              fullVariableName
            );
          }
        } else {
          // Default range: 0 to 999999
          return Math.floor(Math.random() * 1000000).toString();
        }

      case '$guid':
        // Generate a UUID v4
        return this.generateUUID();

      default:
        throw new VariableResolutionError(
          `Unknown dynamic variable '${baseVariableName}'`,
          fullVariableName
        );
    }
  }

  /**
   * T9.6: Generates a UUID v4 (simple implementation without external dependencies)
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * T10.15: Checks if a variable name represents a parameterized function call
   * Function calls have the pattern: plugins.pluginName.functionName(args...)
   * Enhanced to handle nested parentheses and complex arguments
   */
  private isParameterizedFunctionCall(variableName: string): boolean {
    // Check if it starts with plugins.pluginName.functionName(
    const startPattern = /^plugins\.\w+\.\w+\(/;
    if (!startPattern.test(variableName)) {
      return false;
    }

    // Check if it ends with ) and has balanced parentheses
    if (!variableName.endsWith(')')) {
      return false;
    }

    // Find the opening parenthesis
    const openParenIndex = variableName.indexOf('(');
    if (openParenIndex === -1) {
      return false;
    }

    // Check if parentheses are balanced
    let parenCount = 0;
    for (let i = openParenIndex; i < variableName.length; i++) {
      if (variableName[i] === '(') {
        parenCount++;
      } else if (variableName[i] === ')') {
        parenCount--;
        if (parenCount === 0 && i === variableName.length - 1) {
          return true; // Balanced and ends correctly
        } else if (parenCount < 0) {
          return false; // Unbalanced
        }
      }
    }

    return false; // Unbalanced or doesn't end correctly
  }

  /**
   * T10.15: Resolves a parameterized function call
   * Parses function arguments, resolves any variable references, and calls the plugin function
   */
  private async resolveParameterizedFunctionCall(
    variableName: string,
    context: VariableContext
  ): Promise<string> {
    const functionCall = this.parseFunctionCall(variableName);

    if (!context.parameterizedPluginSources || !context.parameterizedPluginSources[functionCall.pluginName]) {
      throw new VariableResolutionError(
        `Plugin '${functionCall.pluginName}' not found or has no parameterized functions`,
        variableName
      );
    }

    const pluginFunctions = context.parameterizedPluginSources[functionCall.pluginName];
    if (!pluginFunctions[functionCall.functionName]) {
      throw new VariableResolutionError(
        `Parameterized function '${functionCall.functionName}' not found in plugin '${functionCall.pluginName}'`,
        variableName
      );
    }

    // Resolve function arguments
    const resolvedArgs: unknown[] = [];
    for (const arg of functionCall.arguments) {
      if (arg.type === 'string') {
        resolvedArgs.push(arg.value);
      } else if (arg.type === 'variable') {
        // Recursively resolve variable arguments
        const resolvedValue = await this.resolve(arg.value, context);
        resolvedArgs.push(resolvedValue);
      }
    }

    // Call the parameterized function
    try {
      const parameterizedFunction = pluginFunctions[functionCall.functionName];
      const result = await parameterizedFunction(...resolvedArgs);
      return this.stringifyValue(result);
    } catch (error) {
      throw new VariableResolutionError(
        `Parameterized function '${variableName}' failed to execute: ${error instanceof Error ? error.message : String(error)}`,
        variableName
      );
    }
  }

  /**
   * T10.15: Parses a function call string into a FunctionCall object
   * Supports syntax: plugins.pluginName.functionName("arg1", "{{variable}}", "arg3")
   * Enhanced to handle nested parentheses and complex arguments
   */
  private parseFunctionCall(variableName: string): FunctionCall {
    // Extract the basic parts using a more flexible approach
    const basicMatch = variableName.match(/^plugins\.(\w+)\.(\w+)\(/);
    if (!basicMatch) {
      throw new VariableResolutionError(
        `Invalid function call syntax '${variableName}'. Expected: plugins.pluginName.functionName(args...)`,
        variableName
      );
    }

    const [, pluginName, functionName] = basicMatch;

    // Find the opening parenthesis
    const openParenIndex = variableName.indexOf('(');
    if (openParenIndex === -1 || !variableName.endsWith(')')) {
      throw new VariableResolutionError(
        `Invalid function call syntax '${variableName}'. Expected: plugins.pluginName.functionName(args...)`,
        variableName
      );
    }

    // Extract the arguments string (everything between the outermost parentheses)
    const argsStr = variableName.substring(openParenIndex + 1, variableName.length - 1);
    const args: FunctionArgument[] = [];

    if (argsStr.trim()) {
      // Parse function arguments
      const argMatches = this.parseArguments(argsStr);
      for (const argMatch of argMatches) {
        const trimmedArg = argMatch.trim();

        if (trimmedArg.startsWith('"') && trimmedArg.endsWith('"')) {
          // String literal argument
          const stringValue = trimmedArg.slice(1, -1); // Remove quotes

          // Check if the string contains variable references
          if (stringValue.includes('{{') && stringValue.includes('}}')) {
            args.push({
              type: 'variable',
              value: stringValue,
            });
          } else {
            args.push({
              type: 'string',
              value: stringValue,
            });
          }
        } else if (trimmedArg.startsWith('\\"') && trimmedArg.endsWith('\\"')) {
          // Handle escaped quotes (from nested function calls)
          const stringValue = trimmedArg.slice(2, -2); // Remove escaped quotes

          // Check if the string contains variable references
          if (stringValue.includes('{{') && stringValue.includes('}}')) {
            args.push({
              type: 'variable',
              value: stringValue,
            });
          } else {
            args.push({
              type: 'string',
              value: stringValue,
            });
          }
        } else {
          throw new VariableResolutionError(
            `Invalid argument '${trimmedArg}' in function call '${variableName}'. Arguments must be quoted strings.`,
            variableName
          );
        }
      }
    }

    return {
      pluginName,
      functionName,
      arguments: args,
    };
  }

  /**
   * T10.15: Parses function arguments, handling quoted strings with commas
   * Returns array of argument strings (including quotes)
   */
  private parseArguments(argsStr: string): string[] {
    const args: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < argsStr.length) {
      const char = argsStr[i];

      if (char === '"' && (i === 0 || argsStr[i - 1] !== '\\')) {
        inQuotes = !inQuotes;
        current += char;
      } else if (char === '\\' && i + 1 < argsStr.length && argsStr[i + 1] === '"') {
        // Handle escaped quotes - add both the backslash and quote
        current += char;
        current += argsStr[i + 1];
        i++; // Skip the next character since we processed it
      } else if (char === ',' && !inQuotes) {
        if (current.trim()) {
          args.push(current.trim());
          current = '';
        }
      } else {
        current += char;
      }

      i++;
    }

    // Add the last argument
    if (current.trim()) {
      args.push(current.trim());
    }

    return args;
  }

  /**
   * T8.7: Enhanced to handle both numeric and non-numeric array indices
   */
  resolveArrayAccess(value: unknown, accessPath: string[]): unknown {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    let current: unknown = value;
    for (const segment of accessPath) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (Array.isArray(current)) {
        const index = parseInt(segment, 10);
        if (!isNaN(index)) {
          current = current[index];
        } else {
          return undefined; // Non-numeric index on array
        }
      } else if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[segment];
      } else {
        return undefined;
      }
    }

    return current;
  }

  private getProfiles(context: VariableContext): Record<string, unknown> {
    // Remove unused variable assignment
    const resolvedProfiles: Record<string, unknown> = {};

    // Merge all profiles
    Object.assign(resolvedProfiles, context.profiles);

    return resolvedProfiles;
  }

  private extractVariableValue(response: HttpResponse, path: string): unknown {
    try {
      const parsedBody = JSON.parse(response.body);
      return this.resolveArrayAccess(parsedBody, path.split('.'));
    } catch {
      // If parsing fails, return the raw body
      return response.body;
    }
  }

  async resolveStepsVariable(stepPath: string, steps: import('./chainExecutor.js').StepExecutionResult[]): Promise<unknown> {
    const parts = stepPath.split('.');
    if (parts.length < 2) {
      throw new VariableResolutionError(`Invalid steps path: ${stepPath}. Expected format: stepId.property[.subproperty...]`, stepPath);
    }

    const [stepId, property, ...subPath] = parts;

    // Find the step by ID
    const step = steps.find(s => s.stepId === stepId);
    if (!step) {
      throw new VariableResolutionError(`Step '${stepId}' not found in executed steps`, stepPath);
    }

    let value: unknown;
    switch (property) {
      case 'request':
        value = step.request;
        break;
      case 'response':
        value = step.response;
        break;
      case 'success':
        value = step.success;
        break;
      case 'error':
        value = step.error;
        break;
      default:
        throw new VariableResolutionError(`Invalid step property '${property}'. Available: request, response, success, error`, stepPath);
    }

    // If there's a subpath, navigate into the object
    if (subPath.length > 0) {
      value = this.resolveArrayAccess(value, subPath);
    }

    return value;
  }

  private maskSecretInObject(obj: unknown, secretPattern: RegExp): unknown {
    if (typeof obj === 'string') {
      return obj.replace(secretPattern, (match, secretName) => {
        return `[MASKED:${secretName}]`;
      });
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.maskSecretInObject(item, secretPattern));
    }

    if (obj && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.maskSecretInObject(value, secretPattern);
      }
      return result;
    }

    return obj;
  }

  /**
   * Process JSONPath expressions for step data access
   */
  private static processStepVariableValue(stepData: Record<string, unknown>, path: string): unknown {
    try {
      // Use JSONPath to query the step data
      const result = JSONPath({ path: path, json: stepData });

      // If no result found, return undefined
      if (!result || result.length === 0) {
        return undefined;
      }

      // Return the first result (JSONPath returns an array)
      return result[0];
    } catch {
      // If JSONPath fails, try simple property access
      return undefined;
    }
  }
}

// Singleton instance
export const variableResolver = new VariableResolver();
