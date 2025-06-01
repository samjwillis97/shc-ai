import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { handleApiCommand } from '../../src/cli/commands/api.js';
import { tmpdir } from 'os';

describe('Phase 4 Integration - Profiles and Variable Scopes', () => {
  let tempDir: string;
  let configFile: string;
  
  beforeEach(async () => {
    // Create a temporary directory for test files
    tempDir = await fs.mkdtemp(join(tmpdir(), 'httpcraft-phase4-test-'));
    configFile = join(tempDir, 'config.yaml');
  });
  
  afterEach(async () => {
    // Clean up temporary files
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Basic Profile Functionality', () => {
    it('should load and use default profile from config', async () => {
      const config = `
config:
  defaultProfile: "dev"

profiles:
  dev:
    apiHost: "dev.api.example.com"
    userId: "dev_user_123"
  prod:
    apiHost: "api.example.com"
    userId: "prod_user_456"

apis:
  testApi:
    baseUrl: "https://{{profile.apiHost}}/v1"
    endpoints:
      getUser:
        method: GET
        path: "/users/{{profile.userId}}"
`;

      await fs.writeFile(configFile, config);
      
      // Mock console.log to capture output
      const originalLog = console.log;
      let capturedOutput = '';
      console.log = (msg: string) => { capturedOutput = msg; };
      
      // Mock httpClient to avoid actual HTTP calls
      const originalExecuteRequest = (await import('../../src/core/httpClient.js')).httpClient.executeRequest;
      (await import('../../src/core/httpClient.js')).httpClient.executeRequest = async (req) => {
        expect(req.url).toBe('https://dev.api.example.com/v1/users/dev_user_123');
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          body: JSON.stringify({ id: 'dev_user_123', name: 'Dev User' })
        };
      };
      
      try {
        await handleApiCommand({
          apiName: 'testApi',
          endpointName: 'getUser',
          config: configFile
        });
        
        expect(capturedOutput).toBe('{"id":"dev_user_123","name":"Dev User"}');
      } finally {
        console.log = originalLog;
        (await import('../../src/core/httpClient.js')).httpClient.executeRequest = originalExecuteRequest;
      }
    });

    it('should override default profile with CLI profile', async () => {
      const config = `
config:
  defaultProfile: "dev"

profiles:
  dev:
    apiHost: "dev.api.example.com"
  prod:
    apiHost: "api.example.com"

apis:
  testApi:
    baseUrl: "https://{{profile.apiHost}}/v1"
    endpoints:
      ping:
        method: GET
        path: "/ping"
`;

      await fs.writeFile(configFile, config);
      
      // Mock httpClient to verify the URL contains the prod host
      const originalExecuteRequest = (await import('../../src/core/httpClient.js')).httpClient.executeRequest;
      (await import('../../src/core/httpClient.js')).httpClient.executeRequest = async (req) => {
        expect(req.url).toBe('https://api.example.com/v1/ping');
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          body: 'pong'
        };
      };
      
      const originalLog = console.log;
      console.log = () => {}; // Suppress output
      
      try {
        await handleApiCommand({
          apiName: 'testApi',
          endpointName: 'ping',
          config: configFile,
          profiles: ['prod'] // Override default with CLI profile
        });
      } finally {
        console.log = originalLog;
        (await import('../../src/core/httpClient.js')).httpClient.executeRequest = originalExecuteRequest;
      }
    });

    it('should merge multiple profiles with later ones taking precedence', async () => {
      const config = `
profiles:
  base:
    apiHost: "base.example.com"
    timeout: 5000
    debug: true
  env:
    apiHost: "dev.example.com"
    port: 3000
  user:
    userId: "user_123"
    timeout: 10000

apis:
  testApi:
    baseUrl: "https://{{profile.apiHost}}:{{profile.port}}/v1"
    endpoints:
      getUser:
        method: GET
        path: "/users/{{profile.userId}}"
        headers:
          X-Debug: "{{profile.debug}}"
          X-Timeout: "{{profile.timeout}}"
`;

      await fs.writeFile(configFile, config);
      
      const originalExecuteRequest = (await import('../../src/core/httpClient.js')).httpClient.executeRequest;
      (await import('../../src/core/httpClient.js')).httpClient.executeRequest = async (req) => {
        // Verify that variables from all profiles are merged correctly
        expect(req.url).toBe('https://dev.example.com:3000/v1/users/user_123');
        expect(req.headers).toEqual({
          'X-Debug': 'true',        // from base
          'X-Timeout': '10000'      // from user (overrides base)
        });
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          body: 'success'
        };
      };
      
      const originalLog = console.log;
      console.log = () => {}; // Suppress output
      
      try {
        await handleApiCommand({
          apiName: 'testApi',
          endpointName: 'getUser',
          config: configFile,
          profiles: ['base', 'env', 'user'] // Multiple profiles
        });
      } finally {
        console.log = originalLog;
        (await import('../../src/core/httpClient.js')).httpClient.executeRequest = originalExecuteRequest;
      }
    });
  });

  describe('API and Endpoint Variables', () => {
    it('should resolve API and endpoint variables with correct precedence', async () => {
      const config = `
profiles:
  dev:
    defaultTimeout: "30000"
    environment: "development"

apis:
  testApi:
    baseUrl: "https://api.example.com/v1"
    variables:
      apiVersion: "1.2.3"
      timeout: "5000"
      serviceKey: "api_level_key"
    endpoints:
      updateItem:
        method: PUT
        path: "/items/{{itemId}}"
        variables:
          timeout: "2000"          # Overrides API timeout
          serviceKey: "endpoint_key" # Overrides API serviceKey
        headers:
          X-API-Version: "{{api.apiVersion}}"
          X-Timeout: "{{endpoint.timeout}}"
          X-Service-Key: "{{serviceKey}}"
          X-Environment: "{{profile.environment}}"
        body:
          id: "{{itemId}}"
          timeout: "{{timeout}}"
`;

      await fs.writeFile(configFile, config);
      
      const originalExecuteRequest = (await import('../../src/core/httpClient.js')).httpClient.executeRequest;
      (await import('../../src/core/httpClient.js')).httpClient.executeRequest = async (req) => {
        expect(req.url).toBe('https://api.example.com/v1/items/item_123');
        expect(req.headers).toEqual({
          'X-API-Version': '1.2.3',        // From API variables
          'X-Timeout': '2000',             // From endpoint variables (overrides API)
          'X-Service-Key': 'endpoint_key', // From endpoint variables (overrides API)
          'X-Environment': 'development'   // From profile
        });
        expect(req.body).toEqual({
          id: 'item_123',                  // From CLI
          timeout: '2000'                  // From endpoint variables (highest precedence for 'timeout')
        });
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          body: 'updated'
        };
      };
      
      const originalLog = console.log;
      console.log = () => {}; // Suppress output
      
      try {
        await handleApiCommand({
          apiName: 'testApi',
          endpointName: 'updateItem',
          config: configFile,
          profiles: ['dev'],
          variables: { itemId: 'item_123' } // CLI variable
        });
      } finally {
        console.log = originalLog;
        (await import('../../src/core/httpClient.js')).httpClient.executeRequest = originalExecuteRequest;
      }
    });
  });

  describe('Variable Precedence Integration', () => {
    it('should respect full variable precedence order', async () => {
      const config = `
profiles:
  dev:
    testVar: "profile_value"
    
apis:
  testApi:
    baseUrl: "https://api.example.com/v1"
    variables:
      testVar: "api_value"
    endpoints:
      test:
        method: GET
        path: "/test"
        variables:
          testVar: "endpoint_value"
        headers:
          X-Test-Var: "{{testVar}}"
`;

      await fs.writeFile(configFile, config);
      
      const originalExecuteRequest = (await import('../../src/core/httpClient.js')).httpClient.executeRequest;
      (await import('../../src/core/httpClient.js')).httpClient.executeRequest = async (req) => {
        expect(req.headers).toEqual({
          'X-Test-Var': 'cli_value' // CLI should win over all others
        });
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          body: 'success'
        };
      };
      
      const originalLog = console.log;
      console.log = () => {}; // Suppress output
      
      try {
        await handleApiCommand({
          apiName: 'testApi',
          endpointName: 'test',
          config: configFile,
          profiles: ['dev'],
          variables: { testVar: 'cli_value' } // CLI should override all others
        });
      } finally {
        console.log = originalLog;
        (await import('../../src/core/httpClient.js')).httpClient.executeRequest = originalExecuteRequest;
      }
    });
  });

  describe('Error Handling', () => {
    it('should error when requested profile does not exist', async () => {
      const config = `
profiles:
  dev:
    host: "dev.example.com"

apis:
  testApi:
    baseUrl: "https://{{profile.host}}/v1"
    endpoints:
      test:
        method: GET
        path: "/test"
`;

      await fs.writeFile(configFile, config);
      
      const originalError = console.error;
      const originalExit = process.exit;
      let capturedErrors: string[] = [];
      let exitCode = 0;
      
      console.error = (msg: string) => { capturedErrors.push(msg); };
      process.exit = ((code: number) => { 
        if (exitCode === 0) exitCode = code; // Capture first exit code
        throw new Error('Process exit called'); // Stop execution
      }) as any;
      
      try {
        await handleApiCommand({
          apiName: 'testApi',
          endpointName: 'test',
          config: configFile,
          profiles: ['nonexistent']
        });
        
        // Should not reach here
        expect.fail('Expected function to throw or exit');
      } catch (error) {
        // Expected to throw due to mocked process.exit
        expect(capturedErrors[0]).toContain("Profile 'nonexistent' not found");
        expect(exitCode).toBe(1);
      } finally {
        console.error = originalError;
        process.exit = originalExit;
      }
    });

    it('should error when scoped variable is not defined', async () => {
      const config = `
profiles:
  dev:
    host: "dev.example.com"

apis:
  testApi:
    baseUrl: "https://{{profile.host}}/v1"
    endpoints:
      test:
        method: GET
        path: "/test"
        headers:
          X-Missing: "{{profile.missing}}"
`;

      await fs.writeFile(configFile, config);
      
      const originalError = console.error;
      const originalExit = process.exit;
      let capturedError = '';
      let exitCode = 0;
      
      console.error = (msg: string) => { capturedError = msg; };
      process.exit = ((code: number) => { exitCode = code; }) as any;
      
      try {
        await handleApiCommand({
          apiName: 'testApi',
          endpointName: 'test',
          config: configFile,
          profiles: ['dev']
        });
        
        expect(capturedError).toContain("Variable Error");
        expect(capturedError).toContain("missing");
        expect(exitCode).toBe(1);
      } finally {
        console.error = originalError;
        process.exit = originalExit;
      }
    });
  });

  describe('Complex JSON Body Resolution', () => {
    it('should resolve variables in complex JSON request bodies', async () => {
      const config = `
profiles:
  dev:
    environment: "development"
    debug: true

apis:
  testApi:
    baseUrl: "https://api.example.com/v1"
    variables:
      apiVersion: "1.0.0"
    endpoints:
      createItem:
        method: POST
        path: "/items"
        variables:
          defaultStatus: "pending"
        body:
          name: "Item {{itemName}}"
          status: "{{endpoint.defaultStatus}}"
          metadata:
            version: "{{api.apiVersion}}"
            environment: "{{profile.environment}}"
            debug: "{{profile.debug}}"
            timestamp: "{{timestamp}}"
          tags:
            - "{{profile.environment}}"
            - "v{{api.apiVersion}}"
`;

      await fs.writeFile(configFile, config);
      
      const originalExecuteRequest = (await import('../../src/core/httpClient.js')).httpClient.executeRequest;
      (await import('../../src/core/httpClient.js')).httpClient.executeRequest = async (req) => {
        expect(req.body).toEqual({
          name: 'Item test_item',
          status: 'pending',
          metadata: {
            version: '1.0.0',
            environment: 'development',
            debug: 'true',
            timestamp: '2023-10-26T12:00:00Z'
          },
          tags: ['development', 'v1.0.0']
        });
        return {
          status: 201,
          statusText: 'Created',
          headers: {},
          body: '{"id":"item_123"}'
        };
      };
      
      const originalLog = console.log;
      console.log = () => {}; // Suppress output
      
      try {
        await handleApiCommand({
          apiName: 'testApi',
          endpointName: 'createItem',
          config: configFile,
          profiles: ['dev'],
          variables: {
            itemName: 'test_item',
            timestamp: '2023-10-26T12:00:00Z'
          }
        });
      } finally {
        console.log = originalLog;
        (await import('../../src/core/httpClient.js')).httpClient.executeRequest = originalExecuteRequest;
      }
    });
  });
}); 