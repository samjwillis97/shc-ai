/**
 * Unit tests for CacheManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { setTimeout } from 'timers';
import { CacheManager } from '../../src/core/cacheManager.js';

// Helper function for delays in tests
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

describe('CacheManager', () => {
  let tempDir: string;
  let cacheManager: CacheManager;

  beforeEach(async () => {
    // Create a temporary directory for cache files
    tempDir = path.join(os.tmpdir(), 'httpcraft-cache-test-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });

    // Create cache manager with test configuration
    cacheManager = CacheManager.getInstance({
      baseDir: tempDir,
      defaultTtl: 1000, // 1 second for quick expiry tests
      maxSize: 5, // Small size for testing limits
      cleanupInterval: 100, // Quick cleanup for tests
    });
  });

  afterEach(async () => {
    // Stop the cache manager and clean up
    cacheManager.stop();
    CacheManager.clearInstance(); // Clear singleton for proper test isolation
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Basic Operations', () => {
    it('should set and get values', async () => {
      await cacheManager.set('test-namespace', 'key1', 'value1');
      const value = await cacheManager.get('test-namespace', 'key1');
      expect(value).toBe('value1');
    });

    it('should return undefined for non-existent keys', async () => {
      const value = await cacheManager.get('test-namespace', 'non-existent');
      expect(value).toBeUndefined();
    });

    it('should check if keys exist', async () => {
      await cacheManager.set('test-namespace', 'key1', 'value1');
      expect(await cacheManager.has('test-namespace', 'key1')).toBe(true);
      expect(await cacheManager.has('test-namespace', 'non-existent')).toBe(false);
    });

    it('should delete keys', async () => {
      await cacheManager.set('test-namespace', 'key1', 'value1');
      expect(await cacheManager.delete('test-namespace', 'key1')).toBe(true);
      expect(await cacheManager.get('test-namespace', 'key1')).toBeUndefined();
      expect(await cacheManager.delete('test-namespace', 'non-existent')).toBe(false);
    });

    it('should clear namespaces', async () => {
      await cacheManager.set('test-namespace', 'key1', 'value1');
      await cacheManager.set('test-namespace', 'key2', 'value2');
      await cacheManager.clear('test-namespace');
      expect(await cacheManager.get('test-namespace', 'key1')).toBeUndefined();
      expect(await cacheManager.get('test-namespace', 'key2')).toBeUndefined();
    });

    it('should get keys in a namespace', async () => {
      await cacheManager.set('test-namespace', 'key1', 'value1');
      await cacheManager.set('test-namespace', 'key2', 'value2');
      const keys = await cacheManager.keys('test-namespace');
      expect(keys).toEqual(expect.arrayContaining(['key1', 'key2']));
      expect(keys).toHaveLength(2);
    });

    it('should get namespace size', async () => {
      await cacheManager.set('test-namespace', 'key1', 'value1');
      await cacheManager.set('test-namespace', 'key2', 'value2');
      const size = await cacheManager.size('test-namespace');
      expect(size).toBe(2);
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should respect custom TTL', async () => {
      await cacheManager.set('test-namespace', 'key1', 'value1', 100); // 100ms TTL
      expect(await cacheManager.get('test-namespace', 'key1')).toBe('value1');
      
      // Wait for expiry
      await delay(150);
      expect(await cacheManager.get('test-namespace', 'key1')).toBeUndefined();
    });

    it('should use default TTL when none specified', async () => {
      await cacheManager.set('test-namespace', 'key1', 'value1'); // Uses default 1 second TTL
      expect(await cacheManager.get('test-namespace', 'key1')).toBe('value1');
      
      // Wait for expiry
      await delay(1100);
      expect(await cacheManager.get('test-namespace', 'key1')).toBeUndefined();
    });

    it('should exclude expired keys from keys() method', async () => {
      await cacheManager.set('test-namespace', 'key1', 'value1', 100); // 100ms TTL
      await cacheManager.set('test-namespace', 'key2', 'value2'); // Default TTL
      
      expect((await cacheManager.keys('test-namespace')).length).toBe(2);
      
      // Wait for first key to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      const keys = await cacheManager.keys('test-namespace');
      expect(keys).toEqual(['key2']);
    });
  });

  describe('Namespacing', () => {
    it('should isolate namespaces', async () => {
      await cacheManager.set('namespace1', 'key1', 'value1');
      await cacheManager.set('namespace2', 'key1', 'value2');
      
      expect(await cacheManager.get('namespace1', 'key1')).toBe('value1');
      expect(await cacheManager.get('namespace2', 'key1')).toBe('value2');
    });

    it('should list all namespaces', async () => {
      await cacheManager.set('namespace1', 'key1', 'value1');
      await cacheManager.set('namespace2', 'key1', 'value2');
      
      const namespaces = await cacheManager.getNamespaces();
      expect(namespaces).toEqual(expect.arrayContaining(['namespace1', 'namespace2']));
    });

    it('should clear specific namespaces only', async () => {
      await cacheManager.set('namespace1', 'key1', 'value1');
      await cacheManager.set('namespace2', 'key1', 'value2');
      
      await cacheManager.clear('namespace1');
      
      expect(await cacheManager.get('namespace1', 'key1')).toBeUndefined();
      expect(await cacheManager.get('namespace2', 'key1')).toBe('value2');
    });
  });

  describe('Size Limits', () => {
    it('should enforce max size per namespace', async () => {
      // Fill up to max size (5 items)
      for (let i = 0; i < 5; i++) {
        await cacheManager.set('test-namespace', `key${i}`, `value${i}`);
      }
      
      // Add one more to trigger eviction
      await cacheManager.set('test-namespace', 'key5', 'value5');
      
      const size = await cacheManager.size('test-namespace');
      expect(size).toBe(5); // Should still be at max size
      
      // The first key should be evicted
      expect(await cacheManager.get('test-namespace', 'key0')).toBeUndefined();
      expect(await cacheManager.get('test-namespace', 'key5')).toBe('value5');
    });

    it('should not evict when updating existing keys', async () => {
      // Fill up to max size
      for (let i = 0; i < 5; i++) {
        await cacheManager.set('test-namespace', `key${i}`, `value${i}`);
      }
      
      // Update existing key (should not trigger eviction)
      await cacheManager.set('test-namespace', 'key0', 'updated-value');
      
      const size = await cacheManager.size('test-namespace');
      expect(size).toBe(5);
      expect(await cacheManager.get('test-namespace', 'key0')).toBe('updated-value');
    });
  });

  describe('Persistence', () => {
    it('should persist data to files', async () => {
      await cacheManager.set('test-namespace', 'key1', 'value1');
      
      // Check that file was created
      const filePath = path.join(tempDir, 'test-namespace.json');
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
      
      // Check file contents
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(fileContent);
      expect(data.key1.value).toBe('value1');
    });

    it('should load data from files on startup', async () => {
      // Manually create a cache file
      const filePath = path.join(tempDir, 'test-namespace.json');
      const cacheData = {
        key1: {
          value: 'persisted-value',
          createdAt: Date.now(),
        },
      };
      await fs.writeFile(filePath, JSON.stringify(cacheData, null, 2));
      
      // Access the key (which should trigger loading from file)
      const value = await cacheManager.get('test-namespace', 'key1');
      expect(value).toBe('persisted-value');
    });

    it('should handle corrupted cache files gracefully', async () => {
      // Create a corrupted cache file
      const filePath = path.join(tempDir, 'test-namespace.json');
      await fs.writeFile(filePath, 'invalid json content');
      
      // Should start with empty cache instead of crashing
      const value = await cacheManager.get('test-namespace', 'key1');
      expect(value).toBeUndefined();
      
      // Should be able to add new items
      await cacheManager.set('test-namespace', 'key1', 'value1');
      expect(await cacheManager.get('test-namespace', 'key1')).toBe('value1');
    });
  });

  describe('Plugin Cache Interface', () => {
    it('should provide namespaced cache interface for plugins', async () => {
      const pluginCache = cacheManager.getPluginCache('my-plugin');
      
      await pluginCache.set('key1', 'value1');
      expect(await pluginCache.get('key1')).toBe('value1');
      expect(await pluginCache.has('key1')).toBe(true);
      
      const keys = await pluginCache.keys();
      expect(keys).toContain('key1');
      
      expect(await pluginCache.size()).toBe(1);
      
      expect(await pluginCache.delete('key1')).toBe(true);
      expect(await pluginCache.get('key1')).toBeUndefined();
    });

    it('should isolate plugin namespaces', async () => {
      const plugin1Cache = cacheManager.getPluginCache('plugin1');
      const plugin2Cache = cacheManager.getPluginCache('plugin2');
      
      await plugin1Cache.set('key1', 'value1');
      await plugin2Cache.set('key1', 'value2');
      
      expect(await plugin1Cache.get('key1')).toBe('value1');
      expect(await plugin2Cache.get('key1')).toBe('value2');
    });

    it('should support TTL in plugin interface', async () => {
      const pluginCache = cacheManager.getPluginCache('my-plugin');
      
      await pluginCache.set('key1', 'value1', 100); // 100ms TTL
      expect(await pluginCache.get('key1')).toBe('value1');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(await pluginCache.get('key1')).toBeUndefined();
    });
  });

  describe('Statistics', () => {
    it('should provide cache statistics', async () => {
      await cacheManager.set('namespace1', 'key1', 'value1');
      await cacheManager.set('namespace2', 'key1', 'value2');
      
      const stats = await cacheManager.getStats();
      expect(stats.namespaces).toBe(2);
      expect(stats.totalItems).toBe(2);
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.namespaceStats).toHaveLength(2);
      
      const ns1Stats = stats.namespaceStats.find(ns => ns.namespace === 'namespace1');
      expect(ns1Stats?.items).toBe(1);
    });
  });

  describe('Cleanup', () => {
    it('should clean up expired items', async () => {
      await cacheManager.set('test-namespace', 'key1', 'value1', 50); // 50ms TTL
      await cacheManager.set('test-namespace', 'key2', 'value2'); // Default TTL
      
      // Wait for first key to expire
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Trigger cleanup
      await cacheManager.cleanup();
      
      const keys = await cacheManager.keys('test-namespace');
      expect(keys).toEqual(['key2']);
    });

    it('should clear all caches', async () => {
      await cacheManager.set('namespace1', 'key1', 'value1');
      await cacheManager.set('namespace2', 'key1', 'value2');
      
      await cacheManager.clearAll();
      
      expect(await cacheManager.get('namespace1', 'key1')).toBeUndefined();
      expect(await cacheManager.get('namespace2', 'key1')).toBeUndefined();
      
      const namespaces = await cacheManager.getNamespaces();
      expect(namespaces).toHaveLength(0);
    });
  });

  describe('Complex Data Types', () => {
    it('should handle objects and arrays', async () => {
      const objectValue = { name: 'test', count: 42, enabled: true };
      const arrayValue = [1, 2, 3, { nested: 'value' }];
      
      await cacheManager.set('test-namespace', 'object', objectValue);
      await cacheManager.set('test-namespace', 'array', arrayValue);
      
      expect(await cacheManager.get('test-namespace', 'object')).toEqual(objectValue);
      expect(await cacheManager.get('test-namespace', 'array')).toEqual(arrayValue);
    });

    it('should handle null and undefined values', async () => {
      await cacheManager.set('test-namespace', 'null-value', null);
      await cacheManager.set('test-namespace', 'undefined-value', undefined);
      
      expect(await cacheManager.get('test-namespace', 'null-value')).toBeNull();
      expect(await cacheManager.get('test-namespace', 'undefined-value')).toBeUndefined();
    });
  });
});
