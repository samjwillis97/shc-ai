/**
 * T9.7: Integration tests for complete variable precedence order
 * PRD FR3.2 precedence (Highest to Lowest):
 * 1. CLI arguments (--var)
 * 2. Step with overrides (in chain steps)
 * 3. chain.vars (defined at the start of a chain definition)
 * 4. Endpoint-specific variables
 * 5. API-specific variables
 * 6. Profile variables (from the active profile)
 * 7. Dedicated/Global variable files
 * 8. {{secret.*}} variables
 * 9. {{env.*}} OS environment variables
 * 10. {{$dynamic}} built-in dynamic variables
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VariableResolver, VariableContext } from '../../src/core/variableResolver.js';
import { VariableSource } from '../../src/types/plugin.js';

describe('T9.7: Complete Variable Precedence Order', () => {
  let resolver: VariableResolver;
  let originalEnv: typeof process.env;

  beforeEach(() => {
    resolver = new VariableResolver();
    resolver.resetSecretTracking();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Full Precedence Chain Tests', () => {
    it('should respect complete precedence order: CLI > Step with > Chain vars > Endpoint > API > Profile > Global > Secret > Env > Dynamic', async () => {
      // Setup environment variables
      process.env.TEST_VAR = 'env_value';
      process.env.SECRET_VAR = 'secret_env_value';

      // Setup plugin sources
      const pluginSources: Record<string, Record<string, VariableSource>> = {
        testPlugin: {
          testVar: () => 'plugin_value'
        }
      };

      // Create context with all variable sources
      const context: VariableContext = {
        cliVariables: { testVar: 'cli_value' },           // 1. CLI (highest)
        stepWith: { testVar: 'step_with_value' },         // 2. Step with
        chainVars: { testVar: 'chain_vars_value' },       // 3. Chain vars
        endpoint: { testVar: 'endpoint_value' },          // 4. Endpoint
        api: { testVar: 'api_value' },                    // 5. API
        profiles: { testVar: 'profile_value' },           // 6. Profile
        globalVariables: { testVar: 'global_value' },     // 7. Global
        plugins: pluginSources,                           // Plugin (scoped only)
        env: { ...process.env } as Record<string, string> // 8-9. Secret/Env
      };

      // CLI should win over all others
      const result = await resolver.resolve('{{testVar}}', context);
      expect(result).toBe('cli_value');
    });

    it('should fall back through precedence levels correctly', async () => {
      // Setup environment
      process.env.TEST_VAR = 'env_value';
      process.env.SECRET_VAR = 'secret_env_value';

      const pluginSources: Record<string, Record<string, VariableSource>> = {
        testPlugin: {
          testVar: () => 'plugin_value'
        }
      };

      // Test Step with precedence (no CLI)
      let context: VariableContext = {
        cliVariables: {},                                          // No CLI
        stepWith: { testVar: 'step_with_value' },         // 2. Step with
        chainVars: { testVar: 'chain_vars_value' },       // 3. Chain vars
        endpoint: { testVar: 'endpoint_value' },          // 4. Endpoint
        api: { testVar: 'api_value' },                    // 5. API
        profiles: { testVar: 'profile_value' },           // 6. Profile
        globalVariables: { testVar: 'global_value' },     // 7. Global
        plugins: pluginSources,
        env: { ...process.env } as Record<string, string>
      };

      let result = await resolver.resolve('{{testVar}}', context);
      expect(result).toBe('step_with_value');

      // Test Chain vars precedence (no CLI, no Step with)
      context = {
        cliVariables: {},                                          // No CLI
        stepWith: {},                                     // No Step with
        chainVars: { testVar: 'chain_vars_value' },       // 3. Chain vars
        endpoint: { testVar: 'endpoint_value' },          // 4. Endpoint
        api: { testVar: 'api_value' },                    // 5. API
        profiles: { testVar: 'profile_value' },           // 6. Profile
        globalVariables: { testVar: 'global_value' },     // 7. Global
        plugins: pluginSources,
        env: { ...process.env } as Record<string, string>
      };

      result = await resolver.resolve('{{testVar}}', context);
      expect(result).toBe('chain_vars_value');

      // Test Endpoint precedence
      context = {
        cliVariables: {},
        stepWith: {},
        chainVars: {},                                    // No Chain vars
        endpoint: { testVar: 'endpoint_value' },          // 4. Endpoint
        api: { testVar: 'api_value' },                    // 5. API
        profiles: { testVar: 'profile_value' },           // 6. Profile
        globalVariables: { testVar: 'global_value' },     // 7. Global
        plugins: pluginSources,
        env: { ...process.env } as Record<string, string>
      };

      result = await resolver.resolve('{{testVar}}', context);
      expect(result).toBe('endpoint_value');

      // Test API precedence
      context = {
        cliVariables: {},
        stepWith: {},
        chainVars: {},
        endpoint: {},                                     // No Endpoint
        api: { testVar: 'api_value' },                    // 5. API
        profiles: { testVar: 'profile_value' },           // 6. Profile
        globalVariables: { testVar: 'global_value' },     // 7. Global
        plugins: pluginSources,
        env: { ...process.env } as Record<string, string>
      };

      result = await resolver.resolve('{{testVar}}', context);
      expect(result).toBe('api_value');

      // Test Profile precedence
      context = {
        cliVariables: {},
        stepWith: {},
        chainVars: {},
        endpoint: {},
        api: {},                                          // No API
        profiles: { testVar: 'profile_value' },           // 6. Profile
        globalVariables: { testVar: 'global_value' },     // 7. Global
        plugins: pluginSources,
        env: { ...process.env } as Record<string, string>
      };

      result = await resolver.resolve('{{testVar}}', context);
      expect(result).toBe('profile_value');

      // Test Global variables precedence
      context = {
        cliVariables: {},
        stepWith: {},
        chainVars: {},
        endpoint: {},
        api: {},
        profiles: {},                                     // No Profile
        globalVariables: { testVar: 'global_value' },     // 7. Global
        plugins: pluginSources,
        env: { ...process.env } as Record<string, string>
      };

      result = await resolver.resolve('{{testVar}}', context);
      expect(result).toBe('global_value');
    });

    it('should handle scoped variables correctly in precedence', async () => {
      // Setup environment
      process.env.TEST_SECRET = 'secret_from_env';
      process.env.TEST_ENV = 'env_from_env';

      const pluginSources: Record<string, Record<string, VariableSource>> = {
        authPlugin: {
          getToken: () => 'plugin_token_value'
        }
      };

      const context: VariableContext = {
        cliVariables: { regularVar: 'cli_regular' },
        stepWith: {},
        chainVars: {},
        endpoint: {},
        api: {},
        profiles: {},
        globalVariables: {},
        plugins: pluginSources,
        env: { ...process.env } as Record<string, string>
      };

      // Test scoped variables work correctly
      const secretResult = await resolver.resolve('{{secret.TEST_SECRET}}', context);
      expect(secretResult).toBe('secret_from_env');

      const envResult = await resolver.resolve('{{env.TEST_ENV}}', context);
      expect(envResult).toBe('env_from_env');

      const pluginResult = await resolver.resolve('{{plugins.authPlugin.getToken}}', context);
      expect(pluginResult).toBe('plugin_token_value');

      const dynamicResult = await resolver.resolve('{{$timestamp}}', context);
      expect(dynamicResult).toMatch(/^\d+$/); // Should be a timestamp

      // Test that regular variables still follow precedence
      const regularResult = await resolver.resolve('{{regularVar}}', context);
      expect(regularResult).toBe('cli_regular');
    });

    it('should handle mixed scoped and unscoped variables in same template', async () => {
      // Setup environment
      process.env.API_KEY = 'secret_api_key';
      process.env.NODE_ENV = 'test';

      const pluginSources: Record<string, Record<string, VariableSource>> = {
        authPlugin: {
          getToken: () => 'bearer_token_123'
        }
      };

      const context: VariableContext = {
        cliVariables: { userId: 'user_123' },
        stepWith: {},
        chainVars: {},
        endpoint: { timeout: '5000' },
        api: { version: 'v2' },
        profiles: { environment: 'testing' },
        globalVariables: { defaultLimit: '100' },
        plugins: pluginSources,
        env: { ...process.env } as Record<string, string>
      };

      const template = 'User: {{userId}}, Timeout: {{timeout}}, Version: {{api.version}}, Env: {{env.NODE_ENV}}, Secret: {{secret.API_KEY}}, Token: {{plugins.authPlugin.getToken}}, Limit: {{defaultLimit}}, Timestamp: {{$timestamp}}';
      
      const result = await resolver.resolve(template, context);
      
      // Verify each part resolves correctly according to precedence
      expect(result).toContain('User: user_123');        // CLI
      expect(result).toContain('Timeout: 5000');         // Endpoint
      expect(result).toContain('Version: v2');           // API (scoped)
      expect(result).toContain('Env: test');             // Environment (scoped)
      expect(result).toContain('Secret: secret_api_key'); // Secret (scoped)
      expect(result).toContain('Token: bearer_token_123'); // Plugin (scoped)
      expect(result).toContain('Limit: 100');            // Global
      expect(result).toMatch(/Timestamp: \d+/);          // Dynamic
    });

    it('should handle complex precedence overrides', async () => {
      // Test where same variable exists at multiple levels
      const context: VariableContext = {
        cliVariables: { 
          cliOnlyVar: 'cli_only',
          overrideVar: 'cli_override'
        },
        stepWith: { 
          stepOnlyVar: 'step_only',
          overrideVar: 'step_override'  // Should be overridden by CLI
        },
        chainVars: { 
          chainOnlyVar: 'chain_only',
          overrideVar: 'chain_override' // Should be overridden by CLI and Step
        },
        endpoint: { 
          endpointOnlyVar: 'endpoint_only',
          overrideVar: 'endpoint_override' // Should be overridden by higher precedence
        },
        api: { 
          apiOnlyVar: 'api_only',
          overrideVar: 'api_override'
        },
        profiles: { 
          profileOnlyVar: 'profile_only',
          overrideVar: 'profile_override'
        },
        globalVariables: { 
          globalOnlyVar: 'global_only',
          overrideVar: 'global_override'
        },
        plugins: {},
        env: { ...process.env } as Record<string, string>
      };

      // Test that CLI wins for overrideVar
      const overrideResult = await resolver.resolve('{{overrideVar}}', context);
      expect(overrideResult).toBe('cli_override');

      // Test that each level-specific variable resolves correctly
      const cliResult = await resolver.resolve('{{cliOnlyVar}}', context);
      expect(cliResult).toBe('cli_only');

      const stepResult = await resolver.resolve('{{stepOnlyVar}}', context);
      expect(stepResult).toBe('step_only');

      const chainResult = await resolver.resolve('{{chainOnlyVar}}', context);
      expect(chainResult).toBe('chain_only');

      const endpointResult = await resolver.resolve('{{endpointOnlyVar}}', context);
      expect(endpointResult).toBe('endpoint_only');

      const apiResult = await resolver.resolve('{{apiOnlyVar}}', context);
      expect(apiResult).toBe('api_only');

      const profileResult = await resolver.resolve('{{profileOnlyVar}}', context);
      expect(profileResult).toBe('profile_only');

      const globalResult = await resolver.resolve('{{globalOnlyVar}}', context);
      expect(globalResult).toBe('global_only');
    });

    it('should handle precedence with missing intermediate levels', async () => {
      // Test precedence when some intermediate levels are missing
      const context: VariableContext = {
        cliVariables: { cliVar: 'cli_value' },
        stepWith: {},                                     // Empty instead of undefined
        chainVars: {},                                    // Empty instead of undefined
        endpoint: { endpointVar: 'endpoint_value' },
        api: { testVar: 'api_value' },                    // Add testVar to API level  
        profiles: {},
        globalVariables: { testVar: 'global_value' },     // Add testVar to global level
        plugins: {},
        env: { ...process.env } as Record<string, string>
      };

      // Should fall back from CLI to API (skipping missing levels)
      const result1 = await resolver.resolve('{{testVar}}', context);
      expect(result1).toBe('api_value'); // API should win over global

      // Test with only global available
      context.api = {};  // Empty API instead of undefined
      const result2 = await resolver.resolve('{{testVar}}', context);
      expect(result2).toBe('global_value'); // Global should be used
    });

    it('should throw error when variable cannot be resolved at any level', async () => {
      const context: VariableContext = {
        cliVariables: {},
        stepWith: {},
        chainVars: {},
        endpoint: {},
        api: {},
        profiles: {},
        globalVariables: {},
        plugins: {},
        env: {}
      };

      await expect(resolver.resolve('{{nonExistentVar}}', context))
        .rejects.toThrow("Variable 'nonExistentVar' could not be resolved");
    });
  });

  describe('Secret Variable Tracking in Precedence', () => {
    it('should track secret variables for masking regardless of precedence level', async () => {
      process.env.SECRET_KEY = 'super_secret_value';

      const context: VariableContext = {
        cliVariables: {},
        stepWith: {},
        chainVars: {},
        endpoint: {},
        api: {},
        profiles: {},
        globalVariables: {},
        plugins: {},
        env: { ...process.env } as Record<string, string>
      };

      // Resolve a secret variable
      await resolver.resolve('{{secret.SECRET_KEY}}', context);

      // Verify it's tracked for masking
      const secretVars = resolver.getSecretVariables();
      expect(secretVars).toContain('secret.SECRET_KEY');

      // Test masking works
      const textWithSecret = 'The key is super_secret_value and more text';
      const maskedText = resolver.maskSecrets(textWithSecret);
      expect(maskedText).toBe('The key is [SECRET] and more text');
    });
  });

  describe('Dynamic Variables in Precedence', () => {
    it('should handle dynamic variables correctly in precedence context', async () => {
      const context: VariableContext = {
        cliVariables: {},
        stepWith: {},
        chainVars: {},
        endpoint: {},
        api: {},
        profiles: {},
        globalVariables: {},
        plugins: {},
        env: {}
      };

      // Dynamic variables should work regardless of other precedence levels
      const timestamp = await resolver.resolve('{{$timestamp}}', context);
      expect(timestamp).toMatch(/^\d+$/);

      const isoTimestamp = await resolver.resolve('{{$isoTimestamp}}', context);
      expect(isoTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      const randomInt = await resolver.resolve('{{$randomInt}}', context);
      expect(parseInt(randomInt)).toBeGreaterThanOrEqual(0);
      expect(parseInt(randomInt)).toBeLessThan(1000000);

      const guid = await resolver.resolve('{{$guid}}', context);
      expect(guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  });

  describe('Plugin Variables in Precedence', () => {
    it('should handle plugin variables correctly (scoped access only)', async () => {
      const pluginSources: Record<string, Record<string, VariableSource>> = {
        testPlugin: {
          getValue: () => 'plugin_value',
          getAsyncValue: async () => 'async_plugin_value'
        }
      };

      const context: VariableContext = {
        cliVariables: { getValue: 'cli_value' }, // Same name as plugin variable
        stepWith: {},
        chainVars: {},
        endpoint: {},
        api: {},
        profiles: {},
        globalVariables: {},
        plugins: pluginSources,
        env: {}
      };

      // Unscoped should resolve to CLI value
      const unscopedResult = await resolver.resolve('{{getValue}}', context);
      expect(unscopedResult).toBe('cli_value');

      // Scoped plugin access should work
      const pluginResult = await resolver.resolve('{{plugins.testPlugin.getValue}}', context);
      expect(pluginResult).toBe('plugin_value');

      // Async plugin variables should work
      const asyncResult = await resolver.resolve('{{plugins.testPlugin.getAsyncValue}}', context);
      expect(asyncResult).toBe('async_plugin_value');
    });
  });
}); 