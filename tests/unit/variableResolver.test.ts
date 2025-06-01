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

  describe('Phase 3 Compatibility - Basic Functionality', () => {
    it('should resolve simple variables from CLI', () => {
      const context = resolver.createContext({ name: 'world' });
      const result = resolver.resolve('Hello {{name}}!', context);
      expect(result).toBe('Hello world!');
    });

    it('should resolve environment variables with env. prefix', () => {
      const context = resolver.createContext({}, undefined, undefined, undefined);
      context.env.TEST_VAR = 'test_value';
      
      const result = resolver.resolve('Value: {{env.TEST_VAR}}', context);
      expect(result).toBe('Value: test_value');
    });

    it('should handle CLI variables taking precedence over environment', () => {
      const context = resolver.createContext({ test: 'cli_value' });
      context.env.test = 'env_value';
      
      const result = resolver.resolve('{{test}}', context);
      expect(result).toBe('cli_value');
    });

    it('should throw error for undefined variables', () => {
      const context = resolver.createContext({});
      
      expect(() => {
        resolver.resolve('{{undefined_var}}', context);
      }).toThrow(VariableResolutionError);
    });
  });

  describe('Phase 4 - Profile Variables', () => {
    it('should resolve profile variables with profile. prefix', () => {
      const profiles = { apiHost: 'dev.example.com', userId: 123 };
      const context = resolver.createContext({}, profiles);
      
      const result = resolver.resolve('Host: {{profile.apiHost}}, User: {{profile.userId}}', context);
      expect(result).toBe('Host: dev.example.com, User: 123');
    });

    it('should merge multiple profiles with later ones taking precedence', () => {
      const profiles = {
        dev: { host: 'dev.example.com', debug: true },
        user_a: { userId: 'user_123', host: 'custom.example.com' }
      };
      
      const merged = resolver.mergeProfiles(['dev', 'user_a'], profiles);
      expect(merged).toEqual({
        host: 'custom.example.com', // user_a overrides dev
        debug: true,                // from dev
        userId: 'user_123'          // from user_a
      });
    });

    it('should handle missing profiles gracefully', () => {
      const profiles = { dev: { host: 'dev.example.com' } };
      const merged = resolver.mergeProfiles(['dev', 'missing'], profiles);
      expect(merged).toEqual({ host: 'dev.example.com' });
    });

    it('should throw error for undefined profile variables', () => {
      const context = resolver.createContext({}, { host: 'example.com' });
      
      expect(() => {
        resolver.resolve('{{profile.missing}}', context);
      }).toThrow(VariableResolutionError);
    });
  });

  describe('Phase 4 - API and Endpoint Variables', () => {
    it('should resolve API variables with api. prefix', () => {
      const apiVars = { version: '1.2.3', timeout: 5000 };
      const context = resolver.createContext({}, undefined, apiVars);
      
      const result = resolver.resolve('Version: {{api.version}}, Timeout: {{api.timeout}}', context);
      expect(result).toBe('Version: 1.2.3, Timeout: 5000');
    });

    it('should resolve endpoint variables with endpoint. prefix', () => {
      const endpointVars = { maxItems: 50, includeDeleted: false };
      const context = resolver.createContext({}, undefined, undefined, endpointVars);
      
      const result = resolver.resolve('Max: {{endpoint.maxItems}}, Include: {{endpoint.includeDeleted}}', context);
      expect(result).toBe('Max: 50, Include: false');
    });

    it('should throw error for undefined API variables', () => {
      const context = resolver.createContext({}, undefined, { version: '1.0' });
      
      expect(() => {
        resolver.resolve('{{api.missing}}', context);
      }).toThrow(VariableResolutionError);
    });

    it('should throw error for undefined endpoint variables', () => {
      const context = resolver.createContext({}, undefined, undefined, { limit: 10 });
      
      expect(() => {
        resolver.resolve('{{endpoint.missing}}', context);
      }).toThrow(VariableResolutionError);
    });
  });

  describe('Phase 4 - Variable Precedence', () => {
    it('should respect full precedence order: CLI > Endpoint > API > Profile > Environment', () => {
      const context = resolver.createContext(
        { test: 'cli_value' },                    // CLI (highest)
        { test: 'profile_value' },                // Profile
        { test: 'api_value' },                    // API
        { test: 'endpoint_value' }                // Endpoint
      );
      context.env.test = 'env_value';            // Environment (lowest)
      
      const result = resolver.resolve('{{test}}', context);
      expect(result).toBe('cli_value');
    });

    it('should fall back to endpoint when CLI is not available', () => {
      const context = resolver.createContext(
        {},                                       // No CLI
        { test: 'profile_value' },                // Profile
        { test: 'api_value' },                    // API
        { test: 'endpoint_value' }                // Endpoint
      );
      context.env.test = 'env_value';            // Environment
      
      const result = resolver.resolve('{{test}}', context);
      expect(result).toBe('endpoint_value');
    });

    it('should fall back to API when CLI and endpoint not available', () => {
      const context = resolver.createContext(
        {},                                       // No CLI
        { test: 'profile_value' },                // Profile
        { test: 'api_value' },                    // API
        {}                                        // No endpoint
      );
      context.env.test = 'env_value';            // Environment
      
      const result = resolver.resolve('{{test}}', context);
      expect(result).toBe('api_value');
    });

    it('should fall back to profile when CLI, endpoint, and API not available', () => {
      const context = resolver.createContext(
        {},                                       // No CLI
        { test: 'profile_value' },                // Profile
        {},                                       // No API
        {}                                        // No endpoint
      );
      context.env.test = 'env_value';            // Environment
      
      const result = resolver.resolve('{{test}}', context);
      expect(result).toBe('profile_value');
    });

    it('should fall back to environment as last resort', () => {
      const context = resolver.createContext(
        {},                                       // No CLI
        {},                                       // No profile
        {},                                       // No API
        {}                                        // No endpoint
      );
      context.env.test = 'env_value';            // Environment
      
      const result = resolver.resolve('{{test}}', context);
      expect(result).toBe('env_value');
    });
  });

  describe('Phase 4 - Scoped Variables', () => {
    it('should resolve scoped variables correctly', () => {
      const context = resolver.createContext(
        { cliVar: 'cli_val' },
        { profileVar: 'profile_val' },
        { apiVar: 'api_val' },
        { endpointVar: 'endpoint_val' }
      );
      context.env.ENV_VAR = 'env_val';
      
      const template = 'CLI: {{cliVar}}, Profile: {{profile.profileVar}}, API: {{api.apiVar}}, Endpoint: {{endpoint.endpointVar}}, Env: {{env.ENV_VAR}}';
      const result = resolver.resolve(template, context);
      expect(result).toBe('CLI: cli_val, Profile: profile_val, API: api_val, Endpoint: endpoint_val, Env: env_val');
    });

    it('should throw error for unknown scopes', () => {
      const context = resolver.createContext({});
      
      expect(() => {
        resolver.resolve('{{unknown.variable}}', context);
      }).toThrow(VariableResolutionError);
    });
  });

  describe('Data Type Handling', () => {
    it('should stringify numbers correctly', () => {
      const context = resolver.createContext({}, { port: 8080, version: 1.5 });
      
      const result = resolver.resolve('Port: {{profile.port}}, Version: {{profile.version}}', context);
      expect(result).toBe('Port: 8080, Version: 1.5');
    });

    it('should stringify booleans correctly', () => {
      const context = resolver.createContext({}, { debug: true, production: false });
      
      const result = resolver.resolve('Debug: {{profile.debug}}, Prod: {{profile.production}}', context);
      expect(result).toBe('Debug: true, Prod: false');
    });

    it('should handle complex objects in values', () => {
      const complexValue = { nested: { key: 'value' }, array: [1, 2, 3] };
      const context = resolver.createContext({}, { complex: complexValue });
      
      const result = resolver.resolve('Data: {{profile.complex}}', context);
      expect(result).toBe('Data: {"nested":{"key":"value"},"array":[1,2,3]}');
    });
  });

  describe('resolveValue - Complex Objects', () => {
    it('should resolve variables in object values', () => {
      const context = resolver.createContext({ name: 'test', port: '8080' });
      const obj = {
        service: '{{name}}-service',
        config: {
          port: '{{port}}',
          host: 'localhost'
        }
      };
      
      const result = resolver.resolveValue(obj, context);
      expect(result).toEqual({
        service: 'test-service',
        config: {
          port: '8080',
          host: 'localhost'
        }
      });
    });

    it('should resolve variables in arrays', () => {
      const context = resolver.createContext({ env: 'dev', version: '1.0' });
      const array = ['{{env}}-environment', 'version-{{version}}', 'static-value'];
      
      const result = resolver.resolveValue(array, context);
      expect(result).toEqual(['dev-environment', 'version-1.0', 'static-value']);
    });

    it('should handle nested arrays and objects', () => {
      const context = resolver.createContext({ name: 'api', version: '2.0' });
      const complex = {
        services: [
          {
            name: '{{name}}-service',
            versions: ['{{version}}', '1.0']
          }
        ]
      };
      
      const result = resolver.resolveValue(complex, context);
      expect(result).toEqual({
        services: [
          {
            name: 'api-service',
            versions: ['2.0', '1.0']
          }
        ]
      });
    });
  });

  describe('Error Handling', () => {
    it('should provide informative error messages for variable resolution failures', () => {
      const context = resolver.createContext({});
      
      try {
        resolver.resolve('{{missing_var}}', context);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(VariableResolutionError);
        expect(error.message).toContain('missing_var');
        expect(error.variableName).toBe('missing_var');
      }
    });

    it('should provide informative error messages for scoped variable failures', () => {
      const context = resolver.createContext({}, { existing: 'value' });
      
      try {
        resolver.resolve('{{profile.missing}}', context);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(VariableResolutionError);
        expect(error.message).toContain('missing');
        expect(error.variableName).toBe('profile.missing');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty variable names gracefully', () => {
      const context = resolver.createContext({});
      
      expect(() => {
        resolver.resolve('{{}}', context);
      }).toThrow(VariableResolutionError);
    });

    it('should handle variables with spaces in names', () => {
      const context = resolver.createContext({ 'my var': 'value' });
      
      const result = resolver.resolve('{{ my var }}', context);
      expect(result).toBe('value');
    });

    it('should handle variables in complex paths', () => {
      const context = resolver.createContext({}, undefined, undefined, undefined);
      context.env['COMPLEX_PATH'] = '/path/to/resource';
      
      const result = resolver.resolve('{{env.COMPLEX_PATH}}', context);
      expect(result).toBe('/path/to/resource');
    });

    it('should handle multiple variables in one string', () => {
      const context = resolver.createContext(
        { name: 'service' },
        { env: 'dev' },
        { version: '1.0' }
      );
      
      const result = resolver.resolve('{{name}}-{{profile.env}}-v{{api.version}}', context);
      expect(result).toBe('service-dev-v1.0');
    });
  });
}); 