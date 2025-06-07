import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { testEnv } from '../helpers/testSetup';

/**
 * T10.12: Comprehensive End-to-End Integration Tests
 * 
 * These tests verify that all HttpCraft features work together correctly:
 * - Configuration loading (local, global, modular imports)
 * - Variable resolution with full precedence
 * - Profile management and merging
 * - Plugin system (local files, pre/post hooks, variables)
 * - Chain execution with step data passing
 * - CLI options (verbose, dry-run, exit-on-http-error)
 * - Secret masking and security features
 * - Error handling and edge cases
 * 
 * These tests use real HTTP requests to httpbin.org to verify actual functionality
 */
describe('T10.12: End-to-End Integration Tests', () => {
  let tempDir: string;
  let configFile: string;
  let originalEnv: Record<string, string | undefined>;

  const execAsync = promisify(exec);

  async function runHttpCraft(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const cliPath = path.resolve('./dist/index.js');
    const mockBaseUrl = testEnv.getTestBaseUrl();

    const command = `node "${cliPath}" ${args.map(arg => `"${arg}"`).join(' ')}`;
    
    try {
      const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
      return { stdout: stdout || '', stderr: stderr || '', exitCode: 0 };
    } catch (error: any) {
      // Log the command and error for debugging
      console.error(`Command failed: ${command}`);
      console.error(`Error:`, error.message);
      console.error(`Stdout:`, error.stdout || '');
      console.error(`Stderr:`, error.stderr || '');
      
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code || 1
      };
    }
  }

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Create temporary directory for test files
    tempDir = path.join(process.cwd(), `temp-e2e-tests-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    configFile = path.join(tempDir, 'httpcraft.yaml');
  });

  afterEach(async () => {
    // Restore original environment
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Basic API Requests with All Features', () => {
    it('should handle complete workflow: config loading, variables, profiles, and HTTP requests', async () => {
      // Set up environment variables
      process.env.E2E_SECRET_TOKEN = 'secret-env-token-123';
      process.env.E2E_BASE_URL = testEnv.getTestBaseUrl();
      
      // Create comprehensive configuration
      const config = `
profiles:
  dev:
    environment: "development"
    userId: "dev-user-123"
    debug: true
  prod:
    environment: "production"
    userId: "prod-user-456"
    debug: false

config:
  defaultProfile: "dev"

apis:
  httpbin:
    baseUrl: "{{env.E2E_BASE_URL}}"
    headers:
      User-Agent: "HttpCraft/1.0 ({{profile.environment}})"
      X-User-ID: "{{profile.userId}}"
    variables:
      apiVersion: "v1"
      timeout: 5000
    endpoints:
      get-json:
        method: GET
        path: "/json"
        headers:
          X-Debug: "{{profile.debug}}"
      post-data:
        method: POST
        path: "/post"
        headers:
          Content-Type: "application/json"
        body:
          message: "Hello from {{profile.environment}}"
          userId: "{{profile.userId}}"
          apiVersion: "{{api.apiVersion}}"
          timestamp: "{{$timestamp}}"
      get-headers:
        method: GET
        path: "/headers"
        headers:
          Authorization: "Bearer {{secret.E2E_SECRET_TOKEN}}"
`;

      await fs.writeFile(configFile, config);

      // Test 1: Basic GET request with variable resolution and profiles
      const getResult = await runHttpCraft([
        'httpbin', 'get-json',
        '--config', configFile
      ]);

      expect(getResult.exitCode).toBe(0);
      const getResponseData = JSON.parse(getResult.stdout);
      expect(getResponseData).toHaveProperty('slideshow');

      // Test 2: POST request with complex body variable resolution
      const postResult = await runHttpCraft([
        'httpbin', 'post-data',
        '--config', configFile,
        '--verbose'
      ]);

      expect(postResult.exitCode).toBe(0);
      const postResponseData = JSON.parse(postResult.stdout);
      expect(postResponseData.json.message).toBe('Hello from development');
      expect(postResponseData.json.userId).toBe('dev-user-123');
      expect(postResponseData.json.apiVersion).toBe('v1');
      expect(postResponseData.json.timestamp).toMatch(/^\d+$/);

      // Verify verbose output contains request details
      expect(postResult.stderr).toContain('[REQUEST] POST');
      expect(postResult.stderr).toContain('httpbin.org');
      expect(postResult.stderr).toContain('HttpCraft/1.0 (development)');

      // Test 3: Request with secret variable resolution and masking
      const headerResult = await runHttpCraft([
        'httpbin', 'get-headers',
        '--config', configFile,
        '--verbose'
      ]);

      expect(headerResult.exitCode).toBe(0);
      const headerResponseData = JSON.parse(headerResult.stdout);
      expect(headerResponseData.headers.Authorization).toBe('Bearer secret-env-token-123');

      // Verify secret is masked in verbose output
      expect(headerResult.stderr).toContain('[SECRET]');
      expect(headerResult.stderr).not.toContain('secret-env-token-123');

      // Test 4: Override profile with CLI
      const prodResult = await runHttpCraft([
        'httpbin', 'get-json',
        '--config', configFile,
        '--profile', 'prod'
      ]);

      expect(prodResult.exitCode).toBe(0);
      // Verify that we can get different profile data (this would show in headers if we had an endpoint that echoed them)
    });

    it('should handle CLI variable overrides and precedence correctly', async () => {
      const config = `
profiles:
  test:
    message: "profile-message"
    userId: "profile-user"

apis:
  httpbin:
    baseUrl: "${mockBaseUrl}"
    variables:
      message: "api-message"
    endpoints:
      post-test:
        method: POST
        path: "/post"
        variables:
          message: "endpoint-message"
        body:
          cliVar: "{{cliVar}}"
          profileVar: "{{userId}}"
          endpointVar: "{{message}}"
          envVar: "{{env.E2E_TEST_VAR}}"
`;

      process.env.E2E_TEST_VAR = 'env-value';

      await fs.writeFile(configFile, config);

      const result = await runHttpCraft([
        'httpbin', 'post-test',
        '--config', configFile,
        '--profile', 'test',
        '--var', 'cliVar=cli-value',
        '--var', 'message=cli-override-message'
      ]);

      expect(result.exitCode).toBe(0);
      const responseData = JSON.parse(result.stdout);
      
      // Verify variable precedence: CLI > Endpoint > API > Profile > Environment
      expect(responseData.json.cliVar).toBe('cli-value');
      expect(responseData.json.profileVar).toBe('profile-user');
      expect(responseData.json.endpointVar).toBe('cli-override-message'); // CLI overrides endpoint
      expect(responseData.json.envVar).toBe('env-value');
    });
  });

  describe('Plugin System Integration', () => {
    it('should work with local plugins providing variables and hooks', async () => {
      // Create a test plugin
      const mockBaseUrl = testEnv.getTestBaseUrl();

      const pluginCode = `
export default {
  async setup(context) {
    // Register a variable source
    context.registerVariableSource('timestamp', () => {
      return Date.now().toString();
    });
    
    context.registerVariableSource('authToken', () => {
      return context.config.token || 'default-token';
    });
    
    // Register pre-request hook
    context.registerPreRequestHook(async (request) => {
      request.headers['X-Plugin-Added'] = 'true';
      request.headers['X-Plugin-Config'] = context.config.environment || 'unknown';
    });
    
    // Register post-response hook
    context.registerPostResponseHook(async (request, response) => {
      if (response.body && typeof response.body === 'string') {
        try {
          const parsed = JSON.parse(response.body);
          if (parsed.headers) {
            parsed.headers['X-Processed-By-Plugin'] = 'true';
            response.body = JSON.stringify(parsed);
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    });
  }
};
`;

      const pluginFile = path.join(tempDir, 'testPlugin.js');
      await fs.writeFile(pluginFile, pluginCode);

      const config = `
plugins:
  - path: "./testPlugin.js"
    name: "testPlugin"
    config:
      environment: "test-env"
      token: "plugin-token-123"

apis:
  httpbin:
    baseUrl: "${mockBaseUrl}"
    headers:
      Authorization: "Bearer {{plugins.testPlugin.authToken}}"
      X-Timestamp: "{{plugins.testPlugin.timestamp}}"
    endpoints:
      get-headers:
        method: GET
        path: "/headers"
`;

      await fs.writeFile(configFile, config);

      const result = await runHttpCraft([
        'httpbin', 'get-headers',
        '--config', configFile,
        '--verbose'
      ]);

      expect(result.exitCode).toBe(0);
      const responseData = JSON.parse(result.stdout);
      
      // Verify plugin variable resolution worked
      expect(responseData.headers.Authorization).toBe('Bearer plugin-token-123');
      expect(responseData.headers['X-Timestamp']).toMatch(/^\d+$/);
      
      // Verify pre-request hook worked
      expect(responseData.headers['X-Plugin-Added']).toBe('true');
      expect(responseData.headers['X-Plugin-Config']).toBe('test-env');
      
      // Verify post-response hook worked
      expect(responseData.headers['X-Processed-By-Plugin']).toBe('true');
    });

    it('should support parameterized plugin functions (T10.15)', async () => {
      // Create a plugin with parameterized functions
      const mockBaseUrl = testEnv.getTestBaseUrl();

      const pluginCode = `
const cache = new Map();
cache.set('dev-key', 'dev-api-key-12345');
cache.set('prod-key', 'prod-api-key-67890');

export default {
  async setup(context) {
    context.registerParameterizedVariableSource('getKey', (keyType, environment = 'dev') => {
      const cacheKey = \`\${environment}-\${keyType}\`;
      return cache.get(cacheKey) || \`not-found-\${cacheKey}\`;
    });
    
    context.registerParameterizedVariableSource('buildAuthHeader', (token, prefix = 'Bearer') => {
      return \`\${prefix} \${token}\`;
    });
  }
};
`;

      const pluginFile = path.join(tempDir, 'cachePlugin.js');
      await fs.writeFile(pluginFile, pluginCode);

      const config = `
profiles:
  dev:
    environment: "dev"
  prod:
    environment: "prod"

plugins:
  - path: "./cachePlugin.js"
    name: "cache"

apis:
  httpbin:
    baseUrl: "${mockBaseUrl}"
    endpoints:
      test-parameterized:
        method: GET
        path: "/headers"
        headers:
          X-API-Key: "{{plugins.cache.getKey(\\"key\\", \\"{{profile.environment}}\\\")}}"
          Authorization: "{{plugins.cache.buildAuthHeader(\\"{{plugins.cache.getKey(\\"key\\", \\"prod\\\")}}\", \\"Token\\")}}"
`;

      await fs.writeFile(configFile, config);

      // Test with dev profile
      const devResult = await runHttpCraft([
        'httpbin', 'test-parameterized',
        '--config', configFile,
        '--profile', 'dev'
      ]);

      expect(devResult.exitCode).toBe(0);
      const devResponseData = JSON.parse(devResult.stdout);
      expect(devResponseData.headers['X-Api-Key']).toBe('dev-api-key-12345');
      expect(devResponseData.headers.Authorization).toBe('Token prod-api-key-67890');

      // Test with prod profile
      const prodResult = await runHttpCraft([
        'httpbin', 'test-parameterized',
        '--config', configFile,
        '--profile', 'prod'
      ]);

      expect(prodResult.exitCode).toBe(0);
      const prodResponseData = JSON.parse(prodResult.stdout);
      expect(prodResponseData.headers['X-Api-Key']).toBe('prod-api-key-67890');
    });
  });

  describe('Chain Execution Integration', () => {
    it('should execute complex chains with step data passing and all features', async () => {
      const mockBaseUrl = testEnv.getTestBaseUrl();

      const config = `
profiles:
  test:
    baseUrl: "${mockBaseUrl}"
    userId: "chain-test-user"

apis:
  httpbin:
    baseUrl: "{{profile.baseUrl}}"
    endpoints:
      create-post:
        method: POST
        path: "/post"
        body:
          userId: "{{profile.userId}}"
          title: "{{title}}"
          content: "{{content}}"
      get-data:
        method: GET
        path: "/json"
      echo-data:
        method: POST
        path: "/post"
        body:
          previousResponse: "{{previousData}}"
          stepCount: "{{stepCount}}"

chains:
  multi-step-workflow:
    description: "Complex chain testing all features"
    vars:
      title: "Test Post"
      content: "This is test content"
      stepCount: 3
    steps:
      - id: create
        call: httpbin.create-post
        with:
          body:
            timestamp: "{{$timestamp}}"
            uuid: "{{$guid}}"
      - id: fetch
        call: httpbin.get-data
      - id: combine
        call: httpbin.echo-data
        with:
          body:
            createdPost: "{{steps.create.response.body.json.title}}"
            fetchedData: "{{steps.fetch.response.body.slideshow.title}}"
            combinedId: "{{steps.create.response.body.json.uuid}}-{{steps.fetch.response.body.slideshow.date}}"
`;

      await fs.writeFile(configFile, config);

      // Test default chain output
      const defaultResult = await runHttpCraft([
        'chain', 'multi-step-workflow',
        '--config', configFile,
        '--profile', 'test'
      ]);

      expect(defaultResult.exitCode).toBe(0);
      const defaultResponse = JSON.parse(defaultResult.stdout);
      expect(defaultResponse.json.createdPost).toBe('Test Post');
      expect(defaultResponse.json.fetchedData).toBe('Sample Slide Show');
      expect(defaultResponse.json.combinedId).toContain('-');

      // Test structured JSON output
      const fullResult = await runHttpCraft([
        'chain', 'multi-step-workflow',
        '--config', configFile,
        '--profile', 'test',
        '--chain-output', 'full'
      ]);

      expect(fullResult.exitCode).toBe(0);
      const fullResponse = JSON.parse(fullResult.stdout);
      expect(fullResponse.chainName).toBe('multi-step-workflow');
      expect(fullResponse.success).toBe(true);
      expect(fullResponse.steps).toHaveLength(3);
      
      // Verify step data structure
      expect(fullResponse.steps[0].stepId).toBe('create');
      expect(fullResponse.steps[1].stepId).toBe('fetch');
      expect(fullResponse.steps[2].stepId).toBe('combine');
      
      // Verify step data passing worked
      const createStep = fullResponse.steps[0];
      const combineStep = fullResponse.steps[2];
      expect(JSON.parse(createStep.response.body).json.title).toBe('Test Post');
      expect(JSON.parse(combineStep.response.body).json.createdPost).toBe('Test Post');

      // Test verbose chain execution
      const verboseResult = await runHttpCraft([
        'chain', 'multi-step-workflow',
        '--config', configFile,
        '--profile', 'test',
        '--verbose'
      ]);

      expect(verboseResult.exitCode).toBe(0);
      expect(verboseResult.stderr).toContain('[CHAIN] Starting execution');
      expect(verboseResult.stderr).toContain('[STEP create]');
      expect(verboseResult.stderr).toContain('[STEP fetch]');
      expect(verboseResult.stderr).toContain('[STEP combine]');
    });

    it('should handle chain failure correctly with proper error reporting', async () => {
      const mockBaseUrl = testEnv.getTestBaseUrl();

      const config = `
apis:
  httpbin:
    baseUrl: "${mockBaseUrl}"
    endpoints:
      success:
        method: GET
        path: "/json"
      failure:
        method: GET
        path: "/status/404"  # This will return 404

chains:
  failing-chain:
    steps:
      - id: success-step
        call: httpbin.success
      - id: failing-step
        call: httpbin.failure
      - id: never-reached
        call: httpbin.success
`;

      await fs.writeFile(configFile, config);

      const result = await runHttpCraft([
        'chain', 'failing-chain',
        '--config', configFile,
        '--verbose'
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Chain execution failed');
      expect(result.stderr).toContain('failing-step');
      expect(result.stderr).toContain('HTTP 404');
      
      // Verify the chain stopped at the failing step
      expect(result.stderr).toContain('success-step');
      expect(result.stderr).not.toContain('never-reached');
    });
  });

  describe('CLI Options and Error Handling', () => {
    it('should handle dry-run mode correctly', async () => {
      const mockBaseUrl = testEnv.getTestBaseUrl();

      const config = `
apis:
  httpbin:
    baseUrl: "${mockBaseUrl}"
    endpoints:
      test:
        method: POST
        path: "/post"
        body:
          message: "This should not be sent"
          secret: "{{secret.E2E_SECRET_TOKEN}}"
`;

      process.env.E2E_SECRET_TOKEN = 'should-be-masked';
      await fs.writeFile(configFile, config);

      const result = await runHttpCraft([
        'httpbin', 'test',
        '--config', configFile,
        '--dry-run'
      ]);

      expect(result.exitCode).toBe(0);
      
      // Verify dry-run output shows request details
      expect(result.stderr).toContain('[DRY RUN] POST');
      expect(result.stderr).toContain('httpbin.org');
      expect(result.stderr).toContain('This should not be sent');
      
      // Verify secrets are masked even in dry-run
      expect(result.stderr).toContain('[SECRET]');
      expect(result.stderr).not.toContain('should-be-masked');
      
      // Should not have actual HTTP response
      expect(result.stdout).toBe('');
    });

    it('should handle exit-on-http-error correctly', async () => {
      const mockBaseUrl = testEnv.getTestBaseUrl();

      const config = `
apis:
  httpbin:
    baseUrl: "${mockBaseUrl}"
    endpoints:
      not-found:
        method: GET
        path: "/status/404"
      server-error:
        method: GET
        path: "/status/500"
      success:
        method: GET
        path: "/json"
`;

      await fs.writeFile(configFile, config);

      // Test 404 with 4xx pattern - should exit with code 1
      const notFoundResult = await runHttpCraft([
        'httpbin', 'not-found',
        '--config', configFile,
        '--exit-on-http-error', '4xx'
      ]);

      expect(notFoundResult.exitCode).toBe(1);
      expect(notFoundResult.stderr).toContain('HTTP 404');

      // Test 500 with 4xx pattern - should not exit
      const serverErrorResult = await runHttpCraft([
        'httpbin', 'server-error',
        '--config', configFile,
        '--exit-on-http-error', '4xx'
      ]);

      expect(serverErrorResult.exitCode).toBe(0);
      expect(serverErrorResult.stderr).toContain('HTTP 500');

      // Test success with 4xx pattern - should not exit
      const successResult = await runHttpCraft([
        'httpbin', 'success',
        '--config', configFile,
        '--exit-on-http-error', '4xx'
      ]);

      expect(successResult.exitCode).toBe(0);
    });

    it('should handle configuration errors gracefully', async () => {
      // Test missing configuration file
      const missingConfigResult = await runHttpCraft([
        'nonexistent-api', 'nonexistent-endpoint',
        '--config', 'nonexistent-config.yaml'
      ]);

      expect(missingConfigResult.exitCode).toBe(1);
      expect(missingConfigResult.stderr).toContain('Error:');

      // Test malformed YAML
      await fs.writeFile(configFile, 'invalid: yaml: content: [unclosed');

      const malformedResult = await runHttpCraft([
        'test-api', 'test-endpoint',
        '--config', configFile
      ]);

      expect(malformedResult.exitCode).toBe(1);
      expect(malformedResult.stderr).toContain('Error:');

      // Test missing API
      await fs.writeFile(configFile, `
apis:
  existing-api:
    baseUrl: "${mockBaseUrl}"
    endpoints:
      test:
        method: GET
        path: "/json"
`);

      const missingApiResult = await runHttpCraft([
        'nonexistent-api', 'test',
        '--config', configFile
      ]);

      expect(missingApiResult.exitCode).toBe(1);
      expect(missingApiResult.stderr).toContain("API 'nonexistent-api' not found");

      // Test missing endpoint
      const missingEndpointResult = await runHttpCraft([
        'existing-api', 'nonexistent-endpoint',
        '--config', configFile
      ]);

      expect(missingEndpointResult.exitCode).toBe(1);
      expect(missingEndpointResult.stderr).toContain("Endpoint 'nonexistent-endpoint' not found");
    });
  });

  describe('Modular Configuration Loading', () => {
    it('should load APIs and chains from directories', async () => {
      // Create directory structure
      const apisDir = path.join(tempDir, 'apis');
      const chainsDir = path.join(tempDir, 'chains');
      await fs.mkdir(apisDir, { recursive: true });
      await fs.mkdir(chainsDir, { recursive: true });

      // Create API files
      await fs.writeFile(path.join(apisDir, 'service1.yaml'), `
service1:
  baseUrl: "${mockBaseUrl}"
  endpoints:
    test1:
      method: GET
      path: "/json"
`);

      await fs.writeFile(path.join(apisDir, 'service2.yaml'), `
service2:
  baseUrl: "${mockBaseUrl}"
  endpoints:
    test2:
      method: GET
      path: "/headers"
`);

      // Create chain file
      await fs.writeFile(path.join(chainsDir, 'workflow.yaml'), `
test-workflow:
  description: "Test modular loading"
  steps:
    - id: step1
      call: service1.test1
    - id: step2
      call: service2.test2
`);

      // Create main config
      const mockBaseUrl = testEnv.getTestBaseUrl();

      const config = `
apis:
  - "directory:./apis/"

chains:
  - "directory:./chains/"
`;

      await fs.writeFile(configFile, config);

      // Test API from modular loading
      const apiResult = await runHttpCraft([
        'service1', 'test1',
        '--config', configFile
      ]);

      expect(apiResult.exitCode).toBe(0);
      const apiResponseData = JSON.parse(apiResult.stdout);
      expect(apiResponseData).toHaveProperty('slideshow');

      // Test chain from modular loading
      const chainResult = await runHttpCraft([
        'chain', 'test-workflow',
        '--config', configFile
      ]);

      expect(chainResult.exitCode).toBe(0);
      const chainResponseData = JSON.parse(chainResult.stdout);
      expect(chainResponseData.headers).toBeDefined();
    });
  });

  describe('Dynamic Variables Integration', () => {
    it('should generate fresh dynamic variables in each request', async () => {
      const config = `
apis:
  httpbin:
    baseUrl: "${mockBaseUrl}"
    endpoints:
      test-dynamic:
        method: POST
        path: "/post"
        body:
          timestamp1: "{{$timestamp}}"
          timestamp2: "{{$timestamp}}"
          iso1: "{{$isoTimestamp}}"
          iso2: "{{$isoTimestamp}}"
          randomInt1: "{{$randomInt}}"
          randomInt2: "{{$randomInt}}"
          guid1: "{{$guid}}"
          guid2: "{{$guid}}"
`;

      await fs.writeFile(configFile, config);

      const result = await runHttpCraft([
        'httpbin', 'test-dynamic',
        '--config', configFile
      ]);

      expect(result.exitCode).toBe(0);
      const responseData = JSON.parse(result.stdout);
      const requestData = responseData.json;

      // Verify dynamic variables are generated
      expect(requestData.timestamp1).toMatch(/^\d+$/);
      expect(requestData.timestamp2).toMatch(/^\d+$/);
      expect(requestData.iso1).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(requestData.iso2).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(requestData.randomInt1).toMatch(/^\d+$/);
      expect(requestData.randomInt2).toMatch(/^\d+$/);
      expect(requestData.guid1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(requestData.guid2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

      // Verify timestamps are close to current time
      const currentTime = Math.floor(Date.now() / 1000);
      const timestamp1 = parseInt(requestData.timestamp1);
      expect(timestamp1).toBeGreaterThan(currentTime - 5);
      expect(timestamp1).toBeLessThan(currentTime + 5);
    });
  });
}); 