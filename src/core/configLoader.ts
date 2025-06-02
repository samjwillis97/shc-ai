import fs from 'fs/promises';
import path from 'path';
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
   * Attempts to find and load the default config file
   * Looks for .httpcraft.yaml in the current directory
   * Returns both the config and the path where it was found
   */
  async loadDefaultConfig(): Promise<ConfigWithPath | null> {
    const defaultPaths = ['./.httpcraft.yaml', './.httpcraft.yml'];
    
    for (const configPath of defaultPaths) {
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
    
    return null;
  }
}

// Singleton instance
export const configLoader = new ConfigLoader(); 