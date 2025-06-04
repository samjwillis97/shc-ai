import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promisify } from 'util';
import { spawn } from 'child_process';
import path, { join } from 'path';
import { writeFileSync, existsSync, unlinkSync } from 'fs';
import * as fs from 'fs/promises';

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

  await fs.writeFile(filename, content);
  return filename;
}

describe('Completion Integration Tests', () => {
  const testConfigFile = 'test-completion-config.yaml';

  beforeEach(async () => {
    // Create a test config file
    await writeFileSync(testConfigFile, `
apis:
  github-api:
    baseUrl: "https://api.github.com"
    endpoints:
      get-user:
        method: GET
        path: "/users/{{username}}"
      list-repos:
        method: GET
        path: "/users/{{username}}/repos"
  
  jsonplaceholder:
    baseUrl: "https://jsonplaceholder.typicode.com"
    endpoints:
      get-posts:
        method: GET
        path: "/posts"
      get-post:
        method: GET
        path: "/posts/{{id}}"

chains:
  user-workflow:
    description: "Get user and their repos"
    steps:
      - id: getUser
        call: github-api.get-user
      - id: getRepos
        call: github-api.list-repos
  
  simple-test:
    steps:
      - id: getPost
        call: jsonplaceholder.get-post
`);
  });

  afterEach(async () => {
    // Clean up test config file
    if (existsSync(testConfigFile)) {
      unlinkSync(testConfigFile);
    }
  });

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
      expect(result.stdout).toContain('--chain-output');
      expect(result.stdout).toContain('chain:Execute a chain of HTTP requests');
      expect(result.stdout).toContain('httpcraft --get-api-names');
      expect(result.stdout).toContain('httpcraft --get-endpoint-names');
      expect(result.stdout).toContain('httpcraft --get-chain-names');
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
      const result = await runCli(['--get-api-names', '--config', testConfigFile]);

      expect(result.exitCode).toBe(0);
      const lines = result.stdout.trim().split('\n');
      expect(lines).toContain('github-api');
      expect(lines).toContain('jsonplaceholder');
      expect(lines).toHaveLength(2);
    });

    it('should silently exit when config file does not exist', async () => {
      const result = await runCli(['--get-api-names', '--config', 'nonexistent.yaml']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    });

    it('should use default config when no config specified', async () => {
      // Create a default config file
      await writeFileSync('.httpcraft.yaml', `
apis:
  default-api:
    baseUrl: "https://api.default.com"
    endpoints:
      test:
        method: GET
        path: "/test"
`);

      try {
        const result = await runCli(['--get-api-names']);

        expect(result.exitCode).toBe(0);
        const lines = result.stdout.trim().split('\n');
        expect(lines).toContain('default-api');
      } finally {
        // Clean up
        if (existsSync('.httpcraft.yaml')) {
          unlinkSync('.httpcraft.yaml');
        }
      }
    });

    it('should silently exit when no default config exists', async () => {
      // Temporarily move any global config that might interfere
      const globalConfigPath = join(process.env.HOME || '~', '.config', 'httpcraft', 'config.yaml');
      const backupPath = globalConfigPath + '.test-backup';
      let needsRestore = false;
      
      try {
        if (existsSync(globalConfigPath)) {
          if (existsSync(backupPath)) {
            unlinkSync(backupPath);
          }
          await fs.rename(globalConfigPath, backupPath);
          needsRestore = true;
        }
        
        const result = await runCli(['--get-api-names']);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('');
        expect(result.stderr).toBe('');
      } finally {
        // Restore global config if we moved it
        if (needsRestore && existsSync(backupPath)) {
          await fs.rename(backupPath, globalConfigPath);
        }
      }
    });
  });

  describe('--get-endpoint-names command', () => {
    it('should list endpoint names for specified API', async () => {
      const result = await runCli(['--get-endpoint-names', 'github-api', '--config', testConfigFile]);

      expect(result.exitCode).toBe(0);
      const lines = result.stdout.trim().split('\n');
      expect(lines).toContain('get-user');
      expect(lines).toContain('list-repos');
      expect(lines).toHaveLength(2);
    });

    it('should handle non-existent API silently', async () => {
      const result = await runCli(['--get-endpoint-names', 'nonexistent-api', '--config', testConfigFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    });

    it('should silently exit when config file does not exist', async () => {
      const result = await runCli(['--get-endpoint-names', 'github-api', '--config', 'nonexistent.yaml']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    });

    it('should list endpoints for different APIs', async () => {
      const githubResult = await runCli(['--get-endpoint-names', 'github-api', '--config', testConfigFile]);
      const jsonResult = await runCli(['--get-endpoint-names', 'jsonplaceholder', '--config', testConfigFile]);

      expect(githubResult.exitCode).toBe(0);
      expect(jsonResult.exitCode).toBe(0);

      const githubLines = githubResult.stdout.trim().split('\n');
      const jsonLines = jsonResult.stdout.trim().split('\n');

      expect(githubLines).toContain('get-user');
      expect(githubLines).toContain('list-repos');
      expect(jsonLines).toContain('get-posts');
      expect(jsonLines).toContain('get-post');
    });
  });

  describe('--get-chain-names command', () => {
    it('should list chain names from config file', async () => {
      const result = await runCli(['--get-chain-names', '--config', testConfigFile]);

      expect(result.exitCode).toBe(0);
      const lines = result.stdout.trim().split('\n');
      expect(lines).toContain('user-workflow');
      expect(lines).toContain('simple-test');
      expect(lines).toHaveLength(2);
    });

    it('should silently exit when config file does not exist', async () => {
      const result = await runCli(['--get-chain-names', '--config', 'nonexistent.yaml']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    });

    it('should use default config when no config specified', async () => {
      // Create a default config file with chains
      await writeFileSync('.httpcraft.yaml', `
apis:
  test-api:
    baseUrl: "https://api.test.com"
    endpoints:
      test:
        method: GET
        path: "/test"

chains:
  default-chain:
    steps:
      - id: test
        call: test-api.test
`);

      try {
        const result = await runCli(['--get-chain-names']);

        expect(result.exitCode).toBe(0);
        const lines = result.stdout.trim().split('\n');
        expect(lines).toContain('default-chain');
      } finally {
        // Clean up
        if (existsSync('.httpcraft.yaml')) {
          unlinkSync('.httpcraft.yaml');
        }
      }
    });

    it('should silently exit when no default config exists', async () => {
      const result = await runCli(['--get-chain-names']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    });

    it('should handle config with no chains', async () => {
      await writeFileSync('no-chains-config.yaml', `
apis:
  test-api:
    baseUrl: "https://api.test.com"
    endpoints:
      test:
        method: GET
        path: "/test"
`);

      try {
        const result = await runCli(['--get-chain-names', '--config', 'no-chains-config.yaml']);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('');
        expect(result.stderr).toBe('');
      } finally {
        // Clean up
        if (existsSync('no-chains-config.yaml')) {
          unlinkSync('no-chains-config.yaml');
        }
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

    it('should show chain command in help', async () => {
      const result = await runCli(['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('chain <chainName>');
      expect(result.stdout).toContain('Execute a chain of HTTP requests');
    });

    it('should show chain-output option in help', async () => {
      const result = await runCli(['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('--chain-output');
      expect(result.stdout).toContain('Output format for chains');
      expect(result.stdout).toContain('[choices: "default", "full"]');
    });
  });
}); 