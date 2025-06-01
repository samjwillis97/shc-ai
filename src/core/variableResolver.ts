/**
 * Variable resolution and substitution for HttpCraft
 * Supports {{variable}} syntax with precedence rules
 */

export interface VariableContext {
  cli: Record<string, string>;
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
   * Current precedence for Phase 3: CLI > Environment
   */
  resolve(template: string, context: VariableContext): string {
    const variablePattern = /\{\{([^}]+)\}\}/g;
    
    return template.replace(variablePattern, (match, variableName: string) => {
      const trimmedName = variableName.trim();
      
      // Check if it's an environment variable (env.VAR_NAME)
      if (trimmedName.startsWith('env.')) {
        const envVarName = trimmedName.substring(4);
        if (context.env[envVarName] !== undefined) {
          return context.env[envVarName];
        }
        throw new VariableResolutionError(
          `Environment variable '${envVarName}' is not defined`,
          trimmedName
        );
      }
      
      // Check CLI variables first (highest precedence)
      if (context.cli[trimmedName] !== undefined) {
        return context.cli[trimmedName];
      }
      
      // Check environment variables for direct variable names
      if (context.env[trimmedName] !== undefined) {
        return context.env[trimmedName];
      }
      
      throw new VariableResolutionError(
        `Variable '${trimmedName}' could not be resolved`,
        trimmedName
      );
    });
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
   */
  createContext(cliVars: Record<string, string>): VariableContext {
    return {
      cli: { ...cliVars },
      env: { ...process.env } as Record<string, string>
    };
  }
}

// Singleton instance
export const variableResolver = new VariableResolver(); 