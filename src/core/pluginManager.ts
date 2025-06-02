/**
 * Plugin Manager for HttpCraft
 * Handles loading, setup, and management of plugins
 */

import path from 'path';
import {
  Plugin,
  PluginInstance,
  PluginContext,
  PluginConfig,
  PreRequestHook,
  VariableSource,
  HttpRequest
} from '../types/plugin.js';
import { PluginConfiguration } from '../types/config.js';

export class PluginManager {
  private plugins: PluginInstance[] = [];

  /**
   * Load and setup plugins from configuration
   */
  async loadPlugins(pluginConfigs: PluginConfiguration[], configDir: string = process.cwd()): Promise<void> {
    for (const pluginConfig of pluginConfigs) {
      await this.loadPlugin(pluginConfig, configDir);
    }
  }

  /**
   * Load a single plugin from configuration
   */
  private async loadPlugin(pluginConfig: PluginConfiguration, configDir: string): Promise<void> {
    try {
      // Resolve plugin path relative to config file directory
      const pluginPath = path.resolve(configDir, pluginConfig.path);
      
      // Dynamic import of the plugin module
      const pluginModule = await import(pluginPath);
      
      // Get the plugin object (could be default export or named export)
      const plugin: Plugin = pluginModule.default || pluginModule;
      
      if (!plugin || typeof plugin.setup !== 'function') {
        throw new Error(`Plugin at ${pluginPath} does not export a valid Plugin object with a setup method`);
      }

      // Create plugin instance
      const pluginInstance: PluginInstance = {
        name: pluginConfig.name,
        plugin,
        config: pluginConfig.config || {},
        preRequestHooks: [],
        variableSources: {}
      };

      // Create context for plugin setup
      const context: PluginContext = {
        // These will be set when executing requests
        request: {} as HttpRequest,
        config: pluginInstance.config,
        registerPreRequestHook: (hook: PreRequestHook) => {
          pluginInstance.preRequestHooks.push(hook);
        },
        registerVariableSource: (name: string, source: VariableSource) => {
          pluginInstance.variableSources[name] = source;
        }
      };

      // Call plugin setup
      await plugin.setup(context);

      // Add to loaded plugins
      this.plugins.push(pluginInstance);
      
      console.debug(`[PluginManager] Loaded plugin '${pluginConfig.name}' from ${pluginPath}`);
    } catch (error) {
      throw new Error(`Failed to load plugin '${pluginConfig.name}' from ${pluginConfig.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute all pre-request hooks in order
   */
  async executePreRequestHooks(request: HttpRequest): Promise<void> {
    for (const pluginInstance of this.plugins) {
      for (const hook of pluginInstance.preRequestHooks) {
        try {
          await hook(request);
        } catch (error) {
          throw new Error(`Pre-request hook failed in plugin '${pluginInstance.name}': ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  /**
   * Get all variable sources from all plugins
   */
  getVariableSources(): Record<string, Record<string, VariableSource>> {
    const allSources: Record<string, Record<string, VariableSource>> = {};
    
    for (const pluginInstance of this.plugins) {
      allSources[pluginInstance.name] = pluginInstance.variableSources;
    }
    
    return allSources;
  }

  /**
   * Clear all loaded plugins
   */
  clear(): void {
    this.plugins = [];
  }

  /**
   * Get all loaded plugin instances
   */
  getPlugins(): PluginInstance[] {
    return [...this.plugins];
  }
} 