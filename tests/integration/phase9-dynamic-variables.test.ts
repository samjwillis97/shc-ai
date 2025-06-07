import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { testEnv } from '../helpers/testSetup';

const execFileAsync = promisify(execFile);

describe('Phase 9 T9.6: Built-in Dynamic Variables Integration Tests', () => {
  const testConfigPath = join(process.cwd(), 'test-config-t9.6-dynamic.yaml');
  const cliPath = join(process.cwd(), 'dist', 'cli', 'main.js');

  beforeAll(async () => {
    // Create test configuration file
    const mockBaseUrl = testEnv.getTestBaseUrl();

    const testConfig = `# Test configuration for T9.6: Built-in Dynamic Variables
# This config demonstrates using built-in dynamic variables

apis:
  httpbin:
    baseUrl: "${mockBaseUrl}"
    endpoints:
      testDynamicVariables:
        method: GET
        path: "/get"
        headers:
          X-Timestamp: "{{$timestamp}}"
          X-ISO-Timestamp: "{{$isoTimestamp}}"
          X-Random-ID: "{{$randomInt}}"
          X-Request-ID: "{{$guid}}"
        params:
          timestamp: "{{$timestamp}}"
          random: "{{$randomInt}}"
      
      testDynamicInBody:
        method: POST
        path: "/post"
        headers:
          Content-Type: "application/json"
          X-Request-ID: "{{$guid}}"
        body:
          timestamp: "{{$timestamp}}"
          iso_timestamp: "{{$isoTimestamp}}"
          random_number: "{{$randomInt}}"
          request_id: "{{$guid}}"
          message: "Generated at {{$isoTimestamp}} with ID {{$guid}}"`;

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

  describe('Dynamic Variable Resolution', () => {
    it('should resolve all dynamic variables in headers and params', async () => {
      const { stderr } = await execFileAsync('node', [
        cliPath,
        'httpbin',
        'testDynamicVariables',
        '--config',
        testConfigPath,
        '--dry-run'
      ]);

      // Check that headers contain properly formatted dynamic values
      expect(stderr).toMatch(/X-Timestamp: \d+/); // Unix timestamp
      expect(stderr).toMatch(/X-ISO-Timestamp: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/); // ISO timestamp
      expect(stderr).toMatch(/X-Random-ID: \d+/); // Random integer
      expect(stderr).toMatch(/X-Request-ID: [0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/); // UUID

      // Check query parameters too
      expect(stderr).toMatch(/timestamp: \d+/);
      expect(stderr).toMatch(/random: \d+/);
    });

    it('should resolve dynamic variables in request body', async () => {
      const { stderr } = await execFileAsync('node', [
        cliPath,
        'httpbin',
        'testDynamicInBody',
        '--config',
        testConfigPath,
        '--dry-run'
      ]);

      // Parse the dry run output to check body content
      expect(stderr).toMatch(/"timestamp": "\d+"/);
      expect(stderr).toMatch(/"iso_timestamp": "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"/);
      expect(stderr).toMatch(/"random_number": "\d+"/);
      expect(stderr).toMatch(/"request_id": "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"/);
      expect(stderr).toMatch(/"message": "Generated at \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z with ID [0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"/);
    });

    it('should generate unique values on multiple calls', async () => {
      const { stderr: stderr1 } = await execFileAsync('node', [
        cliPath,
        'httpbin',
        'testDynamicVariables',
        '--config',
        testConfigPath,
        '--dry-run'
      ]);

      const { stderr: stderr2 } = await execFileAsync('node', [
        cliPath,
        'httpbin',
        'testDynamicVariables',
        '--config',
        testConfigPath,
        '--dry-run'
      ]);

      // Extract UUIDs from both runs
      const uuidPattern = /X-Request-ID: ([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/;
      const uuid1 = stderr1.match(uuidPattern)?.[1];
      const uuid2 = stderr2.match(uuidPattern)?.[1];

      expect(uuid1).toBeDefined();
      expect(uuid2).toBeDefined();
      expect(uuid1).not.toBe(uuid2); // Should be unique

      // Extract timestamps (they should be different or at least very close)
      const timestampPattern = /X-Timestamp: (\d+)/;
      const timestamp1 = stderr1.match(timestampPattern)?.[1];
      const timestamp2 = stderr2.match(timestampPattern)?.[1];

      expect(timestamp1).toBeDefined();
      expect(timestamp2).toBeDefined();
      // Timestamps should be valid Unix timestamps
      expect(parseInt(timestamp1!)).toBeGreaterThan(1600000000); // After 2020
      expect(parseInt(timestamp2!)).toBeGreaterThan(1600000000);
    });

    it('should work with verbose output', async () => {
      const { stderr } = await execFileAsync('node', [
        cliPath,
        'httpbin',
        'testDynamicVariables',
        '--config',
        testConfigPath,
        '--dry-run',
        '--verbose'
      ]);

      // Verbose output should show the request details with resolved dynamic variables
      expect(stderr).toContain('[DRY RUN] GET ${testEnv.getTestBaseUrl()}/get');
      expect(stderr).toMatch(/X-Timestamp: \d+/);
      expect(stderr).toMatch(/X-Request-ID: [0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/);
    });

    it('should work with other variable types (CLI overrides)', async () => {
      const { stderr } = await execFileAsync('node', [
        cliPath,
        'httpbin',
        'testDynamicInBody',
        '--config',
        testConfigPath,
        '--dry-run',
        '--var',
        'custom_message=Custom message with {{$guid}}'
      ]);

      // The dynamic variables should still work even when CLI variables are present
      expect(stderr).toMatch(/"timestamp": "\d+"/);
      expect(stderr).toMatch(/"request_id": "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"/);
    });

    it('should validate timestamp formats are reasonable', async () => {
      const { stderr } = await execFileAsync('node', [
        cliPath,
        'httpbin',
        'testDynamicVariables',
        '--config',
        testConfigPath,
        '--dry-run'
      ]);

      // Extract and validate timestamp values
      const timestampMatch = stderr.match(/X-Timestamp: (\d+)/);
      const isoTimestampMatch = stderr.match(/X-ISO-Timestamp: ([^,\n]+)/);

      expect(timestampMatch).toBeDefined();
      expect(isoTimestampMatch).toBeDefined();

      const unixTimestamp = parseInt(timestampMatch![1]);
      const isoTimestamp = isoTimestampMatch![1].trim();

      // Unix timestamp should be reasonable (after 2020, before 2040)
      expect(unixTimestamp).toBeGreaterThan(1577836800); // 2020-01-01
      expect(unixTimestamp).toBeLessThan(2208988800); // 2040-01-01

      // ISO timestamp should be parseable and recent
      const isoDate = new Date(isoTimestamp);
      expect(isoDate.getTime()).toBeGreaterThan(Date.now() - 60000); // Within last minute
      expect(isoDate.getTime()).toBeLessThanOrEqual(Date.now() + 1000); // Not in future
    });

    it('should validate random integers are in expected range', async () => {
      const { stderr } = await execFileAsync('node', [
        cliPath,
        'httpbin',
        'testDynamicVariables',
        '--config',
        testConfigPath,
        '--dry-run'
      ]);

      // Extract random integers
      const randomMatches = stderr.match(/X-Random-ID: (\d+)/g);
      expect(randomMatches).toBeDefined();
      expect(randomMatches!.length).toBeGreaterThan(0);

      randomMatches!.forEach(match => {
        const randomNum = parseInt(match.split(': ')[1]);
        expect(randomNum).toBeGreaterThanOrEqual(0);
        expect(randomNum).toBeLessThanOrEqual(999999); // Default range
      });
    });
  });
}); 