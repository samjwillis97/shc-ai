/**
 * Variable resolution and substitution for HttpCraft
 * Supports {{variable}} syntax with precedence rules
 */

export interface VariableContext {
  cli: Record<string, string>;
  stepWith?: Record<string, any>; // For future chain steps
  chainVars?: Record<string, any>; // For future chains
  endpoint?: Record<string, any>;
  api?: Record<string, any>;
  profiles?: Record<string, any>; // Merged profile variables
  env: Record<string, string>;
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
   * Phase 4 precedence: CLI > Step with > Chain vars > Endpoint > API > Profile > Environment
   */
  resolve(template: string, context: VariableContext): string {
    const variablePattern = /\{\{([^}]*)\}\}/g;
    
    return template.replace(variablePattern, (match, variableName: string) => {
      const trimmedName = variableName.trim();
      
      // Validate that variable name is not empty
      if (!trimmedName) {
        throw new VariableResolutionError(
          'Variable name cannot be empty',
          trimmedName
        );
      }
      
      // Handle scoped variables (e.g., env.VAR_NAME, profile.key, api.key, endpoint.key)
      if (trimmedName.includes('.')) {
        return this.resolveScopedVariable(trimmedName, context);
      }
      
      // Handle unscoped variables with precedence
      const value = this.resolveUnscopedVariable(trimmedName, context);
      if (value !== undefined) {
        return this.stringifyValue(value);
      }
      
      throw new VariableResolutionError(
        `Variable '${trimmedName}' could not be resolved`,
        trimmedName
      );
    });
  }
  
  /**
   * Resolves scoped variables like env.VAR_NAME, profile.key, api.key, endpoint.key
   */
  private resolveScopedVariable(variableName: string, context: VariableContext): string {
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
        
      default:
        throw new VariableResolutionError(
          `Unknown variable scope '${scope}' in '${variableName}'`,
          variableName
        );
    }
  }
  
  /**
   * Resolves unscoped variables using precedence order
   */
  private resolveUnscopedVariable(variableName: string, context: VariableContext): any {
    // Phase 4 precedence: CLI > Step with > Chain vars > Endpoint > API > Profile > Environment
    
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
    
    // 7. Environment variables (lowest precedence)
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
  resolveValue(value: any, context: VariableContext): any {
    if (typeof value === 'string') {
      return this.resolve(value, context);
    }
    
    if (Array.isArray(value)) {
      return value.map(item => this.resolveValue(item, context));
    }
    
    if (value && typeof value === 'object') {
      const resolved: any = {};
      for (const [key, val] of Object.entries(value)) {
        resolved[key] = this.resolveValue(val, context);
      }
      return resolved;
    }
    
    return value;
  }
  
  /**
   * Creates a variable context from CLI arguments and environment variables
   * Enhanced for Phase 4 with profile, API, and endpoint support
   */
  createContext(
    cliVars: Record<string, string>,
    profiles?: Record<string, any>,
    api?: Record<string, any>,
    endpoint?: Record<string, any>
  ): VariableContext {
    return {
      cli: { ...cliVars },
      profiles: profiles ? { ...profiles } : undefined,
      api: api ? { ...api } : undefined,
      endpoint: endpoint ? { ...endpoint } : undefined,
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