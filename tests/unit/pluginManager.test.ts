import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PluginManager } from '../../src/core/pluginManager.js';
import { PluginConfiguration } from '../../src/types/config.js';
import { HttpRequest, HttpResponse } from '../../src/types/plugin.js';
import fs from 'fs/promises';
import path from 'path';

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
}); 