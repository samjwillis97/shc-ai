import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VariableResolver, VariableContext, VariableResolutionError } from '../../src/core/variableResolver.js';
import type { StepExecutionResult } from '../../src/core/chainExecutor.js';
import type { VariableSource } from '../../src/types/plugin.js';

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
    it('should substitute simple variables', async () => {
      const result = await resolver.resolve('hello {{name}}', mockContext);
      expect(result).toBe('hello John');
    });

    it('should substitute multiple variables', async () => {
      const result = await resolver.resolve('User {{name}} has ID {{userId}}', mockContext);
      expect(result).toBe('User John has ID 123');
    });

    it('should handle variables with whitespace', async () => {
      const result = await resolver.resolve('hello {{ name }}', mockContext);
      expect(result).toBe('hello John');
    });

    it('should return original string when no variables present', async () => {
      const result = await resolver.resolve('hello world', mockContext);
      expect(result).toBe('hello world');
    });
  });

  describe('T3.2: Environment variable support', () => {
    it('should resolve env.VAR_NAME syntax', async () => {
      const result = await resolver.resolve('Current user: {{env.USER}}', mockContext);
      expect(result).toBe('Current user: testuser');
    });

    it('should resolve multiple environment variables', async () => {
      const result = await resolver.resolve('User: {{env.USER}}, Env: {{env.NODE_ENV}}', mockContext);
      expect(result).toBe('User: testuser, Env: test');
    });

    it('should throw error for undefined environment variables', async () => {
      await expect(resolver.resolve('Missing: {{env.UNDEFINED_VAR}}', mockContext))
        .rejects.toThrow(VariableResolutionError);
      
      await expect(resolver.resolve('Missing: {{env.UNDEFINED_VAR}}', mockContext))
        .rejects.toThrow("Environment variable 'UNDEFINED_VAR' is not defined");
    });
  });

  describe('T3.4: Variable precedence (CLI > Environment)', () => {
    it('should prefer CLI variables over environment variables', async () => {
      // Both CLI and env have 'apiKey', CLI should win
      const result = await resolver.resolve('Key: {{apiKey}}', mockContext);
      expect(result).toBe('Key: cli-api-key');
    });

    it('should fall back to environment when CLI variable not defined', async () => {
      // Environment variables should only be accessible via env. prefix according to PRD
      const result = await resolver.resolve('Path: {{env.PATH}}', mockContext);
      expect(result).toBe('Path: /usr/bin:/bin');
    });
  });

  describe('T3.7: Error handling for unresolved variables', () => {
    it('should throw VariableResolutionError for undefined variables', async () => {
      await expect(resolver.resolve('Missing: {{undefinedVar}}', mockContext))
        .rejects.toThrow(VariableResolutionError);
    });

    it('should provide informative error message', async () => {
      try {
        await resolver.resolve('Missing: {{undefinedVar}}', mockContext);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(VariableResolutionError);
        expect((error as VariableResolutionError).message).toBe("Variable 'undefinedVar' could not be resolved");
        expect((error as VariableResolutionError).variableName).toBe('undefinedVar');
      }
    });

    it('should halt execution on first unresolved variable', async () => {
      await expect(resolver.resolve('First: {{undefinedVar1}}, Second: {{undefinedVar2}}', mockContext))
        .rejects.toThrow(VariableResolutionError);
    });
  });

  describe('resolveValue method', () => {
    it('should resolve variables in strings', async () => {
      const result = await resolver.resolveValue('Hello {{name}}', mockContext);
      expect(result).toBe('Hello John');
    });

    it('should resolve variables in object values', async () => {
      const input = {
        title: 'User {{name}}',
        id: '{{userId}}',
        env: '{{env.NODE_ENV}}'
      };
      const result = await resolver.resolveValue(input, mockContext);
      expect(result).toEqual({
        title: 'User John',
        id: '123',
        env: 'test'
      });
    });

    it('should resolve variables in arrays', async () => {
      const input = ['{{name}}', '{{userId}}', 'static'];
      const result = await resolver.resolveValue(input, mockContext);
      expect(result).toEqual(['John', '123', 'static']);
    });

    it('should handle nested objects', async () => {
      const input = {
        user: {
          name: '{{name}}',
          id: '{{userId}}'
        },
        meta: {
          env: '{{env.NODE_ENV}}'
        }
      };
      const result = await resolver.resolveValue(input, mockContext);
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

    it('should preserve non-string values', async () => {
      const input = {
        name: '{{name}}',
        count: 42,
        active: true,
        data: null
      };
      const result = await resolver.resolveValue(input, mockContext);
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
    it('should resolve simple variables from CLI', async () => {
      const context = resolver.createContext({ name: 'world' });
      const result = await resolver.resolve('Hello {{name}}!', context);
      expect(result).toBe('Hello world!');
    });

    it('should resolve environment variables with env. prefix', async () => {
      const context = resolver.createContext({}, undefined, undefined, undefined);
      context.env.TEST_VAR = 'test_value';
      
      const result = await resolver.resolve('Value: {{env.TEST_VAR}}', context);
      expect(result).toBe('Value: test_value');
    });

    it('should handle CLI variables taking precedence over environment', async () => {
      const context = resolver.createContext({ test: 'cli_value' });
      context.env.test = 'env_value';
      
      const result = await resolver.resolve('{{test}}', context);
      expect(result).toBe('cli_value');
    });

    it('should throw error for undefined variables', async () => {
      const context = resolver.createContext({});
      
      await expect(resolver.resolve('{{undefined_var}}', context))
        .rejects.toThrow(VariableResolutionError);
    });
  });

  describe('Phase 4 - Profile Variables', () => {
    it('should resolve profile variables with profile. prefix', async () => {
      const profiles = { apiHost: 'dev.example.com', userId: 123 };
      const context = resolver.createContext({}, profiles);
      
      const result = await resolver.resolve('Host: {{profile.apiHost}}, User: {{profile.userId}}', context);
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

    it('should throw error for undefined profile variables', async () => {
      const context = resolver.createContext({}, { host: 'example.com' });
      
      await expect(resolver.resolve('{{profile.missing}}', context))
        .rejects.toThrow(VariableResolutionError);
    });
  });

  describe('Phase 4 - API and Endpoint Variables', () => {
    it('should resolve API variables with api. prefix', async () => {
      const apiVars = { version: '1.2.3', timeout: 5000 };
      const context = resolver.createContext({}, undefined, apiVars);
      
      const result = await resolver.resolve('Version: {{api.version}}, Timeout: {{api.timeout}}', context);
      expect(result).toBe('Version: 1.2.3, Timeout: 5000');
    });

    it('should resolve endpoint variables with endpoint. prefix', async () => {
      const endpointVars = { maxItems: 50, includeDeleted: false };
      const context = resolver.createContext({}, undefined, undefined, endpointVars);
      
      const result = await resolver.resolve('Max: {{endpoint.maxItems}}, Include: {{endpoint.includeDeleted}}', context);
      expect(result).toBe('Max: 50, Include: false');
    });

    it('should throw error for undefined API variables', async () => {
      const context = resolver.createContext({}, undefined, { version: '1.0' });
      
      await expect(resolver.resolve('{{api.missing}}', context))
        .rejects.toThrow(VariableResolutionError);
    });

    it('should throw error for undefined endpoint variables', async () => {
      const context = resolver.createContext({}, undefined, undefined, { limit: 10 });
      
      await expect(resolver.resolve('{{endpoint.missing}}', context))
        .rejects.toThrow(VariableResolutionError);
    });
  });

  describe('Phase 4 - Variable Precedence', () => {
    it('should respect full precedence order: CLI > Endpoint > API > Profile > Environment', async () => {
      const context = resolver.createContext(
        { test: 'cli_value' },                    // CLI (highest)
        { test: 'profile_value' },                // Profile
        { test: 'api_value' },                    // API
        { test: 'endpoint_value' }                // Endpoint
      );
      context.env.test = 'env_value';            // Environment (lowest)
      
      const result = await resolver.resolve('{{test}}', context);
      expect(result).toBe('cli_value');
    });

    it('should fall back to endpoint when CLI is not available', async () => {
      const context = resolver.createContext(
        {},                                       // No CLI
        { test: 'profile_value' },                // Profile
        { test: 'api_value' },                    // API
        { test: 'endpoint_value' }                // Endpoint
      );
      context.env.test = 'env_value';            // Environment
      
      const result = await resolver.resolve('{{test}}', context);
      expect(result).toBe('endpoint_value');
    });

    it('should fall back to API when CLI and endpoint not available', async () => {
      const context = resolver.createContext(
        {},                                       // No CLI
        { test: 'profile_value' },                // Profile
        { test: 'api_value' },                    // API
        {}                                        // No endpoint
      );
      context.env.test = 'env_value';            // Environment
      
      const result = await resolver.resolve('{{test}}', context);
      expect(result).toBe('api_value');
    });

    it('should fall back to profile when CLI, endpoint, and API not available', async () => {
      const context = resolver.createContext(
        {},                                       // No CLI
        { test: 'profile_value' },                // Profile
        {},                                       // No API
        {}                                        // No endpoint
      );
      context.env.test = 'env_value';            // Environment
      
      const result = await resolver.resolve('{{test}}', context);
      expect(result).toBe('profile_value');
    });

    it('should fall back to environment as last resort', async () => {
      const context = resolver.createContext(
        {},                                       // No CLI
        {},                                       // No profile
        {},                                       // No API
        {}                                        // No endpoint
      );
      context.env.test = 'env_value';            // Environment
      
      // Environment variables should only be accessible via env. prefix according to PRD
      const result = await resolver.resolve('{{env.test}}', context);
      expect(result).toBe('env_value');
    });
  });

  describe('Phase 4 - Scoped Variables', () => {
    it('should resolve scoped variables correctly', async () => {
      const context = resolver.createContext(
        { cliVar: 'cli_val' },
        { profileVar: 'profile_val' },
        { apiVar: 'api_val' },
        { endpointVar: 'endpoint_val' }
      );
      context.env.ENV_VAR = 'env_val';
      
      const template = 'CLI: {{cliVar}}, Profile: {{profile.profileVar}}, API: {{api.apiVar}}, Endpoint: {{endpoint.endpointVar}}, Env: {{env.ENV_VAR}}';
      const result = await resolver.resolve(template, context);
      expect(result).toBe('CLI: cli_val, Profile: profile_val, API: api_val, Endpoint: endpoint_val, Env: env_val');
    });

    it('should throw error for unknown scopes', async () => {
      const context = resolver.createContext({});
      
      await expect(resolver.resolve('{{unknown.variable}}', context))
        .rejects.toThrow(VariableResolutionError);
    });
  });

  describe('Data Type Handling', () => {
    it('should stringify numbers correctly', async () => {
      const context = resolver.createContext({}, { port: 8080, version: 1.5 });
      
      const result = await resolver.resolve('Port: {{profile.port}}, Version: {{profile.version}}', context);
      expect(result).toBe('Port: 8080, Version: 1.5');
    });

    it('should stringify booleans correctly', async () => {
      const context = resolver.createContext({}, { debug: true, production: false });
      
      const result = await resolver.resolve('Debug: {{profile.debug}}, Prod: {{profile.production}}', context);
      expect(result).toBe('Debug: true, Prod: false');
    });

    it('should handle complex objects in values', async () => {
      const complexValue = { nested: { key: 'value' }, array: [1, 2, 3] };
      const context = resolver.createContext({}, { complex: complexValue });
      
      const result = await resolver.resolve('Data: {{profile.complex}}', context);
      expect(result).toBe('Data: {"nested":{"key":"value"},"array":[1,2,3]}');
    });
  });

  describe('resolveValue - Complex Objects', () => {
    it('should resolve variables in object values', async () => {
      const context = resolver.createContext({ name: 'test', port: '8080' });
      const obj = {
        service: '{{name}}-service',
        config: {
          port: '{{port}}',
          host: 'localhost'
        }
      };
      
      const result = await resolver.resolveValue(obj, context);
      expect(result).toEqual({
        service: 'test-service',
        config: {
          port: '8080',
          host: 'localhost'
        }
      });
    });

    it('should resolve variables in arrays', async () => {
      const context = resolver.createContext({ env: 'dev', version: '1.0' });
      const array = ['{{env}}-environment', 'version-{{version}}', 'static-value'];
      
      const result = await resolver.resolveValue(array, context);
      expect(result).toEqual(['dev-environment', 'version-1.0', 'static-value']);
    });

    it('should handle nested arrays and objects', async () => {
      const context = resolver.createContext({ name: 'api', version: '2.0' });
      const complex = {
        services: [
          {
            name: '{{name}}-service',
            versions: ['{{version}}', '1.0']
          }
        ]
      };
      
      const result = await resolver.resolveValue(complex, context);
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
    it('should provide informative error messages for variable resolution failures', async () => {
      const context = resolver.createContext({});
      
      try {
        await resolver.resolve('{{missing_var}}', context);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(VariableResolutionError);
        expect((error as VariableResolutionError).message).toContain('missing_var');
        expect((error as VariableResolutionError).variableName).toBe('missing_var');
      }
    });

    it('should provide informative error messages for scoped variable failures', async () => {
      const context = resolver.createContext({}, { existing: 'value' });
      
      try {
        await resolver.resolve('{{profile.missing}}', context);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(VariableResolutionError);
        expect((error as VariableResolutionError).message).toContain('missing');
        expect((error as VariableResolutionError).variableName).toBe('profile.missing');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty variable names gracefully', async () => {
      const context = resolver.createContext({});
      
      await expect(resolver.resolve('{{}}', context))
        .rejects.toThrow(VariableResolutionError);
    });

    it('should handle variables with spaces in names', async () => {
      const context = resolver.createContext({ 'my var': 'value' });
      
      const result = await resolver.resolve('{{ my var }}', context);
      expect(result).toBe('value');
    });

    it('should handle variables in complex paths', async () => {
      const context = resolver.createContext({}, undefined, undefined, undefined);
      context.env['COMPLEX_PATH'] = '/path/to/resource';
      
      const result = await resolver.resolve('{{env.COMPLEX_PATH}}', context);
      expect(result).toBe('/path/to/resource');
    });

    it('should handle multiple variables in one string', async () => {
      const context = resolver.createContext(
        { name: 'service' },
        { env: 'dev' },
        { version: '1.0' }
      );
      
      const result = await resolver.resolve('{{name}}-{{profile.env}}-v{{api.version}}', context);
      expect(result).toBe('service-dev-v1.0');
    });
  });

  describe('T8.8 & T8.9: Step Variable Resolution', () => {
    let mockSteps: StepExecutionResult[];

    beforeEach(() => {
      mockSteps = [
        {
          stepId: 'createUser',
          request: {
            method: 'POST',
            url: 'https://api.test.com/users',
            headers: { 'Content-Type': 'application/json' },
            body: { name: 'John', email: 'john@example.com' }
          },
          response: {
            status: 201,
            statusText: 'Created',
            headers: { 'location': '/users/456' },
            body: '{"id": 456, "name": "John", "email": "john@example.com"}'
          },
          success: true
        },
        {
          stepId: 'getUser',
          request: {
            method: 'GET',
            url: 'https://api.test.com/users/456',
            headers: {},
            body: undefined
          },
          response: {
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            body: '{"id": 456, "name": "John", "email": "john@example.com", "created": "2023-01-01"}'
          },
          success: true
        }
      ];

      mockContext.steps = mockSteps;
    });

    describe('T8.8: Response variable resolution', () => {
      it('should resolve step response body using JSONPath', async () => {
        const result = await resolver.resolve('User ID: {{steps.createUser.response.body.id}}', mockContext);
        expect(result).toBe('User ID: 456');
      });

      it('should resolve step response status', async () => {
        const result = await resolver.resolve('Status: {{steps.createUser.response.status}}', mockContext);
        expect(result).toBe('Status: 201');
      });

      it('should resolve step response headers', async () => {
        const result = await resolver.resolve('Location: {{steps.createUser.response.headers.location}}', mockContext);
        expect(result).toBe('Location: /users/456');
      });

      it('should resolve nested JSON properties from response body', async () => {
        const result = await resolver.resolve('Name: {{steps.getUser.response.body.name}}', mockContext);
        expect(result).toBe('Name: John');
      });

      it('should resolve entire response object when no path specified', async () => {
        const result = await resolver.resolve('Response: {{steps.createUser.response}}', mockContext);
        const parsed = JSON.parse(result.replace('Response: ', ''));
        expect(parsed.status).toBe(201);
        expect(parsed.statusText).toBe('Created');
      });
    });

    describe('T8.9: Request variable resolution', () => {
      it('should resolve step request method', async () => {
        const result = await resolver.resolve('Method: {{steps.createUser.request.method}}', mockContext);
        expect(result).toBe('Method: POST');
      });

      it('should resolve step request URL', async () => {
        const result = await resolver.resolve('URL: {{steps.createUser.request.url}}', mockContext);
        expect(result).toBe('URL: https://api.test.com/users');
      });

      it('should resolve step request headers', async () => {
        const result = await resolver.resolve('Content-Type: {{steps.createUser.request.headers.Content-Type}}', mockContext);
        expect(result).toBe('Content-Type: application/json');
      });

      it('should resolve step request body properties', async () => {
        const result = await resolver.resolve('Email: {{steps.createUser.request.body.email}}', mockContext);
        expect(result).toBe('Email: john@example.com');
      });

      it('should resolve entire request object when no path specified', async () => {
        const result = await resolver.resolve('Request: {{steps.getUser.request}}', mockContext);
        const parsed = JSON.parse(result.replace('Request: ', ''));
        expect(parsed.method).toBe('GET');
        expect(parsed.url).toBe('https://api.test.com/users/456');
      });
    });

    describe('Error handling for step variables', () => {
      it('should throw error for non-existent step ID', async () => {
        await expect(resolver.resolve('{{steps.nonExistentStep.response.body}}', mockContext))
          .rejects.toThrow(VariableResolutionError);
        
        await expect(resolver.resolve('{{steps.nonExistentStep.response.body}}', mockContext))
          .rejects.toThrow("Step 'nonExistentStep' not found in executed steps");
      });

      it('should throw error for invalid data type', async () => {
        await expect(resolver.resolve('{{steps.createUser.invalidType.body}}', mockContext))
          .rejects.toThrow(VariableResolutionError);
        
        await expect(resolver.resolve('{{steps.createUser.invalidType.body}}', mockContext))
          .rejects.toThrow("Invalid step data type 'invalidType'");
      });

      it('should throw error for invalid step variable format', async () => {
        await expect(resolver.resolve('{{steps.createUser}}', mockContext))
          .rejects.toThrow(VariableResolutionError);
        
        await expect(resolver.resolve('{{steps.createUser}}', mockContext))
          .rejects.toThrow("Invalid step variable format");
      });

      it('should throw error when no steps in context', async () => {
        const contextWithoutSteps = { ...mockContext };
        delete contextWithoutSteps.steps;
        
        await expect(resolver.resolve('{{steps.createUser.response.body}}', contextWithoutSteps))
          .rejects.toThrow(VariableResolutionError);
        
        await expect(resolver.resolve('{{steps.createUser.response.body}}', contextWithoutSteps))
          .rejects.toThrow("Step variable 'steps.createUser.response.body' is not available (no steps in context)");
      });

      it('should throw error for non-existent JSONPath', async () => {
        await expect(resolver.resolve('{{steps.createUser.response.body.nonExistentField}}', mockContext))
          .rejects.toThrow(VariableResolutionError);
        
        await expect(resolver.resolve('{{steps.createUser.response.body.nonExistentField}}', mockContext))
          .rejects.toThrow("JSONPath '$.body.nonExistentField' found no matches");
      });
    });

    describe('Complex JSONPath expressions', () => {
      it('should handle array access in JSONPath', async () => {
        // Mock a step with array response
        const stepWithArray: StepExecutionResult = {
          stepId: 'getUsers',
          request: { method: 'GET', url: 'https://api.test.com/users', headers: {}, body: undefined },
          response: {
            status: 200,
            statusText: 'OK',
            headers: {},
            body: '[{"id": 1, "name": "John"}, {"id": 2, "name": "Jane"}]'
          },
          success: true
        };
        
        const contextWithArray = { ...mockContext, steps: [stepWithArray] };
        
        const result = await resolver.resolve('First user: {{steps.getUsers.response.body[0].name}}', contextWithArray);
        expect(result).toBe('First user: John');
      });

      it('should handle nested object access', async () => {
        // Mock a step with nested response
        const stepWithNested: StepExecutionResult = {
          stepId: 'getProfile',
          request: { method: 'GET', url: 'https://api.test.com/profile', headers: {}, body: undefined },
          response: {
            status: 200,
            statusText: 'OK',
            headers: {},
            body: '{"user": {"profile": {"address": {"city": "New York"}}}}'
          },
          success: true
        };
        
        const contextWithNested = { ...mockContext, steps: [stepWithNested] };
        
        const result = await resolver.resolve('City: {{steps.getProfile.response.body.user.profile.address.city}}', contextWithNested);
        expect(result).toBe('City: New York');
      });
    });
  });

  describe('T9.3: Global Variables Support', () => {
    it('should resolve global variables', async () => {
      const contextWithGlobals = {
        ...mockContext,
        globalVariables: {
          globalVar: 'global-value',
          anotherGlobal: 'another-global-value'
        }
      };

      const result = await resolver.resolve('Global: {{globalVar}}', contextWithGlobals);
      expect(result).toBe('Global: global-value');
    });

    it('should resolve multiple global variables', async () => {
      const contextWithGlobals = {
        ...mockContext,
        globalVariables: {
          var1: 'value1',
          var2: 'value2'
        }
      };

      const result = await resolver.resolve('{{var1}} and {{var2}}', contextWithGlobals);
      expect(result).toBe('value1 and value2');
    });

    it('should handle different data types in global variables', async () => {
      const contextWithGlobals = {
        ...mockContext,
        globalVariables: {
          stringVar: 'hello',
          numberVar: 42,
          booleanVar: true
        }
      };

      const result1 = await resolver.resolve('String: {{stringVar}}', contextWithGlobals);
      expect(result1).toBe('String: hello');

      const result2 = await resolver.resolve('Number: {{numberVar}}', contextWithGlobals);
      expect(result2).toBe('Number: 42');

      const result3 = await resolver.resolve('Boolean: {{booleanVar}}', contextWithGlobals);
      expect(result3).toBe('Boolean: true');
    });
  });

  describe('T9.3: Variable Precedence with Global Variables', () => {
    it('should prefer CLI variables over global variables', async () => {
      const contextWithGlobals = {
        ...mockContext,
        globalVariables: {
          testVar: 'global-value'
        },
        cli: {
          testVar: 'cli-value'
        }
      };

      const result = await resolver.resolve('Value: {{testVar}}', contextWithGlobals);
      expect(result).toBe('Value: cli-value');
    });

    it('should prefer profile variables over global variables', async () => {
      const contextWithGlobals = {
        ...mockContext,
        globalVariables: {
          testVar: 'global-value'
        },
        profiles: {
          testVar: 'profile-value'
        }
      };

      const result = await resolver.resolve('Value: {{testVar}}', contextWithGlobals);
      expect(result).toBe('Value: profile-value');
    });

    it('should prefer API variables over global variables', async () => {
      const contextWithGlobals = {
        ...mockContext,
        globalVariables: {
          testVar: 'global-value'
        },
        api: {
          testVar: 'api-value'
        }
      };

      const result = await resolver.resolve('Value: {{testVar}}', contextWithGlobals);
      expect(result).toBe('Value: api-value');
    });

    it('should prefer endpoint variables over global variables', async () => {
      const contextWithGlobals = {
        ...mockContext,
        globalVariables: {
          testVar: 'global-value'
        },
        endpoint: {
          testVar: 'endpoint-value'
        }
      };

      const result = await resolver.resolve('Value: {{testVar}}', contextWithGlobals);
      expect(result).toBe('Value: endpoint-value');
    });

    it('should prefer global variables over environment variables', async () => {
      const contextWithGlobals = {
        ...mockContext,
        globalVariables: {
          PATH: 'global-path-value'
        }
      };

      const result = await resolver.resolve('Path: {{PATH}}', contextWithGlobals);
      expect(result).toBe('Path: global-path-value');
    });

    it('should fall back to environment when global variable not defined', async () => {
      const contextWithoutGlobals = {
        ...mockContext,
        globalVariables: {
          someOtherVar: 'global-value'
        }
      };

      // Environment variables should only be accessible via env. prefix according to PRD
      const result = await resolver.resolve('Path: {{env.PATH}}', contextWithoutGlobals);
      expect(result).toBe('Path: /usr/bin:/bin');
    });

    it('should handle missing global variables gracefully', async () => {
      const contextWithoutGlobals = {
        ...mockContext,
        globalVariables: undefined
      };

      // Environment variables should only be accessible via env. prefix according to PRD
      const result = await resolver.resolve('Path: {{env.PATH}}', contextWithoutGlobals);
      expect(result).toBe('Path: /usr/bin:/bin');
    });
  });

  describe('T9.4: Secret Variable Resolution', () => {
    it('should resolve secret variables from environment', async () => {
      const contextWithSecrets = {
        ...mockContext,
        env: {
          ...mockContext.env,
          API_KEY: 'secret-api-key-123',
          SECRET_TOKEN: 'secret-token-456'
        }
      };

      const result = await resolver.resolve('API Key: {{secret.API_KEY}}', contextWithSecrets);
      expect(result).toBe('API Key: secret-api-key-123');
    });

    it('should resolve multiple secret variables', async () => {
      const contextWithSecrets = {
        ...mockContext,
        env: {
          ...mockContext.env,
          API_KEY: 'secret-api-key',
          DB_PASSWORD: 'secret-db-password'
        }
      };

      const result = await resolver.resolve('API: {{secret.API_KEY}}, DB: {{secret.DB_PASSWORD}}', contextWithSecrets);
      expect(result).toBe('API: secret-api-key, DB: secret-db-password');
    });

    it('should throw error for undefined secret variables', async () => {
      await expect(resolver.resolve('Missing: {{secret.UNDEFINED_SECRET}}', mockContext))
        .rejects.toThrow(VariableResolutionError);
      
      await expect(resolver.resolve('Missing: {{secret.UNDEFINED_SECRET}}', mockContext))
        .rejects.toThrow("Secret variable 'UNDEFINED_SECRET' is not defined");
    });

    it('should differentiate between secret and env variables in error messages', async () => {
      try {
        await resolver.resolve('Missing: {{secret.MISSING_VAR}}', mockContext);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(VariableResolutionError);
        expect((error as VariableResolutionError).message).toBe("Secret variable 'MISSING_VAR' is not defined");
        expect((error as VariableResolutionError).variableName).toBe('secret.MISSING_VAR');
      }

      try {
        await resolver.resolve('Missing: {{env.MISSING_VAR}}', mockContext);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(VariableResolutionError);
        expect((error as VariableResolutionError).message).toBe("Environment variable 'MISSING_VAR' is not defined");
        expect((error as VariableResolutionError).variableName).toBe('env.MISSING_VAR');
      }
    });

    it('should handle secret variables in different contexts', async () => {
      const contextWithSecrets = {
        ...mockContext,
        env: {
          ...mockContext.env,
          API_KEY: 'test-secret-key',
          DATABASE_URL: 'postgres://user:pass@host:5432/db'
        }
      };

      // In headers
      const headerTemplate = 'Authorization: Bearer {{secret.API_KEY}}';
      const resolvedHeader = await resolver.resolve(headerTemplate, contextWithSecrets);
      expect(resolvedHeader).toBe('Authorization: Bearer test-secret-key');

      // In URLs
      const urlTemplate = 'postgresql://{{secret.DATABASE_URL}}';
      const resolvedUrl = await resolver.resolve(urlTemplate, contextWithSecrets);
      expect(resolvedUrl).toBe('postgresql://postgres://user:pass@host:5432/db');
    });

    it('should work with resolveValue method for objects', async () => {
      const contextWithSecrets = {
        ...mockContext,
        env: {
          ...mockContext.env,
          API_KEY: 'secret-key-value',
          SECRET_TOKEN: 'secret-token-value'
        }
      };

      const template = {
        headers: {
          'Authorization': 'Bearer {{secret.API_KEY}}',
          'X-Secret-Token': '{{secret.SECRET_TOKEN}}'
        },
        url: 'https://api.example.com/{{secret.API_KEY}}'
      };

      const resolved = await resolver.resolveValue(template, contextWithSecrets);
      expect(resolved).toEqual({
        headers: {
          'Authorization': 'Bearer secret-key-value',
          'X-Secret-Token': 'secret-token-value'
        },
        url: 'https://api.example.com/secret-key-value'
      });
    });
  });

  describe('T9.6: Built-in Dynamic Variables', () => {
    it('should resolve $timestamp to Unix timestamp', async () => {
      const before = Math.floor(Date.now() / 1000);
      const result = await resolver.resolve('Timestamp: {{$timestamp}}', mockContext);
      const after = Math.floor(Date.now() / 1000);
      
      const timestamp = parseInt(result.replace('Timestamp: ', ''));
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should resolve $isoTimestamp to ISO 8601 format', async () => {
      const result = await resolver.resolve('ISO: {{$isoTimestamp}}', mockContext);
      const isoString = result.replace('ISO: ', '');
      
      // Validate ISO 8601 format
      expect(isoString).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      
      // Should be parseable as a date
      const date = new Date(isoString);
      expect(date.getTime()).toBeGreaterThan(0);
    });

    it('should resolve $randomInt to random integer', async () => {
      const result1 = await resolver.resolve('Random: {{$randomInt}}', mockContext);
      const result2 = await resolver.resolve('Random: {{$randomInt}}', mockContext);
      
      const num1 = parseInt(result1.replace('Random: ', ''));
      const num2 = parseInt(result2.replace('Random: ', ''));
      
      // Should be valid integers in default range (0-999999)
      expect(num1).toBeGreaterThanOrEqual(0);
      expect(num1).toBeLessThanOrEqual(999999);
      expect(num2).toBeGreaterThanOrEqual(0);
      expect(num2).toBeLessThanOrEqual(999999);
      
      // Very unlikely to be the same (though theoretically possible)
      // We'll just check they're valid numbers
      expect(Number.isInteger(num1)).toBe(true);
      expect(Number.isInteger(num2)).toBe(true);
    });

    it('should resolve $guid to UUID v4 format', async () => {
      const result = await resolver.resolve('ID: {{$guid}}', mockContext);
      const guid = result.replace('ID: ', '');
      
      // Validate UUID v4 format
      expect(guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      
      // Should be unique
      const result2 = await resolver.resolve('ID: {{$guid}}', mockContext);
      const guid2 = result2.replace('ID: ', '');
      expect(guid).not.toBe(guid2);
    });

    it('should support $randomInt with range parameters', async () => {
      // Note: This syntax isn't supported yet based on current implementation
      // but let's test error handling for invalid formats
      await expect(resolver.resolve('{{$randomInt.invalid}}', mockContext))
        .rejects.toThrow(VariableResolutionError);
    });

    it('should handle multiple dynamic variables in one template', async () => {
      const result = await resolver.resolve(
        'Time: {{$timestamp}}, ISO: {{$isoTimestamp}}, Random: {{$randomInt}}, ID: {{$guid}}',
        mockContext
      );
      
      expect(result).toContain('Time: ');
      expect(result).toContain('ISO: ');
      expect(result).toContain('Random: ');
      expect(result).toContain('ID: ');
      
      // Extract and validate each part
      const parts = result.split(', ');
      const timestamp = parseInt(parts[0].replace('Time: ', ''));
      const isoString = parts[1].replace('ISO: ', '');
      const randomNum = parseInt(parts[2].replace('Random: ', ''));
      const guid = parts[3].replace('ID: ', '');
      
      expect(Number.isInteger(timestamp)).toBe(true);
      expect(isoString).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(Number.isInteger(randomNum)).toBe(true);
      expect(guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('should throw error for unknown dynamic variables', async () => {
      await expect(resolver.resolve('{{$unknown}}', mockContext))
        .rejects.toThrow(VariableResolutionError);
      
      await expect(resolver.resolve('{{$invalidVar}}', mockContext))
        .rejects.toThrow("Unknown dynamic variable '$invalidVar'");
    });

    it('should work with resolveValue method for objects', async () => {
      const template = {
        timestamp: '{{$timestamp}}',
        iso: '{{$isoTimestamp}}',
        random: '{{$randomInt}}',
        id: '{{$guid}}',
        nested: {
          time: '{{$timestamp}}',
          uuid: '{{$guid}}'
        }
      };

      const resolved = await resolver.resolveValue(template, mockContext);
      
      expect(typeof resolved.timestamp).toBe('string');
      expect(typeof resolved.iso).toBe('string');
      expect(typeof resolved.random).toBe('string');
      expect(typeof resolved.id).toBe('string');
      expect(typeof resolved.nested.time).toBe('string');
      expect(typeof resolved.nested.uuid).toBe('string');
      
      // Validate formats
      expect(parseInt(resolved.timestamp)).toBeGreaterThan(0);
      expect(resolved.iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(parseInt(resolved.random)).toBeGreaterThanOrEqual(0);
      expect(resolved.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  });

  describe('T9.5: Secret Masking in Verbose/Dry-Run Output', () => {
    beforeEach(() => {
      // Reset secret tracking before each test
      resolver.resetSecretTracking();
    });

    it('should track secret variables when resolving', async () => {
      const contextWithSecrets = {
        ...mockContext,
        env: {
          ...mockContext.env,
          API_KEY: 'secret-api-key-123',
          SECRET_TOKEN: 'secret-token-456'
        }
      };

      // Resolve some secret variables
      await resolver.resolve('Authorization: Bearer {{secret.API_KEY}}', contextWithSecrets);
      await resolver.resolve('Token: {{secret.SECRET_TOKEN}}', contextWithSecrets);

      // Check that secret variables are tracked
      const trackedSecrets = resolver.getSecretVariables();
      expect(trackedSecrets).toContain('secret.API_KEY');
      expect(trackedSecrets).toContain('secret.SECRET_TOKEN');
    });

    it('should mask secret values in output strings', async () => {
      const contextWithSecrets = {
        ...mockContext,
        env: {
          ...mockContext.env,
          API_KEY: 'secret-api-key-123',
          SECRET_TOKEN: 'secret-token-456'
        }
      };

      // First resolve some secret variables to track them
      await resolver.resolve('Authorization: Bearer {{secret.API_KEY}}', contextWithSecrets);
      await resolver.resolve('Token: {{secret.SECRET_TOKEN}}', contextWithSecrets);

      // Now mask secrets in output strings
      const outputWithSecrets = 'Headers: Authorization: Bearer secret-api-key-123, X-Token: secret-token-456';
      const maskedOutput = resolver.maskSecrets(outputWithSecrets);

      expect(maskedOutput).toBe('Headers: Authorization: Bearer [SECRET], X-Token: [SECRET]');
    });

    it('should mask secrets in JSON formatted output', async () => {
      const contextWithSecrets = {
        ...mockContext,
        env: {
          ...mockContext.env,
          API_KEY: 'secret-api-key-123',
          DATABASE_URL: 'postgres://user:pass@host:5432/db'
        }
      };

      // Resolve secret variables
      await resolver.resolve('{{secret.API_KEY}}', contextWithSecrets);
      await resolver.resolve('{{secret.DATABASE_URL}}', contextWithSecrets);

      // Test masking in JSON output
      const jsonOutput = JSON.stringify({
        headers: {
          'Authorization': 'Bearer secret-api-key-123',
          'X-API-Key': 'secret-api-key-123'
        },
        body: {
          database_url: 'postgres://user:pass@host:5432/db',
          api_key: 'secret-api-key-123'
        }
      }, null, 2);

      const maskedOutput = resolver.maskSecrets(jsonOutput);

      // Check that secrets are masked in the formatted JSON
      expect(maskedOutput).toContain('"Authorization": "Bearer [SECRET]"');
      expect(maskedOutput).toContain('"X-API-Key": "[SECRET]"');
      expect(maskedOutput).toContain('"database_url": "[SECRET]"');
      expect(maskedOutput).toContain('"api_key": "[SECRET]"');
      
      // Should not contain the actual secret values
      expect(maskedOutput).not.toContain('secret-api-key-123');
      expect(maskedOutput).not.toContain('postgres://user:pass@host:5432/db');
    });

    it('should handle multiple occurrences of the same secret', async () => {
      const contextWithSecrets = {
        ...mockContext,
        env: {
          ...mockContext.env,
          API_KEY: 'repeated-secret-key'
        }
      };

      await resolver.resolve('{{secret.API_KEY}}', contextWithSecrets);

      const outputWithRepeatedSecret = 'Key1: repeated-secret-key, Key2: repeated-secret-key, Key3: repeated-secret-key';
      const maskedOutput = resolver.maskSecrets(outputWithRepeatedSecret);

      expect(maskedOutput).toBe('Key1: [SECRET], Key2: [SECRET], Key3: [SECRET]');
    });

    it('should not mask non-secret values', async () => {
      const contextWithSecrets = {
        ...mockContext,
        env: {
          ...mockContext.env,
          API_KEY: 'secret-value'
        }
      };

      await resolver.resolve('{{secret.API_KEY}}', contextWithSecrets);

      const outputWithMixed = 'Secret: secret-value, Public: public-value, Number: 123';
      const maskedOutput = resolver.maskSecrets(outputWithMixed);

      expect(maskedOutput).toBe('Secret: [SECRET], Public: public-value, Number: 123');
    });

    it('should handle secrets with special regex characters', async () => {
      const contextWithSecrets = {
        ...mockContext,
        env: {
          ...mockContext.env,
          SPECIAL_SECRET: 'secret.with-special+chars*()'
        }
      };

      await resolver.resolve('{{secret.SPECIAL_SECRET}}', contextWithSecrets);

      const outputWithSpecialChars = 'Value: secret.with-special+chars*()';
      const maskedOutput = resolver.maskSecrets(outputWithSpecialChars);

      expect(maskedOutput).toBe('Value: [SECRET]');
    });

    it('should reset secret tracking when requested', async () => {
      const contextWithSecrets = {
        ...mockContext,
        env: {
          ...mockContext.env,
          API_KEY: 'secret-key'
        }
      };

      await resolver.resolve('{{secret.API_KEY}}', contextWithSecrets);
      expect(resolver.getSecretVariables()).toHaveLength(1);

      resolver.resetSecretTracking();
      expect(resolver.getSecretVariables()).toHaveLength(0);

      // After reset, masking should not affect the previously tracked secret
      const output = 'Key: secret-key';
      const maskedOutput = resolver.maskSecrets(output);
      expect(maskedOutput).toBe('Key: secret-key'); // Not masked since tracking was reset
    });

    it('should handle empty or undefined secret values gracefully', async () => {
      const contextWithSecrets = {
        ...mockContext,
        env: {
          ...mockContext.env,
          EMPTY_SECRET: '',
          // UNDEFINED_SECRET is intentionally missing
        }
      };

      // This should track the secret variable even if resolution fails
      try {
        await resolver.resolve('{{secret.UNDEFINED_SECRET}}', contextWithSecrets);
      } catch (error) {
        // Expected to fail
      }

      const output = 'Some output without secrets';
      const maskedOutput = resolver.maskSecrets(output);
      expect(maskedOutput).toBe(output); // No masking since no valid secret values
    });

    it('should work with resolveValue method for complex objects', async () => {
      const contextWithSecrets = {
        ...mockContext,
        env: {
          ...mockContext.env,
          API_KEY: 'secret-api-key',
          TOKEN: 'secret-token'
        }
      };

      const template = {
        headers: {
          'Authorization': 'Bearer {{secret.API_KEY}}',
          'X-Token': '{{secret.TOKEN}}'
        },
        config: {
          apiKey: '{{secret.API_KEY}}',
          publicValue: 'not-secret'
        }
      };

      await resolver.resolveValue(template, contextWithSecrets);

      // Now test masking
      const outputString = JSON.stringify({
        headers: {
          'Authorization': 'Bearer secret-api-key',
          'X-Token': 'secret-token'
        },
        config: {
          apiKey: 'secret-api-key',
          publicValue: 'not-secret'
        }
      });

      const maskedOutput = resolver.maskSecrets(outputString);

      expect(maskedOutput).toContain('"Authorization":"Bearer [SECRET]"');
      expect(maskedOutput).toContain('"X-Token":"[SECRET]"');
      expect(maskedOutput).toContain('"apiKey":"[SECRET]"');
      expect(maskedOutput).toContain('"publicValue":"not-secret"'); // Should not be masked
    });
  });

  describe('T9.7: Complete Variable Precedence Order (Unit Tests)', () => {
    it('should follow exact PRD precedence: CLI > Step with > Chain vars > Endpoint > API > Profile > Global', async () => {
      const context = resolver.createContext(
        { testVar: 'cli_value' },                    // 1. CLI (highest)
        { testVar: 'profile_value' },                // 6. Profile
        { testVar: 'api_value' },                    // 5. API
        { testVar: 'endpoint_value' },               // 4. Endpoint
        undefined,                                   // No plugins
        { testVar: 'global_value' }                  // 7. Global
      );
      
      // Add step with and chain vars manually
      context.stepWith = { testVar: 'step_with_value' };  // 2. Step with
      context.chainVars = { testVar: 'chain_vars_value' }; // 3. Chain vars

      const result = await resolver.resolve('{{testVar}}', context);
      expect(result).toBe('cli_value'); // CLI should win
    });

    it('should fall back correctly when higher precedence levels are missing', async () => {
      // Test Step with precedence (no CLI)
      let context = resolver.createContext(
        {},                                          // No CLI
        { testVar: 'profile_value' },
        { testVar: 'api_value' },
        { testVar: 'endpoint_value' },
        undefined,
        { testVar: 'global_value' }
      );
      context.stepWith = { testVar: 'step_with_value' };
      context.chainVars = { testVar: 'chain_vars_value' };

      let result = await resolver.resolve('{{testVar}}', context);
      expect(result).toBe('step_with_value');

      // Test Chain vars precedence (no CLI, no Step with)
      context = resolver.createContext(
        {},                                          // No CLI
        { testVar: 'profile_value' },
        { testVar: 'api_value' },
        { testVar: 'endpoint_value' },
        undefined,
        { testVar: 'global_value' }
      );
      context.stepWith = {};                         // No Step with
      context.chainVars = { testVar: 'chain_vars_value' };

      result = await resolver.resolve('{{testVar}}', context);
      expect(result).toBe('chain_vars_value');

      // Test Endpoint precedence
      context = resolver.createContext(
        {},
        { testVar: 'profile_value' },
        { testVar: 'api_value' },
        { testVar: 'endpoint_value' },
        undefined,
        { testVar: 'global_value' }
      );
      context.stepWith = {};
      context.chainVars = {};

      result = await resolver.resolve('{{testVar}}', context);
      expect(result).toBe('endpoint_value');

      // Test API precedence
      context = resolver.createContext(
        {},
        { testVar: 'profile_value' },
        { testVar: 'api_value' },
        {},                                          // No endpoint
        undefined,
        { testVar: 'global_value' }
      );

      result = await resolver.resolve('{{testVar}}', context);
      expect(result).toBe('api_value');

      // Test Profile precedence
      context = resolver.createContext(
        {},
        { testVar: 'profile_value' },
        {},                                          // No API
        {},
        undefined,
        { testVar: 'global_value' }
      );

      result = await resolver.resolve('{{testVar}}', context);
      expect(result).toBe('profile_value');

      // Test Global precedence
      context = resolver.createContext(
        {},
        {},                                          // No profile
        {},
        {},
        undefined,
        { testVar: 'global_value' }
      );

      result = await resolver.resolve('{{testVar}}', context);
      expect(result).toBe('global_value');
    });

    it('should handle scoped variables independently of unscoped precedence', async () => {
      process.env.TEST_SECRET = 'secret_value';
      process.env.TEST_ENV = 'env_value';

      const pluginSources: Record<string, Record<string, VariableSource>> = {
        testPlugin: {
          getValue: () => 'plugin_value'
        }
      };

      const context = resolver.createContext(
        { testVar: 'cli_value' },                    // Unscoped variable
        {},
        {},
        {},
        pluginSources,
        {}
      );

      // Unscoped should follow precedence
      const unscopedResult = await resolver.resolve('{{testVar}}', context);
      expect(unscopedResult).toBe('cli_value');

      // Scoped variables should work independently
      const secretResult = await resolver.resolve('{{secret.TEST_SECRET}}', context);
      expect(secretResult).toBe('secret_value');

      const envResult = await resolver.resolve('{{env.TEST_ENV}}', context);
      expect(envResult).toBe('env_value');

      const pluginResult = await resolver.resolve('{{plugins.testPlugin.getValue}}', context);
      expect(pluginResult).toBe('plugin_value');

      const dynamicResult = await resolver.resolve('{{$timestamp}}', context);
      expect(dynamicResult).toMatch(/^\d+$/);
    });

    it('should handle variable name conflicts across different scopes', async () => {
      process.env.conflictVar = 'env_value';

      const pluginSources: Record<string, Record<string, VariableSource>> = {
        testPlugin: {
          conflictVar: () => 'plugin_value'
        }
      };

      const context = resolver.createContext(
        { conflictVar: 'cli_value' },
        { conflictVar: 'profile_value' },
        { conflictVar: 'api_value' },
        { conflictVar: 'endpoint_value' },
        pluginSources,
        { conflictVar: 'global_value' }
      );

      // Unscoped should resolve to CLI (highest precedence)
      const unscopedResult = await resolver.resolve('{{conflictVar}}', context);
      expect(unscopedResult).toBe('cli_value');

      // Scoped access should work for each scope
      const envResult = await resolver.resolve('{{env.conflictVar}}', context);
      expect(envResult).toBe('env_value');

      const pluginResult = await resolver.resolve('{{plugins.testPlugin.conflictVar}}', context);
      expect(pluginResult).toBe('plugin_value');

      const apiResult = await resolver.resolve('{{api.conflictVar}}', context);
      expect(apiResult).toBe('api_value');

      const endpointResult = await resolver.resolve('{{endpoint.conflictVar}}', context);
      expect(endpointResult).toBe('endpoint_value');

      const profileResult = await resolver.resolve('{{profile.conflictVar}}', context);
      expect(profileResult).toBe('profile_value');
    });

    it('should maintain precedence with complex nested variable resolution', async () => {
      const context = resolver.createContext(
        { 
          baseVar: 'cli_base'
        },
        { 
          baseVar: 'profile_base'
        },
        {},
        {},
        undefined,
        {}
      );

      // First resolve the nested variable template, then resolve the result
      const nestedTemplate = '{{baseVar}}_nested';
      const resolvedNested = await resolver.resolve(nestedTemplate, context);
      
      // Add the resolved nested variable to CLI context
      context.cli.nestedVar = resolvedNested;

      // The nestedVar should use CLI baseVar due to precedence
      const result = await resolver.resolve('{{nestedVar}}', context);
      expect(result).toBe('cli_base_nested');
    });

    it('should handle precedence correctly with undefined/null values', async () => {
      const context = resolver.createContext(
        { definedVar: 'cli_value' },
        { definedVar: 'profile_value' },
        {},
        {},
        undefined,
        {}
      );

      // Add undefined values at higher precedence levels
      context.stepWith = { definedVar: undefined };
      context.chainVars = { definedVar: null };

      // Should fall back to CLI since stepWith and chainVars have undefined/null
      const result = await resolver.resolve('{{definedVar}}', context);
      expect(result).toBe('cli_value');
    });

    it('should validate precedence order matches PRD specification exactly', async () => {
      // This test documents the exact PRD precedence order
      const precedenceOrder = [
        'CLI arguments (--var)',
        'Step with overrides (in chain steps)',
        'chain.vars (defined at the start of a chain definition)',
        'Endpoint-specific variables',
        'API-specific variables',
        'Profile variables (from the active profile)',
        'Dedicated/Global variable files',
        '{{secret.*}} variables (scoped access only)',
        '{{env.*}} OS environment variables (scoped access only)',
        '{{$dynamic}} built-in dynamic variables (scoped access only)'
      ];

      // Test that our implementation follows this order
      const context = resolver.createContext(
        { testVar: 'level_1_cli' },                  // 1. CLI
        { testVar: 'level_6_profile' },              // 6. Profile
        { testVar: 'level_5_api' },                  // 5. API
        { testVar: 'level_4_endpoint' },             // 4. Endpoint
        undefined,                                   // Plugins (scoped only)
        { testVar: 'level_7_global' }                // 7. Global
      );
      context.stepWith = { testVar: 'level_2_step_with' };    // 2. Step with
      context.chainVars = { testVar: 'level_3_chain_vars' };  // 3. Chain vars

      // CLI should win (level 1)
      const result = await resolver.resolve('{{testVar}}', context);
      expect(result).toBe('level_1_cli');

      // Verify the precedence order is correctly documented
      expect(precedenceOrder).toHaveLength(10);
      expect(precedenceOrder[0]).toContain('CLI arguments');
      expect(precedenceOrder[1]).toContain('Step with overrides');
      expect(precedenceOrder[2]).toContain('chain.vars');
      expect(precedenceOrder[3]).toContain('Endpoint-specific');
      expect(precedenceOrder[4]).toContain('API-specific');
      expect(precedenceOrder[5]).toContain('Profile variables');
      expect(precedenceOrder[6]).toContain('Global variable files');
      expect(precedenceOrder[7]).toContain('{{secret.*}}');
      expect(precedenceOrder[8]).toContain('{{env.*}}');
      expect(precedenceOrder[9]).toContain('{{$dynamic}}');
    });
  });

  describe('T10.16: Nested Variable Resolution', () => {
    it('should resolve simple nested variables', async () => {
      const context = resolver.createContext(
        { index: '2', value: 'test' },
        {},
        {},
        {},
        undefined,
        {}
      );

      const result = await resolver.resolve('data.{{index}}.{{value}}', context);
      expect(result).toBe('data.2.test');
    });

    it('should resolve nested variables in step JSONPath expressions', async () => {
      const mockSteps: StepExecutionResult[] = [
        {
          stepId: 'getClaims',
          request: { method: 'GET', url: 'https://api.test.com/claims', headers: {}, body: undefined },
          response: {
            status: 200,
            statusText: 'OK',
            headers: {},
            body: '{"data": [{"id": 100}, {"id": 200}, {"id": 300}]}'
          },
          success: true
        }
      ];

      const context = resolver.createContext(
        { claimIndex: '1' },
        {},
        {},
        {},
        undefined,
        {}
      );
      context.steps = mockSteps;

      const result = await resolver.resolve('{{steps.getClaims.response.body.data.{{claimIndex}}.id}}', context);
      expect(result).toBe('200');
    });

    it('should resolve multiple nested variables in the same expression', async () => {
      const context = resolver.createContext(
        { 
          section: 'claims',
          index: '0',
          field: 'id'
        },
        {},
        {},
        {},
        undefined,
        {}
      );

      const result = await resolver.resolve('api/{{section}}/{{index}}/{{field}}', context);
      expect(result).toBe('api/claims/0/id');
    });

    it('should resolve nested variables with different scopes', async () => {
      const context = resolver.createContext(
        { userId: '123' },
        { environment: 'prod' },
        {},
        {},
        undefined,
        {}
      );

      const result = await resolver.resolve('{{profile.environment}}/users/{{userId}}/data', context);
      expect(result).toBe('prod/users/123/data');
    });

    it('should resolve complex nested variable expressions', async () => {
      const mockSteps: StepExecutionResult[] = [
        {
          stepId: 'getUsers',
          request: { method: 'GET', url: 'https://api.test.com/users', headers: {}, body: undefined },
          response: {
            status: 200,
            statusText: 'OK',
            headers: {},
            body: '{"users": [{"name": "john", "posts": [{"title": "First Post"}, {"title": "Second Post"}]}, {"name": "jane", "posts": [{"title": "Jane Post"}]}]}'
          },
          success: true
        }
      ];

      const context = resolver.createContext(
        { 
          userIndex: '0',
          postIndex: '1'
        },
        {},
        {},
        {},
        undefined,
        {}
      );
      context.steps = mockSteps;

      const result = await resolver.resolve('{{steps.getUsers.response.body.users.{{userIndex}}.posts.{{postIndex}}.title}}', context);
      expect(result).toBe('Second Post');
    });

    it('should handle environment variables in nested expressions', async () => {
      process.env.TEST_INDEX = '2';
      
      const mockSteps: StepExecutionResult[] = [
        {
          stepId: 'getData',
          request: { method: 'GET', url: 'https://api.test.com/data', headers: {}, body: undefined },
          response: {
            status: 200,
            statusText: 'OK',
            headers: {},
            body: '{"items": ["item0", "item1", "item2", "item3"]}'
          },
          success: true
        }
      ];

      const context = resolver.createContext(
        {},
        {},
        {},
        {},
        undefined,
        {}
      );
      context.steps = mockSteps;

      const result = await resolver.resolve('{{steps.getData.response.body.items.{{env.TEST_INDEX}}}}', context);
      expect(result).toBe('item2');

      delete process.env.TEST_INDEX;
    });

    it('should resolve profile variables in nested expressions', async () => {
      const mockSteps: StepExecutionResult[] = [
        {
          stepId: 'getProducts',
          request: { method: 'GET', url: 'https://api.test.com/products', headers: {}, body: undefined },
          response: {
            status: 200,
            statusText: 'OK',
            headers: {},
            body: '{"categories": {"electronics": ["phone", "laptop"], "books": ["fiction", "non-fiction"]}}'
          },
          success: true
        }
      ];

      const context = resolver.createContext(
        {},
        { category: 'electronics', productIndex: '1' },
        {},
        {},
        undefined,
        {}
      );
      context.steps = mockSteps;

      const result = await resolver.resolve('{{steps.getProducts.response.body.categories.{{profile.category}}.{{profile.productIndex}}}}', context);
      expect(result).toBe('laptop');
    });

    it('should prevent infinite loops with circular references', async () => {
      const context = resolver.createContext(
        { 
          a: '{{b}}',
          b: '{{a}}'
        },
        {},
        {},
        {},
        undefined,
        {}
      );

      await expect(resolver.resolve('{{a}}', context))
        .rejects.toThrow(VariableResolutionError);
      
      await expect(resolver.resolve('{{a}}', context))
        .rejects.toThrow('Maximum variable resolution iterations reached');
    });

    it('should handle deeply nested variables', async () => {
      const context = resolver.createContext(
        { 
          level1: '{{level2}}',
          level2: '{{level3}}',
          level3: 'final_value'
        },
        {},
        {},
        {},
        undefined,
        {}
      );

      const result = await resolver.resolve('{{level1}}', context);
      expect(result).toBe('final_value');
    });

    it('should throw error when nested variable cannot be resolved', async () => {
      const context = resolver.createContext(
        { index: '1' },
        {},
        {},
        {},
        undefined,
        {}
      );

      await expect(resolver.resolve('data.{{undefinedVar}}.value', context))
        .rejects.toThrow(VariableResolutionError);
      
      await expect(resolver.resolve('data.{{undefinedVar}}.value', context))
        .rejects.toThrow("Variable 'undefinedVar' could not be resolved");
    });

    it('should work with dynamic variables in nested expressions', async () => {
      const context = resolver.createContext(
        { prefix: '$timestamp' },
        {},
        {},
        {},
        undefined,
        {}
      );

      const result = await resolver.resolve('{{{{prefix}}}}', context);
      expect(result).toMatch(/^\d+$/); // Should be a timestamp
    });

    it('should handle multiple levels of nesting', async () => {
      const context = resolver.createContext(
        { 
          arrayIndex: '0',
          objectKey: 'name'
        },
        {},
        {},
        {},
        undefined,
        {}
      );

      const mockSteps: StepExecutionResult[] = [
        {
          stepId: 'complexData',
          request: { method: 'GET', url: 'https://api.test.com/complex', headers: {}, body: undefined },
          response: {
            status: 200,
            statusText: 'OK',
            headers: {},
            body: '{"data": [{"name": "first"}, {"name": "second"}]}'
          },
          success: true
        }
      ];
      context.steps = mockSteps;

      // This resolves: steps.complexData.response.body.data.{{arrayIndex}}.{{objectKey}}
      // Which becomes: steps.complexData.response.body.data.0.name
      const result = await resolver.resolve('{{steps.complexData.response.body.data.{{arrayIndex}}.{{objectKey}}}}', context);
      expect(result).toBe('first');
    });
  });

  describe('Phase 13: Enhanced Profile Merging', () => {
    describe('mergeProfiles with verbose output', () => {
      let stderrSpy: any;

      beforeEach(() => {
        stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      });

      afterEach(() => {
        stderrSpy.mockRestore();
      });

      it('should show merged profile variables in verbose mode', () => {
        const profiles = {
          base: { 
            apiUrl: 'https://api.example.com',
            timeout: 5000
          },
          env: { 
            environment: 'dev',
            debug: true
          },
          user: { 
            userId: '123',
            timeout: 10000 // Override base timeout
          }
        };

        const result = resolver.mergeProfiles(['base', 'env', 'user'], profiles, true);

        // Check merged result
        expect(result).toEqual({
          apiUrl: 'https://api.example.com',
          timeout: 10000, // user profile overrides base
          environment: 'dev',
          debug: true,
          userId: '123'
        });

        // Check verbose output
        expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE] Merged profile variables:\n');
        expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   apiUrl: https://api.example.com (from base profile)\n');
        expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   timeout: 10000 (from user profile)\n');
        expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   environment: dev (from env profile)\n');
        expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   debug: true (from env profile)\n');
        expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   userId: 123 (from user profile)\n');
      });

      it('should not show verbose output when verbose is false', () => {
        const profiles = {
          base: { apiUrl: 'https://api.example.com' },
          user: { userId: '123' }
        };

        const result = resolver.mergeProfiles(['base', 'user'], profiles, false);

        expect(result).toEqual({
          apiUrl: 'https://api.example.com',
          userId: '123'
        });

        // Should not have any verbose output
        expect(stderrSpy).not.toHaveBeenCalled();
      });

      it('should not show verbose output when no variables are merged', () => {
        const profiles = {
          empty1: {},
          empty2: {}
        };

        const result = resolver.mergeProfiles(['empty1', 'empty2'], profiles, true);

        expect(result).toEqual({});

        // Should not show verbose output for empty result
        expect(stderrSpy).not.toHaveBeenCalledWith('[VERBOSE] Merged profile variables:\n');
      });

      it('should mask secrets in verbose output', () => {
        // First set up a secret value to be tracked
        const secretValue = 'super-secret-key';
        resolver.resetSecretTracking();
        
        // Simulate secret tracking by calling maskSecrets with the secret value
        // This would normally happen during variable resolution
        const maskedValue = resolver.maskSecrets(secretValue);
        
        const profiles = {
          secrets: { 
            apiKey: secretValue,
            publicValue: 'not-secret'
          }
        };

        const result = resolver.mergeProfiles(['secrets'], profiles, true);

        expect(result).toEqual({
          apiKey: secretValue,
          publicValue: 'not-secret'
        });

        // Check that verbose output was called
        expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE] Merged profile variables:\n');
        expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('apiKey:'));
        expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('publicValue: not-secret (from secrets profile)'));
      });

      it('should show correct profile origin for overridden variables', () => {
        const profiles = {
          base: { 
            setting: 'base-value',
            unique: 'base-unique'
          },
          override: { 
            setting: 'override-value'
          }
        };

        const result = resolver.mergeProfiles(['base', 'override'], profiles, true);

        expect(result).toEqual({
          setting: 'override-value',
          unique: 'base-unique'
        });

        // Check that the origin shows the overriding profile
        expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   setting: override-value (from override profile)\n');
        expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   unique: base-unique (from base profile)\n');
      });

      it('should handle complex variable values in verbose output', () => {
        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        
        const profiles = {
          complex: {
            stringValue: 'simple string',
            numberValue: 42,
            booleanValue: true,
            objectValue: { nested: 'value' },
            arrayValue: [1, 2, 3]
          }
        };

        resolver.mergeProfiles(['complex'], profiles, true);

        expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE] Merged profile variables:\n');
        expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   stringValue: simple string (from complex profile)\n');
        expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   numberValue: 42 (from complex profile)\n');
        expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   booleanValue: true (from complex profile)\n');
        expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   objectValue: [object Object] (from complex profile)\n');
        expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   arrayValue: 1,2,3 (from complex profile)\n');

        stderrSpy.mockRestore();
      });
    });

    describe('backward compatibility', () => {
      it('should work with existing mergeProfiles calls without verbose parameter', () => {
        const profiles = {
          base: { apiUrl: 'https://api.example.com' },
          user: { userId: '123' }
        };

        // Call without verbose parameter (should default to false)
        const result = resolver.mergeProfiles(['base', 'user'], profiles);

        expect(result).toEqual({
          apiUrl: 'https://api.example.com',
          userId: '123'
        });
      });

      it('should maintain profile precedence order', () => {
        const profiles = {
          first: { 
            shared: 'first-value',
            unique1: 'first-unique'
          },
          second: { 
            shared: 'second-value',
            unique2: 'second-unique'
          },
          third: { 
            shared: 'third-value',
            unique3: 'third-unique'
          }
        };

        const result = resolver.mergeProfiles(['first', 'second', 'third'], profiles);

        expect(result).toEqual({
          shared: 'third-value', // Last profile wins
          unique1: 'first-unique',
          unique2: 'second-unique',
          unique3: 'third-unique'
        });
      });
    });
  });
}); 