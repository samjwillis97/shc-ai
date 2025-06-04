import { configLoader } from '../../core/configLoader.js';
import { chainExecutor } from '../../core/chainExecutor.js';
import { variableResolver } from '../../core/variableResolver.js';
import { PluginManager } from '../../core/pluginManager.js';
import { httpClient } from '../../core/httpClient.js';
import type { HttpCraftConfig, ChainDefinition } from '../../types/config.js';
import path from 'path';

export interface ChainCommandArgs {
  chainName: string;
  config?: string;
  variables?: Record<string, string>;
  profiles?: string[];
  verbose?: boolean;
  dryRun?: boolean;
  exitOnHttpError?: string;
  chainOutput?: string;
}

export async function handleChainCommand(args: ChainCommandArgs): Promise<void> {
  try {
    // Load configuration
    let config: HttpCraftConfig;
    let configPath: string;
    
    if (args.config) {
      config = await configLoader.loadConfig(args.config);
      configPath = args.config;
    } else {
      const defaultConfig = await configLoader.loadDefaultConfig();
      if (!defaultConfig) {
        console.error('Error: No configuration file found. Use --config to specify a config file or create .httpcraft.yaml');
        process.exit(1);
      }
      config = defaultConfig.config;
      configPath = defaultConfig.path;
    }
    
    // Initialize and load plugins
    const pluginManager = new PluginManager();
    if (config.plugins && config.plugins.length > 0) {
      const configDir = path.dirname(configPath);
      await pluginManager.loadPlugins(config.plugins, configDir);
      
      // Set plugin manager on HTTP client for pre-request hooks
      httpClient.setPluginManager(pluginManager);
    }
    
    // Find chain
    if (!config.chains) {
      console.error('Error: No chains defined in configuration');
      process.exit(1);
    }
    
    const chain = config.chains[args.chainName];
    if (!chain) {
      console.error(`Error: Chain '${args.chainName}' not found in configuration`);
      process.exit(1);
    }
    
    // Determine which profiles to use
    let profileNames: string[] = [];
    if (args.profiles && args.profiles.length > 0) {
      // Use profiles specified via CLI
      profileNames = args.profiles;
    } else if (config.config?.defaultProfile) {
      // Use default profile(s) from config
      if (Array.isArray(config.config.defaultProfile)) {
        profileNames = config.config.defaultProfile;
      } else {
        profileNames = [config.config.defaultProfile];
      }
    }
    
    // Load and merge profile variables
    let mergedProfileVars: Record<string, any> = {};
    if (profileNames.length > 0) {
      if (!config.profiles) {
        console.error(`Error: No profiles defined in configuration, but profile(s) requested: ${profileNames.join(', ')}`);
        process.exit(1);
      }
      
      // Validate that all requested profiles exist
      for (const profileName of profileNames) {
        if (!config.profiles[profileName]) {
          console.error(`Error: Profile '${profileName}' not found in configuration`);
          process.exit(1);
        }
      }
      
      mergedProfileVars = variableResolver.mergeProfiles(profileNames, config.profiles);
    }
    
    // Execute the chain
    const result = await chainExecutor.executeChain(
      args.chainName,
      chain,
      config,
      args.variables || {},
      mergedProfileVars,
      args.verbose || false,
      args.dryRun || false,
      pluginManager,
      path.dirname(configPath)
    );
    
    // Handle execution result
    if (result.success) {
      if (args.chainOutput === 'full') {
        // T10.3: Output structured JSON of all steps' resolved requests and responses
        const structuredOutput = {
          chainName: result.chainName,
          success: result.success,
          steps: result.steps.map(step => ({
            stepId: step.stepId,
            request: {
              method: step.request.method,
              url: step.request.url,
              headers: step.request.headers,
              body: step.request.body
            },
            response: {
              status: step.response.status,
              statusText: step.response.statusText,
              headers: step.response.headers,
              body: step.response.body
            },
            success: step.success,
            error: step.error
          }))
        };
        console.log(JSON.stringify(structuredOutput, null, 2));
      } else {
        // Default output: response body of the last successful step (T8.11)
        if (result.steps.length > 0) {
          const lastStep = result.steps[result.steps.length - 1];
          console.log(lastStep.response.body);
        }
      }
    } else {
      console.error(`Chain execution failed: ${result.error}`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('Error executing chain:', error);
    process.exit(1);
  }
} 