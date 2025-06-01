import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VariableResolver, VariableContext, VariableResolutionError } from '../../src/core/variableResolver.js';

describe('VariableResolver', () => {
  let resolver: VariableResolver;
  let mockContext: VariableContext;

  beforeEach(() => {
    resolver = new VariableResolver();
    mockContext = {
      cli: {
        userId: '123',
        apiKey: 'cli-api-key',
        name: 'John'
      },
      env: {
        USER: 'testuser',
        NODE_ENV: 'test',
        apiKey: 'env-api-key',
        PATH: '/usr/bin:/bin'
      }
    };
  });

  describe('T3.1: Basic templating function', () => {
    it('should substitute simple variables', () => {
      const result = resolver.resolve('hello {{name}}', mockContext);
      expect(result).toBe('hello John');
    });

    it('should substitute multiple variables', () => {
      const result = resolver.resolve('User {{name}} has ID {{userId}}', mockContext);
      expect(result).toBe('User John has ID 123');
    });

    it('should handle variables with whitespace', () => {
      const result = resolver.resolve('hello {{ name }}', mockContext);
      expect(result).toBe('hello John');
    });

    it('should return original string when no variables present', () => {
      const result = resolver.resolve('hello world', mockContext);
      expect(result).toBe('hello world');
    });
  });

  describe('T3.2: Environment variable support', () => {
    it('should resolve env.VAR_NAME syntax', () => {
      const result = resolver.resolve('Current user: {{env.USER}}', mockContext);
      expect(result).toBe('Current user: testuser');
    });

    it('should resolve multiple environment variables', () => {
      const result = resolver.resolve('User: {{env.USER}}, Env: {{env.NODE_ENV}}', mockContext);
      expect(result).toBe('User: testuser, Env: test');
    });

    it('should throw error for undefined environment variables', () => {
      expect(() => {
        resolver.resolve('Missing: {{env.UNDEFINED_VAR}}', mockContext);
      }).toThrow(VariableResolutionError);
      
      expect(() => {
        resolver.resolve('Missing: {{env.UNDEFINED_VAR}}', mockContext);
      }).toThrow("Environment variable 'UNDEFINED_VAR' is not defined");
    });
  });

  describe('T3.4: Variable precedence (CLI > Environment)', () => {
    it('should prefer CLI variables over environment variables', () => {
      // Both CLI and env have 'apiKey', CLI should win
      const result = resolver.resolve('Key: {{apiKey}}', mockContext);
      expect(result).toBe('Key: cli-api-key');
    });

    it('should fall back to environment when CLI variable not defined', () => {
      const result = resolver.resolve('Path: {{PATH}}', mockContext);
      expect(result).toBe('Path: /usr/bin:/bin');
    });
  });

  describe('T3.7: Error handling for unresolved variables', () => {
    it('should throw VariableResolutionError for undefined variables', () => {
      expect(() => {
        resolver.resolve('Missing: {{undefinedVar}}', mockContext);
      }).toThrow(VariableResolutionError);
    });

    it('should provide informative error message', () => {
      try {
        resolver.resolve('Missing: {{undefinedVar}}', mockContext);
      } catch (error) {
        expect(error).toBeInstanceOf(VariableResolutionError);
        expect((error as VariableResolutionError).message).toBe("Variable 'undefinedVar' could not be resolved");
        expect((error as VariableResolutionError).variableName).toBe('undefinedVar');
      }
    });

    it('should halt execution on first unresolved variable', () => {
      expect(() => {
        resolver.resolve('First: {{undefinedVar1}}, Second: {{undefinedVar2}}', mockContext);
      }).toThrow(VariableResolutionError);
    });
  });

  describe('resolveValue method', () => {
    it('should resolve variables in strings', () => {
      const result = resolver.resolveValue('Hello {{name}}', mockContext);
      expect(result).toBe('Hello John');
    });

    it('should resolve variables in object values', () => {
      const input = {
        title: 'User {{name}}',
        id: '{{userId}}',
        env: '{{env.NODE_ENV}}'
      };
      const result = resolver.resolveValue(input, mockContext);
      expect(result).toEqual({
        title: 'User John',
        id: '123',
        env: 'test'
      });
    });

    it('should resolve variables in arrays', () => {
      const input = ['{{name}}', '{{userId}}', 'static'];
      const result = resolver.resolveValue(input, mockContext);
      expect(result).toEqual(['John', '123', 'static']);
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          name: '{{name}}',
          id: '{{userId}}'
        },
        meta: {
          env: '{{env.NODE_ENV}}'
        }
      };
      const result = resolver.resolveValue(input, mockContext);
      expect(result).toEqual({
        user: {
          name: 'John',
          id: '123'
        },
        meta: {
          env: 'test'
        }
      });
    });

    it('should preserve non-string values', () => {
      const input = {
        name: '{{name}}',
        count: 42,
        active: true,
        data: null
      };
      const result = resolver.resolveValue(input, mockContext);
      expect(result).toEqual({
        name: 'John',
        count: 42,
        active: true,
        data: null
      });
    });
  });

  describe('createContext method', () => {
    it('should create context with CLI variables and environment', () => {
      const originalEnv = process.env;
      process.env = { TEST_VAR: 'test_value', USER: 'testuser' };
      
      try {
        const cliVars = { apiKey: 'cli-key', userId: '456' };
        const context = resolver.createContext(cliVars);
        
        expect(context.cli).toEqual(cliVars);
        expect(context.env.TEST_VAR).toBe('test_value');
        expect(context.env.USER).toBe('testuser');
      } finally {
        process.env = originalEnv;
      }
    });

    it('should not modify original CLI variables object', () => {
      const cliVars: Record<string, string> = { apiKey: 'test' };
      const context = resolver.createContext(cliVars);
      
      context.cli.newVar = 'added';
      expect(cliVars.newVar).toBeUndefined();
    });
  });
}); 