/**
 * Variable resolution and substitution for HttpCraft
 * Supports {{variable}} syntax with precedence rules
 */

import { VariableSource } from '../types/plugin.js';
import { JSONPath } from 'jsonpath-plus';
import type { StepExecutionResult } from './chainExecutor.js';

export interface VariableContext {
  cli: Record<string, string>;
  stepWith?: Record<string, any>; // For future chain steps
  chainVars?: Record<string, any>; // For future chains
  endpoint?: Record<string, any>;
  api?: Record<string, any>;
  profiles?: Record<string, any>; // Merged profile variables
  globalVariables?: Record<string, any>; // T9.3: Global variable files
  plugins?: Record<string, Record<string, VariableSource>>; // Plugin variable sources
  env: Record<string, string>;
  steps?: StepExecutionResult[]; // T8.8 & T8.9: Step execution results for chains
}

export class VariableResolutionError extends Error {
  constructor(message: string, public variableName: string) {
    super(message);
    this.name = 'VariableResolutionError';
  }
}

export class VariableResolver {
  private secretVariables: Set<string> = new Set(); // T9.5: Track secret variables for masking
  private secretValues: Map<string, string> = new Map(); // T9.5: Track secret values for masking
  
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
   * T9.5: Mask secret values in a string for verbose/dry-run output
   * Replaces actual secret values with [SECRET] placeholder
   */
  maskSecrets(text: string): string {
    let maskedText = text;
    
    // For each tracked secret value, replace it with [SECRET]
    for (const [variableName, secretValue] of this.secretValues) {
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
   */
  async resolve(template: string, context: VariableContext): Promise<string> {
    const variablePattern = /\{\{([^}]*)\}\}/g;
    let resolvedTemplate = template;
    
    // Process variables sequentially to handle async plugin variables
    const matches = Array.from(template.matchAll(variablePattern));
    
    for (const match of matches) {
      const variableName = match[1].trim();
      
      // Validate that variable name is not empty
      if (!variableName) {
        throw new VariableResolutionError(
          'Variable name cannot be empty',
          variableName
        );
      }
      
      let resolvedValue: string;
      
      // Handle scoped variables (e.g., env.VAR_NAME, profile.key, api.key, endpoint.key, plugins.name.variable, steps.stepId.*)
      if (variableName.includes('.')) {
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
      resolvedTemplate = resolvedTemplate.replace(match[0], resolvedValue);
    }
    
    return resolvedTemplate;
  }
  
  /**
   * Resolves scoped variables like env.VAR_NAME, secret.VAR_NAME, profile.key, api.key, endpoint.key, plugins.name.variable, steps.stepId.*
   */
  private async resolveScopedVariable(variableName: string, context: VariableContext): Promise<string> {
    const [scope, ...keyParts] = variableName.split('.');
    const key = keyParts.join('.');
    
    switch (scope) {
      case 'env':
        if (context.env[key] !== undefined) {
          return context.env[key];
        }
        throw new VariableResolutionError(
          `Environment variable '${key}' is not defined`,
          variableName
        );
        
      case 'secret':
        // T9.4: Secret variable resolution (default provider: OS environment)
        if (context.env[key] !== undefined) {
          this.secretVariables.add(variableName);
          this.secretValues.set(variableName, context.env[key]);
          return context.env[key];
        }
        throw new VariableResolutionError(
          `Secret variable '${key}' is not defined`,
          variableName
        );
        
      case 'profile':
        if (context.profiles && context.profiles[key] !== undefined) {
          return this.stringifyValue(context.profiles[key]);
        }
        throw new VariableResolutionError(
          `Profile variable '${key}' is not defined`,
          variableName
        );
        
      case 'api':
        if (context.api && context.api[key] !== undefined) {
          return this.stringifyValue(context.api[key]);
        }
        throw new VariableResolutionError(
          `API variable '${key}' is not defined`,
          variableName
        );
        
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
  private resolveStepVariable(keyParts: string[], steps: StepExecutionResult[], variableName: string): string {
    if (keyParts.length < 2) {
      throw new VariableResolutionError(
        `Invalid step variable format '${variableName}'. Expected: steps.stepId.response.* or steps.stepId.request.*`,
        variableName
      );
    }
    
    const [stepId, dataType, ...pathParts] = keyParts;
    
    // Find the step by ID
    const step = steps.find(s => s.stepId === stepId);
    if (!step) {
      throw new VariableResolutionError(
        `Step '${stepId}' not found in executed steps`,
        variableName
      );
    }
    
    let targetData: any;
    
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
        } catch (parseError) {
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
   * Note: Plugin variables require the plugins.name.variable syntax and are not available as unscoped
   * Note: Secret, env, and dynamic variables are only accessible via their scoped syntax
   */
  private resolveUnscopedVariable(variableName: string, context: VariableContext): any {
    // 1. CLI variables (highest precedence)
    if (context.cli[variableName] !== undefined) {
      return context.cli[variableName];
    }
    
    // 2. Step with overrides (for future chains)
    if (context.stepWith && context.stepWith[variableName] !== undefined) {
      return context.stepWith[variableName];
    }
    
    // 3. Chain variables (for future chains)
    if (context.chainVars && context.chainVars[variableName] !== undefined) {
      return context.chainVars[variableName];
    }
    
    // 4. Endpoint-specific variables
    if (context.endpoint && context.endpoint[variableName] !== undefined) {
      return context.endpoint[variableName];
    }
    
    // 5. API-specific variables
    if (context.api && context.api[variableName] !== undefined) {
      return context.api[variableName];
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
  private stringifyValue(value: any): string {
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
  async resolveValue(value: any, context: VariableContext): Promise<any> {
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
      const resolved: any = {};
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
   */
  createContext(
    cliVars: Record<string, string>,
    profiles?: Record<string, any>,
    api?: Record<string, any>,
    endpoint?: Record<string, any>,
    plugins?: Record<string, Record<string, VariableSource>>,
    globalVariables?: Record<string, any> // T9.3: Global variables
  ): VariableContext {
    return {
      cli: { ...cliVars },
      profiles: profiles ? { ...profiles } : undefined,
      api: api ? { ...api } : undefined,
      endpoint: endpoint ? { ...endpoint } : undefined,
      plugins: plugins ? { ...plugins } : undefined,
      globalVariables: globalVariables ? { ...globalVariables } : undefined, // T9.3
      env: { ...process.env } as Record<string, string>
    };
  }
  
  /**
   * Merges multiple profiles into a single variables object
   * Later profiles override earlier ones for the same key
   */
  mergeProfiles(profileNames: string[], profiles: Record<string, Record<string, any>>): Record<string, any> {
    const merged: Record<string, any> = {};
    
    for (const profileName of profileNames) {
      const profile = profiles[profileName];
      if (profile) {
        Object.assign(merged, profile);
      }
    }
    
    return merged;
  }
  
  /**
   * T9.6: Resolves built-in dynamic variables ($timestamp, $isoTimestamp, $randomInt, $guid)
   */
  private resolveDynamicVariable(variableName: string, params: string, fullVariableName: string): string {
    switch (variableName) {
      case '$timestamp':
        // Unix timestamp in seconds
        return Math.floor(Date.now() / 1000).toString();
        
      case '$isoTimestamp':
        // ISO 8601 timestamp
        return new Date().toISOString();
        
      case '$randomInt':
        // Random integer - supports optional range parameters like $randomInt(1,100)
        if (params) {
          // Try to parse range parameters from parentheses
          const rangeMatch = params.match(/^\((\d+),(\d+)\)$/);
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
          `Unknown dynamic variable '${variableName}'`,
          fullVariableName
        );
    }
  }
  
  /**
   * T9.6: Generates a UUID v4 (simple implementation without external dependencies)
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Singleton instance
export const variableResolver = new VariableResolver(); 