import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleApiCommand } from '../../src/cli/commands/api.js';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';

describe('Phase 5 Integration Tests', () => {
  const testConfigPath = join(process.cwd(), 'test-phase5-config.yaml');
  const testConfigPostPath = join(process.cwd(), 'test-phase5-post-config.yaml');
  let originalStderr: typeof process.stderr.write;
  let stderrOutput: string;

  // Simple config for GET requests
  const testConfig = `
config:
  defaultProfile: development

profiles:
  development:
    base_url: https://jsonplaceholder.typicode.com
    api_key: dev-key-123
  
  production:
    base_url: https://api.production.com
    api_key: prod-key-456

apis:
  jsonplaceholder:
    baseUrl: "{{base_url}}"
    headers:
      X-API-Key: "{{api_key}}"
      User-Agent: HttpCraft/1.0
    endpoints:
      getTodo:
        method: GET
        path: /todos/{{todo_id}}
        description: "Get a specific todo item"
`;

  // Separate config for POST requests with body
  const testConfigPost = `
config:
  defaultProfile: development

profiles:
  development:
    base_url: https://jsonplaceholder.typicode.com
    api_key: dev-key-123
  
  production:
    base_url: https://api.production.com
    api_key: prod-key-456

apis:
  jsonplaceholder:
    baseUrl: "{{base_url}}"
    headers:
      X-API-Key: "{{api_key}}"
      User-Agent: HttpCraft/1.0
    endpoints:
      postTodo:
        method: POST
        path: /todos
        headers:
          Content-Type: application/json
        body:
          title: "{{title}}"
          body: "{{description}}"
          userId: "{{user_id}}"
        description: "Create a new todo item"
`;

  beforeEach(async () => {
    await writeFile(testConfigPath, testConfig);
    await writeFile(testConfigPostPath, testConfigPost);
    
    // Capture stderr output
    stderrOutput = '';
    originalStderr = process.stderr.write;
    process.stderr.write = ((chunk: any) => {
      stderrOutput += chunk.toString();
      return true;
    }) as any;
  });

  afterEach(async () => {
    try {
      await unlink(testConfigPath);
      await unlink(testConfigPostPath);
    } catch {
      // Files may not exist
    }
    
    // Restore stderr
    process.stderr.write = originalStderr;
  });

  describe('Verbose Output', () => {
    it('should display detailed request and response information', async () => {
      await handleApiCommand({
        apiName: 'jsonplaceholder',
        endpointName: 'getTodo',
        config: testConfigPath,
        variables: { todo_id: '1' },
        verbose: true,
      });

      // Check that verbose output contains request details
      expect(stderrOutput).toContain('[REQUEST] GET https://jsonplaceholder.typicode.com/todos/1');
      expect(stderrOutput).toContain('[REQUEST] Headers:');
      expect(stderrOutput).toContain('X-API-Key: dev-key-123');
      expect(stderrOutput).toContain('User-Agent: HttpCraft/1.0');
      
      // Check response details
      expect(stderrOutput).toMatch(/\[RESPONSE\] 200 OK \(\d+ms\)/);
      expect(stderrOutput).toContain('[RESPONSE] Headers:');
    });

    it('should display request body in verbose mode for POST requests', async () => {
      await handleApiCommand({
        apiName: 'jsonplaceholder',
        endpointName: 'postTodo',
        config: testConfigPostPath,
        variables: { 
          title: 'Test Todo',
          description: 'This is a test todo item',
          user_id: '1'
        },
        verbose: true,
      });

      expect(stderrOutput).toContain('[REQUEST] POST https://jsonplaceholder.typicode.com/todos');
      expect(stderrOutput).toContain('[REQUEST] Body:');
      expect(stderrOutput).toContain('"title": "Test Todo"');
      expect(stderrOutput).toContain('"body": "This is a test todo item"');
      expect(stderrOutput).toContain('"userId": "1"');
    });
  });

  describe('Dry Run', () => {
    it('should display request details without making actual HTTP request', async () => {
      await handleApiCommand({
        apiName: 'jsonplaceholder',
        endpointName: 'getTodo',
        config: testConfigPath,
        variables: { todo_id: '1' },
        dryRun: true,
      });

      expect(stderrOutput).toContain('[DRY RUN] GET https://jsonplaceholder.typicode.com/todos/1');
      expect(stderrOutput).toContain('[DRY RUN] Headers:');
      expect(stderrOutput).toContain('X-API-Key: dev-key-123');
      expect(stderrOutput).toContain('User-Agent: HttpCraft/1.0');
      
      // Should not contain response details since no request was made
      expect(stderrOutput).not.toContain('[RESPONSE]');
    });

    it('should work with profiles in dry-run mode', async () => {
      await handleApiCommand({
        apiName: 'jsonplaceholder',
        endpointName: 'getTodo',
        config: testConfigPath,
        profiles: ['production'],
        variables: { todo_id: '42' },
        dryRun: true,
      });

      expect(stderrOutput).toContain('[DRY RUN] GET https://api.production.com/todos/42');
      expect(stderrOutput).toContain('X-API-Key: prod-key-456');
    });

    it('should handle unresolved variables gracefully in dry-run mode', async () => {
      await handleApiCommand({
        apiName: 'jsonplaceholder',
        endpointName: 'getTodo',
        config: testConfigPath,
        // Note: not providing todo_id variable
        dryRun: true,
      });

      expect(stderrOutput).toContain('[DRY RUN] Warning: Variable \'todo_id\' could not be resolved');
      expect(stderrOutput).toContain('[DRY RUN] GET {{base_url}}/todos/{{todo_id}}');
      expect(stderrOutput).toContain('X-API-Key: {{api_key}}');
    });
  });

  describe('Exit on HTTP Error', () => {
    it('should handle 404 errors correctly with exit-on-http-error', async () => {
      let exitCalled = false;
      const originalExit = process.exit;
      process.exit = ((code: number) => {
        exitCalled = true;
        expect(code).toBe(1);
        throw new Error('process.exit called');
      }) as any;

      try {
        await expect(handleApiCommand({
          apiName: 'jsonplaceholder',
          endpointName: 'getTodo',
          config: testConfigPath,
          variables: { todo_id: '999999' }, // Should return 404
          exitOnHttpError: '4xx',
        })).rejects.toThrow('process.exit called');

        expect(exitCalled).toBe(true);
        expect(stderrOutput).toContain('HTTP 404');
      } finally {
        process.exit = originalExit;
      }
    });

    it('should not exit for 404 when pattern does not match', async () => {
      let exitCalled = false;
      const originalExit = process.exit;
      process.exit = ((code: number) => {
        exitCalled = true;
        throw new Error('process.exit called');
      }) as any;

      try {
        await handleApiCommand({
          apiName: 'jsonplaceholder',
          endpointName: 'getTodo',
          config: testConfigPath,
          variables: { todo_id: '999999' }, // Should return 404
          exitOnHttpError: '5xx', // Won't match 404
        });

        expect(exitCalled).toBe(false);
      } finally {
        process.exit = originalExit;
      }
    });
  });

  describe('Combined Features', () => {
    it('should work with verbose and dry-run together', async () => {
      await handleApiCommand({
        apiName: 'jsonplaceholder',
        endpointName: 'postTodo',
        config: testConfigPostPath,
        variables: { 
          title: 'Combined Test',
          description: 'Testing combined features',
          user_id: '1'
        },
        verbose: true,
        dryRun: true,
      });

      // Should show dry-run output (verbose is ignored in dry-run)
      expect(stderrOutput).toContain('[DRY RUN] POST https://jsonplaceholder.typicode.com/todos');
      expect(stderrOutput).toContain('[DRY RUN] Headers:');
      expect(stderrOutput).toContain('[DRY RUN] Body:');
      expect(stderrOutput).toContain('"title": "Combined Test"');
      
      // Should not contain response details
      expect(stderrOutput).not.toContain('[RESPONSE]');
    });

    it('should handle variable resolution correctly in verbose mode', async () => {
      await handleApiCommand({
        apiName: 'jsonplaceholder',
        endpointName: 'getTodo',
        config: testConfigPath,
        profiles: ['production'],
        variables: { todo_id: '5' },
        verbose: true,
        dryRun: true,
      });

      // Should show resolved values from production profile
      expect(stderrOutput).toContain('[DRY RUN] GET https://api.production.com/todos/5');
      expect(stderrOutput).toContain('X-API-Key: prod-key-456');
    });
  });
}); 