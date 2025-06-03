import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VariableResolver, VariableContext, VariableResolutionError } from '../../src/core/variableResolver.js';
import type { StepExecutionResult } from '../../src/core/chainExecutor.js';

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
      const result = await resolver.resolve('Path: {{PATH}}', mockContext);
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
      
      const result = await resolver.resolve('{{test}}', context);
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
      const contextWithGlobals = {
        ...mockContext,
        globalVariables: {
          someOtherVar: 'global-value'
        }
      };

      const result = await resolver.resolve('Path: {{PATH}}', contextWithGlobals);
      expect(result).toBe('Path: /usr/bin:/bin');
    });

    it('should handle missing global variables gracefully', async () => {
      const contextWithoutGlobals = {
        ...mockContext,
        globalVariables: undefined
      };

      const result = await resolver.resolve('Path: {{PATH}}', contextWithoutGlobals);
      expect(result).toBe('Path: /usr/bin:/bin');
    });
  });
}); 