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

describe('ConfigLoader - Modular Chain Imports (T9.2)', () => {
  let tempDir: string;
  let configLoader: ConfigLoader;

  beforeEach(async () => {
    configLoader = new ConfigLoader();
    // Create a temporary directory for test files
    tempDir = path.join(process.cwd(), 'test-temp-chains-' + Date.now());
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
    it('should load chains from directory using "directory:" syntax', async () => {
      // Create test directory structure
      const chainsDir = path.join(tempDir, 'chains');
      await fs.mkdir(chainsDir, { recursive: true });

      // Create API for the chain to reference
      const apiFile = path.join(tempDir, 'api.yaml');
      await fs.writeFile(apiFile, `
testApi:
  baseUrl: "https://httpbin.org"
  endpoints:
    get:
      method: GET
      path: "/get"
    post:
      method: POST
      path: "/post"
`);

      // Create chain files
      await fs.writeFile(path.join(chainsDir, 'workflow1.yaml'), `
workflow1:
  description: "First workflow"
  steps:
    - id: step1
      call: "testApi.get"
    - id: step2
      call: "testApi.post"
`);

      await fs.writeFile(path.join(chainsDir, 'workflow2.yaml'), `
workflow2:
  description: "Second workflow"
  vars:
    baseId: "123"
  steps:
    - id: getData
      call: "testApi.get"
`);

      // Create main config file
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  - "${apiFile}"
chains:
  - "directory:./chains/"
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.chains).toHaveProperty('workflow1');
      expect(config.chains).toHaveProperty('workflow2');
      expect(config.chains!.workflow1.description).toBe('First workflow');
      expect(config.chains!.workflow2.vars).toEqual({ baseId: '123' });
      expect(config.chains!.workflow1.steps).toHaveLength(2);
      expect(config.chains!.workflow2.steps).toHaveLength(1);
    });

    it('should handle both .yaml and .yml files in directory', async () => {
      const chainsDir = path.join(tempDir, 'chains');
      await fs.mkdir(chainsDir, { recursive: true });

      await fs.writeFile(path.join(chainsDir, 'chain1.yaml'), `
chain1:
  steps:
    - id: step1
      call: "api.endpoint"
`);

      await fs.writeFile(path.join(chainsDir, 'chain2.yml'), `
chain2:
  steps:
    - id: step1
      call: "api.endpoint"
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  api:
    baseUrl: "https://example.com"
    endpoints:
      endpoint:
        method: GET
        path: "/test"
chains:
  - "directory:./chains/"
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.chains).toHaveProperty('chain1');
      expect(config.chains).toHaveProperty('chain2');
    });

    it('should load files in alphabetical order for deterministic merging', async () => {
      const chainsDir = path.join(tempDir, 'chains');
      await fs.mkdir(chainsDir, { recursive: true });

      // Create files with same chain name but different values
      await fs.writeFile(path.join(chainsDir, 'a-first.yaml'), `
testChain:
  description: "First description"
  steps:
    - id: step1
      call: "api.endpoint1"
`);

      await fs.writeFile(path.join(chainsDir, 'z-last.yaml'), `
testChain:
  description: "Last description"
  steps:
    - id: step1
      call: "api.endpoint2"
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  api:
    baseUrl: "https://example.com"
    endpoints:
      endpoint1:
        method: GET
        path: "/test1"
      endpoint2:
        method: GET
        path: "/test2"
chains:
  - "directory:./chains/"
`);

      const config = await configLoader.loadConfig(configFile);

      // Last loaded should win (z-last.yaml loads after a-first.yaml)
      expect(config.chains!.testChain.description).toBe('Last description');
      expect(config.chains!.testChain.steps[0].call).toBe('api.endpoint2');
    });
  });

  describe('Individual File Import Support', () => {
    it('should load chains from individual files', async () => {
      // Create chain file
      const chainFile = path.join(tempDir, 'my-chain.yaml');
      await fs.writeFile(chainFile, `
myChain:
  description: "My test chain"
  vars:
    userId: "123"
  steps:
    - id: getUser
      call: "api.getUser"
    - id: updateUser
      call: "api.updateUser"
`);

      // Create main config file
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  api:
    baseUrl: "https://example.com"
    endpoints:
      getUser:
        method: GET
        path: "/users/{{userId}}"
      updateUser:
        method: PUT
        path: "/users/{{userId}}"
chains:
  - "./my-chain.yaml"
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.chains).toHaveProperty('myChain');
      expect(config.chains!.myChain.description).toBe('My test chain');
      expect(config.chains!.myChain.vars).toEqual({ userId: '123' });
    });
  });

  describe('Mixed Import Types', () => {
    it('should handle mixed directory and file imports', async () => {
      // Create directory with chains
      const chainsDir = path.join(tempDir, 'chains');
      await fs.mkdir(chainsDir, { recursive: true });

      await fs.writeFile(path.join(chainsDir, 'dir-chain.yaml'), `
dirChain:
  description: "From directory"
  steps:
    - id: step1
      call: "api.endpoint"
`);

      // Create individual chain file
      const chainFile = path.join(tempDir, 'extra-chain.yaml');
      await fs.writeFile(chainFile, `
extraChain:
  description: "Individual file"
  steps:
    - id: step1
      call: "api.endpoint"
`);

      // Create main config file
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  api:
    baseUrl: "https://example.com"
    endpoints:
      endpoint:
        method: GET
        path: "/test"
chains:
  - "directory:./chains/"
  - "./extra-chain.yaml"
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.chains).toHaveProperty('dirChain');
      expect(config.chains).toHaveProperty('extraChain');
      expect(config.chains!.dirChain.description).toBe('From directory');
      expect(config.chains!.extraChain.description).toBe('Individual file');
    });
  });

  describe('Direct Chain Definitions (Backward Compatibility)', () => {
    it('should still support direct chain definitions in config', async () => {
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  api:
    baseUrl: "https://example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
chains:
  directChain:
    description: "Direct definition"
    steps:
      - id: test
        call: "api.test"
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.chains).toHaveProperty('directChain');
      expect(config.chains!.directChain.description).toBe('Direct definition');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent directory', async () => {
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
chains:
  - "directory:./non-existent/"
`);

      await expect(configLoader.loadConfig(configFile)).rejects.toThrow(
        'Chain directory not found'
      );
    });

    it('should throw error for non-existent file', async () => {
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
chains:
  - "./non-existent.yaml"
`);

      await expect(configLoader.loadConfig(configFile)).rejects.toThrow(
        'Failed to load chain file'
      );
    });

    it('should throw error for invalid chain file content', async () => {
      const chainFile = path.join(tempDir, 'invalid.yaml');
      await fs.writeFile(chainFile, `
invalidChain:
  # Missing required steps
  description: "Invalid chain"
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
chains:
  - "./invalid.yaml"
`);

      await expect(configLoader.loadConfig(configFile)).rejects.toThrow(
        'steps array is required'
      );
    });

    it('should throw error for chain with invalid step', async () => {
      const chainFile = path.join(tempDir, 'invalid-step.yaml');
      await fs.writeFile(chainFile, `
invalidStepChain:
  steps:
    - id: "valid"
      call: "api.endpoint"
    - # Missing id and call
      description: "Invalid step"
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
chains:
  - "./invalid-step.yaml"
`);

      await expect(configLoader.loadConfig(configFile)).rejects.toThrow(
        'id is required'
      );
    });

    it('should throw error for malformed YAML in chain file', async () => {
      const chainFile = path.join(tempDir, 'malformed.yaml');
      await fs.writeFile(chainFile, `
invalidYaml: [
  unclosed bracket
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
chains:
  - "./malformed.yaml"
`);

      await expect(configLoader.loadConfig(configFile)).rejects.toThrow();
    });
  });

  describe('Conflict Resolution', () => {
    it('should follow "last loaded wins" for chain name conflicts', async () => {
      // Create first chain file
      const chain1File = path.join(tempDir, 'chain1.yaml');
      await fs.writeFile(chain1File, `
conflictChain:
  description: "First chain"
  steps:
    - id: step1
      call: "api.endpoint1"
`);

      // Create second chain file
      const chain2File = path.join(tempDir, 'chain2.yaml');
      await fs.writeFile(chain2File, `
conflictChain:
  description: "Second chain"
  steps:
    - id: step1
      call: "api.endpoint2"
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  api:
    baseUrl: "https://example.com"
    endpoints:
      endpoint1:
        method: GET
        path: "/test1"
      endpoint2:
        method: GET
        path: "/test2"
chains:
  - "./chain1.yaml"
  - "./chain2.yaml"  # This should win
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.chains!.conflictChain.description).toBe('Second chain');
      expect(config.chains!.conflictChain.steps[0].call).toBe('api.endpoint2');
    });
  });
});

describe('ConfigLoader - Global Variable Files (T9.3)', () => {
  let tempDir: string;
  let configLoader: ConfigLoader;

  beforeEach(async () => {
    configLoader = new ConfigLoader();
    // Create a temporary directory for test files
    tempDir = path.join(process.cwd(), 'test-temp-vars-' + Date.now());
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

  describe('Variable File Loading', () => {
    it('should load variables from a single file', async () => {
      // Create variable file
      const varFile = path.join(tempDir, 'globals.yaml');
      await fs.writeFile(varFile, `
globalVar1: "global-value-1"
globalVar2: 42
globalVar3: true
`);

      // Create main config file
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  test:
    baseUrl: "https://example.com"
    endpoints:
      get:
        method: GET
        path: "/test"
variables:
  - "./globals.yaml"
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.globalVariables).toEqual({
        globalVar1: 'global-value-1',
        globalVar2: 42,
        globalVar3: true
      });
    });

    it('should load variables from multiple files', async () => {
      // Create first variable file
      const varFile1 = path.join(tempDir, 'globals1.yaml');
      await fs.writeFile(varFile1, `
var1: "value1"
var2: "value2"
`);

      // Create second variable file
      const varFile2 = path.join(tempDir, 'globals2.yaml');
      await fs.writeFile(varFile2, `
var3: "value3"
var4: "value4"
`);

      // Create main config file
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  test:
    baseUrl: "https://example.com"
    endpoints:
      get:
        method: GET
        path: "/test"
variables:
  - "./globals1.yaml"
  - "./globals2.yaml"
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.globalVariables).toEqual({
        var1: 'value1',
        var2: 'value2',
        var3: 'value3',
        var4: 'value4'
      });
    });

    it('should handle "last loaded wins" for variable conflicts', async () => {
      // Create first variable file
      const varFile1 = path.join(tempDir, 'globals1.yaml');
      await fs.writeFile(varFile1, `
conflictVar: "first-value"
uniqueVar1: "unique1"
`);

      // Create second variable file
      const varFile2 = path.join(tempDir, 'globals2.yaml');
      await fs.writeFile(varFile2, `
conflictVar: "second-value"
uniqueVar2: "unique2"
`);

      // Create main config file
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  test:
    baseUrl: "https://example.com"
    endpoints:
      get:
        method: GET
        path: "/test"
variables:
  - "./globals1.yaml"
  - "./globals2.yaml"  # This should win for conflicts
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.globalVariables).toEqual({
        conflictVar: 'second-value', // Last loaded wins
        uniqueVar1: 'unique1',
        uniqueVar2: 'unique2'
      });
    });

    it('should handle configs without variables section', async () => {
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  test:
    baseUrl: "https://example.com"
    endpoints:
      get:
        method: GET
        path: "/test"
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.globalVariables).toEqual({});
    });

    it('should support different data types in variable files', async () => {
      const varFile = path.join(tempDir, 'types.yaml');
      await fs.writeFile(varFile, `
stringVar: "hello world"
numberVar: 123
floatVar: 45.67
booleanTrue: true
booleanFalse: false
nullVar: null
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  test:
    baseUrl: "https://example.com"
    endpoints:
      get:
        method: GET
        path: "/test"
variables:
  - "./types.yaml"
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.globalVariables).toEqual({
        stringVar: 'hello world',
        numberVar: 123,
        floatVar: 45.67,
        booleanTrue: true,
        booleanFalse: false,
        nullVar: null
      });
    });
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent variable file', async () => {
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  test:
    baseUrl: "https://example.com"
    endpoints:
      get:
        method: GET
        path: "/test"
variables:
  - "./non-existent.yaml"
`);

      await expect(configLoader.loadConfig(configFile)).rejects.toThrow(
        'Failed to load variable file ./non-existent.yaml'
      );
    });

    it('should throw error for invalid variable file content', async () => {
      const varFile = path.join(tempDir, 'invalid.yaml');
      await fs.writeFile(varFile, `
invalidVar:
  nested: "object"  # Objects are not allowed
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  test:
    baseUrl: "https://example.com"
    endpoints:
      get:
        method: GET
        path: "/test"
variables:
  - "./invalid.yaml"
`);

      await expect(configLoader.loadConfig(configFile)).rejects.toThrow(
        'Invalid variable \'invalidVar\': value must be a string, number, or boolean'
      );
    });

    it('should throw error for malformed YAML in variable file', async () => {
      const varFile = path.join(tempDir, 'malformed.yaml');
      await fs.writeFile(varFile, `
invalidYaml: [
  unclosed bracket
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  test:
    baseUrl: "https://example.com"
    endpoints:
      get:
        method: GET
        path: "/test"
variables:
  - "./malformed.yaml"
`);

      await expect(configLoader.loadConfig(configFile)).rejects.toThrow();
    });

    it('should throw error for non-string variable file path', async () => {
      // This would be caught during YAML parsing, but we test the validation
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  test:
    baseUrl: "https://example.com"
    endpoints:
      get:
        method: GET
        path: "/test"
variables:
  - 123  # Invalid: not a string
`);

      await expect(configLoader.loadConfig(configFile)).rejects.toThrow(
        'Variable file path must be a string'
      );
    });

    it('should throw error for variable file that is not an object', async () => {
      const varFile = path.join(tempDir, 'not-object.yaml');
      await fs.writeFile(varFile, `
- "this is an array"
- "not an object"
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  test:
    baseUrl: "https://example.com"
    endpoints:
      get:
        method: GET
        path: "/test"
variables:
  - "./not-object.yaml"
`);

      await expect(configLoader.loadConfig(configFile)).rejects.toThrow(
        'Invalid variable file: must contain an object'
      );
    });
  });
});

describe('ConfigLoader - Modular Profile Imports', () => {
  let tempDir: string;
  let configLoader: ConfigLoader;

  beforeEach(async () => {
    configLoader = new ConfigLoader();
    // Create a temporary directory for test files
    tempDir = path.join(process.cwd(), 'test-temp-profiles-' + Date.now());
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
    it('should load profiles from directory using "directory:" syntax', async () => {
      // Create test directory structure
      const profilesDir = path.join(tempDir, 'profiles');
      await fs.mkdir(profilesDir, { recursive: true });

      // Create profile files
      await fs.writeFile(path.join(profilesDir, 'development.yaml'), `
development:
  apiHost: "dev.example.com"
  debug: true
  timeout: 5000
`);

      await fs.writeFile(path.join(profilesDir, 'production.yaml'), `
production:
  apiHost: "api.example.com"
  debug: false
  timeout: 10000
`);

      // Create main config file
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  testApi:
    baseUrl: "https://example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
profiles:
  - "directory:./profiles/"
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.profiles).toHaveProperty('development');
      expect(config.profiles).toHaveProperty('production');
      expect(config.profiles!.development.apiHost).toBe('dev.example.com');
      expect(config.profiles!.development.debug).toBe(true);
      expect(config.profiles!.production.apiHost).toBe('api.example.com');
      expect(config.profiles!.production.debug).toBe(false);
    });

    it('should handle empty directory gracefully', async () => {
      // Create empty directory
      const profilesDir = path.join(tempDir, 'profiles');
      await fs.mkdir(profilesDir, { recursive: true });

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  testApi:
    baseUrl: "https://example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
profiles:
  - "directory:./profiles/"
`);

      const config = await configLoader.loadConfig(configFile);
      expect(config.profiles).toEqual({});
    });

    it('should merge profiles from multiple files in deterministic order', async () => {
      // Create test directory structure
      const profilesDir = path.join(tempDir, 'profiles');
      await fs.mkdir(profilesDir, { recursive: true });

      // Create profile files (note: alphabetical order matters)
      await fs.writeFile(path.join(profilesDir, 'a-base.yaml'), `
base:
  host: "base.example.com"
  port: 80
`);

      await fs.writeFile(path.join(profilesDir, 'b-override.yaml'), `
base:
  host: "override.example.com"
  ssl: true
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  testApi:
    baseUrl: "https://example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
profiles:
  - "directory:./profiles/"
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.profiles).toHaveProperty('base');
      // b-override.yaml should override values from a-base.yaml
      expect(config.profiles!.base.host).toBe('override.example.com');
      expect(config.profiles!.base.port).toBe(80); // preserved from first file
      expect(config.profiles!.base.ssl).toBe(true); // added by second file
    });

    it('should throw error for non-existent directory', async () => {
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  testApi:
    baseUrl: "https://example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
profiles:
  - "directory:./non-existent/"
`);

      await expect(configLoader.loadConfig(configFile))
        .rejects.toThrow(/Profile directory not found/);
    });
  });

  describe('Individual File Import Support', () => {
    it('should load profiles from individual files', async () => {
      // Create profile file
      const profileFile = path.join(tempDir, 'my-profile.yaml');
      await fs.writeFile(profileFile, `
myProfile:
  apiHost: "my.example.com"
  userId: "user123"
  enabled: true
`);

      // Create main config file
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  testApi:
    baseUrl: "https://example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
profiles:
  - "./my-profile.yaml"
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.profiles).toHaveProperty('myProfile');
      expect(config.profiles!.myProfile.apiHost).toBe('my.example.com');
      expect(config.profiles!.myProfile.userId).toBe('user123');
      expect(config.profiles!.myProfile.enabled).toBe(true);
    });
  });

  describe('Mixed Import Types', () => {
    it('should handle mixed directory and file imports', async () => {
      // Create directory with profiles
      const profilesDir = path.join(tempDir, 'profiles');
      await fs.mkdir(profilesDir, { recursive: true });

      await fs.writeFile(path.join(profilesDir, 'dev.yaml'), `
dev:
  env: "development"
  debug: true
`);

      // Create individual profile file
      const profileFile = path.join(tempDir, 'extra-profile.yaml');
      await fs.writeFile(profileFile, `
prod:
  env: "production"
  debug: false
`);

      // Create main config file
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  testApi:
    baseUrl: "https://example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
profiles:
  - "directory:./profiles/"
  - "./extra-profile.yaml"
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.profiles).toHaveProperty('dev');
      expect(config.profiles).toHaveProperty('prod');
      expect(config.profiles!.dev.env).toBe('development');
      expect(config.profiles!.prod.env).toBe('production');
    });

    it('should handle later imports overriding earlier ones', async () => {
      // Create directory with profiles
      const profilesDir = path.join(tempDir, 'profiles');
      await fs.mkdir(profilesDir, { recursive: true });

      await fs.writeFile(path.join(profilesDir, 'base.yaml'), `
shared:
  host: "directory.example.com"
  port: 8080
`);

      // Create individual profile file that overrides
      const profileFile = path.join(tempDir, 'override.yaml');
      await fs.writeFile(profileFile, `
shared:
  host: "file.example.com"
  ssl: true
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  testApi:
    baseUrl: "https://example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
profiles:
  - "directory:./profiles/"
  - "./override.yaml"
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.profiles).toHaveProperty('shared');
      expect(config.profiles!.shared.host).toBe('file.example.com'); // overridden by file
      expect(config.profiles!.shared.port).toBe(8080); // preserved from directory
      expect(config.profiles!.shared.ssl).toBe(true); // added by file
    });
  });

  describe('Error Handling', () => {
    it('should throw error for invalid profile file content', async () => {
      const profileFile = path.join(tempDir, 'invalid.yaml');
      await fs.writeFile(profileFile, 'invalid yaml content: [unclosed');

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  testApi:
    baseUrl: "https://example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
profiles:
  - "./invalid.yaml"
`);

      await expect(configLoader.loadConfig(configFile))
        .rejects.toThrow(/Failed to load profile file/);
    });

    it('should throw error for non-object profile values', async () => {
      const profileFile = path.join(tempDir, 'invalid-profile.yaml');
      await fs.writeFile(profileFile, `
myProfile:
  validKey: "value"
  invalidKey:
    nested: "object"
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  testApi:
    baseUrl: "https://example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
profiles:
  - "./invalid-profile.yaml"
`);

      await expect(configLoader.loadConfig(configFile))
        .rejects.toThrow(/Invalid profile variable 'invalidKey'/);
    });

    it('should throw error for non-string import specification', async () => {
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  testApi:
    baseUrl: "https://example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
profiles:
  - 123
`);

      await expect(configLoader.loadConfig(configFile))
        .rejects.toThrow(/Profile import specification must be a string/);
    });
  });

  describe('Direct Profile Definition Support', () => {
    it('should still support direct profile definitions', async () => {
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  testApi:
    baseUrl: "https://example.com"
    endpoints:
      test:
        method: GET
        path: "/test"
profiles:
  dev:
    host: "dev.example.com"
    debug: true
  prod:
    host: "prod.example.com"
    debug: false
`);

      const config = await configLoader.loadConfig(configFile);

      expect(config.profiles).toHaveProperty('dev');
      expect(config.profiles).toHaveProperty('prod');
      expect(config.profiles!.dev.host).toBe('dev.example.com');
      expect(config.profiles!.prod.host).toBe('prod.example.com');
    });
  });
}); 