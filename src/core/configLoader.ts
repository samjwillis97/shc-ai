import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import type { HttpCraftConfig, RawHttpCraftConfig, ApiDefinition } from '../types/config.js';

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
      
      // Parse YAML as raw config (may contain import specifications)
      const rawConfig = yaml.load(fileContent) as RawHttpCraftConfig;
      
      // Basic validation
      if (!rawConfig || typeof rawConfig !== 'object') {
        throw new Error('Invalid configuration: root must be an object');
      }

      // Load modular imports for APIs (T9.1)
      const processedApis = rawConfig.apis 
        ? await this.loadModularApis(rawConfig.apis, path.dirname(fullPath))
        : {};

      // Convert to processed config
      const config: HttpCraftConfig = {
        ...rawConfig,
        apis: processedApis
      };
      
      return config;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load configuration from ${configPath}: ${error.message}`);
      }
      throw new Error(`Failed to load configuration from ${configPath}: Unknown error`);
    }
  }

  /**
   * Loads API definitions from modular imports
   * Supports both direct definitions and import specifications
   * T9.1: Implement modular imports for API definitions from a directory
   */
  async loadModularApis(
    apisConfig: Record<string, ApiDefinition> | string[],
    basePath: string
  ): Promise<Record<string, ApiDefinition>> {
    const mergedApis: Record<string, ApiDefinition> = {};

    // If it's a direct definition object, return as-is
    if (!Array.isArray(apisConfig)) {
      return apisConfig;
    }

    // Process import specifications
    for (const importSpec of apisConfig) {
      if (typeof importSpec !== 'string') {
        throw new Error('API import specification must be a string');
      }

      let loadedApis: Record<string, ApiDefinition>;

      if (importSpec.startsWith('directory:')) {
        // Load from directory
        const dirPath = importSpec.substring(10); // Remove "directory:" prefix
        loadedApis = await this.loadApisFromDirectory(dirPath, basePath);
      } else {
        // Load from individual file
        loadedApis = await this.loadApisFromFile(importSpec, basePath);
      }

      // Merge with existing APIs (last one loaded wins for conflicts)
      Object.assign(mergedApis, loadedApis);
    }

    return mergedApis;
  }

  /**
   * Loads API definitions from all .yaml/.yml files in a directory
   */
  async loadApisFromDirectory(
    dirPath: string,
    basePath: string
  ): Promise<Record<string, ApiDefinition>> {
    const fullDirPath = path.resolve(basePath, dirPath);
    const mergedApis: Record<string, ApiDefinition> = {};

    try {
      const files = await fs.readdir(fullDirPath);
      
      // Filter for YAML files and sort for deterministic order
      const yamlFiles = files
        .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'))
        .sort();

      for (const file of yamlFiles) {
        const filePath = path.join(fullDirPath, file);
        try {
          const fileApis = await this.loadApisFromFile(filePath, '');
          // Merge APIs (last loaded wins for conflicts)
          Object.assign(mergedApis, fileApis);
        } catch (error) {
          throw new Error(`Failed to load API file ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return mergedApis;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        throw new Error(`API directory not found: ${fullDirPath}`);
      }
      throw error;
    }
  }

  /**
   * Loads API definitions from a single file
   */
  async loadApisFromFile(
    filePath: string,
    basePath: string
  ): Promise<Record<string, ApiDefinition>> {
    const fullFilePath = basePath ? path.resolve(basePath, filePath) : filePath;

    try {
      const fileContent = await fs.readFile(fullFilePath, 'utf-8');
      const fileConfig = yaml.load(fileContent) as Record<string, ApiDefinition>;

      if (!fileConfig || typeof fileConfig !== 'object') {
        throw new Error('Invalid API file: must contain an object');
      }

      // Validate that all top-level keys are valid API definitions
      for (const [apiName, apiDef] of Object.entries(fileConfig)) {
        if (!apiDef || typeof apiDef !== 'object') {
          throw new Error(`Invalid API definition for '${apiName}': must be an object`);
        }
        if (!apiDef.baseUrl) {
          throw new Error(`Invalid API definition for '${apiName}': baseUrl is required`);
        }
        if (!apiDef.endpoints || typeof apiDef.endpoints !== 'object') {
          throw new Error(`Invalid API definition for '${apiName}': endpoints section is required`);
        }
      }

      return fileConfig;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load API file ${fullFilePath}: ${error.message}`);
      }
      throw new Error(`Failed to load API file ${fullFilePath}: Unknown error`);
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