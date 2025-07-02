/**
 * Global Cache Manager for HttpCraft
 * Provides file-based persistent caching with TTL support and plugin namespacing
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { clearInterval, setInterval } from 'timers';

export interface CacheItem<T = unknown> {
  value: T;
  expiresAt?: number; // Timestamp when the item expires, undefined for no expiry
  createdAt: number;  // Timestamp when the item was created
}

export interface CacheConfig {
  baseDir?: string;      // Base directory for cache files (default: ~/.httpcraft/cache)
  defaultTtl?: number;   // Default TTL in milliseconds (default: 1 hour)
  maxSize?: number;      // Maximum cache size per namespace (default: 1000 items)
  cleanupInterval?: number; // Cleanup interval in milliseconds (default: 5 minutes)
}

export interface PluginCacheInterface {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T, ttl?: number): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  size(): Promise<number>;
}

interface CacheFileData {
  [key: string]: CacheItem;
}

export class CacheManager {
  private static instance: CacheManager;
  private config: Required<CacheConfig>;
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private memoryCache = new Map<string, Map<string, CacheItem>>(); // namespace -> key -> item

  private constructor(config: CacheConfig = {}) {
    const defaultBaseDir = path.join(os.homedir(), '.httpcraft', 'cache');
    this.config = {
      baseDir: config.baseDir ?? defaultBaseDir,
      defaultTtl: config.defaultTtl ?? 60 * 60 * 1000, // 1 hour
      maxSize: config.maxSize ?? 1000,
      cleanupInterval: config.cleanupInterval ?? 5 * 60 * 1000, // 5 minutes
    };

    this.startCleanupTimer();
  }

  public static getInstance(config?: CacheConfig): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager(config);
    } else if (config) {
      // Reconfigure existing instance
      CacheManager.instance.reconfigure(config);
    }
    return CacheManager.instance;
  }

  /**
   * Reconfigure the cache manager with new settings
   */
  public reconfigure(config: CacheConfig): void {
    const defaultBaseDir = path.join(os.homedir(), '.httpcraft', 'cache');
    this.config = {
      baseDir: config.baseDir ?? defaultBaseDir,
      defaultTtl: config.defaultTtl ?? 60 * 60 * 1000, // 1 hour
      maxSize: config.maxSize ?? 1000,
      cleanupInterval: config.cleanupInterval ?? 5 * 60 * 1000, // 5 minutes
    };

    // Restart cleanup timer with new interval
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.startCleanupTimer();
  }

  /**
   * Get cache interface for a specific plugin namespace
   */
  public getPluginCache(pluginName: string): PluginCacheInterface {
    return {
      get: <T = unknown>(key: string) => this.get<T>(pluginName, key),
      set: <T = unknown>(key: string, value: T, ttl?: number) => this.set(pluginName, key, value, ttl),
      has: (key: string) => this.has(pluginName, key),
      delete: (key: string) => this.delete(pluginName, key),
      clear: () => this.clear(pluginName),
      keys: () => this.keys(pluginName),
      size: () => this.size(pluginName),
    };
  }

  /**
   * Get a value from cache
   */
  public async get<T = unknown>(namespace: string, key: string): Promise<T | undefined> {
    await this.ensureNamespaceLoaded(namespace);
    
    const namespaceCache = this.memoryCache.get(namespace);
    if (!namespaceCache) {
      return undefined;
    }

    const item = namespaceCache.get(key);
    if (!item) {
      return undefined;
    }

    // Check if item has expired
    if (item.expiresAt && Date.now() > item.expiresAt) {
      await this.delete(namespace, key);
      return undefined;
    }

    return item.value as T;
  }

  /**
   * Set a value in cache
   */
  public async set<T = unknown>(namespace: string, key: string, value: T, ttl?: number): Promise<void> {
    await this.ensureNamespaceLoaded(namespace);
    
    let namespaceCache = this.memoryCache.get(namespace);
    if (!namespaceCache) {
      namespaceCache = new Map();
      this.memoryCache.set(namespace, namespaceCache);
    }

    // Check cache size limit
    if (namespaceCache.size >= this.config.maxSize && !namespaceCache.has(key)) {
      // Remove oldest item to make space
      const firstKey = namespaceCache.keys().next().value;
      if (firstKey) {
        namespaceCache.delete(firstKey);
      }
    }

    const effectiveTtl = ttl ?? this.config.defaultTtl;
    const expiresAt = effectiveTtl ? Date.now() + effectiveTtl : undefined;
    const item: CacheItem<T> = {
      value,
      expiresAt,
      createdAt: Date.now(),
    };

    namespaceCache.set(key, item);
    await this.persistNamespace(namespace);
  }

  /**
   * Check if a key exists in cache
   */
  public async has(namespace: string, key: string): Promise<boolean> {
    const value = await this.get(namespace, key);
    return value !== undefined;
  }

  /**
   * Delete a key from cache
   */
  public async delete(namespace: string, key: string): Promise<boolean> {
    await this.ensureNamespaceLoaded(namespace);
    
    const namespaceCache = this.memoryCache.get(namespace);
    if (!namespaceCache) {
      return false;
    }

    const existed = namespaceCache.delete(key);
    if (existed) {
      await this.persistNamespace(namespace);
    }
    return existed;
  }

  /**
   * Clear all keys in a namespace
   */
  public async clear(namespace: string): Promise<void> {
    const namespaceCache = this.memoryCache.get(namespace);
    if (namespaceCache) {
      namespaceCache.clear();
      await this.persistNamespace(namespace);
    }

    // Also remove the file if it exists
    const filePath = this.getNamespaceFilePath(namespace);
    try {
      await fs.unlink(filePath);
    } catch {
      // File doesn't exist, which is fine
    }
  }

  /**
   * Get all keys in a namespace
   */
  public async keys(namespace: string): Promise<string[]> {
    await this.ensureNamespaceLoaded(namespace);
    
    const namespaceCache = this.memoryCache.get(namespace);
    if (!namespaceCache) {
      return [];
    }

    // Filter out expired keys
    const validKeys: string[] = [];
    const now = Date.now();
    
    for (const [key, item] of namespaceCache.entries()) {
      if (!item.expiresAt || now <= item.expiresAt) {
        validKeys.push(key);
      }
    }

    return validKeys;
  }

  /**
   * Get number of items in a namespace
   */
  public async size(namespace: string): Promise<number> {
    const keys = await this.keys(namespace);
    return keys.length;
  }

  /**
   * Get all namespaces
   */
  public async getNamespaces(): Promise<string[]> {
    try {
      await this.ensureCacheDirectoryExists();
      const files = await fs.readdir(this.config.baseDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.slice(0, -5)); // Remove .json extension
    } catch {
      return [];
    }
  }

  /**
   * Clear all caches (useful for testing and management)
   */
  public async clearAll(): Promise<void> {
    this.memoryCache.clear();
    
    try {
      await fs.rm(this.config.baseDir, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist, which is fine
    }
  }

  /**
   * Get cache statistics
   */
  public async getStats(): Promise<{
    namespaces: number;
    totalItems: number;
    totalSize: number;
    namespaceStats: Array<{
      namespace: string;
      items: number;
      size: number;
    }>;
  }> {
    const namespaces = await this.getNamespaces();
    const namespaceStats = [];
    let totalItems = 0;
    let totalSize = 0;

    for (const namespace of namespaces) {
      const keys = await this.keys(namespace);
      const items = keys.length;
      
      // Calculate approximate size by loading the file
      let size = 0;
      try {
        const filePath = this.getNamespaceFilePath(namespace);
        const stats = await fs.stat(filePath);
        size = stats.size;
      } catch {
        // File doesn't exist
      }

      namespaceStats.push({ namespace, items, size });
      totalItems += items;
      totalSize += size;
    }

    return {
      namespaces: namespaces.length,
      totalItems,
      totalSize,
      namespaceStats,
    };
  }

  /**
   * Cleanup expired items across all namespaces
   */
  public async cleanup(): Promise<void> {
    const namespaces = await this.getNamespaces();
    
    for (const namespace of namespaces) {
      await this.ensureNamespaceLoaded(namespace);
      const namespaceCache = this.memoryCache.get(namespace);
      
      if (namespaceCache) {
        const now = Date.now();
        let hasChanges = false;
        
        for (const [key, item] of namespaceCache.entries()) {
          if (item.expiresAt && now > item.expiresAt) {
            namespaceCache.delete(key);
            hasChanges = true;
          }
        }
        
        if (hasChanges) {
          await this.persistNamespace(namespace);
        }
      }
    }
  }

  /**
   * Stop the cache manager and cleanup resources
   */
  public stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Clear the singleton instance (for testing)
   */
  public static clearInstance(): void {
    if (CacheManager.instance) {
      CacheManager.instance.stop();
      CacheManager.instance = undefined as any;
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(error => {
        console.error('Cache cleanup error:', error);
      });
    }, this.config.cleanupInterval);

    // Don't keep the process alive just for cleanup
    this.cleanupTimer.unref();
  }

  private async ensureCacheDirectoryExists(): Promise<void> {
    try {
      await fs.mkdir(this.config.baseDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create cache directory: ${error}`);
    }
  }

  private getNamespaceFilePath(namespace: string): string {
    return path.join(this.config.baseDir, `${namespace}.json`);
  }

  private async ensureNamespaceLoaded(namespace: string): Promise<void> {
    if (this.memoryCache.has(namespace)) {
      return;
    }

    await this.loadNamespace(namespace);
  }

  private async loadNamespace(namespace: string): Promise<void> {
    const filePath = this.getNamespaceFilePath(namespace);
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const cacheData: CacheFileData = JSON.parse(data);
      
      const namespaceCache = new Map<string, CacheItem>();
      const now = Date.now();
      
      // Filter out expired items during load
      for (const [key, item] of Object.entries(cacheData)) {
        if (!item.expiresAt || now <= item.expiresAt) {
          namespaceCache.set(key, item);
        }
      }
      
      this.memoryCache.set(namespace, namespaceCache);
    } catch {
      // File doesn't exist or is corrupted, start with empty cache
      this.memoryCache.set(namespace, new Map());
    }
  }

  private async persistNamespace(namespace: string): Promise<void> {
    await this.ensureCacheDirectoryExists();
    
    const namespaceCache = this.memoryCache.get(namespace);
    if (!namespaceCache) {
      return;
    }

    const cacheData: CacheFileData = {};
    for (const [key, item] of namespaceCache.entries()) {
      cacheData[key] = item;
    }

    const filePath = this.getNamespaceFilePath(namespace);
    await fs.writeFile(filePath, JSON.stringify(cacheData, null, 2), 'utf-8');
  }
}

// Export singleton instance
export const cacheManager = CacheManager.getInstance();
