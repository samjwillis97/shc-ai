import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { ConfigLoader } from '../../src/core/configLoader.js';

describe('ConfigLoader', () => {
  const configLoader = new ConfigLoader();

  it('should load a valid YAML config file', async () => {
    const configPath = path.join(process.cwd(), 'tests/fixtures/test-config.yaml');
    const config = await configLoader.loadConfig(configPath);
    
    expect(config.apis).toBeDefined();
    expect(config.apis.jsonplaceholder).toBeDefined();
    expect(config.apis.jsonplaceholder.baseUrl).toBe('https://jsonplaceholder.typicode.com');
    expect(config.apis.jsonplaceholder.endpoints.getTodo.method).toBe('GET');
    expect(config.apis.jsonplaceholder.endpoints.getTodo.path).toBe('/todos/1');
  });

  it('should throw error for non-existent file', async () => {
    const configPath = path.join(process.cwd(), 'non-existent-config.yaml');
    
    await expect(configLoader.loadConfig(configPath)).rejects.toThrow(/Failed to load configuration/);
  });

  it('should handle config without apis section (for modular imports)', async () => {
    const configPath = path.join(process.cwd(), 'tests/fixtures/invalid-config.yaml');
    
    const config = await configLoader.loadConfig(configPath);
    expect(config.apis).toEqual({});
    // Config should still be valid even without apis section
    expect(typeof config).toBe('object');
  });

  describe('loadDefaultConfig - T2.3 Search Hierarchy', () => {
    const tempDir = path.join(os.tmpdir(), 'httpcraft-test-' + Math.random().toString(36).substr(2, 9));
    const originalCwd = process.cwd();
    const globalConfigDir = path.join(os.homedir(), '.config', 'httpcraft');
    const globalConfigPath = path.join(globalConfigDir, 'config.yaml');
    
    let globalConfigBackup: string | null = null;

    beforeEach(async () => {
      // Create temp directory and change to it
      await fs.mkdir(tempDir, { recursive: true });
      process.chdir(tempDir);
      
      // Backup existing global config if it exists
      try {
        globalConfigBackup = await fs.readFile(globalConfigPath, 'utf-8');
      } catch (error) {
        globalConfigBackup = null;
      }
    });

    afterEach(async () => {
      // Restore original working directory
      process.chdir(originalCwd);
      
      // Clean up temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
      
      // Restore global config
      if (globalConfigBackup !== null) {
        await fs.mkdir(globalConfigDir, { recursive: true });
        await fs.writeFile(globalConfigPath, globalConfigBackup);
      } else {
        // Remove global config if it was created during test
        try {
          await fs.unlink(globalConfigPath);
        } catch (error) {
          // Ignore if file doesn't exist
        }
      }
    });

    it('should return null when no config files exist anywhere', async () => {
      // Ensure global config doesn't exist
      try {
        await fs.unlink(globalConfigPath);
      } catch (error) {
        // Ignore if file doesn't exist
      }
      
      const config = await configLoader.loadDefaultConfig();
      expect(config).toBeNull();
    });

    it('should prioritize .httpcraft.yaml in current directory over global config', async () => {
      const localConfig = `
apis:
  local:
    baseUrl: "https://local.example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
`;
      
      const globalConfig = `
apis:
  global:
    baseUrl: "https://global.example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
`;
      
      // Create global config
      await fs.mkdir(globalConfigDir, { recursive: true });
      await fs.writeFile(globalConfigPath, globalConfig);
      
      // Create local config
      await fs.writeFile('.httpcraft.yaml', localConfig);
      
      const result = await configLoader.loadDefaultConfig();
      expect(result).not.toBeNull();
      expect(result!.config.apis.local).toBeDefined();
      expect(result!.config.apis.global).toBeUndefined();
      expect(result!.path).toBe(path.resolve('.httpcraft.yaml'));
    });

    it('should prioritize .httpcraft.yml over global config', async () => {
      const localConfig = `
apis:
  local-yml:
    baseUrl: "https://local-yml.example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
`;
      
      const globalConfig = `
apis:
  global:
    baseUrl: "https://global.example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
`;
      
      // Create global config
      await fs.mkdir(globalConfigDir, { recursive: true });
      await fs.writeFile(globalConfigPath, globalConfig);
      
      // Create local config with .yml extension
      await fs.writeFile('.httpcraft.yml', localConfig);
      
      const result = await configLoader.loadDefaultConfig();
      expect(result).not.toBeNull();
      expect(result!.config.apis['local-yml']).toBeDefined();
      expect(result!.config.apis.global).toBeUndefined();
      expect(result!.path).toBe(path.resolve('.httpcraft.yml'));
    });

    it('should prioritize .httpcraft.yaml over .httpcraft.yml', async () => {
      const yamlConfig = `
apis:
  yaml-priority:
    baseUrl: "https://yaml.example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
`;
      
      const ymlConfig = `
apis:
  yml-fallback:
    baseUrl: "https://yml.example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
`;
      
      // Create both local configs
      await fs.writeFile('.httpcraft.yaml', yamlConfig);
      await fs.writeFile('.httpcraft.yml', ymlConfig);
      
      const result = await configLoader.loadDefaultConfig();
      expect(result).not.toBeNull();
      expect(result!.config.apis['yaml-priority']).toBeDefined();
      expect(result!.config.apis['yml-fallback']).toBeUndefined();
      expect(result!.path).toBe(path.resolve('.httpcraft.yaml'));
    });

    it('should fallback to global config when no local config exists', async () => {
      const globalConfig = `
apis:
  global-only:
    baseUrl: "https://global-only.example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
`;
      
      // Create only global config
      await fs.mkdir(globalConfigDir, { recursive: true });
      await fs.writeFile(globalConfigPath, globalConfig);
      
      const result = await configLoader.loadDefaultConfig();
      expect(result).not.toBeNull();
      expect(result!.config.apis['global-only']).toBeDefined();
      expect(result!.path).toBe(globalConfigPath);
    });

    it('should handle malformed local config and fallback to global', async () => {
      const invalidLocalConfig = 'invalid: yaml: content: [';
      const validGlobalConfig = `
apis:
  global-fallback:
    baseUrl: "https://global-fallback.example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
`;
      
      // Create invalid local config
      await fs.writeFile('.httpcraft.yaml', invalidLocalConfig);
      
      // Create valid global config
      await fs.mkdir(globalConfigDir, { recursive: true });
      await fs.writeFile(globalConfigPath, validGlobalConfig);
      
      const result = await configLoader.loadDefaultConfig();
      expect(result).not.toBeNull();
      expect(result!.config.apis['global-fallback']).toBeDefined();
      expect(result!.path).toBe(globalConfigPath);
    });
  });
}); 