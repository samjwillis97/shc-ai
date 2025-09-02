import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  handleListApisCommand,
  handleListEndpointsCommand,
  handleListProfilesCommand,
  handleListVariablesCommand,
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

  describe('List Variables Command', () => {
    test('should list all variables in table format', async () => {
      await handleListVariablesCommand({ config: testConfigPath });

      // Should show profile variables (with default profiles active)
      expect(capturedOutput).toContain('Variables with profiles: base, dev:');
      expect(capturedOutput).toContain('Name');
      expect(capturedOutput).toContain('Value');
      expect(capturedOutput).toContain('Source');

      // Should show profile variables from test config
      expect(capturedOutput).toContain('apiUrl');
      expect(capturedOutput).toContain('Profile: base (active)');
      expect(capturedOutput).toContain('environment');
      expect(capturedOutput).toContain('Profile: dev (active)');

      // Should show dynamic variables
      expect(capturedOutput).toContain('$timestamp');
      expect(capturedOutput).toContain('Built-in Dynamic Variable');

      // Should show usage examples
      expect(capturedOutput).toContain('Usage examples:');
      expect(capturedOutput).toContain('{{variableName}}');
      expect(capturedOutput).toContain('{{env.VARIABLE_NAME}}');
    });
    test('should list variables in JSON format', async () => {
      await handleListVariablesCommand({ config: testConfigPath, json: true });

      const output = JSON.parse(capturedOutput);
      expect(Array.isArray(output)).toBe(true);
      expect(output.length).toBeGreaterThan(0);

      // Check structure of variable objects
      const sampleVar = output.find((v: any) => v.name === 'apiUrl');
      expect(sampleVar).toBeDefined();
      expect(sampleVar).toHaveProperty('name');
      expect(sampleVar).toHaveProperty('value');
      expect(sampleVar).toHaveProperty('source');
      expect(sampleVar).toHaveProperty('scope');
      expect(sampleVar).toHaveProperty('active');
      expect(sampleVar.scope).toBe('profile');
      expect(typeof sampleVar.active).toBe('boolean');

      // Check that profile variables have the correct source format in JSON
      expect(sampleVar.source).toMatch(/^Profile: /);
      expect(sampleVar.source).not.toContain('(active)'); // Should not contain active indicator in JSON
    });

    test('should filter variables by profiles', async () => {
      await handleListVariablesCommand({
        config: testConfigPath,
        profiles: ['base', 'prod'],
      });

      expect(capturedOutput).toContain('with profiles: base, prod');
      expect(capturedOutput).toContain('Profile: base (active)');
      expect(capturedOutput).toContain('Profile: prod (active)');
      expect(capturedOutput).toContain('Profile: dev'); // Should still show inactive profiles
    });

    test('should show active flag correctly in JSON format', async () => {
      await handleListVariablesCommand({
        config: testConfigPath,
        profiles: ['base', 'prod'],
        json: true,
      });

      const output = JSON.parse(capturedOutput);
      expect(Array.isArray(output)).toBe(true);

      // Check that active profiles have active: true
      const baseVar = output.find((v: any) => v.source === 'Profile: base');
      const prodVar = output.find((v: any) => v.source === 'Profile: prod');
      const devVar = output.find((v: any) => v.source === 'Profile: dev');

      expect(baseVar?.active).toBe(true);
      expect(prodVar?.active).toBe(true);
      expect(devVar?.active).toBe(false);
    });

    test('should not show environment variables but they remain available', async () => {
      // Set env vars that would have been shown previously
      process.env.TEST_API_KEY = 'secret123';
      process.env.TEST_API_URL = 'https://api.test.com';
      process.env.RANDOM_VAR = 'should_not_show';

      await handleListVariablesCommand({ config: testConfigPath });

      // Should NOT show any environment variables in the output
      expect(capturedOutput).not.toContain('env.TEST_API_KEY');
      expect(capturedOutput).not.toContain('env.TEST_API_URL');
      expect(capturedOutput).not.toContain('env.RANDOM_VAR');
      expect(capturedOutput).not.toContain('Environment Variable');

      // But should still show profile and dynamic variables
      expect(capturedOutput).toContain('apiUrl');
      expect(capturedOutput).toContain('Profile: base (active)');
      expect(capturedOutput).toContain('$timestamp');
      expect(capturedOutput).toContain('Built-in Dynamic Variable');

      // Should still mention environment variables are available in usage examples
      expect(capturedOutput).toContain('{{env.VARIABLE_NAME}}     - Environment variable');

      // Clean up
      delete process.env.TEST_API_KEY;
      delete process.env.TEST_API_URL;
      delete process.env.RANDOM_VAR;
    });
    test('should handle missing configuration file', async () => {
      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number) => {
        exitCode = code;
        throw new Error('Process exit called');
      }) as any;

      try {
        await handleListVariablesCommand({ config: '/nonexistent/config.yaml' });
      } catch (error) {
        // Expected to throw due to process.exit mock
      }

      process.exit = originalExit;
      expect(exitCode).toBe(1);
      expect(capturedError).toContain('Error:');
    });

    test('should handle empty configuration gracefully', async () => {
      // Create minimal config
      const minimalConfigPath = path.join(tempDir, 'minimal-config.yaml');
      await fs.writeFile(minimalConfigPath, 'apis: {}');

      await handleListVariablesCommand({ config: minimalConfigPath });

      // Should still show built-in variables
      expect(capturedOutput).toContain('Variables:');
      expect(capturedOutput).toContain('$timestamp');
      expect(capturedOutput).toContain('Built-in Dynamic Variable');
    });
  });
});
