import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { ConfigLoader } from '../../src/core/configLoader.js';

describe('ConfigLoader - Modular API Imports (T9.1)', () => {
  let tempDir: string;
  let configLoader: ConfigLoader;

  beforeEach(async () => {
    configLoader = new ConfigLoader();
    // Create a temporary directory for test files
    tempDir = path.join(process.cwd(), 'test-temp-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Directory Import Support', () => {
    it('should load APIs from directory using "directory:" syntax', async () => {
      // Create test directory structure
      const apisDir = path.join(tempDir, 'apis');
      await fs.mkdir(apisDir, { recursive: true });

      // Create API files
      await fs.writeFile(path.join(apisDir, 'service1.yaml'), `
service1:
  baseUrl: "https://api.service1.com"
  endpoints:
    get:
      method: GET
      path: "/data"
`);

      await fs.writeFile(path.join(apisDir, 'service2.yaml'), `
service2:
  baseUrl: "https://api.service2.com"
  endpoints:
    post:
      method: POST
      path: "/submit"
`);

      // Create main config file
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  - "directory:./apis/"
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.apis).toHaveProperty('service1');
      expect(config.apis).toHaveProperty('service2');
      expect(config.apis.service1.baseUrl).toBe('https://api.service1.com');
      expect(config.apis.service2.baseUrl).toBe('https://api.service2.com');
    });

    it('should handle both .yaml and .yml files in directory', async () => {
      const apisDir = path.join(tempDir, 'apis');
      await fs.mkdir(apisDir, { recursive: true });

      await fs.writeFile(path.join(apisDir, 'service1.yaml'), `
service1:
  baseUrl: "https://api.service1.com"
  endpoints:
    get:
      method: GET
      path: "/data"
`);

      await fs.writeFile(path.join(apisDir, 'service2.yml'), `
service2:
  baseUrl: "https://api.service2.com"
  endpoints:
    post:
      method: POST
      path: "/submit"
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  - "directory:./apis/"
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.apis).toHaveProperty('service1');
      expect(config.apis).toHaveProperty('service2');
    });

    it('should load files in alphabetical order for deterministic merging', async () => {
      const apisDir = path.join(tempDir, 'apis');
      await fs.mkdir(apisDir, { recursive: true });

      // Create files with same API name but different values
      await fs.writeFile(path.join(apisDir, 'a-first.yaml'), `
testApi:
  baseUrl: "https://first.com"
  endpoints:
    test:
      method: GET
      path: "/first"
`);

      await fs.writeFile(path.join(apisDir, 'z-last.yaml'), `
testApi:
  baseUrl: "https://last.com"
  endpoints:
    test:
      method: GET
      path: "/last"
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  - "directory:./apis/"
`);

      const config = await configLoader.loadConfig(configFile);

      // Last loaded should win (z-last.yaml loads after a-first.yaml)
      expect(config.apis.testApi.baseUrl).toBe('https://last.com');
      expect(config.apis.testApi.endpoints.test.path).toBe('/last');
    });
  });

  describe('Individual File Import Support', () => {
    it('should load APIs from individual files', async () => {
      // Create API file
      const apiFile = path.join(tempDir, 'my-api.yaml');
      await fs.writeFile(apiFile, `
myApi:
  baseUrl: "https://api.example.com"
  endpoints:
    getData:
      method: GET
      path: "/data"
`);

      // Create main config file
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  - "./my-api.yaml"
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.apis).toHaveProperty('myApi');
      expect(config.apis.myApi.baseUrl).toBe('https://api.example.com');
    });
  });

  describe('Mixed Import Types', () => {
    it('should handle mixed directory and file imports', async () => {
      // Create directory with APIs
      const apisDir = path.join(tempDir, 'apis');
      await fs.mkdir(apisDir, { recursive: true });

      await fs.writeFile(path.join(apisDir, 'service1.yaml'), `
service1:
  baseUrl: "https://api.service1.com"
  endpoints:
    get:
      method: GET
      path: "/data"
`);

      // Create individual API file
      const apiFile = path.join(tempDir, 'extra-api.yaml');
      await fs.writeFile(apiFile, `
extraApi:
  baseUrl: "https://api.extra.com"
  endpoints:
    post:
      method: POST
      path: "/submit"
`);

      // Create main config file
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  - "directory:./apis/"
  - "./extra-api.yaml"
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.apis).toHaveProperty('service1');
      expect(config.apis).toHaveProperty('extraApi');
    });
  });

  describe('Direct API Definitions (Backward Compatibility)', () => {
    it('should still support direct API definitions in config', async () => {
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  directApi:
    baseUrl: "https://api.direct.com"
    endpoints:
      test:
        method: GET
        path: "/test"
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.apis).toHaveProperty('directApi');
      expect(config.apis.directApi.baseUrl).toBe('https://api.direct.com');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent directory', async () => {
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  - "directory:./non-existent/"
`);

      await expect(configLoader.loadConfig(configFile)).rejects.toThrow(
        'API directory not found'
      );
    });

    it('should throw error for non-existent file', async () => {
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  - "./non-existent.yaml"
`);

      await expect(configLoader.loadConfig(configFile)).rejects.toThrow(
        'Failed to load API file'
      );
    });

    it('should throw error for invalid API file content', async () => {
      const apiFile = path.join(tempDir, 'invalid.yaml');
      await fs.writeFile(apiFile, `
invalidApi:
  # Missing required baseUrl and endpoints
  description: "Invalid API"
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  - "./invalid.yaml"
`);

      await expect(configLoader.loadConfig(configFile)).rejects.toThrow(
        'baseUrl is required'
      );
    });

    it('should throw error for malformed YAML in API file', async () => {
      const apiFile = path.join(tempDir, 'malformed.yaml');
      await fs.writeFile(apiFile, `
invalidYaml: [
  unclosed bracket
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  - "./malformed.yaml"
`);

      await expect(configLoader.loadConfig(configFile)).rejects.toThrow();
    });
  });

  describe('Conflict Resolution', () => {
    it('should follow "last loaded wins" for API name conflicts', async () => {
      // Create first API file
      const api1File = path.join(tempDir, 'api1.yaml');
      await fs.writeFile(api1File, `
conflictApi:
  baseUrl: "https://first.com"
  endpoints:
    test:
      method: GET
      path: "/first"
`);

      // Create second API file
      const api2File = path.join(tempDir, 'api2.yaml');
      await fs.writeFile(api2File, `
conflictApi:
  baseUrl: "https://second.com"
  endpoints:
    test:
      method: POST
      path: "/second"
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  - "./api1.yaml"
  - "./api2.yaml"  # This should win
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.apis.conflictApi.baseUrl).toBe('https://second.com');
      expect(config.apis.conflictApi.endpoints.test.method).toBe('POST');
      expect(config.apis.conflictApi.endpoints.test.path).toBe('/second');
    });
  });
}); 