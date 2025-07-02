/**
 * Minimal test without setup
 */

import { describe, it, expect } from 'vitest';

describe('Minimal Test', () => {
  it('should work', () => {
    expect(1 + 1).toBe(2);
  });

  it('should import CacheManager', async () => {
    const { CacheManager } = await import('../../src/core/cacheManager.js');
    expect(CacheManager).toBeDefined();
  });
});
