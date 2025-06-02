import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir, readFile } from 'fs/promises';
import { join } from 'path';

const execFile = promisify(spawn);

// Helper function to run CLI commands
async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn('node', ['dist/index.js', ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code || 0,
      });
    });
  });
}

// Helper function to create a test config file
async function createTestConfig(filename: string, config: any): Promise<string> {
  const content = `config:
  defaultProfile: "dev"

profiles:
  dev:
    baseUrl: "https://dev.example.com"
  prod:
    baseUrl: "https://prod.example.com"

apis:
  github-api:
    baseUrl: "https://api.github.com"
    endpoints:
      get-user:
        path: "/users/:username"
        method: "GET"
      list-repos:
        path: "/users/:username/repos"
        method: "GET"
  jsonplaceholder:
    baseUrl: "https://jsonplaceholder.typicode.com"
    endpoints:
      get-post:
        path: "/posts/:id"
        method: "GET"
      create-post:
        path: "/posts"
        method: "POST"`;

  await writeFile(filename, content);
  return filename;
}

describe('Completion Integration Tests', () => {
  const testConfigFile = 'test-completion-config.yaml';

  const testConfig = {
    apis: {
      'github-api': {
        baseUrl: 'https://api.github.com',
        endpoints: {
          'get-user': {
            path: '/users/:username',
            method: 'GET'
          },
          'list-repos': {
            path: '/users/:username/repos',
            method: 'GET'
          }
        }
      },
      'jsonplaceholder': {
        baseUrl: 'https://jsonplaceholder.typicode.com',
        endpoints: {
          'get-post': {
            path: '/posts/:id',
            method: 'GET'
          },
          'create-post': {
            path: '/posts',
            method: 'POST'
          }
        }
      }
    }
  };

  // Setup and cleanup
  async function setup() {
    await createTestConfig(testConfigFile, testConfig);
  }

  async function cleanup() {
    try {
      await unlink(testConfigFile);
    } catch {
      // File might not exist
    }
  }

  describe('completion zsh command', () => {
    it('should generate ZSH completion script', async () => {
      const result = await runCli(['completion', 'zsh']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('#compdef httpcraft');
      expect(result.stdout).toContain('_httpcraft()');
      expect(result.stdout).toContain('--config');
      expect(result.stdout).toContain('--var');
      expect(result.stdout).toContain('--profile');
      expect(result.stdout).toContain('--verbose');
      expect(result.stdout).toContain('--dry-run');
      expect(result.stdout).toContain('--exit-on-http-error');
      expect(result.stdout).toContain('httpcraft --get-api-names');
      expect(result.stdout).toContain('httpcraft --get-endpoint-names');
    });

    it('should error for unsupported shells', async () => {
      const result = await runCli(['completion', 'bash']);

      expect(result.exitCode).toBe(1);
      // The yargs error message goes to stderr, not stdout
      expect(result.stderr).toContain('Invalid values');
      expect(result.stderr).toContain('Choices: "zsh"');
    });
  });

  describe('--get-api-names command', () => {
    it('should list API names from config file', async () => {
      await setup();

      const result = await runCli(['--get-api-names', '--config', testConfigFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('github-api');
      expect(result.stdout).toContain('jsonplaceholder');

      await cleanup();
    });

    it('should handle missing config file gracefully', async () => {
      const result = await runCli(['--get-api-names', '--config', 'non-existent.yaml']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    });

    it('should work with default config', async () => {
      // Use a unique filename to avoid conflicts
      const uniqueConfigFile = `.httpcraft-test-${Date.now()}.yaml`;
      
      // Create default config file
      await createTestConfig(uniqueConfigFile, testConfig);
      
      // Copy to default location
      await writeFile('.httpcraft.yaml', await readFile(uniqueConfigFile, 'utf8'));

      const result = await runCli(['--get-api-names']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('github-api');
      expect(result.stdout).toContain('jsonplaceholder');

      // Cleanup
      try {
        await unlink('.httpcraft.yaml');
      } catch {
        // Files might not exist
      }
      try {
        await unlink(uniqueConfigFile);
      } catch {
        // Files might not exist
      }
    });
  });

  describe('--get-endpoint-names command', () => {
    it('should list endpoint names for specified API', async () => {
      await setup();

      const result = await runCli(['--get-endpoint-names', 'github-api', '--config', testConfigFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('get-user');
      expect(result.stdout).toContain('list-repos');

      await cleanup();
    });

    it('should handle non-existent API gracefully', async () => {
      await setup();

      const result = await runCli(['--get-endpoint-names', 'non-existent-api', '--config', testConfigFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');

      await cleanup();
    });

    it('should handle missing config file gracefully', async () => {
      const result = await runCli(['--get-endpoint-names', 'github-api', '--config', 'non-existent.yaml']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    });

    it('should work with default config', async () => {
      // Use a unique filename to avoid conflicts
      const uniqueConfigFile = `.httpcraft-test-${Date.now()}.yaml`;
      
      // Create default config file
      await createTestConfig(uniqueConfigFile, testConfig);
      
      // Copy to default location
      await writeFile('.httpcraft.yaml', await readFile(uniqueConfigFile, 'utf8'));

      const result = await runCli(['--get-endpoint-names', 'jsonplaceholder']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('get-post');
      expect(result.stdout).toContain('create-post');

      // Cleanup
      try {
        await unlink('.httpcraft.yaml');
      } catch {
        // Files might not exist
      }
      try {
        await unlink(uniqueConfigFile);
      } catch {
        // Files might not exist
      }
    });
  });

  describe('help output', () => {
    it('should include completion command in help', async () => {
      const result = await runCli(['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('completion <shell>');
      expect(result.stdout).toContain('Generate shell completion script');
    });

    it('should show completion command usage', async () => {
      const result = await runCli(['completion', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('completion <shell>');
      expect(result.stdout).toContain('Shell to generate completion for');
      expect(result.stdout).toContain('[choices: "zsh"]');
    });
  });
}); 