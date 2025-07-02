/**
 * CLI commands for cache management
 */

import { cacheManager } from '../../core/cacheManager.js';

export interface CacheListArgs {
  namespace?: string;
  config?: string;
}

export interface CacheGetArgs {
  key: string;
  namespace?: string;
  config?: string;
}

export interface CacheDeleteArgs {
  key: string;
  namespace?: string;
  config?: string;
}

export interface CacheClearArgs {
  namespace?: string;
  config?: string;
}

export interface CacheStatsArgs {
  config?: string;
}

/**
 * List cache contents
 */
export async function handleCacheListCommand(args: CacheListArgs): Promise<void> {
  try {
    if (args.namespace) {
      // List contents of specific namespace
      const keys = await cacheManager.keys(args.namespace);
      if (keys.length === 0) {
        console.log(`No items found in namespace '${args.namespace}'`);
        return;
      }

      console.log(`Cache contents for namespace '${args.namespace}':`);
      for (const key of keys) {
        const value = await cacheManager.get(args.namespace, key);
        console.log(`  ${key}: ${JSON.stringify(value)}`);
      }
    } else {
      // List all namespaces and their sizes
      const namespaces = await cacheManager.getNamespaces();
      if (namespaces.length === 0) {
        console.log('No cache namespaces found');
        return;
      }

      console.log('Cache namespaces:');
      for (const namespace of namespaces) {
        const size = await cacheManager.size(namespace);
        console.log(`  ${namespace}: ${size} items`);
      }
    }
  } catch (error) {
    console.error('Error listing cache:', error);
    process.exit(1);
  }
}

/**
 * Get specific cache value
 */
export async function handleCacheGetCommand(args: CacheGetArgs): Promise<void> {
  try {
    const namespace = args.namespace || 'default';
    const value = await cacheManager.get(namespace, args.key);
    
    if (value === undefined) {
      console.log(`Key '${args.key}' not found in namespace '${namespace}'`);
      process.exit(1);
    }

    console.log(JSON.stringify(value, null, 2));
  } catch (error) {
    console.error('Error getting cache value:', error);
    process.exit(1);
  }
}

/**
 * Delete specific cache key
 */
export async function handleCacheDeleteCommand(args: CacheDeleteArgs): Promise<void> {
  try {
    const namespace = args.namespace || 'default';
    const deleted = await cacheManager.delete(namespace, args.key);
    
    if (deleted) {
      console.log(`Deleted key '${args.key}' from namespace '${namespace}'`);
    } else {
      console.log(`Key '${args.key}' not found in namespace '${namespace}'`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error deleting cache key:', error);
    process.exit(1);
  }
}

/**
 * Clear cache namespace or all caches
 */
export async function handleCacheClearCommand(args: CacheClearArgs): Promise<void> {
  try {
    if (args.namespace) {
      // Clear specific namespace
      await cacheManager.clear(args.namespace);
      console.log(`Cleared cache namespace '${args.namespace}'`);
    } else {
      // Clear all caches
      await cacheManager.clearAll();
      console.log('Cleared all cache namespaces');
    }
  } catch (error) {
    console.error('Error clearing cache:', error);
    process.exit(1);
  }
}

/**
 * Show cache statistics
 */
export async function handleCacheStatsCommand(args: CacheStatsArgs): Promise<void> {
  try {
    const stats = await cacheManager.getStats();
    
    console.log('Cache Statistics:');
    console.log(`  Total namespaces: ${stats.namespaces}`);
    console.log(`  Total items: ${stats.totalItems}`);
    console.log(`  Total size: ${formatBytes(stats.totalSize)}`);
    console.log('');
    
    if (stats.namespaceStats.length > 0) {
      console.log('Namespace breakdown:');
      for (const ns of stats.namespaceStats) {
        console.log(`  ${ns.namespace}: ${ns.items} items (${formatBytes(ns.size)})`);
      }
    }
  } catch (error) {
    console.error('Error getting cache stats:', error);
    process.exit(1);
  }
}

/**
 * Format bytes into human readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
