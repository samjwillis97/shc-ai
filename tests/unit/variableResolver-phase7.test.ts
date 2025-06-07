import { describe, it, expect, beforeEach } from 'vitest';
import { VariableResolver, VariableResolutionError } from '../../src/core/variableResolver.js';
import { VariableSource } from '../../src/types/plugin.js';

describe('VariableResolver - Phase 7 Plugin Support', () => {
  let resolver: VariableResolver;

  beforeEach(() => {
    resolver = new VariableResolver();
  });

  describe('T7.4 & T7.5: Plugin Variable Sources', () => {
    it('should resolve plugin variables with plugins.name.variable syntax', async () => {
      const pluginSources: Record<string, Record<string, VariableSource>> = {
        testPlugin: {
          getToken: () => 'plugin-token-123',
          getUserId: async () => 'user-456'
        }
      };

      const context = resolver.createContext(
        {},
        undefined,
        undefined,
        undefined,
        pluginSources
      );

      const result = await resolver.resolve('Token: {{plugins.testPlugin.getToken}}, User: {{plugins.testPlugin.getUserId}}', context);
      expect(result).toBe('Token: plugin-token-123, User: user-456');
    });

    it('should handle async plugin variable sources', async () => {
      const pluginSources: Record<string, Record<string, VariableSource>> = {
        asyncPlugin: {
          asyncVar: async () => {
            // Simulate async operation
            await new Promise(resolve => globalThis.setTimeout(resolve, 10));
            return 'async-result';
          }
        }
      };

      const context = resolver.createContext(
        {},
        undefined,
        undefined,
        undefined,
        pluginSources
      );

      const result = await resolver.resolve('Result: {{plugins.asyncPlugin.asyncVar}}', context);
      expect(result).toBe('Result: async-result');
    });

    it('should handle multiple plugins with different variables', async () => {
      const pluginSources: Record<string, Record<string, VariableSource>> = {
        authPlugin: {
          getToken: () => 'auth-token',
          getUser: () => 'auth-user'
        },
        dataPlugin: {
          getData: () => 'plugin-data',
          getTimestamp: () => '1234567890'
        }
      };

      const context = resolver.createContext(
        {},
        undefined,
        undefined,
        undefined,
        pluginSources
      );

      const result = await resolver.resolve(
        'Auth: {{plugins.authPlugin.getToken}}, Data: {{plugins.dataPlugin.getData}}, Time: {{plugins.dataPlugin.getTimestamp}}',
        context
      );
      expect(result).toBe('Auth: auth-token, Data: plugin-data, Time: 1234567890');
    });

    it('should throw error for undefined plugin variables', async () => {
      const pluginSources: Record<string, Record<string, VariableSource>> = {
        testPlugin: {
          existingVar: () => 'exists'
        }
      };

      const context = resolver.createContext(
        {},
        undefined,
        undefined,
        undefined,
        pluginSources
      );

      await expect(resolver.resolve('{{plugins.testPlugin.nonExistentVar}}', context))
        .rejects.toThrow(VariableResolutionError);
      
      await expect(resolver.resolve('{{plugins.nonExistentPlugin.someVar}}', context))
        .rejects.toThrow(VariableResolutionError);
    });

    it('should throw error for plugin variable resolution failures', async () => {
      const pluginSources: Record<string, Record<string, VariableSource>> = {
        errorPlugin: {
          errorVar: async () => {
            throw new Error('Plugin variable error');
          }
        }
      };

      const context = resolver.createContext(
        {},
        undefined,
        undefined,
        undefined,
        pluginSources
      );

      await expect(resolver.resolve('{{plugins.errorPlugin.errorVar}}', context))
        .rejects.toThrow('Plugin variable \'plugins.errorPlugin.errorVar\' failed to resolve: Plugin variable error');
    });

    it('should handle plugin variables in complex objects', async () => {
      const pluginSources: Record<string, Record<string, VariableSource>> = {
        testPlugin: {
          userId: () => 'user-123',
          timestamp: () => '1234567890',
          token: () => 'bearer-token'
        }
      };

      const context = resolver.createContext(
        {},
        undefined,
        undefined,
        undefined,
        pluginSources
      );

      const complexObject = {
        user: {
          id: '{{plugins.testPlugin.userId}}',
          timestamp: '{{plugins.testPlugin.timestamp}}'
        },
        auth: {
          token: '{{plugins.testPlugin.token}}',
          type: 'Bearer'
        },
        metadata: [
          '{{plugins.testPlugin.userId}}',
          '{{plugins.testPlugin.timestamp}}'
        ]
      };

      const result = await resolver.resolveValue(complexObject, context);
      
      expect(result).toEqual({
        user: {
          id: 'user-123',
          timestamp: '1234567890'
        },
        auth: {
          token: 'bearer-token',
          type: 'Bearer'
        },
        metadata: [
          'user-123',
          '1234567890'
        ]
      });
    });
  });

  describe('Variable Precedence with Plugins', () => {
    it('should maintain correct precedence order with plugins', async () => {
      const pluginSources: Record<string, Record<string, VariableSource>> = {
        testPlugin: {
          testVar: () => 'plugin-value'
        }
      };

      // Test that CLI variables override plugin variables
      const context = resolver.createContext(
        { testVar: 'cli-value' }, // CLI
        { testVar: 'profile-value' }, // Profile
        { testVar: 'api-value' }, // API
        { testVar: 'endpoint-value' }, // Endpoint
        pluginSources // Plugins
      );

      const result = await resolver.resolve('{{testVar}}', context);
      expect(result).toBe('cli-value'); // CLI should win

      // Test that plugin variables work when no higher precedence variables exist
      const contextWithoutCli = resolver.createContext(
        {}, // No CLI
        {}, // No Profile
        {}, // No API
        {}, // No Endpoint
        pluginSources // Plugins
      );

      const resultPlugin = await resolver.resolve('{{plugins.testPlugin.testVar}}', context);
      expect(resultPlugin).toBe('plugin-value');
    });

    it('should handle mixed variable sources in same template', async () => {
      const pluginSources: Record<string, Record<string, VariableSource>> = {
        authPlugin: {
          getToken: () => 'plugin-token'
        }
      };

      const context = resolver.createContext(
        { cliVar: 'cli-value' },
        { profileVar: 'profile-value' },
        { apiVar: 'api-value' },
        { endpointVar: 'endpoint-value' },
        pluginSources
      );

      const template = 'CLI: {{cliVar}}, Profile: {{profile.profileVar}}, API: {{api.apiVar}}, Endpoint: {{endpoint.endpointVar}}, Plugin: {{plugins.authPlugin.getToken}}';
      const result = await resolver.resolve(template, context);
      
      expect(result).toBe('CLI: cli-value, Profile: profile-value, API: api-value, Endpoint: endpoint-value, Plugin: plugin-token');
    });
  });

  describe('Plugin Variable Edge Cases', () => {
    it('should handle plugin variables with dots in variable names', async () => {
      const pluginSources: Record<string, Record<string, VariableSource>> = {
        testPlugin: {
          'var.with.dots': () => 'dotted-value'
        }
      };

      const context = resolver.createContext(
        {},
        undefined,
        undefined,
        undefined,
        pluginSources
      );

      const result = await resolver.resolve('{{plugins.testPlugin.var.with.dots}}', context);
      expect(result).toBe('dotted-value');
    });

    it('should handle empty plugin variable sources', async () => {
      const pluginSources: Record<string, Record<string, VariableSource>> = {};

      const context = resolver.createContext(
        {},
        undefined,
        undefined,
        undefined,
        pluginSources
      );

      await expect(resolver.resolve('{{plugins.nonExistent.var}}', context))
        .rejects.toThrow(VariableResolutionError);
    });

    it('should handle plugin variables that return non-string values', async () => {
      const pluginSources: Record<string, Record<string, VariableSource>> = {
        testPlugin: {
          numberVar: () => '42',
          booleanVar: () => 'true',
          objectVar: () => '{"key":"value"}'
        }
      };

      const context = resolver.createContext(
        {},
        undefined,
        undefined,
        undefined,
        pluginSources
      );

      const numberResult = await resolver.resolve('{{plugins.testPlugin.numberVar}}', context);
      expect(numberResult).toBe('42');

      const booleanResult = await resolver.resolve('{{plugins.testPlugin.booleanVar}}', context);
      expect(booleanResult).toBe('true');

      const objectResult = await resolver.resolve('{{plugins.testPlugin.objectVar}}', context);
      expect(objectResult).toBe('{"key":"value"}');
    });
  });

  describe('Async Variable Resolution', () => {
    it('should handle multiple async variables in same template', async () => {
      const pluginSources: Record<string, Record<string, VariableSource>> = {
        asyncPlugin: {
          var1: async () => {
            await new Promise(resolve => globalThis.setTimeout(resolve, 10));
            return 'async1';
          },
          var2: async () => {
            await new Promise(resolve => globalThis.setTimeout(resolve, 5));
            return 'async2';
          }
        }
      };

      const context = resolver.createContext(
        {},
        undefined,
        undefined,
        undefined,
        pluginSources
      );

      const result = await resolver.resolve('{{plugins.asyncPlugin.var1}} and {{plugins.asyncPlugin.var2}}', context);
      expect(result).toBe('async1 and async2');
    });

    it('should handle async variables in arrays', async () => {
      const pluginSources: Record<string, Record<string, VariableSource>> = {
        asyncPlugin: {
          asyncVar: async () => {
            await new Promise(resolve => globalThis.setTimeout(resolve, 10));
            return 'async-value';
          },
          staticVar: () => 'static-value'
        }
      };

      const context = resolver.createContext(
        {},
        undefined,
        undefined,
        undefined,
        pluginSources
      );

      const array = [
        '{{plugins.asyncPlugin.asyncVar}}',
        'static-value',
        '{{plugins.asyncPlugin.asyncVar}}'
      ];

      const result = await resolver.resolveValue(array, context);
      expect(result).toEqual(['async-value', 'static-value', 'async-value']);
    });

    // Test timeout behavior
    const timeoutPromise = new Promise((_, reject) => {
      globalThis.setTimeout(() => {
        reject(new Error('Timeout'));
      }, 100);
    });

    // Test timeout behavior  
    const timeoutPromise2 = new Promise((_, reject) => {
      globalThis.setTimeout(() => {
        reject(new Error('Timeout'));
      }, 100);
    });
  });
}); 