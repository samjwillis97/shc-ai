import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import type {
  HttpCraftConfig,
  RawHttpCraftConfig,
  ApiDefinition,
  ChainDefinition,
  ProfileDefinition,
} from '../types/config.js';

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

      // Load modular imports for profiles
      const processedProfiles = rawConfig.profiles
        ? await this.loadModularProfiles(rawConfig.profiles, path.dirname(fullPath))
        : {};

      // Load modular imports for chains (T9.2)
      const processedChains = rawConfig.chains
        ? await this.loadModularChains(rawConfig.chains, path.dirname(fullPath))
        : {};

      // Load global variable files (T9.3)
      const importedGlobalVariables = rawConfig.variables
        ? await this.loadGlobalVariables(rawConfig.variables, path.dirname(fullPath))
        : {};

      // Merge imported variables with directly defined globalVariables
      // Direct globalVariables take precedence over imported ones
      const globalVariables = {
        ...importedGlobalVariables,
        ...(rawConfig.globalVariables || {}),
      };

      // Convert to processed config
      const config: HttpCraftConfig = {
        ...rawConfig,
        apis: processedApis,
        profiles: processedProfiles,
        chains: processedChains,
        globalVariables, // T9.3: Add loaded global variables
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
        .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
        .sort();

      for (const file of yamlFiles) {
        const filePath = path.join(fullDirPath, file);
        try {
          const fileApis = await this.loadApisFromFile(filePath, '');
          // Merge APIs (last loaded wins for conflicts)
          Object.assign(mergedApis, fileApis);
        } catch (error) {
          throw new Error(
            `Failed to load API file ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
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
          path: path.resolve(configPath),
        };
      } catch {
        // Continue to next path
        continue;
      }
    }

    // If no local config found, try global configuration
    try {
      const config = await this.loadConfig(globalPath);
      return {
        config,
        path: globalPath,
      };
    } catch {
      // No configuration file found in any location
      return null;
    }
  }

  /**
   * Loads chain definitions from modular imports
   * Supports both direct definitions and import specifications
   * T9.2: Implement modular imports for chain definitions from a directory
   */
  async loadModularChains(
    chainsConfig: Record<string, ChainDefinition> | string[],
    basePath: string
  ): Promise<Record<string, ChainDefinition>> {
    const mergedChains: Record<string, ChainDefinition> = {};

    // If it's a direct definition object, return as-is
    if (!Array.isArray(chainsConfig)) {
      return chainsConfig;
    }

    // Process import specifications
    for (const importSpec of chainsConfig) {
      if (typeof importSpec !== 'string') {
        throw new Error('Chain import specification must be a string');
      }

      let loadedChains: Record<string, ChainDefinition>;

      if (importSpec.startsWith('directory:')) {
        // Load from directory
        const dirPath = importSpec.substring(10); // Remove "directory:" prefix
        loadedChains = await this.loadChainsFromDirectory(dirPath, basePath);
      } else {
        // Load from individual file
        loadedChains = await this.loadChainsFromFile(importSpec, basePath);
      }

      // Merge with existing chains (last one loaded wins for conflicts)
      Object.assign(mergedChains, loadedChains);
    }

    return mergedChains;
  }

  /**
   * Loads chain definitions from all .yaml/.yml files in a directory
   */
  async loadChainsFromDirectory(
    dirPath: string,
    basePath: string
  ): Promise<Record<string, ChainDefinition>> {
    const fullDirPath = path.resolve(basePath, dirPath);
    const mergedChains: Record<string, ChainDefinition> = {};

    try {
      const files = await fs.readdir(fullDirPath);

      // Filter for YAML files and sort for deterministic order
      const yamlFiles = files
        .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
        .sort();

      for (const file of yamlFiles) {
        const filePath = path.join(fullDirPath, file);
        try {
          const fileChains = await this.loadChainsFromFile(filePath, '');
          // Merge chains (last loaded wins for conflicts)
          Object.assign(mergedChains, fileChains);
        } catch (error) {
          throw new Error(
            `Failed to load chain file ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      return mergedChains;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        throw new Error(`Chain directory not found: ${fullDirPath}`);
      }
      throw error;
    }
  }

  /**
   * Loads chain definitions from a single file
   */
  async loadChainsFromFile(
    filePath: string,
    basePath: string
  ): Promise<Record<string, ChainDefinition>> {
    const fullFilePath = basePath ? path.resolve(basePath, filePath) : filePath;

    try {
      const fileContent = await fs.readFile(fullFilePath, 'utf-8');
      const fileConfig = yaml.load(fileContent) as Record<string, ChainDefinition>;

      if (!fileConfig || typeof fileConfig !== 'object') {
        throw new Error('Invalid chain file: must contain an object');
      }

      // Validate that all top-level keys are valid chain definitions
      for (const [chainName, chainDef] of Object.entries(fileConfig)) {
        if (!chainDef || typeof chainDef !== 'object') {
          throw new Error(`Invalid chain definition for '${chainName}': must be an object`);
        }
        if (!chainDef.steps || !Array.isArray(chainDef.steps)) {
          throw new Error(`Invalid chain definition for '${chainName}': steps array is required`);
        }
        // Validate each step
        for (const [index, step] of chainDef.steps.entries()) {
          if (!step || typeof step !== 'object') {
            throw new Error(`Invalid step ${index} in chain '${chainName}': must be an object`);
          }
          if (!step.id || typeof step.id !== 'string') {
            throw new Error(`Invalid step ${index} in chain '${chainName}': id is required`);
          }
          if (!step.call || typeof step.call !== 'string') {
            throw new Error(`Invalid step ${index} in chain '${chainName}': call is required`);
          }
        }
      }

      return fileConfig;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load chain file ${fullFilePath}: ${error.message}`);
      }
      throw new Error(`Failed to load chain file ${fullFilePath}: Unknown error`);
    }
  }

  /**
   * Loads global variable files (T9.3)
   * @param variableFiles Array of variable file paths
   * @param basePath Base path for resolving relative paths
   * @returns Merged global variables
   */
  async loadGlobalVariables(
    variableFiles: string[],
    basePath: string
  ): Promise<Record<string, unknown>> {
    const mergedVariables: Record<string, unknown> = {};

    for (const filePath of variableFiles) {
      if (typeof filePath !== 'string') {
        throw new Error('Variable file path must be a string');
      }

      try {
        const loadedVariables = await this.loadVariableFile(filePath, basePath);
        // Merge variables (last loaded wins for conflicts)
        Object.assign(mergedVariables, loadedVariables);
      } catch (error) {
        throw new Error(
          `Failed to load variable file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return mergedVariables;
  }

  /**
   * Loads variables from a single file
   */
  async loadVariableFile(filePath: string, basePath: string): Promise<Record<string, unknown>> {
    const fullFilePath = path.resolve(basePath, filePath);

    try {
      const fileContent = await fs.readFile(fullFilePath, 'utf-8');
      const variables = yaml.load(fileContent) as Record<string, unknown>;

      if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
        throw new Error('Invalid variable file: must contain an object');
      }

      // Validate that all values are primitive types (string, number, boolean)
      for (const [key, value] of Object.entries(variables)) {
        if (
          value !== null &&
          typeof value !== 'string' &&
          typeof value !== 'number' &&
          typeof value !== 'boolean'
        ) {
          throw new Error(`Invalid variable '${key}': value must be a string, number, or boolean`);
        }
      }

      return variables;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load variable file ${fullFilePath}: ${error.message}`);
      }
      throw new Error(`Failed to load variable file ${fullFilePath}: Unknown error`);
    }
  }

  /**
   * Loads profile definitions from modular imports
   * Supports both direct definitions and import specifications
   * T9.4: Implement modular imports for profile definitions from a directory
   */
  async loadModularProfiles(
    profilesConfig: Record<string, ProfileDefinition> | string[],
    basePath: string
  ): Promise<Record<string, ProfileDefinition>> {
    const mergedProfiles: Record<string, ProfileDefinition> = {};

    // If it's a direct definition object, return as-is
    if (!Array.isArray(profilesConfig)) {
      return profilesConfig;
    }

    // Process import specifications
    for (const importSpec of profilesConfig) {
      if (typeof importSpec !== 'string') {
        throw new Error('Profile import specification must be a string');
      }

      let loadedProfiles: Record<string, ProfileDefinition>;

      if (importSpec.startsWith('directory:')) {
        // Load from directory
        const dirPath = importSpec.substring(10); // Remove "directory:" prefix
        loadedProfiles = await this.loadProfilesFromDirectory(dirPath, basePath);
      } else {
        // Load from individual file
        loadedProfiles = await this.loadProfilesFromFile(importSpec, basePath);
      }

      // Merge with existing profiles
      for (const [profileName, profileDef] of Object.entries(loadedProfiles)) {
        if (mergedProfiles[profileName]) {
          // Profile already exists, merge properties (last loaded wins for property conflicts)
          mergedProfiles[profileName] = { ...mergedProfiles[profileName], ...profileDef };
        } else {
          // New profile, add it
          mergedProfiles[profileName] = profileDef;
        }
      }
    }

    return mergedProfiles;
  }

  /**
   * Loads profile definitions from all .yaml/.yml files in a directory
   */
  async loadProfilesFromDirectory(
    dirPath: string,
    basePath: string
  ): Promise<Record<string, ProfileDefinition>> {
    const fullDirPath = path.resolve(basePath, dirPath);
    const mergedProfiles: Record<string, ProfileDefinition> = {};

    try {
      const files = await fs.readdir(fullDirPath);

      // Filter for YAML files and sort for deterministic order
      const yamlFiles = files
        .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
        .sort();

      for (const file of yamlFiles) {
        const filePath = path.join(fullDirPath, file);
        try {
          const fileProfiles = await this.loadProfilesFromFile(filePath, '');
          // Merge profiles with property-level merging for conflicting profile names
          for (const [profileName, profileDef] of Object.entries(fileProfiles)) {
            if (mergedProfiles[profileName]) {
              // Profile already exists, merge properties (last loaded wins for property conflicts)
              mergedProfiles[profileName] = { ...mergedProfiles[profileName], ...profileDef };
            } else {
              // New profile, add it
              mergedProfiles[profileName] = profileDef;
            }
          }
        } catch (error) {
          throw new Error(
            `Failed to load profile file ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      return mergedProfiles;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        throw new Error(`Profile directory not found: ${fullDirPath}`);
      }
      throw error;
    }
  }

  /**
   * Loads profile definitions from a single file
   */
  async loadProfilesFromFile(
    filePath: string,
    basePath: string
  ): Promise<Record<string, ProfileDefinition>> {
    const fullFilePath = basePath ? path.resolve(basePath, filePath) : filePath;

    try {
      const fileContent = await fs.readFile(fullFilePath, 'utf-8');
      const fileConfig = yaml.load(fileContent) as Record<string, ProfileDefinition>;

      if (!fileConfig || typeof fileConfig !== 'object') {
        throw new Error('Invalid profile file: must contain an object');
      }

      // Validate that all top-level keys are valid profile definitions
      for (const [profileName, profileDef] of Object.entries(fileConfig)) {
        if (!profileDef || typeof profileDef !== 'object') {
          throw new Error(`Invalid profile definition for '${profileName}': must be an object`);
        }

        // Validate that profile values are primitive types (string, number, boolean)
        for (const [key, value] of Object.entries(profileDef)) {
          if (
            value !== null &&
            typeof value !== 'string' &&
            typeof value !== 'number' &&
            typeof value !== 'boolean'
          ) {
            throw new Error(
              `Invalid profile variable '${key}' in profile '${profileName}': must be string, number, or boolean`
            );
          }
        }
      }

      return fileConfig;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load profile file ${fullFilePath}: ${error.message}`);
      }
      throw new Error(`Failed to load profile file ${fullFilePath}: Unknown error`);
    }
  }
}

// Singleton instance
export const configLoader = new ConfigLoader();
