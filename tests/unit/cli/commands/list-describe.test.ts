import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  handleListApisCommand,
  handleListEndpointsCommand,
  handleListProfilesCommand,
} from '../../../../src/cli/commands/list.js';
import {
  handleDescribeApiCommand,
  handleDescribeProfileCommand,
  handleDescribeEndpointCommand,
} from '../../../../src/cli/commands/describe.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('CLI Information Commands', () => {
  let tempDir: string;
  let testConfigPath: string;
  let originalStdout: typeof process.stdout.write;
  let originalStderr: typeof process.stderr.write;
  let capturedOutput: string;
  let capturedError: string;

  beforeEach(async () => {
    // Create temp directory and test config
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'httpcraft-test-'));
    testConfigPath = path.join(tempDir, 'test-config.yaml');

    // Create a test configuration
    const testConfig = `
config:
  defaultProfile: ["base", "dev"]

profiles:
  base:
    description: "Base configuration for all environments"
    apiUrl: "https://api.example.com"
    timeout: 30
  dev:
    description: "Development environment settings"
    environment: "development"
    debug: true
  prod:
    environment: "production"
    debug: false

apis:
  userAPI:
    description: "User management API"
    baseUrl: "{{profile.apiUrl}}/v1"
    headers:
      Authorization: "Bearer {{env.API_KEY}}"
      User-Agent: "HttpCraft/1.0"
    endpoints:
      getUser:
        method: GET
        path: "/users/{{userId}}"
        description: "Get user by ID"
      createUser:
        method: POST
        path: "/users"
        description: "Create a new user"
        body:
          name: "{{userName}}"
          email: "{{userEmail}}"
  
  healthAPI:
    baseUrl: "{{profile.apiUrl}}"
    endpoints:
      health:
        method: GET
        path: "/health"
`;

    await fs.writeFile(testConfigPath, testConfig);

    // Capture console output
    capturedOutput = '';
    capturedError = '';
    originalStdout = process.stdout.write;
    originalStderr = process.stderr.write;

    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;

    console.log = function (...args: any[]): void {
      capturedOutput += args.join(' ') + '\n';
    };

    console.error = function (...args: any[]): void {
      capturedError += args.join(' ') + '\n';
    };

    process.stdout.write = function (chunk: any): boolean {
      capturedOutput += chunk.toString();
      return true;
    };

    process.stderr.write = function (chunk: any): boolean {
      capturedError += chunk.toString();
      return true;
    };

    // Store original functions for restoration
    (this as any).originalConsoleLog = originalConsoleLog;
    (this as any).originalConsoleError = originalConsoleError;
  });

  afterEach(async () => {
    // Restore console output
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
    console.log = (this as any).originalConsoleLog;
    console.error = (this as any).originalConsoleError;

    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true });
  });

  describe('List Commands', () => {
    test('should list APIs with table format', async () => {
      await handleListApisCommand({ config: testConfigPath });

      expect(capturedOutput).toContain('APIs:');
      expect(capturedOutput).toContain('userAPI');
      expect(capturedOutput).toContain('healthAPI');
      expect(capturedOutput).toContain('User management API');
      expect(capturedOutput).toContain('{{profile.apiUrl}}/v1');
    });

    test('should list APIs with JSON format', async () => {
      await handleListApisCommand({ config: testConfigPath, json: true });

      const output = JSON.parse(capturedOutput);
      expect(Array.isArray(output)).toBe(true);
      expect(output).toHaveLength(2);

      const userAPI = output.find((api: any) => api.name === 'userAPI');
      expect(userAPI).toBeDefined();
      expect(userAPI.description).toBe('User management API');
      expect(userAPI.baseUrl).toBe('{{profile.apiUrl}}/v1');
      expect(userAPI.endpoints).toBe(2);
    });

    test('should list all endpoints', async () => {
      await handleListEndpointsCommand({ config: testConfigPath });

      expect(capturedOutput).toContain('Endpoints:');
      expect(capturedOutput).toContain('userAPI');
      expect(capturedOutput).toContain('getUser');
      expect(capturedOutput).toContain('createUser');
      expect(capturedOutput).toContain('GET');
      expect(capturedOutput).toContain('POST');
      expect(capturedOutput).toContain('Get user by ID');
    });

    test('should list endpoints for specific API', async () => {
      await handleListEndpointsCommand({ config: testConfigPath, apiName: 'userAPI' });

      expect(capturedOutput).toContain('Endpoints (userAPI):');
      expect(capturedOutput).toContain('getUser');
      expect(capturedOutput).toContain('createUser');
      expect(capturedOutput).not.toContain('health'); // From healthAPI
    });

    test('should list profiles with default indicators', async () => {
      await handleListProfilesCommand({ config: testConfigPath });

      expect(capturedOutput).toContain('Profiles:');
      expect(capturedOutput).toContain('base');
      expect(capturedOutput).toContain('dev');
      expect(capturedOutput).toContain('prod');
      expect(capturedOutput).toContain('✓'); // Default indicator
      expect(capturedOutput).toContain('Default profiles: base, dev');
    });
  });

  describe('Describe Commands', () => {
    test('should describe API with details', async () => {
      await handleDescribeApiCommand({ config: testConfigPath, apiName: 'userAPI' });

      expect(capturedOutput).toContain('API: userAPI');
      expect(capturedOutput).toContain('Description: User management API');
      expect(capturedOutput).toContain('Base URL: {{profile.apiUrl}}/v1');
      expect(capturedOutput).toContain('Headers:');
      expect(capturedOutput).toContain('Authorization: Bearer {{env.API_KEY}}');
      expect(capturedOutput).toContain('Endpoints:');
      expect(capturedOutput).toContain('getUser (GET /users/{{userId}})');
      expect(capturedOutput).toContain('createUser (POST /users)');
    });

    test('should describe profile with variables', async () => {
      await handleDescribeProfileCommand({ config: testConfigPath, profileName: 'base' });

      expect(capturedOutput).toContain('Profile: base');
      expect(capturedOutput).toContain('Description: Base configuration for all environments');
      expect(capturedOutput).toContain('Default: ✓ (loaded by default)');
      expect(capturedOutput).toContain('Variables:');
      expect(capturedOutput).toContain('apiUrl: https://api.example.com');
      expect(capturedOutput).toContain('timeout: 30');
    });

    test('should describe endpoint with profile resolution', async () => {
      await handleDescribeEndpointCommand({
        config: testConfigPath,
        apiName: 'userAPI',
        endpointName: 'getUser',
      });

      expect(capturedOutput).toContain('Endpoint: userAPI.getUser');
      expect(capturedOutput).toContain('Description: Get user by ID');
      expect(capturedOutput).toContain('Method: GET');
      expect(capturedOutput).toContain('Path: /users/{{userId}}');
      expect(capturedOutput).toContain('Active Profiles: base → dev');
      expect(capturedOutput).toContain('Final Configuration:');
      expect(capturedOutput).toContain('Inherited from API:');
    });

    test('should describe endpoint with JSON output', async () => {
      await handleDescribeEndpointCommand({
        config: testConfigPath,
        apiName: 'userAPI',
        endpointName: 'getUser',
        json: true,
      });

      const output = JSON.parse(capturedOutput);
      expect(output.api).toBe('userAPI');
      expect(output.name).toBe('getUser');
      expect(output.description).toBe('Get user by ID');
      expect(output.method).toBe('GET');
      expect(output.path).toBe('/users/{{userId}}');
      expect(output.activeProfiles).toEqual(['base', 'dev']);
      expect(output.configuration).toBeDefined();
      expect(output.inherited).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle missing API in describe', async () => {
      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number) => {
        exitCode = code;
        throw new Error('Process exit called');
      }) as any;

      try {
        await handleDescribeApiCommand({ config: testConfigPath, apiName: 'nonexistent' });
      } catch (error) {
        // Expected to throw due to process.exit mock
      }

      process.exit = originalExit;
      expect(exitCode).toBe(1);
      expect(capturedError).toContain("Error: API 'nonexistent' not found");
    });

    test('should handle missing profile in describe', async () => {
      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number) => {
        exitCode = code;
        throw new Error('Process exit called');
      }) as any;

      try {
        await handleDescribeProfileCommand({ config: testConfigPath, profileName: 'nonexistent' });
      } catch (error) {
        // Expected to throw due to process.exit mock
      }

      process.exit = originalExit;
      expect(exitCode).toBe(1);
      expect(capturedError).toContain("Error: Profile 'nonexistent' not found");
    });

    test('should handle missing endpoint in describe', async () => {
      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number) => {
        exitCode = code;
        throw new Error('Process exit called');
      }) as any;

      try {
        await handleDescribeEndpointCommand({
          config: testConfigPath,
          apiName: 'userAPI',
          endpointName: 'nonexistent',
        });
      } catch (error) {
        // Expected to throw due to process.exit mock
      }

      process.exit = originalExit;
      expect(exitCode).toBe(1);
      expect(capturedError).toContain("Error: Endpoint 'nonexistent' not found in API 'userAPI'");
    });

    test('should handle missing configuration file', async () => {
      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number) => {
        exitCode = code;
        throw new Error('Process exit called');
      }) as any;

      try {
        await handleListApisCommand({ config: '/nonexistent/config.yaml' });
      } catch (error) {
        // Expected to throw due to process.exit mock
      }

      process.exit = originalExit;
      expect(exitCode).toBe(1);
      expect(capturedError).toContain('Error:');
    });
  });
});
