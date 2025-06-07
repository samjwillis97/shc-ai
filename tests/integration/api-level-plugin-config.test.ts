import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { testEnv } from '../helpers/testSetup';

const execFileAsync = promisify(execFile);

describe('T10.4: Variable substitution in API-level plugin configurations', () => {
  let testDir: string;
  let configPath: string;
  const cliPath = path.join(process.cwd(), 'dist', 'index.js');

  beforeEach(async () => {
    // Create temporary directory for test files
    testDir = path.join(__dirname, 'temp-api-plugin-test');
    await fs.mkdir(testDir, { recursive: true });

    // Create test plugin
    const pluginContent = `
export default {
  setup: (context) => {
    context.registerPreRequestHook(async (request) => {
      // Add plugin configuration to headers for verification
      request.headers['X-Plugin-Config'] = JSON.stringify(context.config);
      return request;
    });
  }
};
`;
    await fs.writeFile(path.join(testDir, 'testPlugin.js'), pluginContent);

    // Create configuration file
    configPath = path.join(testDir, 'test-config.yaml');
    const mockBaseUrl = testEnv.getTestBaseUrl();
    const configContent = `
profiles:
  test:
    testVar: "resolvedTestValue"
    timeoutValue: "5000"
    nestedVar: "resolvedNested"

plugins:
  - path: ./testPlugin.js
    name: testPlugin
    config:
      globalKey: "globalValue"
      sharedKey: "globalSharedValue"

apis:
  test-api:
    baseUrl: ${mockBaseUrl}
    plugins:
      - name: testPlugin
        config:
          apiKey: "{{testVar}}"
          timeout: "{{timeoutValue}}"
          sharedKey: "apiSharedValue"
          nested:
            value: "{{nestedVar}}"
          envValue: "{{env.TEST_ENV_VAR}}"
    endpoints:
      test-endpoint:
        method: GET
        path: /get
`;
    await fs.writeFile(configPath, configContent);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should resolve variables in API-level plugin configurations from CLI variables', async () => {
    const { stdout, stderr } = await execFileAsync('node', [
      cliPath,
      'test-api',
      'test-endpoint',
      '--config',
      configPath,
      '--var',
      'testVar=cliTestValue',
      '--var',
      'timeoutValue=3000',
      '--var',
      'nestedVar=cliNested'
    ], {
      env: { ...process.env, TEST_ENV_VAR: 'envTestValue' }
    });

    // Debug output if stdout is undefined
    if (!stdout) {
      console.error('CLI stdout is undefined. stderr:', stderr);
      throw new Error(`CLI command failed. stderr: ${stderr}`);
    }

    const response = JSON.parse(stdout);
    const pluginConfig = JSON.parse(response.headers['x-plugin-config'] || response.headers['X-Plugin-Config']);

    // Verify that CLI variables overrode profile variables
    expect(pluginConfig.apiKey).toBe('cliTestValue');
    expect(pluginConfig.timeout).toBe('3000');
    expect(pluginConfig.nested.value).toBe('cliNested');
    
    // Verify environment variable resolution
    expect(pluginConfig.envValue).toBe('envTestValue');
    
    // Verify that global config is still merged
    expect(pluginConfig.globalKey).toBe('globalValue');
    
    // Verify that API-level config overrides global config
    expect(pluginConfig.sharedKey).toBe('apiSharedValue');
  });

  it('should resolve variables in API-level plugin configurations from profiles', async () => {
    const { stdout } = await execFileAsync('node', [
      cliPath,
      'test-api',
      'test-endpoint',
      '--config',
      configPath,
      '--profile',
      'test'
    ], {
      env: { ...process.env, TEST_ENV_VAR: 'envTestValue' }
    });

    const response = JSON.parse(stdout);
    const pluginConfig = JSON.parse(response.headers['x-plugin-config'] || response.headers['X-Plugin-Config']);

    // Verify that profile variables were resolved
    expect(pluginConfig.apiKey).toBe('resolvedTestValue');
    expect(pluginConfig.timeout).toBe('5000');
    expect(pluginConfig.nested.value).toBe('resolvedNested');
    
    // Verify environment variable resolution
    expect(pluginConfig.envValue).toBe('envTestValue');
    
    // Verify configuration merging
    expect(pluginConfig.globalKey).toBe('globalValue');
    expect(pluginConfig.sharedKey).toBe('apiSharedValue');
  });

  it('should handle variable resolution errors in API-level plugin configurations', async () => {
    // Create config with unresolvable variable
    const configWithError = `
profiles:
  test:
    testVar: "resolvedTestValue"

plugins:
  - path: ./testPlugin.js
    name: testPlugin
    config:
      globalKey: "globalValue"

apis:
  test-api:
    baseUrl: ${testEnv.getTestBaseUrl()}
    plugins:
      - name: testPlugin
        config:
          apiKey: "{{undefinedVar}}"
    endpoints:
      test-endpoint:
        method: GET
        path: /get
`;
    const errorConfigPath = path.join(testDir, 'error-config.yaml');
    await fs.writeFile(errorConfigPath, configWithError);

    try {
      await execFileAsync('node', [
        cliPath,
        'test-api',
        'test-endpoint',
        '--config',
        errorConfigPath
      ]);
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.code).toBe(1);
      expect(error.stderr).toContain('Failed to resolve variables in API-level plugin configuration');
      expect(error.stderr).toContain('undefinedVar');
    }
  });

  it('should support complex nested object variable resolution in API-level plugin configurations', async () => {
    const complexConfigContent = `
profiles:
  test:
    host: "example.com"
    port: "8080"
    protocol: "https"
    version: "v2"

plugins:
  - path: ./testPlugin.js
    name: testPlugin
    config:
      globalKey: "globalValue"

apis:
  test-api:
    baseUrl: ${testEnv.getTestBaseUrl()}
    plugins:
      - name: testPlugin
        config:
          connection:
            host: "{{host}}"
            port: "{{port}}"
            url: "{{protocol}}://{{host}}:{{port}}/api/{{version}}"
          array:
            - "item1-{{version}}"
            - "item2-{{host}}"
          deeply:
            nested:
              object:
                value: "deep-{{protocol}}"
    endpoints:
      test-endpoint:
        method: GET
        path: /get
`;
    const complexConfigPath = path.join(testDir, 'complex-config.yaml');
    await fs.writeFile(complexConfigPath, complexConfigContent);

    const { stdout } = await execFileAsync('node', [
      cliPath,
      'test-api',
      'test-endpoint',
      '--config',
      complexConfigPath,
      '--profile',
      'test'
    ]);

    const response = JSON.parse(stdout);
    const pluginConfig = JSON.parse(response.headers['x-plugin-config'] || response.headers['X-Plugin-Config']);

    // Verify complex nested object resolution
    expect(pluginConfig.connection.host).toBe('example.com');
    expect(pluginConfig.connection.port).toBe('8080');
    expect(pluginConfig.connection.url).toBe('https://example.com:8080/api/v2');
    
    // Verify array resolution
    expect(pluginConfig.array[0]).toBe('item1-v2');
    expect(pluginConfig.array[1]).toBe('item2-example.com');
    
    // Verify deeply nested resolution
    expect(pluginConfig.deeply.nested.object.value).toBe('deep-https');
    
    // Verify global config is still present
    expect(pluginConfig.globalKey).toBe('globalValue');
  });
}); 