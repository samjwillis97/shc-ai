import { configLoader } from '../../core/configLoader.js';
import { chainExecutor } from '../../core/chainExecutor.js';
import { variableResolver } from '../../core/variableResolver.js';
import { PluginManager } from '../../core/pluginManager.js';
import type {
  HttpCraftConfig,
} from '../../types/config.js';
import path from 'path';

/**
 * Helper function to parse JSON strings into objects when possible
 * If the value is a valid JSON string, returns the parsed object
 * Otherwise, returns the original value unchanged
 */
function parseJsonIfPossible(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  
  try {
    return JSON.parse(value);
  } catch {
    // If parsing fails, return original string
    return value;
  }
}

export interface ChainCommandArgs {
  chainName: string;
  config?: string;
  variables?: Record<string, string>;
  profiles?: string[];
  noDefaultProfile?: boolean;
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
        console.error(
          'Error: No configuration file found. Use --config to specify a config file or create .httpcraft.yaml'
        );
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
    }

    // T14.3: Set plugin manager on variable resolver for secret resolution
    variableResolver.setPluginManager(pluginManager);

    // Check if any chains are defined at all
    if (!config.chains || Object.keys(config.chains).length === 0) {
      console.error('Error: No chains defined in configuration');
      process.exit(1);
    }

    // Find chain
    const chain = config.chains[args.chainName];
    if (!chain) {
      console.error(`Error: Chain '${args.chainName}' not found in configuration`);
      process.exit(1);
    }

    // Determine which profiles to use - T13.1 & T13.2: Additive profile merging
    let profileNames: string[] = [];
    
    // Always start with default profiles (if any)
    if (config.config?.defaultProfile) {
      profileNames = Array.isArray(config.config.defaultProfile) 
        ? [...config.config.defaultProfile] 
        : [config.config.defaultProfile];
    }
    
    // Add CLI-specified profiles (unless --no-default-profile is used)
    if (args.profiles && args.profiles.length > 0) {
      if (args.noDefaultProfile) {
        // Override: use only CLI profiles
        profileNames = args.profiles;
      } else {
        // Additive: combine default + CLI profiles
        profileNames = [...profileNames, ...args.profiles];
      }
    }

    // T13.6: Enhanced verbose output for profile operations
    if (args.verbose) {
      process.stderr.write('[VERBOSE] Loading profiles:\n');
      
      // Show default profiles
      const defaultProfiles = config.config?.defaultProfile;
      if (defaultProfiles) {
        const defaultProfilesList = Array.isArray(defaultProfiles) ? defaultProfiles : [defaultProfiles];
        process.stderr.write(`[VERBOSE]   Default profiles: ${defaultProfilesList.join(', ')}\n`);
      } else {
        process.stderr.write(`[VERBOSE]   Default profiles: none\n`);
      }
      
      // Show CLI profiles
      if (args.profiles && args.profiles.length > 0) {
        process.stderr.write(`[VERBOSE]   CLI profiles: ${args.profiles.join(', ')}\n`);
      } else {
        process.stderr.write(`[VERBOSE]   CLI profiles: none\n`);
      }
      
      // Show override behavior
      if (args.noDefaultProfile && args.profiles && args.profiles.length > 0) {
        process.stderr.write(`[VERBOSE]   --no-default-profile used: ignoring default profiles\n`);
      }
      
      // Show final profile order
      if (profileNames.length > 0) {
        process.stderr.write(`[VERBOSE]   Final profile order: ${profileNames.join(', ')}\n`);
      } else {
        process.stderr.write(`[VERBOSE]   Final profile order: none\n`);
      }
    }

    // Load and merge profile variables
    let mergedProfileVars: Record<string, unknown> = {};
    if (profileNames.length > 0) {
      if (!config.profiles) {
        console.error(
          `Error: No profiles defined in configuration, but profile(s) requested: ${profileNames.join(', ')}`
        );
        process.exit(1);
      }

      // Validate that all requested profiles exist
      for (const profileName of profileNames) {
        if (!config.profiles[profileName]) {
          console.error(`Error: Profile '${profileName}' not found in configuration`);
          process.exit(1);
        }
      }

      mergedProfileVars = variableResolver.mergeProfiles(profileNames, config.profiles, args.verbose);
    }

    // Execute chain
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

    // Handle chain output
    if (args.chainOutput === 'full' && result.success) {
      // Output structured JSON with parsed bodies and correct property order (only on success)
      const structuredResult = {
        chainName: result.chainName,
        success: result.success,
        steps: result.steps.map(step => ({
          ...step,
          request: {
            ...step.request,
            body: parseJsonIfPossible(step.request.body)
          },
          response: {
            ...step.response,
            body: parseJsonIfPossible(step.response.body)
          }
        }))
      };
      console.log(JSON.stringify(structuredResult, null, 2));
    } else if (args.chainOutput !== 'full') {
      // Default behavior: output last step's response body (only on success)
      if (result.success && result.steps.length > 0) {
        const lastStep = result.steps[result.steps.length - 1];
        if (lastStep.success && lastStep.response?.body) {
          console.log(lastStep.response.body);
        }
      }
    }

    // Check if chain failed and exit appropriately
    if (!result.success) {
      console.error(`Chain execution failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Error executing chain:', error);
    } else {
      console.error('Error executing chain:', String(error));
    }
    process.exit(1);
  }
}
