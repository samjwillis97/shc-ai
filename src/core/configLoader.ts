import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import type { HttpCraftConfig } from '../types/config.js';

export interface ConfigWithPath {
  config: HttpCraftConfig;
  path: string;
}

export class ConfigLoader {
  /**
   * Loads and parses a YAML configuration file
   * @param configPath Path to the YAML configuration file
   * @returns Parsed configuration object
   */
  async loadConfig(configPath: string): Promise<HttpCraftConfig> {
    try {
      // Resolve the full path
      const fullPath = path.resolve(configPath);
      
      // Check if file exists
      await fs.access(fullPath);
      
      // Read the file
      const fileContent = await fs.readFile(fullPath, 'utf-8');
      
      // Parse YAML
      const config = yaml.load(fileContent) as HttpCraftConfig;
      
      // Basic validation
      if (!config || typeof config !== 'object') {
        throw new Error('Invalid configuration: root must be an object');
      }
      
      if (!config.apis || typeof config.apis !== 'object') {
        throw new Error('Invalid configuration: apis section is required');
      }
      
      return config;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load configuration from ${configPath}: ${error.message}`);
      }
      throw new Error(`Failed to load configuration from ${configPath}: Unknown error`);
    }
  }
  
  /**
   * Attempts to find and load the default config file using the search hierarchy:
   * 1. ./.httpcraft.yaml or ./.httpcraft.yml in current directory
   * 2. $HOME/.config/httpcraft/config.yaml as global default
   * Returns both the config and the path where it was found
   */
  async loadDefaultConfig(): Promise<ConfigWithPath | null> {
    // Search order as per T2.3 specification
    const localPaths = ['./.httpcraft.yaml', './.httpcraft.yml'];
    const globalPath = path.join(os.homedir(), '.config', 'httpcraft', 'config.yaml');
    
    // First, try local configuration files in current directory
    for (const configPath of localPaths) {
      try {
        const config = await this.loadConfig(configPath);
        return {
          config,
          path: path.resolve(configPath)
        };
      } catch (error) {
        // Continue to next path
        continue;
      }
    }
    
    // If no local config found, try global configuration
    try {
      const config = await this.loadConfig(globalPath);
      return {
        config,
        path: globalPath
      };
    } catch (error) {
      // No configuration file found in any location
      return null;
    }
  }
}

// Singleton instance
export const configLoader = new ConfigLoader(); 