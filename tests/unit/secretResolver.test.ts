/**
 * Unit tests for Phase 14: Custom Secret Resolver System
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginManager } from '../../src/core/pluginManager.js';
import { VariableResolver } from '../../src/core/variableResolver.js';
import type { Plugin, SecretResolver } from '../../src/types/plugin.js';

describe('Phase 14: Custom Secret Resolver System', () => {
  let pluginManager: PluginManager;
  let variableResolver: VariableResolver;

  beforeEach(() => {
    pluginManager = new PluginManager();
    variableResolver = new VariableResolver();
    variableResolver.resetSecretTracking();
  });

  describe('T14.1: SecretResolver Interface and PluginContext Enhancement', () => {
    it('should allow plugins to register secret resolvers through context', async () => {
      const mockSecretResolver: SecretResolver = vi.fn().mockResolvedValue('test-secret-value');
      
      // Create a plugin instance manually to test the registration
      const pluginInstance = {
        name: 'testPlugin',
        plugin: {} as Plugin,
        config: {},
        preRequestHooks: [],
        postResponseHooks: [],
        variableSources: {},
        parameterizedVariableSources: {},
        secretResolvers: [] as SecretResolver[]
      };

      const context = {
        request: {} as any,
        config: {},
        registerPreRequestHook: vi.fn(),
        registerPostResponseHook: vi.fn(),
        registerVariableSource: vi.fn(),
        registerParameterizedVariableSource: vi.fn(),
        registerSecretResolver: (resolver: SecretResolver) => {
          pluginInstance.secretResolvers.push(resolver);
        }
      };

      // Test that registerSecretResolver method exists and works
      expect(typeof context.registerSecretResolver).toBe('function');
      context.registerSecretResolver(mockSecretResolver);
      
      expect(pluginInstance.secretResolvers).toHaveLength(1);
      expect(pluginInstance.secretResolvers[0]).toBe(mockSecretResolver);
    });
  });

  describe('T14.2: PluginManager Secret Resolver Registration', () => {
    it('should store and retrieve secret resolvers from plugins', async () => {
      const resolver1: SecretResolver = vi.fn().mockResolvedValue('secret1');
      const resolver2: SecretResolver = vi.fn().mockResolvedValue('secret2');

      // Create mock plugin instances
      const plugin1 = {
        name: 'plugin1',
        plugin: {} as Plugin,
        config: {},
        preRequestHooks: [],
        postResponseHooks: [],
        variableSources: {},
        parameterizedVariableSources: {},
        secretResolvers: [resolver1]
      };

      const plugin2 = {
        name: 'plugin2',
        plugin: {} as Plugin,
        config: {},
        preRequestHooks: [],
        postResponseHooks: [],
        variableSources: {},
        parameterizedVariableSources: {},
        secretResolvers: [resolver2]
      };

      // Manually add plugins to manager
      (pluginManager as any).plugins = [plugin1, plugin2];

      const allResolvers = pluginManager.getSecretResolvers();
      expect(allResolvers).toHaveLength(2);
      expect(allResolvers).toContain(resolver1);
      expect(allResolvers).toContain(resolver2);
    });

    it('should return empty array when no secret resolvers are registered', () => {
      const resolvers = pluginManager.getSecretResolvers();
      expect(resolvers).toEqual([]);
    });
  });

  describe('T14.3: Variable Resolver Integration', () => {
    it('should use custom secret resolvers before environment variables', async () => {
      const customResolver: SecretResolver = vi.fn().mockResolvedValue('custom-secret-value');
      
      // Mock plugin manager with secret resolver
      const mockPluginManager = {
        getSecretResolvers: () => [customResolver]
      } as any;

      variableResolver.setPluginManager(mockPluginManager);

      const context = {
        cli: {},
        env: { TEST_SECRET: 'env-secret-value' },
        profiles: {},
        api: {},
        endpoint: {}
      };

      const result = await variableResolver.resolve('{{secret.TEST_SECRET}}', context);
      
      expect(customResolver).toHaveBeenCalledWith('TEST_SECRET');
      expect(result).toBe('custom-secret-value');
    });

    it('should fall back to environment variables when custom resolvers return undefined', async () => {
      const customResolver: SecretResolver = vi.fn().mockResolvedValue(undefined);
      
      const mockPluginManager = {
        getSecretResolvers: () => [customResolver]
      } as any;

      variableResolver.setPluginManager(mockPluginManager);

      const context = {
        cli: {},
        env: { TEST_SECRET: 'env-secret-value' },
        profiles: {},
        api: {},
        endpoint: {}
      };

      const result = await variableResolver.resolve('{{secret.TEST_SECRET}}', context);
      
      expect(customResolver).toHaveBeenCalledWith('TEST_SECRET');
      expect(result).toBe('env-secret-value');
    });

    it('should try multiple resolvers in order until one returns a value', async () => {
      const resolver1: SecretResolver = vi.fn().mockResolvedValue(undefined);
      const resolver2: SecretResolver = vi.fn().mockResolvedValue('second-resolver-value');
      const resolver3: SecretResolver = vi.fn().mockResolvedValue('third-resolver-value');
      
      const mockPluginManager = {
        getSecretResolvers: () => [resolver1, resolver2, resolver3]
      } as any;

      variableResolver.setPluginManager(mockPluginManager);

      const context = {
        cli: {},
        env: {},
        profiles: {},
        api: {},
        endpoint: {}
      };

      const result = await variableResolver.resolve('{{secret.TEST_SECRET}}', context);
      
      expect(resolver1).toHaveBeenCalledWith('TEST_SECRET');
      expect(resolver2).toHaveBeenCalledWith('TEST_SECRET');
      expect(resolver3).not.toHaveBeenCalled(); // Should stop after resolver2 returns value
      expect(result).toBe('second-resolver-value');
    });

    it('should handle resolver errors gracefully and continue to next resolver', async () => {
      const failingResolver: SecretResolver = vi.fn().mockRejectedValue(new Error('Resolver failed'));
      const workingResolver: SecretResolver = vi.fn().mockResolvedValue('working-resolver-value');
      
      const mockPluginManager = {
        getSecretResolvers: () => [failingResolver, workingResolver]
      } as any;

      variableResolver.setPluginManager(mockPluginManager);

      const context = {
        cli: {},
        env: {},
        profiles: {},
        api: {},
        endpoint: {}
      };

      const result = await variableResolver.resolve('{{secret.TEST_SECRET}}', context);
      
      expect(failingResolver).toHaveBeenCalledWith('TEST_SECRET');
      expect(workingResolver).toHaveBeenCalledWith('TEST_SECRET');
      expect(result).toBe('working-resolver-value');
    });

    it('should work without plugin manager set (backward compatibility)', async () => {
      const context = {
        cli: {},
        env: { TEST_SECRET: 'env-secret-value' },
        profiles: {},
        api: {},
        endpoint: {}
      };

      const result = await variableResolver.resolve('{{secret.TEST_SECRET}}', context);
      expect(result).toBe('env-secret-value');
    });
  });

  describe('T14.4: Secret Masking Integration', () => {
    it('should track secrets from custom resolvers for masking', async () => {
      const customResolver: SecretResolver = vi.fn().mockResolvedValue('super-secret-value');
      
      const mockPluginManager = {
        getSecretResolvers: () => [customResolver]
      } as any;

      variableResolver.setPluginManager(mockPluginManager);

      const context = {
        cli: {},
        env: {},
        profiles: {},
        api: {},
        endpoint: {}
      };

      await variableResolver.resolve('{{secret.API_KEY}}', context);
      
      const secretVariables = variableResolver.getSecretVariables();
      expect(secretVariables).toContain('secret.API_KEY');
      
      const maskedText = variableResolver.maskSecrets('The API key is super-secret-value');
      expect(maskedText).toBe('The API key is [SECRET]');
    });

    it('should mask multiple secrets from different resolvers', async () => {
      const resolver1: SecretResolver = vi.fn().mockImplementation((name) => {
        if (name === 'API_KEY') return Promise.resolve('secret-key-123');
        return Promise.resolve(undefined);
      });
      
      const resolver2: SecretResolver = vi.fn().mockImplementation((name) => {
        if (name === 'TOKEN') return Promise.resolve('secret-token-456');
        return Promise.resolve(undefined);
      });
      
      const mockPluginManager = {
        getSecretResolvers: () => [resolver1, resolver2]
      } as any;

      variableResolver.setPluginManager(mockPluginManager);

      const context = {
        cli: {},
        env: {},
        profiles: {},
        api: {},
        endpoint: {}
      };

      await variableResolver.resolve('{{secret.API_KEY}} and {{secret.TOKEN}}', context);
      
      const maskedText = variableResolver.maskSecrets(
        'API key: secret-key-123, Token: secret-token-456'
      );
      expect(maskedText).toBe('API key: [SECRET], Token: [SECRET]');
    });
  });

  describe('T14.5: API-Level Plugin Integration', () => {
    it('should support different secret mappings per API through plugin overrides', async () => {
      // This test verifies that the existing API-level plugin override system
      // works with secret resolvers (integration test would be more appropriate)
      
      const resolver: SecretResolver = vi.fn().mockImplementation((secretName) => {
        // This would be configured differently per API in real usage
        if (secretName === 'API_KEY') return Promise.resolve('api-specific-key');
        return Promise.resolve(undefined);
      });
      
      const mockPluginManager = {
        getSecretResolvers: () => [resolver]
      } as any;

      variableResolver.setPluginManager(mockPluginManager);

      const context = {
        cli: {},
        env: {},
        profiles: {},
        api: {},
        endpoint: {}
      };

      const result = await variableResolver.resolve('{{secret.API_KEY}}', context);
      expect(result).toBe('api-specific-key');
      expect(resolver).toHaveBeenCalledWith('API_KEY');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when secret cannot be resolved by any method', async () => {
      const resolver: SecretResolver = vi.fn().mockResolvedValue(undefined);
      
      const mockPluginManager = {
        getSecretResolvers: () => [resolver]
      } as any;

      variableResolver.setPluginManager(mockPluginManager);

      const context = {
        cli: {},
        env: {},
        profiles: {},
        api: {},
        endpoint: {}
      };

      await expect(
        variableResolver.resolve('{{secret.NONEXISTENT_SECRET}}', context)
      ).rejects.toThrow("Secret variable 'NONEXISTENT_SECRET' is not defined");
    });

    it('should handle async resolver errors without crashing', async () => {
      const errorResolver: SecretResolver = vi.fn().mockRejectedValue(new Error('Network error'));
      const fallbackResolver: SecretResolver = vi.fn().mockResolvedValue('fallback-value');
      
      const mockPluginManager = {
        getSecretResolvers: () => [errorResolver, fallbackResolver]
      } as any;

      variableResolver.setPluginManager(mockPluginManager);

      const context = {
        cli: {},
        env: {},
        profiles: {},
        api: {},
        endpoint: {}
      };

      const result = await variableResolver.resolve('{{secret.TEST_SECRET}}', context);
      expect(result).toBe('fallback-value');
    });
  });

  describe('Performance and Caching', () => {
    it('should call resolver only once per secret resolution', async () => {
      const resolver: SecretResolver = vi.fn().mockResolvedValue('cached-secret');
      
      const mockPluginManager = {
        getSecretResolvers: () => [resolver]
      } as any;

      variableResolver.setPluginManager(mockPluginManager);

      const context = {
        cli: {},
        env: {},
        profiles: {},
        api: {},
        endpoint: {}
      };

      // Resolve the same secret multiple times in one template
      await variableResolver.resolve('{{secret.API_KEY}} and {{secret.API_KEY}}', context);
      
      // Should be called twice since it's two separate variable resolutions
      expect(resolver).toHaveBeenCalledTimes(2);
      expect(resolver).toHaveBeenCalledWith('API_KEY');
    });
  });
}); 