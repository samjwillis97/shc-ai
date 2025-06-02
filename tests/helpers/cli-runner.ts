import { spawn } from 'child_process';
import { join } from 'path';

export interface CliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function runCli(args: string[]): Promise<CliRunResult> {
  return new Promise((resolve) => {
    const nodePath = process.execPath;
    const cliPath = join(process.cwd(), 'dist', 'index.js');
    
    const child = spawn(nodePath, [cliPath, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode) => {
      resolve({
        exitCode: exitCode || 0,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });

    child.on('error', (error) => {
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: error.message
      });
    });
  });
} 