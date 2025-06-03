import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

describe('Phase 9 T9.4: Secret Variable Resolution Integration Tests', () => {
  const testConfigPath = join(process.cwd(), 'test-config-t9.4-secrets.yaml');
  const cliPath = join(process.cwd(), 'dist', 'cli', 'main.js');

  beforeAll(async () => {
    // Create test configuration file
    const testConfig = `# Test configuration for T9.4: Secret Variable Resolution
# This config demonstrates using {{secret.VAR_NAME}} syntax

apis:
  httpbin:
    baseUrl: "https://httpbin.org"
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
    baseUrl: "https://httpbin.org"
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

      // Should show resolved secret values in dry run
      expect(stderr).toContain('X-API-Key: secret-api-key-123');
      expect(stderr).toContain('X-Secret-Token: secret-token-456');
      expect(stderr).toContain('secret_param: secret-param-value');
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

      // Parse the dry run output to check body content
      expect(stderr).toContain('"api_key": "body-api-key"');
      expect(stderr).toContain('"message": "Using secret: body-secret-token"');
      expect(stderr).toContain('"db_url": "postgres://user:pass@host:5432/db"');
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

      // Verbose output should show the request details
      expect(stderr).toContain('[DRY RUN] GET https://httpbin.org/get');
      expect(stderr).toContain('X-API-Key: verbose-api-key');
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

      expect(stderr).toContain('X-API-Key: override-test-key');
      expect(stderr).toContain('X-Secret-Token: override-test-token');
      expect(stderr).toContain('secret_param: override-test-param');
    });
  });
}); 