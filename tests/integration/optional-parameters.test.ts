/**
 * T18.7: Integration tests for optional parameter syntax ({{variable?}})
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import * as fs from 'fs/promises';
import { testEnv } from '../helpers/testSetup';

const execAsync = promisify(exec);

describe('Optional Parameter Syntax - Integration Tests', () => {
  let tempConfigFile: string;

  beforeEach(async () => {
    // Create a temporary config file
    tempConfigFile = path.join(testEnv.getTempDir(), 'optional-test-config.yaml');
  });

  afterEach(async () => {
    // Clean up
    try {
      await fs.unlink(tempConfigFile);
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should exclude optional query parameters when variables are undefined', async () => {
    const configYaml = `
apis:
  testapi:
    baseUrl: "${testEnv.getMockServerUrl()}"
    endpoints:
      getUsers:
        path: "/users"
        method: GET
        params:
          limit: "10"
          pageKey: "{{pageKey?}}"
          includeMetadata: "{{includeMetadata?}}"
          format: "json"
`;

    await fs.writeFile(tempConfigFile, configYaml);

    const { stderr } = await execAsync(
      `node ${path.join(process.cwd(), 'dist/index.js')} --config "${tempConfigFile}" testapi getUsers --dry-run`
    );

    // Should only include limit and format, not the optional undefined parameters
    expect(stderr).toMatch(/GET.*\/users\?limit=10&format=json/);
    expect(stderr).not.toMatch(/pageKey/);
    expect(stderr).not.toMatch(/includeMetadata/);
  });

  it('should include optional query parameters when variables are defined', async () => {
    const configYaml = `
apis:
  testapi:
    baseUrl: "${testEnv.getMockServerUrl()}"
    endpoints:
      getUsers:
        path: "/users"
        method: GET
        params:
          limit: "10"
          pageKey: "{{pageKey?}}"
          includeMetadata: "{{includeMetadata?}}"
          format: "json"
`;

    await fs.writeFile(tempConfigFile, configYaml);

    const { stderr } = await execAsync(
      `node ${path.join(process.cwd(), 'dist/index.js')} --config "${tempConfigFile}" testapi getUsers --dry-run --var pageKey=abc123 --var includeMetadata=true`
    );

    // Should include all parameters when optional variables are defined
    expect(stderr).toMatch(/GET.*\/users\?.*limit=10/);
    expect(stderr).toMatch(/pageKey=abc123/);
    expect(stderr).toMatch(/includeMetadata=true/);
    expect(stderr).toMatch(/format=json/);
  });

  it('should exclude optional headers when variables are undefined', async () => {
    const configYaml = `
apis:
  testapi:
    baseUrl: "${testEnv.getMockServerUrl()}"
    endpoints:
      getUsers:
        path: "/users"
        method: GET
        headers:
          "User-Agent": "HttpCraft/1.0"
          "X-Optional-Token": "{{optionalToken?}}"
          "Accept": "application/json"
`;

    await fs.writeFile(tempConfigFile, configYaml);

    const { stderr } = await execAsync(
      `node ${path.join(process.cwd(), 'dist/index.js')} --config "${tempConfigFile}" testapi getUsers --dry-run --verbose`
    );

    // Should include static headers but exclude optional undefined headers
    expect(stderr).toMatch(/User-Agent: HttpCraft\/1\.0/);
    expect(stderr).toMatch(/Accept: application\/json/);
    expect(stderr).not.toMatch(/X-Optional-Token/);
  });

  it('should include optional headers when variables are defined', async () => {
    const configYaml = `
apis:
  testapi:
    baseUrl: "${testEnv.getMockServerUrl()}"
    endpoints:
      getUsers:
        path: "/users"
        method: GET
        headers:
          "User-Agent": "HttpCraft/1.0"
          "X-Optional-Token": "{{optionalToken?}}"
          "Accept": "application/json"
`;

    await fs.writeFile(tempConfigFile, configYaml);
  });

  it('should exclude optional parameters when variables are set to null', async () => {
    const configYaml = `
profiles:
  test:
    pageKey: null
    includeMetadata: null

apis:
  testapi:
    baseUrl: "${testEnv.getMockServerUrl()}"
    endpoints:
      getUsers:
        path: "/users"
        method: GET
        params:
          limit: "10"
          pageKey: "{{profile.pageKey?}}"
          includeMetadata: "{{profile.includeMetadata?}}"
          format: "json"
`;

    await fs.writeFile(tempConfigFile, configYaml);

    const { stderr } = await execAsync(
      `node ${path.join(process.cwd(), 'dist/index.js')} --config "${tempConfigFile}" testapi getUsers --dry-run --profile test`
    );

    // Should only include limit and format, not the optional null parameters
    expect(stderr).toMatch(/GET.*\/users\?limit=10&format=json/);
    expect(stderr).not.toMatch(/pageKey/);
    expect(stderr).not.toMatch(/includeMetadata/);
  });
});
