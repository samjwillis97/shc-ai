import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { testEnv } from '../helpers/testSetup';

const execFile = promisify(require('child_process').execFile);

describe('Phase 3: Variable Substitution Integration Tests (Mock Server)', () => {
  const testConfigPath = path.join(process.cwd(), 'test-config-phase3-mock.yaml');
  const cliPath = path.join(process.cwd(), 'dist/index.js');

  beforeEach(async () => {
    // Create a test configuration file using mock server
    const mockBaseUrl = testEnv.getTestBaseUrl();
    const testConfig = `
apis:
  httpbin-get:
    baseUrl: "${mockBaseUrl}"
    endpoints:
      testGet:
        method: GET
        path: "/get"
        headers:
          X-Test-Header: "{{testValue}}"
          X-User: "{{env.USER}}"
          X-Custom: "{{customVar}}"
  
  httpbin-post:
    baseUrl: "${mockBaseUrl}"
    endpoints:
      testPost:
        method: POST
        path: "/post"
        headers:
          Content-Type: "application/json"
        body: |
          {
            "message": "Hello {{name}}",
            "environment": "{{env.NODE_ENV}}",
            "id": {{userId}}
          }

  httpbin-dynamic:
    baseUrl: "{{baseUrl}}"
    endpoints:
      testDynamicBase:
        method: GET
        path: "/get"
        headers:
          X-Dynamic-Test: "{{testValue}}"
`;
    await fs.writeFile(testConfigPath, testConfig);
  });

  afterEach(async () => {
    // Clean up test config file
    try {
      await fs.unlink(testConfigPath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });

  describe('T3.1 & T3.5: Basic templating and substitution in URLs, headers, params', () => {
    it('should substitute CLI variables in headers', async () => {
      const { stdout } = await execFile('node', [
        cliPath,
        'httpbin-get',
        'testGet',
        '--config',
        testConfigPath,
        '--var',
        'testValue=cli-test-value',
        '--var',
        'customVar=custom-value'
      ], {
        env: { ...process.env, USER: 'testuser' }
      });

      const response = JSON.parse(stdout);
      expect(response.headers['x-test-header']).toBe('cli-test-value');
      expect(response.headers['x-user']).toBe('testuser');
      expect(response.headers['x-custom']).toBe('custom-value');
    });

    it('should substitute variables in baseUrl', async () => {
      const mockBaseUrl = testEnv.getTestBaseUrl();
      const { stdout } = await execFile('node', [
        cliPath,
        'httpbin-dynamic',
        'testDynamicBase',
        '--config',
        testConfigPath,
        '--var',
        `baseUrl=${mockBaseUrl}`,
        '--var',
        'testValue=dynamic-base-test'
      ]);

      const response = JSON.parse(stdout);
      expect(response.headers['x-dynamic-test']).toBe('dynamic-base-test');
      // Verify the request was made to the correct host (localhost with mock server port)
      expect(response.headers['host']).toContain('localhost');
    });
  });

  describe('T3.2: Environment variable support', () => {
    it('should resolve env.VAR_NAME syntax', async () => {
      const { stdout } = await execFile('node', [
        cliPath,
        'httpbin-get',
        'testGet',
        '--config',
        testConfigPath,
        '--var',
        'testValue=test',
        '--var',
        'customVar=test'
      ], {
        env: { ...process.env, USER: 'env-user-test' }
      });

      const response = JSON.parse(stdout);
      expect(response.headers['x-user']).toBe('env-user-test');
    });
  });

  describe('T3.3: CLI variable support', () => {
    it('should support multiple --var options', async () => {
      const { stdout } = await execFile('node', [
        cliPath,
        'httpbin-get',
        'testGet',
        '--config',
        testConfigPath,
        '--var',
        'testValue=value1',
        '--var',
        'customVar=value2'
      ], {
        env: { ...process.env, USER: 'testuser' }
      });

      const response = JSON.parse(stdout);
      expect(response.headers['x-test-header']).toBe('value1');
      expect(response.headers['x-custom']).toBe('value2');
    });

    it('should handle values with equals signs', async () => {
      const { stdout } = await execFile('node', [
        cliPath,
        'httpbin-get',
        'testGet',
        '--config',
        testConfigPath,
        '--var',
        'testValue=key=value=with=equals',
        '--var',
        'customVar=test'
      ], {
        env: { ...process.env, USER: 'testuser' }
      });

      const response = JSON.parse(stdout);
      expect(response.headers['x-test-header']).toBe('key=value=with=equals');
    });
  });

  describe('T3.4: Variable precedence (CLI > Environment)', () => {
    it('should prefer CLI variables over environment variables', async () => {
      const { stdout } = await execFile('node', [
        cliPath,
        'httpbin-get',
        'testGet',
        '--config',
        testConfigPath,
        '--var',
        'testValue=cli-wins',
        '--var',
        'customVar=test'
      ], {
        env: { ...process.env, USER: 'testuser', testValue: 'env-loses' }
      });

      const response = JSON.parse(stdout);
      expect(response.headers['x-test-header']).toBe('cli-wins');
    });
  });

  describe('T3.7: Error handling for unresolved variables', () => {
    it('should throw error for undefined variables', async () => {
      try {
        await execFile('node', [
          cliPath,
          'httpbin-get',
          'testGet',
          '--config',
          testConfigPath,
          '--var',
          'testValue=test'
          // Missing customVar
        ], {
          env: { ...process.env, USER: 'testuser' }
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.stderr).toContain('Variable Error');
        expect(error.stderr).toContain('customVar');
      }
    });

    it('should throw error for undefined environment variables', async () => {
      const mockBaseUrl = testEnv.getTestBaseUrl();
      const testConfigWithEnvVar = `
apis:
  httpbin:
    baseUrl: "${mockBaseUrl}"
    endpoints:
      testEnvError:
        method: GET
        path: "/get"
        headers:
          X-Missing-Env: "{{env.UNDEFINED_ENV_VAR}}"
`;
      const envTestConfigPath = path.join(process.cwd(), 'test-env-error-mock.yaml');
      await fs.writeFile(envTestConfigPath, testConfigWithEnvVar);

      try {
        await execFile('node', [
          cliPath,
          'httpbin',
          'testEnvError',
          '--config',
          envTestConfigPath
        ]);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.stderr).toContain('Environment variable');
        expect(error.stderr).toContain('UNDEFINED_ENV_VAR');
      } finally {
        await fs.unlink(envTestConfigPath);
      }
    });

    it('should throw error for undefined baseUrl variables', async () => {
      try {
        await execFile('node', [
          cliPath,
          'httpbin-dynamic',
          'testDynamicBase',
          '--config',
          testConfigPath,
          '--var',
          'testValue=test'
          // Missing baseUrl variable
        ]);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.stderr).toContain('Variable Error');
        expect(error.stderr).toContain('baseUrl');
      }
    });
  });

  describe('T3.8: Body variable substitution', () => {
    it('should substitute variables in request body', async () => {
      const { stdout } = await execFile('node', [
        cliPath,
        'httpbin-post',
        'testPost',
        '--config',
        testConfigPath,
        '--var',
        'name=John',
        '--var',
        'userId=123'
      ], {
        env: { ...process.env, NODE_ENV: 'test' }
      });

      const response = JSON.parse(stdout);
      const sentData = JSON.parse(response.data);
      expect(sentData.message).toBe('Hello John');
      expect(sentData.environment).toBe('test');
      expect(sentData.id).toBe(123);
    });
  });
}); 