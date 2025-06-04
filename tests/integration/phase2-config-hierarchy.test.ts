import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

describe('Phase 2 Integration Tests - T2.3 Config Search Hierarchy', () => {
  const tempDir = path.join(os.tmpdir(), 'httpcraft-integration-test-' + Math.random().toString(36).substr(2, 9));
  const originalCwd = process.cwd();
  const globalConfigDir = path.join(os.homedir(), '.config', 'httpcraft');
  const globalConfigPath = path.join(globalConfigDir, 'config.yaml');
  
  let globalConfigBackup: string | null = null;

  beforeEach(async () => {
    // Create temp directory and change to it
    await fs.mkdir(tempDir, { recursive: true });
    process.chdir(tempDir);
    
    // Backup existing global config if it exists
    try {
      globalConfigBackup = await fs.readFile(globalConfigPath, 'utf-8');
    } catch (error) {
      globalConfigBackup = null;
    }
  });

  afterEach(async () => {
    // Restore original working directory
    process.chdir(originalCwd);
    
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    
    // Restore global config
    if (globalConfigBackup !== null) {
      await fs.mkdir(globalConfigDir, { recursive: true });
      await fs.writeFile(globalConfigPath, globalConfigBackup);
    } else {
      // Remove global config if it was created during test
      try {
        await fs.unlink(globalConfigPath);
      } catch (error) {
        // Ignore if file doesn't exist
      }
    }
  });

  const runHttpCraft = (args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
    return new Promise((resolve) => {
      const child = spawn('node', [
        path.join(originalCwd, 'dist/index.js'),
        ...args
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' }
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code || 0
        });
      });
    });
  };

  it('should use local .httpcraft.yaml over global config', async () => {
    const localConfig = `
apis:
  test:
    baseUrl: "https://httpbin.org"
    endpoints:
      get:
        method: GET
        path: "/get"
`;

    const globalConfig = `
apis:
  test:
    baseUrl: "https://global.example.com"
    endpoints:
      get:
        method: GET
        path: "/global"
`;

    // Create global config
    await fs.mkdir(globalConfigDir, { recursive: true });
    await fs.writeFile(globalConfigPath, globalConfig);

    // Create local config
    await fs.writeFile('.httpcraft.yaml', localConfig);

    // Build the project first
    await new Promise<void>((resolve, reject) => {
      const buildProcess = spawn('npm', ['run', 'build'], {
        cwd: originalCwd,
        stdio: 'inherit'
      });
      
      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Build failed with code ${code}`));
        }
      });
    });

    // Test using dry-run to verify URL construction without making actual request
    const result = await runHttpCraft(['test', 'get', '--dry-run']);
    
    expect(result.stderr).toContain('https://httpbin.org/get');
    expect(result.stderr).not.toContain('https://global.example.com');
    expect(result.exitCode).toBe(0);
  });

  it('should use global config when no local config exists', async () => {
    const globalConfig = `
apis:
  test:
    baseUrl: "https://httpbin.org"
    endpoints:
      get:
        method: GET
        path: "/global-test"
`;

    // Create only global config
    await fs.mkdir(globalConfigDir, { recursive: true });
    await fs.writeFile(globalConfigPath, globalConfig);

    // Build the project first
    await new Promise<void>((resolve, reject) => {
      const buildProcess = spawn('npm', ['run', 'build'], {
        cwd: originalCwd,
        stdio: 'inherit'
      });
      
      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Build failed with code ${code}`));
        }
      });
    });

    // Test using dry-run to verify URL construction
    const result = await runHttpCraft(['test', 'get', '--dry-run']);
    
    expect(result.stderr).toContain('https://httpbin.org/global-test');
    expect(result.exitCode).toBe(0);
  });

  it('should show error when no config exists anywhere', async () => {
    // Ensure no configs exist
    try {
      await fs.unlink(globalConfigPath);
    } catch (error) {
      // Ignore if file doesn't exist
    }

    // Build the project first
    await new Promise<void>((resolve, reject) => {
      const buildProcess = spawn('npm', ['run', 'build'], {
        cwd: originalCwd,
        stdio: 'inherit'
      });
      
      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Build failed with code ${code}`));
        }
      });
    });

    const result = await runHttpCraft(['test', 'get']);
    
    expect(result.stderr).toContain('No configuration file found');
    expect(result.exitCode).toBe(1);
  });
}); 