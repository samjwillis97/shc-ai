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
  PostResponseHook,
  VariableSource,
  HttpRequest,
  HttpResponse
} from '../types/plugin.js';
import { PluginConfiguration } from '../types/config.js';

export class PluginManager {
  private plugins: PluginInstance[] = [];
  private globalPluginConfigs: PluginConfiguration[] = [];

  /**
   * Load and setup plugins from configuration
   */
  async loadPlugins(pluginConfigs: PluginConfiguration[], configDir: string = process.cwd()): Promise<void> {
    // Store global plugin configurations for later merging with API-level configs
    this.globalPluginConfigs = [...pluginConfigs];
    
    for (const pluginConfig of pluginConfigs) {
      await this.loadPlugin(pluginConfig, configDir);
    }
  }

  /**
   * T10.2 & T10.3: Create merged plugin configurations for a specific API
   * API-level plugin configurations override global configurations
   */
  getMergedPluginConfigurations(apiPluginConfigs?: PluginConfiguration[]): PluginConfiguration[] {
    if (!apiPluginConfigs || apiPluginConfigs.length === 0) {
      return this.globalPluginConfigs;
    }

    const mergedConfigs: PluginConfiguration[] = [];
    const globalConfigsMap = new Map<string, PluginConfiguration>();
    
    // Index global configurations by plugin name
    for (const globalConfig of this.globalPluginConfigs) {
      globalConfigsMap.set(globalConfig.name, globalConfig);
    }

    // Process API-level plugin configurations
    for (const apiConfig of apiPluginConfigs) {
      // T10.5: Validate that API references a globally defined plugin
      const globalConfig = globalConfigsMap.get(apiConfig.name);
      if (!globalConfig) {
        throw new Error(`API references undefined plugin '${apiConfig.name}'. Plugin must be defined in the global plugins section.`);
      }

      // T10.3: Merge configurations (API-level overwrites global keys)
      const mergedConfig: PluginConfiguration = {
        // T10.7: Copy the source field (path or npmPackage) from global config
        path: globalConfig.path,
        npmPackage: globalConfig.npmPackage,
        name: apiConfig.name,
        config: {
          ...globalConfig.config, // Start with global config
          ...apiConfig.config     // Override with API-level config
        }
      };

      mergedConfigs.push(mergedConfig);
    }

    // Add any global plugins not overridden by API-level configs
    for (const globalConfig of this.globalPluginConfigs) {
      if (!apiPluginConfigs.find(apiConfig => apiConfig.name === globalConfig.name)) {
        mergedConfigs.push(globalConfig);
      }
    }

    return mergedConfigs;
  }

  /**
   * T10.2: Load plugins for a specific API with merged configurations
   */
  async loadApiPlugins(apiPluginConfigs?: PluginConfiguration[], configDir: string = process.cwd()): Promise<PluginManager> {
    const apiPluginManager = new PluginManager();
    
    // Get merged configurations for this API
    const mergedConfigs = this.getMergedPluginConfigurations(apiPluginConfigs);
    
    // Load plugins with merged configurations
    await apiPluginManager.loadPlugins(mergedConfigs, configDir);
    
    return apiPluginManager;
  }

  /**
   * Load a single plugin from configuration
   * T10.7: Support loading from both local files and npm packages
   */
  private async loadPlugin(pluginConfig: PluginConfiguration, configDir: string): Promise<void> {
    try {
      let pluginPath: string;
      let pluginSource: string;

      // Validate that either path or npmPackage is specified
      if (!pluginConfig.path && !pluginConfig.npmPackage) {
        throw new Error(`Plugin '${pluginConfig.name}' must specify either 'path' or 'npmPackage'`);
      }

      if (pluginConfig.path && pluginConfig.npmPackage) {
        throw new Error(`Plugin '${pluginConfig.name}' cannot specify both 'path' and 'npmPackage'`);
      }

      // T10.7: Handle npm package loading
      if (pluginConfig.npmPackage) {
        pluginPath = pluginConfig.npmPackage;
        pluginSource = `npm package '${pluginConfig.npmPackage}'`;
      } else {
        // Handle local file loading
        pluginPath = path.resolve(configDir, pluginConfig.path!);
        pluginSource = `local file '${pluginPath}'`;
      }
      
      // Dynamic import of the plugin module
      const pluginModule = await import(pluginPath);
      
      // Get the plugin object (could be default export or named export)
      const plugin: Plugin = pluginModule.default || pluginModule;
      
      if (!plugin || typeof plugin.setup !== 'function') {
        throw new Error(`Plugin from ${pluginSource} does not export a valid Plugin object with a setup method`);
      }

      // Create plugin instance
      const pluginInstance: PluginInstance = {
        name: pluginConfig.name,
        plugin,
        config: pluginConfig.config || {},
        preRequestHooks: [],
        postResponseHooks: [],
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
        registerPostResponseHook: (hook: PostResponseHook) => {
          pluginInstance.postResponseHooks.push(hook);
        },
        registerVariableSource: (name: string, source: VariableSource) => {
          pluginInstance.variableSources[name] = source;
        }
      };

      // Call plugin setup
      await plugin.setup(context);

      // Add to loaded plugins
      this.plugins.push(pluginInstance);
      
      // Use process.stderr.write instead of console.debug to avoid polluting stdout
      if (process.env.NODE_ENV === 'development') {
        process.stderr.write(`[PluginManager] Loaded plugin '${pluginConfig.name}' from ${pluginSource}\n`);
      }
    } catch (error) {
      const source = pluginConfig.npmPackage ? `npm package '${pluginConfig.npmPackage}'` : `local file '${pluginConfig.path}'`;
      throw new Error(`Failed to load plugin '${pluginConfig.name}' from ${source}: ${error instanceof Error ? error.message : String(error)}`);
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
   * Execute all post-response hooks in order (T10.1)
   */
  async executePostResponseHooks(request: HttpRequest, response: HttpResponse): Promise<void> {
    for (const pluginInstance of this.plugins) {
      for (const hook of pluginInstance.postResponseHooks) {
        try {
          await hook(request, response);
        } catch (error) {
          throw new Error(`Post-response hook failed in plugin '${pluginInstance.name}': ${error instanceof Error ? error.message : String(error)}`);
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