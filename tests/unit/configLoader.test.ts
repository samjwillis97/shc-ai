import { describe, it, expect } from 'vitest';
import path from 'path';
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
    const configPath = './non-existent-file.yaml';
    
    await expect(configLoader.loadConfig(configPath)).rejects.toThrow(/Failed to load configuration/);
  });

  it('should throw error for invalid config structure', async () => {
    const configPath = path.join(process.cwd(), 'tests/fixtures/invalid-config.yaml');
    
    await expect(configLoader.loadConfig(configPath)).rejects.toThrow(/apis section is required/);
  });

  it('should return null when no default config file exists', async () => {
    // Test in current directory where no .httpcraft.yaml exists
    const config = await configLoader.loadDefaultConfig();
    expect(config).toBeNull();
  });
}); 