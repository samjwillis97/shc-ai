import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PluginManager } from '../../src/core/pluginManager.js';
import { PluginConfiguration } from '../../src/types/config.js';
import { HttpRequest, HttpResponse } from '../../src/types/plugin.js';
import fs from 'fs/promises';
import path from 'path';
import { vi } from 'vitest';

describe('PluginManager', () => {
  let pluginManager: PluginManager;
  let tempDir: string;
  let testPluginPath: string;

  beforeEach(async () => {
    pluginManager = new PluginManager();
    
    // Create a temporary directory for test plugins
    tempDir = path.join(process.cwd(), 'temp-test-plugins');
    await fs.mkdir(tempDir, { recursive: true });
    
    // Create a test plugin file
    testPluginPath = path.join(tempDir, 'testPlugin.js');
    const testPluginContent = `
export default {
  async setup(context) {
    context.registerPreRequestHook(async (request) => {
      request.headers['X-Test-Plugin'] = 'test-value';
      request.headers['X-Config-Value'] = context.config.testValue || 'default';
    });
    
    context.registerVariableSource('testVar', () => {
      return 'plugin-test-value';
    });
    
    context.registerVariableSource('configVar', () => {
      return context.config.configVar || 'default-config';
    });
  }
};
`;
    await fs.writeFile(testPluginPath, testPluginContent);
  });

  afterEach(async () => {
    pluginManager.clear();
    
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('T7.1: Plugin Interface and Context', () => {
    it('should provide correct context to plugin setup', async () => {
      const pluginConfig: PluginConfiguration = {
        path: testPluginPath,
        name: 'testPlugin',
        config: { testValue: 'configured-value' }
      };

      await pluginManager.loadPlugins([pluginConfig], process.cwd());
      
      const plugins = pluginManager.getPlugins();
      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('testPlugin');
      expect(plugins[0].config).toEqual({ testValue: 'configured-value' });
    });
  });

  describe('T7.2: Plugin Loading', () => {
    it('should load a single plugin from local file', async () => {
      const pluginConfig: PluginConfiguration = {
        path: testPluginPath,
        name: 'testPlugin'
      };

      await pluginManager.loadPlugins([pluginConfig], process.cwd());
      
      const plugins = pluginManager.getPlugins();
      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('testPlugin');
    });

    it('should load multiple plugins', async () => {
      // Create a second test plugin
      const secondPluginPath = path.join(tempDir, 'secondPlugin.js');
      const secondPluginContent = `
export default {
  async setup(context) {
    context.registerPreRequestHook(async (request) => {
      request.headers['X-Second-Plugin'] = 'second-value';
    });
  }
};
`;
      await fs.writeFile(secondPluginPath, secondPluginContent);

      const pluginConfigs: PluginConfiguration[] = [
        { path: testPluginPath, name: 'testPlugin' },
        { path: secondPluginPath, name: 'secondPlugin' }
      ];

      await pluginManager.loadPlugins(pluginConfigs, process.cwd());
      
      const plugins = pluginManager.getPlugins();
      expect(plugins).toHaveLength(2);
      expect(plugins[0].name).toBe('testPlugin');
      expect(plugins[1].name).toBe('secondPlugin');
    });

    it('should throw error for invalid plugin path', async () => {
      const pluginConfig: PluginConfiguration = {
        path: './non-existent-plugin.js',
        name: 'invalidPlugin'
      };

      await expect(pluginManager.loadPlugins([pluginConfig], process.cwd()))
        .rejects.toThrow('Failed to load plugin \'invalidPlugin\'');
    });

    it('should throw error for plugin without setup method', async () => {
      const invalidPluginPath = path.join(tempDir, 'invalidPlugin.js');
      const invalidPluginContent = `
export default {
  // Missing setup method
  someOtherMethod() {}
};
`;
      await fs.writeFile(invalidPluginPath, invalidPluginContent);

      const pluginConfig: PluginConfiguration = {
        path: invalidPluginPath,
        name: 'invalidPlugin'
      };

      await expect(pluginManager.loadPlugins([pluginConfig], process.cwd()))
        .rejects.toThrow('does not export a valid Plugin object with a setup method');
    });
  });

  describe('T7.3 & T7.6: Pre-request Hooks', () => {
    it('should execute pre-request hooks', async () => {
      const pluginConfig: PluginConfiguration = {
        path: testPluginPath,
        name: 'testPlugin',
        config: { testValue: 'hook-test' }
      };

      await pluginManager.loadPlugins([pluginConfig], process.cwd());

      const request: HttpRequest = {
        method: 'GET',
        url: 'https://example.com',
        headers: {}
      };

      await pluginManager.executePreRequestHooks(request);

      expect(request.headers['X-Test-Plugin']).toBe('test-value');
      expect(request.headers['X-Config-Value']).toBe('hook-test');
    });

    it('should execute multiple pre-request hooks in order', async () => {
      // Create a second plugin that modifies the same header
      const secondPluginPath = path.join(tempDir, 'orderTestPlugin.js');
      const secondPluginContent = `
export default {
  async setup(context) {
    context.registerPreRequestHook(async (request) => {
      request.headers['X-Order-Test'] = (request.headers['X-Order-Test'] || '') + 'second';
    });
  }
};
`;
      await fs.writeFile(secondPluginPath, secondPluginContent);

      // Create a first plugin that sets the initial value
      const firstPluginPath = path.join(tempDir, 'firstOrderPlugin.js');
      const firstPluginContent = `
export default {
  async setup(context) {
    context.registerPreRequestHook(async (request) => {
      request.headers['X-Order-Test'] = 'first';
    });
  }
};
`;
      await fs.writeFile(firstPluginPath, firstPluginContent);

      const pluginConfigs: PluginConfiguration[] = [
        { path: firstPluginPath, name: 'firstPlugin' },
        { path: secondPluginPath, name: 'secondPlugin' }
      ];

      await pluginManager.loadPlugins(pluginConfigs, process.cwd());

      const request: HttpRequest = {
        method: 'GET',
        url: 'https://example.com',
        headers: {}
      };

      await pluginManager.executePreRequestHooks(request);

      expect(request.headers['X-Order-Test']).toBe('firstsecond');
    });

    it('should handle hook errors gracefully', async () => {
      const errorPluginPath = path.join(tempDir, 'errorPlugin.js');
      const errorPluginContent = `
export default {
  async setup(context) {
    context.registerPreRequestHook(async (request) => {
      throw new Error('Hook error');
    });
  }
};
`;
      await fs.writeFile(errorPluginPath, errorPluginContent);

      const pluginConfig: PluginConfiguration = {
        path: errorPluginPath,
        name: 'errorPlugin'
      };

      await pluginManager.loadPlugins([pluginConfig], process.cwd());

      const request: HttpRequest = {
        method: 'GET',
        url: 'https://example.com',
        headers: {}
      };

      await expect(pluginManager.executePreRequestHooks(request))
        .rejects.toThrow('Pre-request hook failed in plugin \'errorPlugin\': Hook error');
    });
  });

  describe('T7.4 & T7.5: Variable Sources', () => {
    it('should register and provide variable sources', async () => {
      const pluginConfig: PluginConfiguration = {
        path: testPluginPath,
        name: 'testPlugin',
        config: { configVar: 'configured-variable' }
      };

      await pluginManager.loadPlugins([pluginConfig], process.cwd());

      const variableSources = pluginManager.getVariableSources();
      
      expect(variableSources).toHaveProperty('testPlugin');
      expect(variableSources.testPlugin).toHaveProperty('testVar');
      expect(variableSources.testPlugin).toHaveProperty('configVar');

      // Test variable resolution
      const testVarValue = await variableSources.testPlugin.testVar();
      expect(testVarValue).toBe('plugin-test-value');

      const configVarValue = await variableSources.testPlugin.configVar();
      expect(configVarValue).toBe('configured-variable');
    });

    it('should handle multiple plugins with different variable sources', async () => {
      const secondPluginPath = path.join(tempDir, 'secondVarPlugin.js');
      const secondPluginContent = `
export default {
  async setup(context) {
    context.registerVariableSource('secondVar', () => {
      return 'second-plugin-value';
    });
  }
};
`;
      await fs.writeFile(secondPluginPath, secondPluginContent);

      const pluginConfigs: PluginConfiguration[] = [
        { path: testPluginPath, name: 'testPlugin' },
        { path: secondPluginPath, name: 'secondPlugin' }
      ];

      await pluginManager.loadPlugins(pluginConfigs, process.cwd());

      const variableSources = pluginManager.getVariableSources();
      
      expect(variableSources).toHaveProperty('testPlugin');
      expect(variableSources).toHaveProperty('secondPlugin');
      expect(variableSources.testPlugin).toHaveProperty('testVar');
      expect(variableSources.secondPlugin).toHaveProperty('secondVar');

      const firstValue = await variableSources.testPlugin.testVar();
      expect(firstValue).toBe('plugin-test-value');

      const secondValue = await variableSources.secondPlugin.secondVar();
      expect(secondValue).toBe('second-plugin-value');
    });
  });

  describe('T7.7: Configuration Passing', () => {
    it('should pass configuration to plugins', async () => {
      const pluginConfig: PluginConfiguration = {
        path: testPluginPath,
        name: 'testPlugin',
        config: {
          testValue: 'custom-config-value',
          configVar: 'custom-var-value'
        }
      };

      await pluginManager.loadPlugins([pluginConfig], process.cwd());

      const plugins = pluginManager.getPlugins();
      expect(plugins[0].config).toEqual({
        testValue: 'custom-config-value',
        configVar: 'custom-var-value'
      });

      // Test that config is used in hooks
      const request: HttpRequest = {
        method: 'GET',
        url: 'https://example.com',
        headers: {}
      };

      await pluginManager.executePreRequestHooks(request);
      expect(request.headers['X-Config-Value']).toBe('custom-config-value');

      // Test that config is used in variables
      const variableSources = pluginManager.getVariableSources();
      const configVarValue = await variableSources.testPlugin.configVar();
      expect(configVarValue).toBe('custom-var-value');
    });

    it('should handle plugins without configuration', async () => {
      const pluginConfig: PluginConfiguration = {
        path: testPluginPath,
        name: 'testPlugin'
        // No config property
      };

      await pluginManager.loadPlugins([pluginConfig], process.cwd());

      const plugins = pluginManager.getPlugins();
      expect(plugins[0].config).toEqual({});

      // Test that default values are used
      const request: HttpRequest = {
        method: 'GET',
        url: 'https://example.com',
        headers: {}
      };

      await pluginManager.executePreRequestHooks(request);
      expect(request.headers['X-Config-Value']).toBe('default');

      const variableSources = pluginManager.getVariableSources();
      const configVarValue = await variableSources.testPlugin.configVar();
      expect(configVarValue).toBe('default-config');
    });
  });

  describe('T10.1: Post-Response Hooks', () => {
    it('should register and execute post-response hooks', async () => {
      const postResponsePluginPath = path.join(tempDir, 'postResponsePlugin.js');
      const postResponsePluginContent = `
export default {
  async setup(context) {
    context.registerPostResponseHook(async (request, response) => {
      response.headers['X-Post-Response-Hook'] = 'executed';
      response.headers['X-Original-Status'] = response.status.toString();
    });
  }
};
`;
      await fs.writeFile(postResponsePluginPath, postResponsePluginContent);

      const pluginConfig: PluginConfiguration = {
        path: postResponsePluginPath,
        name: 'postResponsePlugin'
      };

      await pluginManager.loadPlugins([pluginConfig], process.cwd());

      const request: HttpRequest = {
        method: 'GET',
        url: 'https://example.com',
        headers: {}
      };

      const response: HttpResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'test response'
      };

      await pluginManager.executePostResponseHooks(request, response);

      expect(response.headers['X-Post-Response-Hook']).toBe('executed');
      expect(response.headers['X-Original-Status']).toBe('200');
    });

    it('should execute multiple post-response hooks in order', async () => {
      const firstPluginPath = path.join(tempDir, 'firstPostResponsePlugin.js');
      const firstPluginContent = `
export default {
  async setup(context) {
    context.registerPostResponseHook(async (request, response) => {
      response.headers['X-Hook-Order'] = 'first';
    });
  }
};
`;
      await fs.writeFile(firstPluginPath, firstPluginContent);

      const secondPluginPath = path.join(tempDir, 'secondPostResponsePlugin.js');
      const secondPluginContent = `
export default {
  async setup(context) {
    context.registerPostResponseHook(async (request, response) => {
      response.headers['X-Hook-Order'] = (response.headers['X-Hook-Order'] || '') + 'second';
    });
  }
};
`;
      await fs.writeFile(secondPluginPath, secondPluginContent);

      const pluginConfigs: PluginConfiguration[] = [
        { path: firstPluginPath, name: 'firstPlugin' },
        { path: secondPluginPath, name: 'secondPlugin' }
      ];

      await pluginManager.loadPlugins(pluginConfigs, process.cwd());

      const request: HttpRequest = {
        method: 'GET',
        url: 'https://example.com',
        headers: {}
      };

      const response: HttpResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'test response'
      };

      await pluginManager.executePostResponseHooks(request, response);

      expect(response.headers['X-Hook-Order']).toBe('firstsecond');
    });

    it('should allow post-response hooks to transform response body', async () => {
      const transformPluginPath = path.join(tempDir, 'transformPlugin.js');
      const transformPluginContent = `
export default {
  async setup(context) {
    context.registerPostResponseHook(async (request, response) => {
      if (response.body === 'transform-me') {
        response.body = '{"transformed": true, "original": "transform-me"}';
        response.headers['content-type'] = 'application/json';
        response.headers['x-transformed-by'] = 'transformPlugin';
      }
    });
  }
};
`;
      await fs.writeFile(transformPluginPath, transformPluginContent);

      const pluginConfig: PluginConfiguration = {
        path: transformPluginPath,
        name: 'transformPlugin'
      };

      await pluginManager.loadPlugins([pluginConfig], process.cwd());

      const request: HttpRequest = {
        method: 'GET',
        url: 'https://example.com',
        headers: {}
      };

      const response: HttpResponse = {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/plain' },
        body: 'transform-me'
      };

      await pluginManager.executePostResponseHooks(request, response);

      expect(response.body).toBe('{"transformed": true, "original": "transform-me"}');
      expect(response.headers['content-type']).toBe('application/json');
      expect(response.headers['x-transformed-by']).toBe('transformPlugin');
    });

    it('should handle post-response hook errors gracefully', async () => {
      const errorPluginPath = path.join(tempDir, 'postResponseErrorPlugin.js');
      const errorPluginContent = `
export default {
  async setup(context) {
    context.registerPostResponseHook(async (request, response) => {
      throw new Error('Post-response hook error');
    });
  }
};
`;
      await fs.writeFile(errorPluginPath, errorPluginContent);

      const pluginConfig: PluginConfiguration = {
        path: errorPluginPath,
        name: 'errorPlugin'
      };

      await pluginManager.loadPlugins([pluginConfig], process.cwd());

      const request: HttpRequest = {
        method: 'GET',
        url: 'https://example.com',
        headers: {}
      };

      const response: HttpResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'test response'
      };

      await expect(pluginManager.executePostResponseHooks(request, response))
        .rejects.toThrow('Post-response hook failed in plugin \'errorPlugin\': Post-response hook error');
    });

    it('should support plugins with both pre-request and post-response hooks', async () => {
      const dualHookPluginPath = path.join(tempDir, 'dualHookPlugin.js');
      const dualHookPluginContent = `
export default {
  async setup(context) {
    context.registerPreRequestHook(async (request) => {
      request.headers['X-Pre-Hook'] = 'executed';
    });
    
    context.registerPostResponseHook(async (request, response) => {
      response.headers['X-Post-Hook'] = 'executed';
      // Can access modified request from pre-hook
      response.headers['X-Request-Had-Pre-Hook'] = request.headers['X-Pre-Hook'] || 'no';
    });
  }
};
`;
      await fs.writeFile(dualHookPluginPath, dualHookPluginContent);

      const pluginConfig: PluginConfiguration = {
        path: dualHookPluginPath,
        name: 'dualHookPlugin'
      };

      await pluginManager.loadPlugins([pluginConfig], process.cwd());

      const request: HttpRequest = {
        method: 'GET',
        url: 'https://example.com',
        headers: {}
      };

      const response: HttpResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'test response'
      };

      // Execute pre-request hooks first
      await pluginManager.executePreRequestHooks(request);
      expect(request.headers['X-Pre-Hook']).toBe('executed');

      // Then execute post-response hooks
      await pluginManager.executePostResponseHooks(request, response);
      expect(response.headers['X-Post-Hook']).toBe('executed');
      expect(response.headers['X-Request-Had-Pre-Hook']).toBe('executed');
    });
  });

  describe('Plugin Manager Utilities', () => {
    it('should clear all plugins', async () => {
      const pluginConfig: PluginConfiguration = {
        path: testPluginPath,
        name: 'testPlugin'
      };

      await pluginManager.loadPlugins([pluginConfig], process.cwd());
      expect(pluginManager.getPlugins()).toHaveLength(1);

      pluginManager.clear();
      expect(pluginManager.getPlugins()).toHaveLength(0);
    });

    it('should return copy of plugins array', async () => {
      const pluginConfig: PluginConfiguration = {
        path: testPluginPath,
        name: 'testPlugin'
      };

      await pluginManager.loadPlugins([pluginConfig], process.cwd());
      
      const plugins1 = pluginManager.getPlugins();
      const plugins2 = pluginManager.getPlugins();
      
      expect(plugins1).not.toBe(plugins2); // Different array instances
      expect(plugins1).toEqual(plugins2); // Same content
    });
  });

  describe('API-level plugin configuration (T10.2)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should merge API-level plugin configurations with global configurations', async () => {
      // Create the actual plugin file
      const pluginPath = path.join(tempDir, 'test-plugin.js');
      const pluginContent = `
export default {
  async setup(context) {
    // Test plugin
  }
};
`;
      await fs.writeFile(pluginPath, pluginContent);

      // Setup global plugins
      const globalConfigs: PluginConfiguration[] = [
        {
          path: './test-plugin.js',
          name: 'testPlugin',
          config: {
            globalKey: 'globalValue',
            sharedKey: 'globalSharedValue'
          }
        }
      ];

      // Setup API-level plugin override
      const apiConfigs: PluginConfiguration[] = [
        {
          path: '', // Path not used in API configs, comes from global
          name: 'testPlugin',
          config: {
            apiKey: 'apiValue',
            sharedKey: 'apiSharedValue' // Should override global value
          }
        }
      ];

      await pluginManager.loadPlugins(globalConfigs, tempDir);
      
      const mergedConfigs = pluginManager.getMergedPluginConfigurations(apiConfigs);
      
      expect(mergedConfigs).toHaveLength(1);
      expect(mergedConfigs[0].name).toBe('testPlugin');
      expect(mergedConfigs[0].path).toBe('./test-plugin.js'); // From global config
      expect(mergedConfigs[0].config).toEqual({
        globalKey: 'globalValue',
        sharedKey: 'apiSharedValue', // API value should override global
        apiKey: 'apiValue'
      });
    });

    it('should include global plugins not overridden by API configs', async () => {
      // Create the actual plugin files
      const plugin1Path = path.join(tempDir, 'plugin1.js');
      const plugin2Path = path.join(tempDir, 'plugin2.js');
      const pluginContent = `
export default {
  async setup(context) {
    // Test plugin
  }
};
`;
      await fs.writeFile(plugin1Path, pluginContent);
      await fs.writeFile(plugin2Path, pluginContent);

      const globalConfigs: PluginConfiguration[] = [
        {
          path: './plugin1.js',
          name: 'plugin1',
          config: { key1: 'value1' }
        },
        {
          path: './plugin2.js',
          name: 'plugin2',
          config: { key2: 'value2' }
        }
      ];

      const apiConfigs: PluginConfiguration[] = [
        {
          path: '',
          name: 'plugin1',
          config: { key1: 'overridden' }
        }
      ];

      await pluginManager.loadPlugins(globalConfigs, tempDir);
      
      const mergedConfigs = pluginManager.getMergedPluginConfigurations(apiConfigs);
      
      expect(mergedConfigs).toHaveLength(2);
      
      const plugin1Config = mergedConfigs.find(c => c.name === 'plugin1');
      const plugin2Config = mergedConfigs.find(c => c.name === 'plugin2');
      
      expect(plugin1Config?.config).toEqual({ key1: 'overridden' });
      expect(plugin2Config?.config).toEqual({ key2: 'value2' });
    });

    it('should validate that API-level plugins reference existing global plugins (T10.5)', async () => {
      // Create the actual plugin file
      const plugin1Path = path.join(tempDir, 'plugin1.js');
      const pluginContent = `
export default {
  async setup(context) {
    // Test plugin
  }
};
`;
      await fs.writeFile(plugin1Path, pluginContent);

      const globalConfigs: PluginConfiguration[] = [
        {
          path: './plugin1.js',
          name: 'plugin1',
          config: {}
        }
      ];

      const apiConfigs: PluginConfiguration[] = [
        {
          path: '',
          name: 'nonexistentPlugin',
          config: {}
        }
      ];

      await pluginManager.loadPlugins(globalConfigs, tempDir);
      
      expect(() => {
        pluginManager.getMergedPluginConfigurations(apiConfigs);
      }).toThrow("API references undefined plugin 'nonexistentPlugin'. Plugin must be defined in the global plugins section, or provide 'path' or 'npmPackage' for inline definition.");
    });

    it('should return global configs when no API configs provided', async () => {
      // Create the actual plugin file
      const plugin1Path = path.join(tempDir, 'plugin1.js');
      const pluginContent = `
export default {
  async setup(context) {
    // Test plugin
  }
};
`;
      await fs.writeFile(plugin1Path, pluginContent);

      const globalConfigs: PluginConfiguration[] = [
        {
          path: './plugin1.js',
          name: 'plugin1',
          config: { key: 'value' }
        }
      ];

      await pluginManager.loadPlugins(globalConfigs, tempDir);
      
      const mergedConfigs = pluginManager.getMergedPluginConfigurations();
      
      expect(mergedConfigs).toEqual(globalConfigs);
    });

    it('should handle empty API plugin configurations', async () => {
      // Create the actual plugin file
      const plugin1Path = path.join(tempDir, 'plugin1.js');
      const pluginContent = `
export default {
  async setup(context) {
    // Test plugin
  }
};
`;
      await fs.writeFile(plugin1Path, pluginContent);

      const globalConfigs: PluginConfiguration[] = [
        {
          path: './plugin1.js',
          name: 'plugin1',
          config: { key: 'value' }
        }
      ];

      await pluginManager.loadPlugins(globalConfigs, tempDir);
      
      const apiPluginManager = await pluginManager.loadApiPlugins([], tempDir);
      
      // Should still load global plugins
      expect(apiPluginManager.getPlugins()).toHaveLength(1);
    });

    it('should create API-specific plugin manager with merged configurations', async () => {
      // Create mock plugin file
      const pluginContent = `
export default {
  async setup(context) {
    // Store config for verification
    this.mergedConfig = context.config;
  }
};
      `;
      
      const pluginPath = path.join(tempDir, 'test-plugin.js');
      await fs.writeFile(pluginPath, pluginContent);

      const globalConfigs: PluginConfiguration[] = [
        {
          path: './test-plugin.js',
          name: 'testPlugin',
          config: {
            globalKey: 'globalValue'
          }
        }
      ];

      const apiConfigs: PluginConfiguration[] = [
        {
          path: '',
          name: 'testPlugin',
          config: {
            apiKey: 'apiValue'
          }
        }
      ];

      await pluginManager.loadPlugins(globalConfigs, tempDir);
      
      const apiPluginManager = await pluginManager.loadApiPlugins(apiConfigs, tempDir);
      
      // Verify that the API plugin manager was created with merged configurations
      const apiPlugins = apiPluginManager.getPlugins();
      expect(apiPlugins).toHaveLength(1);
      expect(apiPlugins[0].name).toBe('testPlugin');
      expect(apiPlugins[0].config).toEqual({
        globalKey: 'globalValue',
        apiKey: 'apiValue'
      });
    });
  });

  describe('T10.4: Variable substitution in API-level plugin configurations', () => {
    it('should support variable substitution in API-level plugin configurations', () => {
      // Create plugin config with variables that need to be resolved
      const apiConfigsWithVariables: PluginConfiguration[] = [
        {
          path: '',
          name: 'testPlugin',
          config: {
            apiKey: '{{testVar}}',
            baseUrl: 'https://{{env.API_HOST}}/api',
            timeout: '{{timeoutValue}}',
            nested: {
              value: '{{nestedVar}}'
            }
          }
        }
      ];

      // Test that the configuration structure supports variables
      // The actual variable resolution will be tested in integration tests
      // since it requires the variable resolver and context
      expect(apiConfigsWithVariables[0].config?.apiKey).toBe('{{testVar}}');
      expect(apiConfigsWithVariables[0].config?.baseUrl).toBe('https://{{env.API_HOST}}/api');
      expect(apiConfigsWithVariables[0].config?.timeout).toBe('{{timeoutValue}}');
      expect(apiConfigsWithVariables[0].config?.nested).toEqual({ value: '{{nestedVar}}' });
    });
  });

  describe('T10.7: npm Plugin Loading', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should validate that either path or npmPackage is specified', async () => {
      const pluginConfig: PluginConfiguration = {
        name: 'invalidPlugin'
        // Missing both path and npmPackage
      };

      await expect(pluginManager.loadPlugins([pluginConfig], process.cwd()))
        .rejects.toThrow("Plugin 'invalidPlugin' must specify either 'path' or 'npmPackage'");
    });

    it('should validate that both path and npmPackage cannot be specified', async () => {
      const pluginConfig: PluginConfiguration = {
        path: './test-plugin.js',
        npmPackage: 'test-npm-plugin',
        name: 'invalidPlugin'
      };

      await expect(pluginManager.loadPlugins([pluginConfig], process.cwd()))
        .rejects.toThrow("Plugin 'invalidPlugin' cannot specify both 'path' and 'npmPackage'");
    });

    it('should attempt to load plugin from npm package', async () => {
      // Mock the npm plugin module
      const mockPlugin = {
        async setup(context: any) {
          context.registerPreRequestHook(async (request: any) => {
            request.headers['X-NPM-Plugin'] = 'npm-loaded';
          });
        }
      };

      // Mock the dynamic import for this specific package
      vi.doMock('test-npm-plugin', () => ({ default: mockPlugin }));

      const pluginConfig: PluginConfiguration = {
        npmPackage: 'test-npm-plugin',
        name: 'npmPlugin',
        config: { testConfig: 'npm-test' }
      };

      await pluginManager.loadPlugins([pluginConfig], process.cwd());

      // Verify the plugin was loaded
      const plugins = pluginManager.getPlugins();
      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('npmPlugin');
      expect(plugins[0].config).toEqual({ testConfig: 'npm-test' });

      // Test that the plugin hooks work
      const request = {
        method: 'GET',
        url: 'https://example.com',
        headers: {}
      };

      await pluginManager.executePreRequestHooks(request);
      expect(request.headers['X-NPM-Plugin']).toBe('npm-loaded');

      // Clean up the mock
      vi.doUnmock('test-npm-plugin');
    });

    it('should handle npm package not found error', async () => {
      const pluginConfig: PluginConfiguration = {
        npmPackage: 'nonexistent-plugin',
        name: 'missingPlugin'
      };

      await expect(pluginManager.loadPlugins([pluginConfig], process.cwd()))
        .rejects.toThrow("Failed to load plugin 'missingPlugin' from npm package 'nonexistent-plugin'");
    });

    it('should handle npm plugin without valid setup method', async () => {
      // Mock an npm package that doesn't export a valid plugin
      const invalidNpmPlugin = {
        someOtherMethod() {}
        // Missing setup method
      };

      vi.doMock('invalid-npm-plugin', () => ({ default: invalidNpmPlugin }));

      const pluginConfig: PluginConfiguration = {
        npmPackage: 'invalid-npm-plugin',
        name: 'invalidNpmPlugin'
      };

      await expect(pluginManager.loadPlugins([pluginConfig], process.cwd()))
        .rejects.toThrow("Plugin from npm package 'invalid-npm-plugin' does not export a valid Plugin object with a setup method");

      // Clean up the mock
      vi.doUnmock('invalid-npm-plugin');
    });

    it('should support npm packages in API-level plugin configuration merging', async () => {
      // Create a mock npm plugin
      const mockNpmPlugin = {
        async setup(context: any) {
          // Mock plugin setup
        }
      };

      vi.doMock('global-npm-plugin', () => ({ default: mockNpmPlugin }));

      const globalConfigs: PluginConfiguration[] = [
        {
          npmPackage: 'global-npm-plugin',
          name: 'npmPlugin',
          config: {
            globalKey: 'globalValue',
            sharedKey: 'globalSharedValue'
          }
        }
      ];

      const apiConfigs: PluginConfiguration[] = [
        {
          // API configs don't specify npmPackage - it comes from global
          name: 'npmPlugin',
          config: {
            apiKey: 'apiValue',
            sharedKey: 'apiSharedValue' // Should override global value
          }
        }
      ];

      await pluginManager.loadPlugins(globalConfigs, process.cwd());
      
      const mergedConfigs = pluginManager.getMergedPluginConfigurations(apiConfigs);
      
      expect(mergedConfigs).toHaveLength(1);
      expect(mergedConfigs[0].name).toBe('npmPlugin');
      expect(mergedConfigs[0].npmPackage).toBe('global-npm-plugin'); // From global config
      expect(mergedConfigs[0].path).toBeUndefined(); // Should not have path
      expect(mergedConfigs[0].config).toEqual({
        globalKey: 'globalValue',
        sharedKey: 'apiSharedValue', // API value should override global
        apiKey: 'apiValue'
      });

      // Clean up the mock
      vi.doUnmock('global-npm-plugin');
    });

    it('should load npm plugins with named exports', async () => {
      // Mock an npm package that has the plugin as a named export
      // We'll mock it with a default export that is undefined, so the fallback logic kicks in
      const mockPlugin = {
        async setup(context: any) {
          context.registerPreRequestHook(async (request: any) => {
            request.headers['X-Named-Export'] = 'named-export-loaded';
          });
        }
      };

      // Mock a module where default is undefined but the module itself is the plugin
      vi.doMock('named-export-plugin', () => ({
        default: undefined,
        ...mockPlugin  // Spread the plugin properties directly on the module
      }));

      const pluginConfig: PluginConfiguration = {
        npmPackage: 'named-export-plugin',
        name: 'namedExportPlugin'
      };

      await pluginManager.loadPlugins([pluginConfig], process.cwd());

      // Verify the plugin was loaded
      const plugins = pluginManager.getPlugins();
      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('namedExportPlugin');

      // Test that the plugin hooks work
      const request = {
        method: 'GET',
        url: 'https://example.com',
        headers: {}
      };

      await pluginManager.executePreRequestHooks(request);
      expect(request.headers['X-Named-Export']).toBe('named-export-loaded');

      // Clean up the mock
      vi.doUnmock('named-export-plugin');
    });

    it('should preserve npm package source in error messages', async () => {
      // Mock import to throw during plugin setup
      const mockPlugin = {
        async setup(context: any) {
          throw new Error('Plugin setup failed');
        }
      };

      vi.doMock('failing-npm-plugin', () => ({ default: mockPlugin }));

      const pluginConfig: PluginConfiguration = {
        npmPackage: 'failing-npm-plugin',
        name: 'failingPlugin'
      };

      await expect(pluginManager.loadPlugins([pluginConfig], process.cwd()))
        .rejects.toThrow("Failed to load plugin 'failingPlugin' from npm package 'failing-npm-plugin': Plugin setup failed");

      // Clean up the mock
      vi.doUnmock('failing-npm-plugin');
    });

    it('should create API-specific plugin manager with npm package configurations', async () => {
      // Mock npm plugin
      const mockNpmPlugin = {
        async setup(context: any) {
          // Store config for verification
          this.mergedConfig = context.config;
        }
      };

      vi.doMock('test-npm-plugin', () => ({ default: mockNpmPlugin }));

      const globalConfigs: PluginConfiguration[] = [
        {
          npmPackage: 'test-npm-plugin',
          name: 'testNpmPlugin',
          config: {
            globalKey: 'globalValue'
          }
        }
      ];

      const apiConfigs: PluginConfiguration[] = [
        {
          name: 'testNpmPlugin',
          config: {
            apiKey: 'apiValue'
          }
        }
      ];

      await pluginManager.loadPlugins(globalConfigs, process.cwd());
      
      const apiPluginManager = await pluginManager.loadApiPlugins(apiConfigs, process.cwd());
      
      // Verify that the API plugin manager was created with merged configurations
      const apiPlugins = apiPluginManager.getPlugins();
      expect(apiPlugins).toHaveLength(1);
      expect(apiPlugins[0].name).toBe('testNpmPlugin');
      expect(apiPlugins[0].config).toEqual({
        globalKey: 'globalValue',
        apiKey: 'apiValue'
      });

      // Clean up the mock
      vi.doUnmock('test-npm-plugin');
    });
  });

  describe('Bug Fix: Plugin setup should not be called twice', () => {
    it('should not call plugin setup twice when using API-level configurations', async () => {
      let setupCallCount = 0;
      
      // Create a test plugin that tracks setup calls
      const trackingPluginPath = path.join(tempDir, 'tracking-plugin.js');
      const trackingPluginContent = `
let setupCallCount = 0;

export default {
  async setup(context) {
    setupCallCount++;
    // Store the count on the plugin instance for verification
    this.setupCallCount = setupCallCount;
    
    context.registerPreRequestHook(async (request) => {
      request.headers['X-Setup-Call-Count'] = setupCallCount.toString();
    });
  }
};
`;
      await fs.writeFile(trackingPluginPath, trackingPluginContent);

      // Setup global plugins
      const globalConfigs: PluginConfiguration[] = [
        {
          path: './tracking-plugin.js',
          name: 'trackingPlugin',
          config: { globalKey: 'globalValue' }
        }
      ];

      // Setup API-level plugin override
      const apiConfigs: PluginConfiguration[] = [
        {
          path: '', // Path comes from global config
          name: 'trackingPlugin',
          config: { apiKey: 'apiValue' }
        }
      ];

      // Load global plugins first
      await pluginManager.loadPlugins(globalConfigs, tempDir);
      
      // Verify global plugin was loaded
      expect(pluginManager.getPlugins()).toHaveLength(1);
      
      // Load API-specific plugins (this should not call setup again for plugins without config changes)
      const apiPluginManager = await pluginManager.loadApiPlugins(apiConfigs, tempDir);
      
      // Verify API plugin manager has the plugin
      expect(apiPluginManager.getPlugins()).toHaveLength(1);
      
      // Test that setup was called exactly once for the API-level configured plugin
      // (it should be called once for global, then once more for API-level with different config)
      const request = {
        method: 'GET',
        url: 'https://example.com',
        headers: {}
      };

      await apiPluginManager.executePreRequestHooks(request);
      
      // The setup should have been called exactly twice:
      // 1. Once during global plugin loading
      // 2. Once during API plugin loading (because it has different config)
      expect(request.headers['X-Setup-Call-Count']).toBe('2');
    });

    it('should not reload plugins when no API-level configurations are provided', async () => {
      // Create a test plugin that tracks setup calls - with unique filename
      const trackingPluginPath = path.join(tempDir, 'tracking-plugin-2.js');
      const trackingPluginContent = `
let setupCallCount = 0;

export default {
  async setup(context) {
    setupCallCount++;
    
    context.registerPreRequestHook(async (request) => {
      request.headers['X-Setup-Call-Count'] = setupCallCount.toString();
    });
  }
};
`;
      await fs.writeFile(trackingPluginPath, trackingPluginContent);

      // Setup global plugins
      const globalConfigs: PluginConfiguration[] = [
        {
          path: './tracking-plugin-2.js',
          name: 'trackingPlugin',
          config: { globalKey: 'globalValue' }
        }
      ];

      // Load global plugins first
      await pluginManager.loadPlugins(globalConfigs, tempDir);
      
      // Load API-specific plugins with no API-level configurations
      const apiPluginManager = await pluginManager.loadApiPlugins(undefined, tempDir);
      
      // Test that the original plugin instance was reused
      const globalPlugins = pluginManager.getPlugins();
      const apiPlugins = apiPluginManager.getPlugins();
      
      expect(apiPlugins).toHaveLength(1);
      expect(apiPlugins[0]).toBe(globalPlugins[0]); // Should be the same instance
      
      // Test that setup was called exactly once
      const request = {
        method: 'GET',
        url: 'https://example.com',
        headers: {}
      };

      await apiPluginManager.executePreRequestHooks(request);
      expect(request.headers['X-Setup-Call-Count']).toBe('1');
    });

    it('should only reload plugins that have API-level configurations', async () => {
      // Create two test plugins that track setup calls - with unique filenames
      const plugin1Path = path.join(tempDir, 'plugin1-unique.js');
      const plugin1Content = `
let setupCallCount = 0;

export default {
  async setup(context) {
    setupCallCount++;
    
    context.registerPreRequestHook(async (request) => {
      request.headers['X-Plugin1-Setup-Count'] = setupCallCount.toString();
    });
  }
};
`;
      await fs.writeFile(plugin1Path, plugin1Content);

      const plugin2Path = path.join(tempDir, 'plugin2-unique.js');
      const plugin2Content = `
let setupCallCount = 0;

export default {
  async setup(context) {
    setupCallCount++;
    
    context.registerPreRequestHook(async (request) => {
      request.headers['X-Plugin2-Setup-Count'] = setupCallCount.toString();
    });
  }
};
`;
      await fs.writeFile(plugin2Path, plugin2Content);

      // Setup global plugins
      const globalConfigs: PluginConfiguration[] = [
        {
          path: './plugin1-unique.js',
          name: 'plugin1',
          config: { key: 'global1' }
        },
        {
          path: './plugin2-unique.js',
          name: 'plugin2',
          config: { key: 'global2' }
        }
      ];

      // Only override plugin1 at API level
      const apiConfigs: PluginConfiguration[] = [
        {
          path: '',
          name: 'plugin1',
          config: { key: 'api1' }
        }
      ];

      // Load global plugins first
      await pluginManager.loadPlugins(globalConfigs, tempDir);
      
      // Load API-specific plugins
      const apiPluginManager = await pluginManager.loadApiPlugins(apiConfigs, tempDir);
      
      // Test the hooks
      const request = {
        method: 'GET',
        url: 'https://example.com',
        headers: {}
      };

      await apiPluginManager.executePreRequestHooks(request);
      
      // Plugin1 should have been setup twice (global + API), plugin2 only once (global)
      expect(request.headers['X-Plugin1-Setup-Count']).toBe('2');
      expect(request.headers['X-Plugin2-Setup-Count']).toBe('1');
    });
  });

  describe('Bug Fix: Global plugin parameterized functions available in API-level configs', () => {
    it('should make global plugin parameterized functions available during API-level plugin configuration resolution', async () => {
      // Create a global plugin that registers a parameterized function
      const globalPluginPath = path.join(tempDir, 'global-plugin.js');
      const globalPluginContent = `
export default {
  async setup(context) {
    context.registerParameterizedVariableSource('getConfig', (key, environment) => {
      const configs = {
        'dev': { authUrl: 'https://dev.auth.com', apiKey: 'dev-key' },
        'prod': { authUrl: 'https://prod.auth.com', apiKey: 'prod-key' }
      };
      return configs[environment][key];
    });
  }
};
`;
      await fs.writeFile(globalPluginPath, globalPluginContent);

      // Create an API-level plugin that will use the global plugin's function
      const apiPluginPath = path.join(tempDir, 'api-plugin.js');
      const apiPluginContent = `
export default {
  async setup(context) {
    // Store the resolved config for verification
    this.resolvedConfig = context.config;
    
    context.registerPreRequestHook(async (request) => {
      request.headers['X-Resolved-Config'] = JSON.stringify(context.config);
    });
  }
};
`;
      await fs.writeFile(apiPluginPath, apiPluginContent);

      // Setup global plugins
      const globalConfigs: PluginConfiguration[] = [
        {
          path: './global-plugin.js',
          name: 'globalPlugin',
          config: {}
        },
        {
          path: './api-plugin.js', 
          name: 'apiPlugin',
          config: {}
        }
      ];

      // Setup API-level plugin config that uses the global plugin's parameterized function
      const apiConfigs: PluginConfiguration[] = [
        {
          name: 'apiPlugin',
          config: {
            authUrl: '{{plugins.globalPlugin.getConfig("authUrl", "prod")}}',
            apiKey: '{{plugins.globalPlugin.getConfig("apiKey", "dev")}}',
            staticValue: 'unchanged'
          }
        }
      ];

      // Load global plugins first
      await pluginManager.loadPlugins(globalConfigs, tempDir);
      
      // Verify global plugin has parameterized functions
      const globalParameterizedSources = pluginManager.getParameterizedVariableSources();
      expect(globalParameterizedSources.globalPlugin.getConfig).toBeDefined();

      // Create a variable context (simulating what the API command does)
      const { variableResolver } = await import('../../src/core/variableResolver.js');
      const variableContext = variableResolver.createContext(
        {}, // CLI vars
        { environment: 'prod' }, // Profile vars
        {}, // API vars
        {}, // Endpoint vars
        {}, // Plugin vars (empty initially)
        {}, // Global vars
        {} // Parameterized plugin sources (empty initially)
      );

      // Load API-specific plugins with the context - this should resolve variables
      const apiPluginManager = await pluginManager.loadApiPlugins(apiConfigs, tempDir, variableContext);
      
      // Verify that the API plugin was loaded with resolved configuration
      const apiPlugins = apiPluginManager.getPlugins();
      const apiPlugin = apiPlugins.find(p => p.name === 'apiPlugin');
      
      expect(apiPlugin).toBeDefined();
      expect(apiPlugin!.config).toEqual({
        authUrl: 'https://prod.auth.com',
        apiKey: 'dev-key', 
        staticValue: 'unchanged'
      });
    });

    it('should handle the case when no variable context is provided', async () => {
      // Create a global plugin that registers a parameterized function
      const globalPluginPath = path.join(tempDir, 'global-plugin-2.js');
      const globalPluginContent = `
export default {
  async setup(context) {
    context.registerParameterizedVariableSource('getEnvConfig', (env) => {
      return env === 'test' ? 'test-value' : 'default-value';
    });
  }
};
`;
      await fs.writeFile(globalPluginPath, globalPluginContent);

      const apiPluginPath = path.join(tempDir, 'api-plugin-2.js');
      const apiPluginContent = `
export default {
  async setup(context) {
    // Plugin setup
  }
};
`;
      await fs.writeFile(apiPluginPath, apiPluginContent);

      const globalConfigs: PluginConfiguration[] = [
        {
          path: './global-plugin-2.js',
          name: 'globalPlugin2',
          config: {}
        },
        {
          path: './api-plugin-2.js',
          name: 'apiPlugin2',
          config: {}
        }
      ];

      const apiConfigs: PluginConfiguration[] = [
        {
          name: 'apiPlugin2',
          config: {
            value: '{{plugins.globalPlugin2.getEnvConfig("test")}}'
          }
        }
      ];

      await pluginManager.loadPlugins(globalConfigs, tempDir);
      
      // Load API plugins without providing a variable context
      const apiPluginManager = await pluginManager.loadApiPlugins(apiConfigs, tempDir);
      
      // Should still work because the global plugin sources are included in the fallback context
      const apiPlugins = apiPluginManager.getPlugins();
      const apiPlugin = apiPlugins.find(p => p.name === 'apiPlugin2');
      
      expect(apiPlugin).toBeDefined();
      expect(apiPlugin!.config.value).toBe('test-value');
    });

    it('should not overwrite existing plugin sources in provided context', async () => {
      // Create global plugin
      const globalPluginPath = path.join(tempDir, 'global-plugin-3.js');
      const globalPluginContent = `
export default {
  async setup(context) {
    context.registerParameterizedVariableSource('globalFunc', () => 'global-value');
    context.registerVariableSource('globalVar', () => 'global-var-value');
  }
};
`;
      await fs.writeFile(globalPluginPath, globalPluginContent);

      const apiPluginPath = path.join(tempDir, 'api-plugin-3.js');
      const apiPluginContent = `
export default {
  async setup(context) {
    // Plugin setup
  }
};
`;
      await fs.writeFile(apiPluginPath, apiPluginContent);

      const globalConfigs: PluginConfiguration[] = [
        {
          path: './global-plugin-3.js',
          name: 'globalPlugin3',
          config: {}
        },
        {
          path: './api-plugin-3.js',
          name: 'apiPlugin3',
          config: {}
        }
      ];

      const apiConfigs: PluginConfiguration[] = [
        {
          name: 'apiPlugin3',
          config: {
            globalValue: '{{plugins.globalPlugin3.globalFunc()}}',
            existingValue: '{{plugins.existingPlugin.existingFunc()}}'
          }
        }
      ];

      await pluginManager.loadPlugins(globalConfigs, tempDir);

      // Create a variable context with existing plugin sources
      const { variableResolver } = await import('../../src/core/variableResolver.js');
      const existingPluginSources = {
        existingPlugin: {
          existingFunc: () => 'existing-value'
        }
      };
      const existingParameterizedSources = {
        existingPlugin: {
          existingFunc: () => 'existing-param-value'
        }
      };

      const variableContext = variableResolver.createContext(
        {}, // CLI vars
        {}, // Profile vars
        {}, // API vars
        {}, // Endpoint vars
        existingPluginSources, // Existing plugin vars
        {}, // Global vars
        existingParameterizedSources // Existing parameterized sources
      );

      const apiPluginManager = await pluginManager.loadApiPlugins(apiConfigs, tempDir, variableContext);
      
      const apiPlugins = apiPluginManager.getPlugins();
      const apiPlugin = apiPlugins.find(p => p.name === 'apiPlugin3');
      
      expect(apiPlugin).toBeDefined();
      expect(apiPlugin!.config).toEqual({
        globalValue: 'global-value',
        existingValue: 'existing-param-value'
      });
    });

    it('should handle the exact scenario from the bug report', async () => {
      // Create configProvider plugin (like the user's plugin)
      const configProviderPath = path.join(tempDir, 'config-provider.js');
      const configProviderContent = `
export default {
  async setup(context) {
    context.registerParameterizedVariableSource('getDataSourceConfig', (configKey, dataSource) => {
      const configurations = {
        nib: {
          authorizationUrl: "https://id.nib-cf-test.com/authorize",
          tokenUrl: "https://id.nib-cf-test.com/oauth/token",
          clientId: "test-client-id"
        }
      };

      const config = configurations[dataSource];
      if (!config) {
        throw new Error(\`Unknown dataSource: \${dataSource}\`);
      }

      return config[configKey];
    });
  }
};
`;
      await fs.writeFile(configProviderPath, configProviderContent);

      // Mock oauth2 plugin (built-in)
      const oauth2PluginPath = path.join(tempDir, 'oauth2-plugin.js');
      const oauth2PluginContent = `
export default {
  async setup(context) {
    // Store config for verification
    this.resolvedConfig = context.config;
  }
};
`;
      await fs.writeFile(oauth2PluginPath, oauth2PluginContent);

      const globalConfigs: PluginConfiguration[] = [
        {
          path: './config-provider.js',
          name: 'configProvider',
          config: {}
        },
        {
          path: './oauth2-plugin.js',
          name: 'oauth2',
          config: {}
        }
      ];

      // This is the exact API-level config that was failing
      const apiConfigs: PluginConfiguration[] = [
        {
          name: 'oauth2',
          config: {
            authorizationUrl: '{{plugins.configProvider.getDataSourceConfig("authorizationUrl", "{{dataSource}}")}}',
            tokenUrl: 'https://id.nib-cf-test.com/oauth/token',
            clientId: 'test-client-id'
          }
        }
      ];

      await pluginManager.loadPlugins(globalConfigs, tempDir);

      // Create context with dataSource from profile (like in the user's setup)
      const { variableResolver } = await import('../../src/core/variableResolver.js');
      const variableContext = variableResolver.createContext(
        {}, // CLI vars
        { dataSource: 'nib' }, // Profile vars with dataSource
        {}, // API vars
        {}, // Endpoint vars
        {}, // Plugin vars
        {}, // Global vars
        {} // Parameterized sources
      );

      // This should now work without throwing an error
      const apiPluginManager = await pluginManager.loadApiPlugins(apiConfigs, tempDir, variableContext);
      
      const oauth2Plugin = apiPluginManager.getPlugins().find(p => p.name === 'oauth2');
      expect(oauth2Plugin).toBeDefined();
      expect(oauth2Plugin!.config).toEqual({
        authorizationUrl: 'https://id.nib-cf-test.com/authorize',
        tokenUrl: 'https://id.nib-cf-test.com/oauth/token',
        clientId: 'test-client-id'
      });
    });

    it('should throw appropriate error when parameterized function does not exist', async () => {
      const globalPluginPath = path.join(tempDir, 'limited-plugin.js');
      const globalPluginContent = `
export default {
  async setup(context) {
    context.registerParameterizedVariableSource('existingFunc', () => 'exists');
  }
};
`;
      await fs.writeFile(globalPluginPath, globalPluginContent);

      const apiPluginPath = path.join(tempDir, 'api-plugin-error.js');
      const apiPluginContent = `
export default {
  async setup(context) {
    // Plugin setup
  }
};
`;
      await fs.writeFile(apiPluginPath, apiPluginContent);

      const globalConfigs: PluginConfiguration[] = [
        {
          path: './limited-plugin.js',
          name: 'limitedPlugin',
          config: {}
        },
        {
          path: './api-plugin-error.js',
          name: 'apiPluginError',
          config: {}
        }
      ];

      const apiConfigs: PluginConfiguration[] = [
        {
          name: 'apiPluginError',
          config: {
            value: '{{plugins.limitedPlugin.nonExistentFunc("test")}}'
          }
        }
      ];

      await pluginManager.loadPlugins(globalConfigs, tempDir);

      // This should throw an error about the non-existent function
      await expect(pluginManager.loadApiPlugins(apiConfigs, tempDir)).rejects.toThrow(
        /Parameterized function 'nonExistentFunc' not found in plugin 'limitedPlugin'/
      );
    });
  });

  describe('Inline Plugin Definitions (Enhanced API-level plugins)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should support inline plugin definitions with local file path', async () => {
      // Create an inline plugin file
      const inlinePluginPath = path.join(tempDir, 'inline-plugin.js');
      const inlinePluginContent = `
export default {
  async setup(context) {
    context.registerPreRequestHook(async (request) => {
      request.headers['X-Inline-Plugin'] = 'local-file';
    });
  }
};
`;
      await fs.writeFile(inlinePluginPath, inlinePluginContent);

      // No global plugins - inline plugin should work without global definition
      const globalConfigs: PluginConfiguration[] = [];

      // API-level inline plugin configuration
      const apiConfigs: PluginConfiguration[] = [
        {
          name: 'inlinePlugin',
          path: './inline-plugin.js',
          config: {
            inlineKey: 'inlineValue'
          }
        }
      ];

      await pluginManager.loadPlugins(globalConfigs, tempDir);
      
      const mergedConfigs = pluginManager.getMergedPluginConfigurations(apiConfigs);
      
      expect(mergedConfigs).toHaveLength(1);
      expect(mergedConfigs[0].name).toBe('inlinePlugin');
      expect(mergedConfigs[0].path).toBe('./inline-plugin.js');
      expect(mergedConfigs[0].config).toEqual({
        inlineKey: 'inlineValue'
      });
    });

    it('should support inline plugin definitions with npm package', async () => {
      // Mock npm plugin
      const mockNpmPlugin = {
        async setup(context: any) {
          context.registerPreRequestHook(async (request: any) => {
            request.headers['X-Inline-Plugin'] = 'npm-package';
          });
        }
      };

      vi.doMock('inline-npm-plugin', () => ({ default: mockNpmPlugin }));

      // No global plugins
      const globalConfigs: PluginConfiguration[] = [];

      // API-level inline plugin configuration with npm package
      const apiConfigs: PluginConfiguration[] = [
        {
          name: 'inlineNpmPlugin',
          npmPackage: 'inline-npm-plugin',
          config: {
            npmKey: 'npmValue'
          }
        }
      ];

      await pluginManager.loadPlugins(globalConfigs, tempDir);
      
      const mergedConfigs = pluginManager.getMergedPluginConfigurations(apiConfigs);
      
      expect(mergedConfigs).toHaveLength(1);
      expect(mergedConfigs[0].name).toBe('inlineNpmPlugin');
      expect(mergedConfigs[0].npmPackage).toBe('inline-npm-plugin');
      expect(mergedConfigs[0].config).toEqual({
        npmKey: 'npmValue'
      });

      // Clean up the mock
      vi.doUnmock('inline-npm-plugin');
    });

    it('should support mix of global plugin references and inline plugin definitions', async () => {
      // Create files for both global and inline plugins
      const globalPluginPath = path.join(tempDir, 'global-plugin.js');
      const inlinePluginPath = path.join(tempDir, 'inline-plugin.js');
      
      const pluginContent = `
export default {
  async setup(context) {
    // Test plugin
  }
};
`;
      await fs.writeFile(globalPluginPath, pluginContent);
      await fs.writeFile(inlinePluginPath, pluginContent);

      // Global plugin configuration
      const globalConfigs: PluginConfiguration[] = [
        {
          name: 'globalPlugin',
          path: './global-plugin.js',
          config: {
            globalKey: 'globalValue'
          }
        }
      ];

      // API configs with both types
      const apiConfigs: PluginConfiguration[] = [
        {
          // Reference global plugin
          name: 'globalPlugin',
          config: { apiSpecific: true }
        },
        {
          // Inline plugin
          name: 'inlinePlugin',
          path: './inline-plugin.js',
          config: {
            inlineKey: 'inlineValue'
          }
        }
      ];

      await pluginManager.loadPlugins(globalConfigs, tempDir);
      
      const mergedConfigs = pluginManager.getMergedPluginConfigurations(apiConfigs);
      
      expect(mergedConfigs).toHaveLength(2);
      
      // Check global plugin reference (merged configuration)
      const globalPluginConfig = mergedConfigs.find(c => c.name === 'globalPlugin');
      expect(globalPluginConfig).toBeDefined();
      expect(globalPluginConfig!.path).toBe('./global-plugin.js');
      expect(globalPluginConfig!.config).toEqual({
        globalKey: 'globalValue',
        apiSpecific: true
      });
      
      // Check inline plugin definition (used as-is)
      const inlinePluginConfig = mergedConfigs.find(c => c.name === 'inlinePlugin');
      expect(inlinePluginConfig).toBeDefined();
      expect(inlinePluginConfig!.path).toBe('./inline-plugin.js');
      expect(inlinePluginConfig!.config).toEqual({
        inlineKey: 'inlineValue'
      });
    });

    it('should create API-specific plugin manager with inline plugins', async () => {
      // Create an inline plugin file
      const inlinePluginPath = path.join(tempDir, 'api-specific-plugin.js');
      const inlinePluginContent = `
export default {
  async setup(context) {
    context.registerPreRequestHook(async (request) => {
      request.headers['X-API-Specific'] = JSON.stringify(context.config);
    });
  }
};
`;
      await fs.writeFile(inlinePluginPath, inlinePluginContent);

      // No global plugins
      const globalConfigs: PluginConfiguration[] = [];

      // API-level inline plugin
      const apiConfigs: PluginConfiguration[] = [
        {
          name: 'apiSpecificPlugin',
          path: './api-specific-plugin.js',
          config: {
            apiId: 'userAPI',
            feature: 'userTracking'
          }
        }
      ];

      await pluginManager.loadPlugins(globalConfigs, tempDir);
      
      const apiPluginManager = await pluginManager.loadApiPlugins(apiConfigs, tempDir);
      
      // Verify that the API plugin manager has the inline plugin loaded
      const apiPlugins = apiPluginManager.getPlugins();
      expect(apiPlugins).toHaveLength(1);
      expect(apiPlugins[0].name).toBe('apiSpecificPlugin');
      expect(apiPlugins[0].config).toEqual({
        apiId: 'userAPI',
        feature: 'userTracking'
      });

      // Test that the plugin hook works
      const request = {
        method: 'GET',
        url: 'https://example.com',
        headers: {}
      };

      await apiPluginManager.executePreRequestHooks(request);
      
      expect(request.headers['X-API-Specific']).toBe(
        JSON.stringify({ apiId: 'userAPI', feature: 'userTracking' })
      );
    });

    it('should maintain improved error message for missing global plugin references', async () => {
      // No global plugins
      const globalConfigs: PluginConfiguration[] = [];

      // API config referencing non-existent global plugin (no path/npmPackage)
      const apiConfigs: PluginConfiguration[] = [
        {
          name: 'nonexistentPlugin',
          config: {}
        }
      ];

      await pluginManager.loadPlugins(globalConfigs, tempDir);
      
      expect(() => {
        pluginManager.getMergedPluginConfigurations(apiConfigs);
      }).toThrow(
        "API references undefined plugin 'nonexistentPlugin'. Plugin must be defined in the global plugins section, or provide 'path' or 'npmPackage' for inline definition."
      );
    });

    it('should handle inline plugins alongside global plugins in API plugin manager', async () => {
      // Create plugin files
      const globalPluginPath = path.join(tempDir, 'shared-plugin.js');
      const inlinePluginPath = path.join(tempDir, 'specific-plugin.js');
      
      const globalPluginContent = `
export default {
  async setup(context) {
    context.registerPreRequestHook(async (request) => {
      request.headers['X-Shared-Plugin'] = 'shared';
    });
  }
};
`;
      
      const inlinePluginContent = `
export default {
  async setup(context) {
    context.registerPreRequestHook(async (request) => {
      request.headers['X-Specific-Plugin'] = 'specific';
    });
  }
};
`;
      
      await fs.writeFile(globalPluginPath, globalPluginContent);
      await fs.writeFile(inlinePluginPath, inlinePluginContent);

      // Global plugin for reuse
      const globalConfigs: PluginConfiguration[] = [
        {
          name: 'sharedPlugin',
          path: './shared-plugin.js',
          config: { shared: true }
        }
      ];

      // API configs with both types
      const apiConfigs: PluginConfiguration[] = [
        {
          // Reference global plugin
          name: 'sharedPlugin',
          config: { apiSpecific: true }
        },
        {
          // Inline plugin
          name: 'specificPlugin',
          path: './specific-plugin.js',
          config: { onlyForThisAPI: true }
        }
      ];

      await pluginManager.loadPlugins(globalConfigs, tempDir);
      
      const apiPluginManager = await pluginManager.loadApiPlugins(apiConfigs, tempDir);
      
      // Verify both plugins are loaded
      const apiPlugins = apiPluginManager.getPlugins();
      expect(apiPlugins).toHaveLength(2);
      
      // Test that both plugins work together
      const request = {
        method: 'GET',
        url: 'https://example.com',
        headers: {}
      };

      await apiPluginManager.executePreRequestHooks(request);
      
      expect(request.headers['X-Shared-Plugin']).toBe('shared');
      expect(request.headers['X-Specific-Plugin']).toBe('specific');
    });

    it('should support variable resolution in inline plugin configurations', async () => {
      // Create an inline plugin that uses its configuration
      const inlinePluginPath = path.join(tempDir, 'configurable-plugin.js');
      const inlinePluginContent = `
export default {
  async setup(context) {
    context.registerPreRequestHook(async (request) => {
      request.headers['X-Plugin-Config'] = JSON.stringify(context.config);
    });
  }
};
`;
      await fs.writeFile(inlinePluginPath, inlinePluginContent);

      // Import variable resolver for context creation
      const { variableResolver } = await import('../../src/core/variableResolver.js');

      // Create variable context with values for resolution
      const variableContext = variableResolver.createContext(
        { cliVar: 'cliValue' }, // CLI vars
        { profileVar: 'profileValue' }, // Profile vars
        { apiVar: 'apiValue' }, // API vars
        {}, // Endpoint vars
        {}, // Plugin vars
        { globalVar: 'globalValue' } // Global vars
      );

      // No global plugins
      const globalConfigs: PluginConfiguration[] = [];

      // Inline plugin with variables in configuration
      const apiConfigs: PluginConfiguration[] = [
        {
          name: 'configurablePlugin',
          path: './configurable-plugin.js',
          config: {
            staticValue: 'static',
            fromCli: '{{cliVar}}',
            fromProfile: '{{profileVar}}',
            fromApi: '{{apiVar}}',
            fromGlobal: '{{globalVar}}'
          }
        }
      ];

      await pluginManager.loadPlugins(globalConfigs, tempDir);
      
      const apiPluginManager = await pluginManager.loadApiPlugins(apiConfigs, tempDir, variableContext);
      
      // Verify that variables were resolved in the inline plugin config
      const apiPlugins = apiPluginManager.getPlugins();
      expect(apiPlugins).toHaveLength(1);
      expect(apiPlugins[0].config).toEqual({
        staticValue: 'static',
        fromCli: 'cliValue',
        fromProfile: 'profileValue',
        fromApi: 'apiValue',
        fromGlobal: 'globalValue'
      });
    });
  });
}); 