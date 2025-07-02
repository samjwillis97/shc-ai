/**
 * Unit tests for cache CLI commands
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { CacheManager } from '../../src/core/cacheManager.js';
import {
  handleCacheListCommand,
  handleCacheGetCommand,
  handleCacheDeleteCommand,
  handleCacheClearCommand,
  handleCacheStatsCommand,
} from '../../src/cli/commands/cache.js';

describe('Cache CLI Commands', () => {
  let tempDir: string;
  let cacheManager: CacheManager;
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let originalProcessExit: typeof process.exit;
  let logOutput: string[];
  let errorOutput: string[];
  let exitCode: number | undefined;

  beforeEach(async () => {
    // Create temporary directory for cache files
    tempDir = path.join(os.tmpdir(), 'httpcraft-cache-cli-test-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });

    // Configure cache manager
    cacheManager = CacheManager.getInstance({
      baseDir: tempDir,
      defaultTtl: 60000,
      maxSize: 1000,
      cleanupInterval: 300000,
    });

    // Mock console and process.exit
    logOutput = [];
    errorOutput = [];
    exitCode = undefined;

    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    originalProcessExit = process.exit;

    console.log = vi.fn((...args) => {
      logOutput.push(args.join(' '));
    });
    console.error = vi.fn((...args) => {
      errorOutput.push(args.join(' '));
    });
    process.exit = vi.fn((code?: number) => {
      exitCode = code;
      throw new Error(`process.exit called with code ${code}`);
    });
  });

  afterEach(async () => {
    // Restore original functions
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.exit = originalProcessExit;

    // Stop cache manager and cleanup
    cacheManager.stop();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('handleCacheListCommand', () => {
    it('should list all namespaces when no namespace specified', async () => {
      await cacheManager.set('plugin1', 'key1', 'value1');
      await cacheManager.set('plugin2', 'key2', 'value2');

      await handleCacheListCommand({});

      expect(logOutput[0]).toBe('Cache namespaces:');
      expect(logOutput[1]).toMatch(/plugin1: 1 items/);
      expect(logOutput[2]).toMatch(/plugin2: 1 items/);
    });

    it('should show message when no namespaces exist', async () => {
      await handleCacheListCommand({});

      expect(logOutput[0]).toBe('No cache namespaces found');
    });

    it('should list contents of specific namespace', async () => {
      await cacheManager.set('plugin1', 'key1', 'value1');
      await cacheManager.set('plugin1', 'key2', { data: 'complex' });

      await handleCacheListCommand({ namespace: 'plugin1' });

      expect(logOutput[0]).toBe("Cache contents for namespace 'plugin1':");
      expect(logOutput[1]).toBe('  key1: "value1"');
      expect(logOutput[2]).toBe('  key2: {"data":"complex"}');
    });

    it('should show message when namespace is empty', async () => {
      await handleCacheListCommand({ namespace: 'empty-namespace' });

      expect(logOutput[0]).toBe("No items found in namespace 'empty-namespace'");
    });
  });

  describe('handleCacheGetCommand', () => {
    it('should get value from default namespace', async () => {
      await cacheManager.set('default', 'key1', 'test-value');

      await handleCacheGetCommand({ key: 'key1' });

      expect(logOutput[0]).toBe('"test-value"');
    });

    it('should get value from specified namespace', async () => {
      await cacheManager.set('plugin1', 'key1', { complex: 'object' });

      await handleCacheGetCommand({ key: 'key1', namespace: 'plugin1' });

      expect(logOutput[0]).toBe('{\n  "complex": "object"\n}');
    });

    it('should exit with error when key not found', async () => {
      try {
        await handleCacheGetCommand({ key: 'non-existent', namespace: 'plugin1' });
      } catch (error) {
        // Expected due to process.exit mock
      }

      expect(logOutput[0]).toBe("Key 'non-existent' not found in namespace 'plugin1'");
      expect(exitCode).toBe(1);
    });
  });

  describe('handleCacheDeleteCommand', () => {
    it('should delete existing key', async () => {
      await cacheManager.set('default', 'key1', 'value1');

      await handleCacheDeleteCommand({ key: 'key1' });

      expect(logOutput[0]).toBe("Deleted key 'key1' from namespace 'default'");
      expect(await cacheManager.get('default', 'key1')).toBeUndefined();
    });

    it('should delete from specified namespace', async () => {
      await cacheManager.set('plugin1', 'key1', 'value1');

      await handleCacheDeleteCommand({ key: 'key1', namespace: 'plugin1' });

      expect(logOutput[0]).toBe("Deleted key 'key1' from namespace 'plugin1'");
    });

    it('should exit with error when key not found', async () => {
      try {
        await handleCacheDeleteCommand({ key: 'non-existent', namespace: 'plugin1' });
      } catch (error) {
        // Expected due to process.exit mock
      }

      expect(logOutput[0]).toBe("Key 'non-existent' not found in namespace 'plugin1'");
      expect(exitCode).toBe(1);
    });
  });

  describe('handleCacheClearCommand', () => {
    it('should clear specific namespace', async () => {
      await cacheManager.set('plugin1', 'key1', 'value1');
      await cacheManager.set('plugin1', 'key2', 'value2');
      await cacheManager.set('plugin2', 'key3', 'value3');

      await handleCacheClearCommand({ namespace: 'plugin1' });

      expect(logOutput[0]).toBe("Cleared cache namespace 'plugin1'");
      expect(await cacheManager.get('plugin1', 'key1')).toBeUndefined();
      expect(await cacheManager.get('plugin2', 'key3')).toBe('value3');
    });

    it('should clear all caches when no namespace specified', async () => {
      await cacheManager.set('plugin1', 'key1', 'value1');
      await cacheManager.set('plugin2', 'key2', 'value2');

      await handleCacheClearCommand({});

      expect(logOutput[0]).toBe('Cleared all cache namespaces');
      expect(await cacheManager.get('plugin1', 'key1')).toBeUndefined();
      expect(await cacheManager.get('plugin2', 'key2')).toBeUndefined();
    });
  });

  describe('handleCacheStatsCommand', () => {
    it('should show cache statistics', async () => {
      await cacheManager.set('plugin1', 'key1', 'value1');
      await cacheManager.set('plugin2', 'key2', 'value2');

      await handleCacheStatsCommand({});

      expect(logOutput[0]).toBe('Cache Statistics:');
      expect(logOutput[1]).toMatch(/Total namespaces: 2/);
      expect(logOutput[2]).toMatch(/Total items: 2/);
      expect(logOutput[3]).toMatch(/Total size: /);
      expect(logOutput[5]).toBe('Namespace breakdown:');
      expect(logOutput[6]).toMatch(/plugin1: 1 items/);
      expect(logOutput[7]).toMatch(/plugin2: 1 items/);
    });

    it('should show empty statistics when no caches exist', async () => {
      await handleCacheStatsCommand({});

      expect(logOutput[0]).toBe('Cache Statistics:');
      expect(logOutput[1]).toBe('  Total namespaces: 0');
      expect(logOutput[2]).toBe('  Total items: 0');
      expect(logOutput[3]).toBe('  Total size: 0 B');
    });
  });

  describe('Error Handling', () => {
    it('should handle cache list errors gracefully', async () => {
      // Mock an error in the cache manager
      const originalGetNamespaces = cacheManager.getNamespaces;
      cacheManager.getNamespaces = vi.fn().mockRejectedValue(new Error('Test error'));

      try {
        await handleCacheListCommand({});
      } catch (error) {
        // Expected due to process.exit mock
      }

      expect(errorOutput[0]).toMatch(/Error listing cache:/);
      expect(exitCode).toBe(1);

      // Restore original method
      cacheManager.getNamespaces = originalGetNamespaces;
    });

    it('should handle cache get errors gracefully', async () => {
      const originalGet = cacheManager.get;
      cacheManager.get = vi.fn().mockRejectedValue(new Error('Test error'));

      try {
        await handleCacheGetCommand({ key: 'key1' });
      } catch (error) {
        // Expected due to process.exit mock
      }

      expect(errorOutput[0]).toMatch(/Error getting cache value:/);
      expect(exitCode).toBe(1);

      // Restore original method
      cacheManager.get = originalGet;
    });

    it('should handle cache delete errors gracefully', async () => {
      const originalDelete = cacheManager.delete;
      cacheManager.delete = vi.fn().mockRejectedValue(new Error('Test error'));

      try {
        await handleCacheDeleteCommand({ key: 'key1' });
      } catch (error) {
        // Expected due to process.exit mock
      }

      expect(errorOutput[0]).toMatch(/Error deleting cache key:/);
      expect(exitCode).toBe(1);

      // Restore original method
      cacheManager.delete = originalDelete;
    });

    it('should handle cache clear errors gracefully', async () => {
      const originalClearAll = cacheManager.clearAll;
      cacheManager.clearAll = vi.fn().mockRejectedValue(new Error('Test error'));

      try {
        await handleCacheClearCommand({});
      } catch (error) {
        // Expected due to process.exit mock
      }

      expect(errorOutput[0]).toMatch(/Error clearing cache:/);
      expect(exitCode).toBe(1);

      // Restore original method
      cacheManager.clearAll = originalClearAll;
    });

    it('should handle cache stats errors gracefully', async () => {
      const originalGetStats = cacheManager.getStats;
      cacheManager.getStats = vi.fn().mockRejectedValue(new Error('Test error'));

      try {
        await handleCacheStatsCommand({});
      } catch (error) {
        // Expected due to process.exit mock
      }

      expect(errorOutput[0]).toMatch(/Error getting cache stats:/);
      expect(exitCode).toBe(1);

      // Restore original method
      cacheManager.getStats = originalGetStats;
    });
  });
});
