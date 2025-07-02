/**
 * Simple test for CacheManager
 */

import { describe, it, expect } from 'vitest';
import { CacheManager } from '../../src/core/cacheManager.js';

describe('CacheManager Simple', () => {
  it('should instantiate correctly', () => {
    const instance = CacheManager.getInstance();
    expect(instance).toBeDefined();
  });
});
