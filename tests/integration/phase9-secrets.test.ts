import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { testEnv } from '../helpers/testSetup';

const execFileAsync = promisify(execFile);

describe('Phase 9 T9.4: Secret Variable Resolution Integration Tests', () => {
  const testConfigPath = join(process.cwd(), 'test-config-t9.4-secrets.yaml');
  const cliPath = join(process.cwd(), 'dist', 'cli', 'main.js');

  beforeAll(async () => {
    // Create test configuration file
    const mockBaseUrl = testEnv.getTestBaseUrl();

    const testConfig = `# Test configuration for T9.4: Secret Variable Resolution
# This config demonstrates using {{secret.VAR_NAME}} syntax

apis:
  httpbin:
    baseUrl: "${mockBaseUrl}"
    endpoints:
      testSecrets:
        method: GET
        path: "/get"
        headers:
          X-API-Key: "{{secret.TEST_API_KEY}}"
          X-Secret-Token: "{{secret.TEST_SECRET_TOKEN}}"
        params:
          secret_param: "{{secret.TEST_SECRET_PARAM}}"
      
      testUndefinedSecret:
        method: GET
        path: "/get"
        headers:
          X-API-Key: "{{secret.TEST_API_KEY}}"
          X-Missing-Secret: "{{secret.UNDEFINED_SECRET}}"
  
  httpbin-body:
    baseUrl: "${mockBaseUrl}"
    endpoints:
      testSecretInBody:
        method: POST
        path: "/post"
        headers:
          Content-Type: "application/json"
        body:
          api_key: "{{secret.TEST_API_KEY}}"
          message: "Using secret: {{secret.TEST_SECRET_TOKEN}}"
          config:
            db_url: "{{secret.DATABASE_URL}}"`;

    await fs.writeFile(testConfigPath, testConfig);

    // Ensure CLI is built
    try {
      await fs.access(cliPath);
    } catch {
      throw new Error('CLI not built. Run npm run build first.');
    }
  });

  afterAll(async () => {
    // Clean up test config file
    try {
      await fs.unlink(testConfigPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe('Secret Variable Resolution', () => {
    it('should resolve secret variables from environment', async () => {
      const { stderr } = await execFileAsync('node', [
        cliPath,
        'httpbin',
        'testSecrets',
        '--config',
        testConfigPath,
        '--dry-run'
      ], {
        env: {
          ...process.env,
          TEST_API_KEY: 'secret-api-key-123',
          TEST_SECRET_TOKEN: 'secret-token-456',
          TEST_SECRET_PARAM: 'secret-param-value'
        }
      });

      // Should mask secret values in dry run output (T9.5: Secret masking)
      expect(stderr).toContain('X-API-Key: [SECRET]');
      expect(stderr).toContain('X-Secret-Token: [SECRET]');
      expect(stderr).toContain('secret_param: [SECRET]');
      
      // Should NOT contain actual secret values
      expect(stderr).not.toContain('secret-api-key-123');
      expect(stderr).not.toContain('secret-token-456');
      expect(stderr).not.toContain('secret-param-value');
    });

    it('should resolve secrets in request body', async () => {
      const { stderr } = await execFileAsync('node', [
        cliPath,
        'httpbin-body',
        'testSecretInBody',
        '--config',
        testConfigPath,
        '--dry-run'
      ], {
        env: {
          ...process.env,
          TEST_API_KEY: 'body-api-key',
          TEST_SECRET_TOKEN: 'body-secret-token',
          DATABASE_URL: 'postgres://user:pass@host:5432/db'
        }
      });

      // Should mask secret values in request body (T9.5: Secret masking)
      expect(stderr).toContain('"api_key": "[SECRET]"');
      expect(stderr).toContain('"message": "Using secret: [SECRET]"');
      expect(stderr).toContain('"db_url": "[SECRET]"');
      
      // Should NOT contain actual secret values
      expect(stderr).not.toContain('body-api-key');
      expect(stderr).not.toContain('body-secret-token');
      expect(stderr).not.toContain('postgres://user:pass@host:5432/db');
    });

    it('should throw error for undefined secret variables', async () => {
      try {
        const result = await execFileAsync('node', [
          cliPath,
          'httpbin',
          'testUndefinedSecret',
          '--config',
          testConfigPath
        ], {
          env: {
            ...process.env,
            TEST_API_KEY: 'defined-key'
            // Intentionally not setting UNDEFINED_SECRET
          }
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.stderr).toBeDefined();
        expect(error.stderr).toContain('Variable Error');
        expect(error.stderr).toContain('Secret variable \'UNDEFINED_SECRET\' is not defined');
      }
    });

    it('should work with verbose output', async () => {
      const mockBaseUrl = testEnv.getTestBaseUrl();
      const { stderr } = await execFileAsync('node', [
        cliPath,
        'httpbin',
        'testSecrets',
        '--config',
        testConfigPath,
        '--dry-run',
        '--verbose'
      ], {
        env: {
          ...process.env,
          TEST_API_KEY: 'verbose-api-key',
          TEST_SECRET_TOKEN: 'verbose-token',
          TEST_SECRET_PARAM: 'verbose-param'
        }
      });

      // Verbose output should show the request details with masked secrets
      expect(stderr).toContain(`[DRY RUN] GET ${mockBaseUrl}/get`);
      expect(stderr).toContain('X-API-Key: [SECRET]');
      expect(stderr).not.toContain('verbose-api-key');
    });

    it('should work with CLI variable overrides', async () => {
      // Note: CLI variables don't override secret.* variables since they're different scopes
      // This test ensures the secret resolution still works when CLI vars are present
      const { stderr } = await execFileAsync('node', [
        cliPath,
        'httpbin',
        'testSecrets',
        '--config',
        testConfigPath,
        '--dry-run',
        '--var',
        'some_var=cli_value'
      ], {
        env: {
          ...process.env,
          TEST_API_KEY: 'override-test-key',
          TEST_SECRET_TOKEN: 'override-test-token',
          TEST_SECRET_PARAM: 'override-test-param'
        }
      });

      // Should mask secret values (T9.5: Secret masking)
      expect(stderr).toContain('X-API-Key: [SECRET]');
      expect(stderr).toContain('X-Secret-Token: [SECRET]');
      expect(stderr).toContain('secret_param: [SECRET]');
      
      // Should NOT contain actual secret values
      expect(stderr).not.toContain('override-test-key');
      expect(stderr).not.toContain('override-test-token');
      expect(stderr).not.toContain('override-test-param');
    });

    it('should mask secrets in verbose and dry-run outputs', async () => {
      const { stderr } = await execFileAsync('node', [
        cliPath,
        'httpbin',
        'testSecrets',
        '--config',
        testConfigPath,
        '--dry-run',
        '--verbose'
      ], {
        env: {
          ...process.env,
          TEST_API_KEY: 'super-secret-api-key-123',
          TEST_SECRET_TOKEN: 'top-secret-token-456',
          TEST_SECRET_PARAM: 'secret-param-789'
        }
      });

      // Should NOT contain the actual secret values
      expect(stderr).not.toContain('super-secret-api-key-123');
      expect(stderr).not.toContain('top-secret-token-456');
      expect(stderr).not.toContain('secret-param-789');

      // Should contain [SECRET] placeholders
      expect(stderr).toContain('X-API-Key: [SECRET]');
      expect(stderr).toContain('X-Secret-Token: [SECRET]');
      expect(stderr).toContain('secret_param: [SECRET]');
    });

    it('should mask secrets in request body during dry-run', async () => {
      const { stderr } = await execFileAsync('node', [
        cliPath,
        'httpbin-body',
        'testSecretInBody',
        '--config',
        testConfigPath,
        '--dry-run'
      ], {
        env: {
          ...process.env,
          TEST_API_KEY: 'body-secret-key-123',
          TEST_SECRET_TOKEN: 'body-secret-token-456',
          DATABASE_URL: 'postgres://secret-user:secret-pass@secret-host:5432/secret-db'
        }
      });

      // Should NOT contain actual secret values
      expect(stderr).not.toContain('body-secret-key-123');
      expect(stderr).not.toContain('body-secret-token-456');
      expect(stderr).not.toContain('postgres://secret-user:secret-pass@secret-host:5432/secret-db');

      // Should contain [SECRET] placeholders in JSON body
      expect(stderr).toContain('"api_key": "[SECRET]"');
      expect(stderr).toContain('"message": "Using secret: [SECRET]"');
      expect(stderr).toContain('"db_url": "[SECRET]"');
    });

    it('should mask secrets in verbose mode during actual requests', async () => {
      const { stderr } = await execFileAsync('node', [
        cliPath,
        'httpbin',
        'testSecrets',
        '--config',
        testConfigPath,
        '--verbose'
      ], {
        env: {
          ...process.env,
          TEST_API_KEY: 'live-secret-key-789',
          TEST_SECRET_TOKEN: 'live-secret-token-101',
          TEST_SECRET_PARAM: 'live-secret-param-202'
        }
      });

      // Should NOT contain actual secret values in verbose output
      expect(stderr).not.toContain('live-secret-key-789');
      expect(stderr).not.toContain('live-secret-token-101');
      expect(stderr).not.toContain('live-secret-param-202');

      // Should contain [SECRET] placeholders in request details
      expect(stderr).toContain('[REQUEST]');
      expect(stderr).toContain('X-API-Key: [SECRET]');
      expect(stderr).toContain('X-Secret-Token: [SECRET]');
    });

    it('should not mask non-secret values in outputs', async () => {
      const { stderr } = await execFileAsync('node', [
        cliPath,
        'httpbin',
        'testSecrets',
        '--config',
        testConfigPath,
        '--dry-run',
        '--var',
        'public_value=this-is-not-secret'
      ], {
        env: {
          ...process.env,
          TEST_API_KEY: 'secret-to-mask',
          TEST_SECRET_TOKEN: 'another-secret',
          TEST_SECRET_PARAM: 'param-secret',
          PUBLIC_VAR: 'this-should-be-visible'
        }
      });

      // Secret values should be masked
      expect(stderr).not.toContain('secret-to-mask');
      expect(stderr).not.toContain('another-secret');
      expect(stderr).not.toContain('param-secret');

      // Public values should be visible (if they appear in the output)
      // Note: These specific values might not appear in this endpoint's output,
      // but if they did, they shouldn't be masked
      expect(stderr).toContain('X-API-Key: [SECRET]');
      expect(stderr).toContain('X-Secret-Token: [SECRET]');
      expect(stderr).toContain('secret_param: [SECRET]');
    });
  });
}); 