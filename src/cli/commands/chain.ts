import { configLoader } from '../../core/configLoader.js';
import type { HttpCraftConfig, ChainDefinition } from '../../types/config.js';

export interface ChainCommandArgs {
  chainName: string;
  config?: string;
  variables?: Record<string, string>;
  profiles?: string[];
  verbose?: boolean;
  dryRun?: boolean;
  exitOnHttpError?: string;
}

export async function handleChainCommand(args: ChainCommandArgs): Promise<void> {
  try {
    // Load configuration
    let config: HttpCraftConfig;
    
    if (args.config) {
      config = await configLoader.loadConfig(args.config);
    } else {
      const defaultConfig = await configLoader.loadDefaultConfig();
      if (!defaultConfig) {
        console.error('Error: No configuration file found. Use --config to specify a config file or create .httpcraft.yaml');
        process.exit(1);
      }
      config = defaultConfig.config;
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
    
    console.log(`Executing chain: ${args.chainName}`);
    if (chain.description) {
      console.log(`Description: ${chain.description}`);
    }
    
    // For now, just show the chain structure (Phase 8, Task T8.1 and T8.2)
    // This will be expanded in subsequent tasks
    console.log(`Chain has ${chain.steps.length} step(s):`);
    for (let i = 0; i < chain.steps.length; i++) {
      const step = chain.steps[i];
      console.log(`  ${i + 1}. ${step.id}: ${step.call}`);
      if (step.description) {
        console.log(`     Description: ${step.description}`);
      }
    }
    
  } catch (error) {
    console.error('Error executing chain:', error);
    process.exit(1);
  }
} 