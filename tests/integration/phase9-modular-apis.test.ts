import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { testEnv } from '../helpers/testSetup';

const execFile = promisify(require('child_process').execFile);

describe('Phase 9 Integration - Modular API Imports (T9.1)', () => {
  let tempDir: string;
  const cliPath = path.join(process.cwd(), 'dist/index.js');

  beforeEach(async () => {
    // Create a temporary directory for test files
    tempDir = path.join(process.cwd(), 'test-temp-integration-' + Date.now());
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

  describe('Directory-based API Loading', () => {
    it('should execute requests using APIs loaded from directory', async () => {
      // Create APIs directory
      const apisDir = path.join(tempDir, 'apis');
      await fs.mkdir(apisDir, { recursive: true });

      // Create API definition file
      await fs.writeFile(path.join(apisDir, 'httpbin.yaml'), `
httpbin:
  baseUrl: "${mockBaseUrl}"
  endpoints:
    testGet:
      method: GET
      path: "/get"
      headers:
        X-Test-Source: "modular-api"
`);

      // Create main config with directory import
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  - "directory:./apis/"
`);

      // Execute request using the modular API
      const { stdout } = await execFile('node', [
        cliPath,
        'httpbin',
        'testGet',
        '--config',
        configFile
      ]);

      const response = JSON.parse(stdout);
      expect(response.headers['X-Test-Source']).toBe('modular-api');
    });

    it('should handle multiple API files in directory', async () => {
      const apisDir = path.join(tempDir, 'apis');
      await fs.mkdir(apisDir, { recursive: true });

      // Create first API file
      await fs.writeFile(path.join(apisDir, 'service1.yaml'), `
service1:
  baseUrl: "${mockBaseUrl}"
  endpoints:
    test1:
      method: GET
      path: "/get"
      headers:
        X-Service: "service1"
`);

      // Create second API file
      await fs.writeFile(path.join(apisDir, 'service2.yaml'), `
service2:
  baseUrl: "${mockBaseUrl}"
  endpoints:
    test2:
      method: GET
      path: "/get"
      headers:
        X-Service: "service2"
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  - "directory:./apis/"
`);

      // Test first service
      const { stdout: stdout1 } = await execFile('node', [
        cliPath,
        'service1',
        'test1',
        '--config',
        configFile
      ]);

      const response1 = JSON.parse(stdout1);
      expect(response1.headers['X-Service']).toBe('service1');

      // Test second service
      const { stdout: stdout2 } = await execFile('node', [
        cliPath,
        'service2',
        'test2',
        '--config',
        configFile
      ]);

      const response2 = JSON.parse(stdout2);
      expect(response2.headers['X-Service']).toBe('service2');
    });
  });

  describe('Mixed Import Methods', () => {
    it('should handle both directory and individual file imports', async () => {
      // Create APIs directory
      const apisDir = path.join(tempDir, 'apis');
      await fs.mkdir(apisDir, { recursive: true });

      await fs.writeFile(path.join(apisDir, 'dir-service.yaml'), `
dirService:
  baseUrl: "${mockBaseUrl}"
  endpoints:
    test:
      method: GET
      path: "/get"
      headers:
        X-Source: "directory"
`);

      // Create individual file
      const individualFile = path.join(tempDir, 'individual-service.yaml');
      await fs.writeFile(individualFile, `
individualService:
  baseUrl: "${mockBaseUrl}"
  endpoints:
    test:
      method: GET
      path: "/get"
      headers:
        X-Source: "individual"
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  - "directory:./apis/"
  - "./individual-service.yaml"
`);

      // Test directory-loaded service
      const { stdout: stdout1 } = await execFile('node', [
        cliPath,
        'dirService',
        'test',
        '--config',
        configFile
      ]);

      const response1 = JSON.parse(stdout1);
      expect(response1.headers['X-Source']).toBe('directory');

      // Test individually-loaded service
      const { stdout: stdout2 } = await execFile('node', [
        cliPath,
        'individualService',
        'test',
        '--config',
        configFile
      ]);

      const response2 = JSON.parse(stdout2);
      expect(response2.headers['X-Source']).toBe('individual');
    });
  });

  describe('Backward Compatibility', () => {
    it('should still work with direct API definitions', async () => {
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  httpbin:
    baseUrl: "${mockBaseUrl}"
    endpoints:
      testDirect:
        method: GET
        path: "/get"
        headers:
          X-Type: "direct"
`);

      const { stdout } = await execFile('node', [
        cliPath,
        'httpbin',
        'testDirect',
        '--config',
        configFile
      ]);

      const response = JSON.parse(stdout);
      expect(response.headers['X-Type']).toBe('direct');
    });
  });

  describe('Error Handling', () => {
    it('should provide clear error for missing directory', async () => {
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  - "directory:./missing-apis/"
`);

      try {
        await execFile('node', [
          cliPath,
          'someApi',
          'someEndpoint',
          '--config',
          configFile
        ]);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.stderr).toContain('API directory not found');
      }
    });

    it('should provide clear error for missing file', async () => {
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  - "./missing-file.yaml"
`);

      try {
        await execFile('node', [
          cliPath,
          'someApi',
          'someEndpoint',
          '--config',
          configFile
        ]);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.stderr).toContain('Failed to load API file');
      }
    });
  });

  describe('Tab Completion Integration', () => {
    it('should include modular APIs in completion', async () => {
      const apisDir = path.join(tempDir, 'apis');
      await fs.mkdir(apisDir, { recursive: true });

      await fs.writeFile(path.join(apisDir, 'completion-test.yaml'), `
completionTest:
  baseUrl: "${mockBaseUrl}"
  endpoints:
    testEndpoint:
      method: GET
      path: "/get"
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
apis:
  - "directory:./apis/"
`);

      // Test API name completion
      const { stdout: apiNames } = await execFile('node', [
        cliPath,
        '--get-api-names',
        '--config',
        configFile
      ]);

      expect(apiNames.trim().split('\n')).toContain('completionTest');

      // Test endpoint completion
      const { stdout: endpointNames } = await execFile('node', [
        cliPath,
        '--get-endpoint-names',
        'completionTest',
        '--config',
        configFile
      ]);

      expect(endpointNames.trim().split('\n')).toContain('testEndpoint');
    });
  });
}); 