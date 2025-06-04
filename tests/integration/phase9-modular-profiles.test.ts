import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { tmpdir } from 'os';

const execFileAsync = promisify(execFile);

// Get the CLI path for testing
const cliPath = path.resolve(process.cwd(), 'dist', 'cli', 'main.js');

describe('Phase 9 Integration - Modular Profile Imports', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'httpcraft-profiles-test-'));
  });

  afterEach(async () => {
    // Clean up temporary files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Directory-based Profile Loading', () => {
    it('should execute requests using profiles loaded from directory', async () => {
      // Create profiles directory
      const profilesDir = path.join(tempDir, 'profiles');
      await fs.mkdir(profilesDir, { recursive: true });

      // Create profile definition file
      await fs.writeFile(path.join(profilesDir, 'development.yaml'), `
development:
  ssoBaseUrl: "https://sso.dev.example.com"
  productBaseUrl: "https://products.dev.example.com"
  logLevel: "debug"
  testApiHost: "httpbin.org"
`);

      await fs.writeFile(path.join(profilesDir, 'production.yaml'), `
production:
  ssoBaseUrl: "https://sso.example.com"
  productBaseUrl: "https://products.example.com"
  logLevel: "info"
  testApiHost: "httpbin.org"
`);

      // Create main config with directory import
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
config:
  defaultProfiles:
    - "development"

profiles:
  - "directory:./profiles/"

apis:
  testApi:
    baseUrl: "https://{{profile.testApiHost}}"
    endpoints:
      testGet:
        method: GET
        path: "/get"
        headers:
          X-Profile-Host: "{{profile.testApiHost}}"
          X-Log-Level: "{{profile.logLevel}}"
`);

      // Execute request using the modular profile
      const { stdout } = await execFileAsync('node', [
        cliPath,
        'testApi',
        'testGet',
        '--config',
        configFile,
        '--profile',
        'development'
      ]);

      const response = JSON.parse(stdout);
      expect(response.headers['X-Profile-Host']).toBe('httpbin.org');
      expect(response.headers['X-Log-Level']).toBe('debug');
    });

    it('should support profile override via CLI', async () => {
      // Create profiles directory
      const profilesDir = path.join(tempDir, 'profiles');
      await fs.mkdir(profilesDir, { recursive: true });

      await fs.writeFile(path.join(profilesDir, 'development.yaml'), `
development:
  env: "dev"
  apiHost: "httpbin.org"
`);

      await fs.writeFile(path.join(profilesDir, 'production.yaml'), `
production:
  env: "prod"
  apiHost: "httpbin.org"
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
config:
  defaultProfiles:
    - "development"

profiles:
  - "directory:./profiles/"

apis:
  testApi:
    baseUrl: "https://{{profile.apiHost}}"
    endpoints:
      testGet:
        method: GET
        path: "/get"
        headers:
          X-Env: "{{profile.env}}"
`);

      // Execute request with production profile override
      const { stdout } = await execFileAsync('node', [
        cliPath,
        'testApi',
        'testGet',
        '--config',
        configFile,
        '--profile',
        'production'
      ]);

      const response = JSON.parse(stdout);
      expect(response.headers['X-Env']).toBe('prod');
    });
  });

  describe('Mixed Import Methods', () => {
    it('should handle both directory and individual file profile imports', async () => {
      // Create profiles directory
      const profilesDir = path.join(tempDir, 'profiles');
      await fs.mkdir(profilesDir, { recursive: true });

      await fs.writeFile(path.join(profilesDir, 'dir-profile.yaml'), `
dirProfile:
  source: "directory"
  apiHost: "httpbin.org"
`);

      // Create individual file
      const individualFile = path.join(tempDir, 'individual-profile.yaml');
      await fs.writeFile(individualFile, `
fileProfile:
  source: "file"
  apiHost: "httpbin.org"
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
profiles:
  - "directory:./profiles/"
  - "./individual-profile.yaml"

apis:
  testApi:
    baseUrl: "https://{{profile.apiHost}}"
    endpoints:
      testGet:
        method: GET
        path: "/get"
        headers:
          X-Source: "{{profile.source}}"
`);

      // Test directory-loaded profile
      const { stdout: stdout1 } = await execFileAsync('node', [
        cliPath,
        'testApi',
        'testGet',
        '--config',
        configFile,
        '--profile',
        'dirProfile'
      ]);

      const response1 = JSON.parse(stdout1);
      expect(response1.headers['X-Source']).toBe('directory');

      // Test individually-loaded profile
      const { stdout: stdout2 } = await execFileAsync('node', [
        cliPath,
        'testApi',
        'testGet',
        '--config',
        configFile,
        '--profile',
        'fileProfile'
      ]);

      const response2 = JSON.parse(stdout2);
      expect(response2.headers['X-Source']).toBe('file');
    });

    it('should handle profile merging when later imports override earlier ones', async () => {
      // Create profiles directory
      const profilesDir = path.join(tempDir, 'profiles');
      await fs.mkdir(profilesDir, { recursive: true });

      await fs.writeFile(path.join(profilesDir, 'base.yaml'), `
merged:
  host: "dir.example.com"
  port: 8080
  apiHost: "httpbin.org"
`);

      // Create individual file that overrides
      const overrideFile = path.join(tempDir, 'override.yaml');
      await fs.writeFile(overrideFile, `
merged:
  host: "file.example.com"
  ssl: true
  apiHost: "httpbin.org"
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
profiles:
  - "directory:./profiles/"
  - "./override.yaml"

apis:
  testApi:
    baseUrl: "https://{{profile.apiHost}}"
    endpoints:
      testGet:
        method: GET
        path: "/get"
        headers:
          X-Host: "{{profile.host}}"
          X-Port: "{{profile.port}}"
          X-Ssl: "{{profile.ssl}}"
`);

      const { stdout } = await execFileAsync('node', [
        cliPath,
        'testApi',
        'testGet',
        '--config',
        configFile,
        '--profile',
        'merged'
      ]);

      const response = JSON.parse(stdout);
      expect(response.headers['X-Host']).toBe('file.example.com'); // overridden
      expect(response.headers['X-Port']).toBe('8080'); // preserved
      expect(response.headers['X-Ssl']).toBe('true'); // added
    });
  });

  describe('Error Handling', () => {
    it('should show clear error for missing profile directory', async () => {
      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
profiles:
  - "directory:./non-existent/"

apis:
  testApi:
    baseUrl: "https://httpbin.org"
    endpoints:
      test:
        method: GET
        path: "/get"
`);

      await expect(execFileAsync('node', [
        cliPath,
        'testApi',
        'test',
        '--config',
        configFile
      ])).rejects.toThrow();
    });

    it('should show clear error for non-existent profile', async () => {
      const profilesDir = path.join(tempDir, 'profiles');
      await fs.mkdir(profilesDir, { recursive: true });

      await fs.writeFile(path.join(profilesDir, 'development.yaml'), `
development:
  host: "dev.example.com"
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
profiles:
  - "directory:./profiles/"

apis:
  testApi:
    baseUrl: "https://httpbin.org"
    endpoints:
      test:
        method: GET
        path: "/get"
`);

      await expect(execFileAsync('node', [
        cliPath,
        'testApi',
        'test',
        '--config',
        configFile,
        '--profile',
        'nonexistent'
      ])).rejects.toThrow();
    });
  });

  describe('Backwards Compatibility', () => {
    it('should still support direct profile definitions alongside imports', async () => {
      // Create profiles directory
      const profilesDir = path.join(tempDir, 'profiles');
      await fs.mkdir(profilesDir, { recursive: true });

      await fs.writeFile(path.join(profilesDir, 'imported.yaml'), `
imported:
  source: "imported"
  apiHost: "httpbin.org"
`);

      const configFile = path.join(tempDir, 'config.yaml');
      await fs.writeFile(configFile, `
profiles:
  - "directory:./profiles/"

apis:
  testApi:
    baseUrl: "https://{{profile.apiHost}}"
    endpoints:
      testGet:
        method: GET
        path: "/get"
        headers:
          X-Source: "{{profile.source}}"
`);

      const { stdout } = await execFileAsync('node', [
        cliPath,
        'testApi',
        'testGet',
        '--config',
        configFile,
        '--profile',
        'imported'
      ]);

      const response = JSON.parse(stdout);
      expect(response.headers['X-Source']).toBe('imported');
    });
  });
}); 