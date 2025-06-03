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
      
      // Replace this specific variable match
      resolvedTemplate = resolvedTemplate.replace(match[0], resolvedValue);
    }
    
    return resolvedTemplate;
  }
  
  /**
   * Resolves scoped variables like env.VAR_NAME, profile.key, api.key, endpoint.key, plugins.name.variable, steps.stepId.*
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
   * Phase 9 precedence: CLI > Step with > Chain vars > Endpoint > API > Profile > Global Variables > Environment
   * Note: Plugin variables require the plugins.name.variable syntax and are not available as unscoped
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
    
    // 8. Environment variables (lowest precedence)
    if (context.env[variableName] !== undefined) {
      return context.env[variableName];
    }
    
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
}

// Singleton instance
export const variableResolver = new VariableResolver(); 