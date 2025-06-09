import { describe, it, expect, beforeEach } from 'vitest';
import { VariableResolver, VariableResolutionError } from '../../src/core/variableResolver.js';
import { ParameterizedVariableSource } from '../../src/types/plugin.js';

describe('VariableResolver - T10.15 Parameterized Plugin Functions', () => {
  let resolver: VariableResolver;

  beforeEach(() => {
    resolver = new VariableResolver();
  });

  describe('Function Execution', () => {
    it('should execute parameterized functions with string arguments', async () => {
      const parameterizedSources: Record<string, Record<string, ParameterizedVariableSource>> = {
        cache: {
          get: (key: unknown, environment = 'dev') => {
            const cache: Record<string, string> = {
              'dev-api-key': 'dev-key-123',
              'prod-api-key': 'prod-key-456'
            };
            return cache[`${environment}-${key}`] || `not-found-${environment}-${key}`;
          }
        }
      };

      const context = resolver.createContext(
        {},
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        parameterizedSources
      );

      const result = await resolver.resolve('{{plugins.cache.get("api-key", "prod")}}', context);
      expect(result).toBe('prod-key-456');

      const resultWithDefault = await resolver.resolve('{{plugins.cache.get("api-key")}}', context);
      expect(resultWithDefault).toBe('dev-key-123');
    });

    it('should execute parameterized functions with variable arguments', async () => {
      const parameterizedSources: Record<string, Record<string, ParameterizedVariableSource>> = {
        auth: {
          getToken: (username: unknown, role = 'user') => {
            return `${role}-token-for-${username}`;
          }
        }
      };

      const context = resolver.createContext(
        { username: 'alice', role: 'admin' },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        parameterizedSources
      );

      const result = await resolver.resolve('{{plugins.auth.getToken("{{username}}", "{{role}}")}}', context);
      expect(result).toBe('admin-token-for-alice');
    });

    it('should handle async parameterized functions', async () => {
      const parameterizedSources: Record<string, Record<string, ParameterizedVariableSource>> = {
        async: {
          fetchData: async (id: unknown, timeout = '1000') => {
            await new Promise(resolve => globalThis.setTimeout(resolve, 10)); // Simulate async operation
            return `data-${id}-timeout-${timeout}`;
          },
          asyncFunction: async (input: unknown) => {
            await new Promise(resolve => globalThis.setTimeout(resolve, 10)); // Simulate async operation
            return `async-${input}`;
          }
        }
      };

      const context = resolver.createContext(
        {},
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        parameterizedSources
      );

      const result = await resolver.resolve('{{plugins.async.fetchData("123", "5000")}}', context);
      expect(result).toBe('data-123-timeout-5000');
    });

    it('should handle multiple parameterized functions in same template', async () => {
      const parameterizedSources: Record<string, Record<string, ParameterizedVariableSource>> = {
        utils: {
          format: (value: unknown, type: unknown) => {
            if (type === 'upper') return (value as string).toUpperCase();
            if (type === 'lower') return (value as string).toLowerCase();
            return value as string;
          },
          concat: (a: unknown, b: unknown) => `${a}-${b}`
        }
      };

      const context = resolver.createContext(
        { name: 'john', suffix: 'doe' },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        parameterizedSources
      );

      const result = await resolver.resolve(
        'User: {{plugins.utils.format("{{name}}", "upper")}} {{plugins.utils.concat("{{suffix}}", "123")}}',
        context
      );
      expect(result).toBe('User: JOHN doe-123');
    });

    it('should handle empty argument list', async () => {
      const parameterizedSources: Record<string, Record<string, ParameterizedVariableSource>> = {
        utils: {
          url: () => {
            return "this is something"
          },
        }
      };

      const context = resolver.createContext(
        { name: 'john', suffix: 'doe' },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        parameterizedSources
      );

      const result = await resolver.resolve(
        'User: {{plugins.utils.url()}}',
        context
      );
      expect(result).toBe('User: this is something');
    });

    // TODO:
    // it('should handle mixed arguments', async () => {
    // });

    // TODO:
    // it('should handle argument with comma in string', async () => {
    // });

    it('should throw error for undefined parameterized function', async () => {
      const parameterizedSources: Record<string, Record<string, ParameterizedVariableSource>> = {
        test: {
          existingFunc: () => 'exists'
        }
      };

      const context = resolver.createContext(
        {},
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        parameterizedSources
      );

      await expect(resolver.resolve('{{plugins.test.nonExistentFunc("arg")}}', context))
        .rejects.toThrow(VariableResolutionError);

      await expect(resolver.resolve('{{plugins.nonExistentPlugin.func("arg")}}', context))
        .rejects.toThrow(VariableResolutionError);
    });

    it('should throw error when parameterized function throws', async () => {
      const parameterizedSources: Record<string, Record<string, ParameterizedVariableSource>> = {
        error: {
          throwError: (message: unknown) => {
            throw new Error(`Plugin error: ${message}`);
          }
        }
      };

      const context = resolver.createContext(
        {},
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        parameterizedSources
      );

      await expect(resolver.resolve('{{plugins.error.throwError("test")}}', context))
        .rejects.toThrow('Parameterized function \'plugins.error.throwError("test")\' failed to execute: Plugin error: test');
    });
  });

  describe('Backward Compatibility', () => {
    it('should continue to support non-parameterized plugin functions', async () => {
      const nonParameterizedSources: Record<string, Record<string, import('../../src/types/plugin.js').VariableSource>> = {
        legacy: {
          getToken: () => 'legacy-token',
          getTimestamp: () => Date.now().toString()
        }
      };

      const context = resolver.createContext(
        {},
        undefined,
        undefined,
        undefined,
        nonParameterizedSources,
        undefined,
        undefined
      );

      const tokenResult = await resolver.resolve('{{plugins.legacy.getToken}}', context);
      expect(tokenResult).toBe('legacy-token');

      const timestampResult = await resolver.resolve('{{plugins.legacy.getTimestamp}}', context);
      expect(timestampResult).toMatch(/^\d+$/);
    });

    it('should handle mixed parameterized and non-parameterized functions from same plugin', async () => {
      const nonParameterizedSources: Record<string, Record<string, import('../../src/types/plugin.js').VariableSource>> = {
        mixed: {
          getDefaultToken: () => 'default-token'
        }
      };

      const parameterizedSources: Record<string, Record<string, ParameterizedVariableSource>> = {
        mixed: {
          getCustomToken: (type: unknown) => `${type}-token`
        }
      };

      const context = resolver.createContext(
        {},
        undefined,
        undefined,
        undefined,
        nonParameterizedSources,
        undefined,
        parameterizedSources
      );

      const defaultResult = await resolver.resolve('{{plugins.mixed.getDefaultToken}}', context);
      expect(defaultResult).toBe('default-token');

      const customResult = await resolver.resolve('{{plugins.mixed.getCustomToken("admin")}}', context);
      expect(customResult).toBe('admin-token');
    });
  });

  describe('Complex Use Cases', () => {
    it('should handle nested variable resolution in complex scenarios', async () => {
      const parameterizedSources: Record<string, Record<string, ParameterizedVariableSource>> = {
        cache: {
          get: (key: unknown, env: unknown) => {
            const data: Record<string, string> = {
              'dev-api-url': 'https://dev.api.com',
              'prod-api-url': 'https://api.com',
              'dev-secret': 'dev-secret-123',
              'prod-secret': 'prod-secret-456'
            };
            return data[`${env}-${key}`] || 'not-found';
          },
          buildAuth: (secret: unknown, type: unknown) => {
            return `${type} ${secret}`;
          }
        }
      };

      const context = resolver.createContext(
        { environment: 'prod', authType: 'Bearer' },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        parameterizedSources
      );

      // Nested function calls with variable resolution
      const result = await resolver.resolve(
        '{{plugins.cache.buildAuth("{{plugins.cache.get(\\"secret\\", \\"{{environment}}\\")}}", "{{authType}}")}}',
        context
      );
      expect(result).toBe('Bearer prod-secret-456');
    });

    it('should work in complex object structures', async () => {
      const parameterizedSources: Record<string, Record<string, ParameterizedVariableSource>> = {
        config: {
          getEndpoint: (service: unknown, env: unknown) => `https://${service}-${env}.example.com`,
          getApiKey: (service: unknown) => `key-for-${service}`
        }
      };

      const context = resolver.createContext(
        { env: 'staging', service: 'auth' },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        parameterizedSources
      );

      const complexObject = {
        api: {
          baseUrl: '{{plugins.config.getEndpoint("{{service}}", "{{env}}")}}',
          headers: {
            'X-API-Key': '{{plugins.config.getApiKey("{{service}}")}}',
            'User-Agent': 'HttpCraft/1.0'
          }
        },
        endpoints: [
          {
            name: 'login',
            url: '{{plugins.config.getEndpoint("{{service}}", "{{env}}")}}/login'
          }
        ]
      };

      const resolved = await resolver.resolveValue(complexObject, context);

      expect(resolved).toEqual({
        api: {
          baseUrl: 'https://auth-staging.example.com',
          headers: {
            'X-API-Key': 'key-for-auth',
            'User-Agent': 'HttpCraft/1.0'
          }
        },
        endpoints: [
          {
            name: 'login',
            url: 'https://auth-staging.example.com/login'
          }
        ]
      });
    });
  });
}); 
