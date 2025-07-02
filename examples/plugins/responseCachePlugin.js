/**
 * Example Cache-Enabled Plugin for HttpCraft
 * Demonstrates using the cache interface for storing API responses and computed values
 */

export default {
  async setup(context) {
    // Cache API responses for performance
    context.registerPreRequestHook(async (request) => {
      // Create a cache key based on the request
      const cacheKey = `response:${request.method}:${request.url}`;
      
      // Check if we have a cached response (cache for 5 minutes)
      const cachedResponse = await context.cache.get(cacheKey);
      if (cachedResponse && context.config.enableResponseCache) {
        console.log(`[Cache] Using cached response for ${request.url}`);
        // Note: In a real plugin, you'd need to handle this differently
        // as pre-request hooks can't return responses directly
        request.headers['X-Cache-Status'] = 'HIT';
      } else {
        request.headers['X-Cache-Status'] = 'MISS';
      }
    });

    // Cache responses after they're received
    context.registerPostResponseHook(async (request, response) => {
      if (context.config.enableResponseCache && response.status < 400) {
        const cacheKey = `response:${request.method}:${request.url}`;
        const ttl = context.config.cacheTtl || 5 * 60 * 1000; // 5 minutes default
        
        await context.cache.set(cacheKey, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          body: response.body,
          cachedAt: new Date().toISOString()
        }, ttl);
        
        console.log(`[Cache] Cached response for ${request.url}`);
      }
    });

    // Provide cached data access through variables
    context.registerVariableSource('cacheStats', async () => {
      const size = await context.cache.size();
      return `${size} items`;
    });

    // Parameterized function to get specific cached values
    context.registerParameterizedVariableSource('getCached', async (key, defaultValue = '') => {
      const value = await context.cache.get(key);
      return value !== undefined ? JSON.stringify(value) : defaultValue;
    });

    // Example: Cache expensive computations
    context.registerParameterizedVariableSource('computeHash', async (input) => {
      const cacheKey = `hash:${input}`;
      
      // Check cache first
      let hash = await context.cache.get(cacheKey);
      if (hash) {
        console.log(`[Cache] Using cached hash for "${input}"`);
        return hash;
      }
      
      // Simulate expensive computation
      console.log(`[Cache] Computing hash for "${input}"`);
      const crypto = await import('crypto');
      hash = crypto.createHash('sha256').update(input).digest('hex');
      
      // Cache the result for 1 hour
      await context.cache.set(cacheKey, hash, 60 * 60 * 1000);
      
      return hash;
    });

    // Example: Cache user sessions/tokens
    context.registerParameterizedVariableSource('getUserToken', async (userId) => {
      const cacheKey = `token:${userId}`;
      
      let token = await context.cache.get(cacheKey);
      if (token) {
        console.log(`[Cache] Using cached token for user ${userId}`);
        return token;
      }
      
      // Simulate token generation/retrieval
      console.log(`[Cache] Generating new token for user ${userId}`);
      token = `token_${userId}_${Date.now()}`;
      
      // Cache token for 30 minutes
      await context.cache.set(cacheKey, token, 30 * 60 * 1000);
      
      return token;
    });

    // Cache management functions
    context.registerParameterizedVariableSource('clearCache', async (pattern = '') => {
      if (pattern) {
        // Clear specific cache keys matching pattern
        const keys = await context.cache.keys();
        const matchingKeys = keys.filter(key => key.includes(pattern));
        
        for (const key of matchingKeys) {
          await context.cache.delete(key);
        }
        
        return `Cleared ${matchingKeys.length} cache entries matching "${pattern}"`;
      } else {
        // Clear all cache for this plugin
        await context.cache.clear();
        return 'Cleared all cache entries for this plugin';
      }
    });

    // Example: Rate limiting using cache
    context.registerPreRequestHook(async (request) => {
      if (context.config.enableRateLimit) {
        const rateLimitKey = `ratelimit:${request.url}`;
        const requestCount = await context.cache.get(rateLimitKey) || 0;
        const maxRequests = context.config.maxRequestsPerMinute || 60;
        
        if (requestCount >= maxRequests) {
          throw new Error(`Rate limit exceeded for ${request.url}. Max ${maxRequests} requests per minute.`);
        }
        
        // Increment counter with 1-minute TTL
        await context.cache.set(rateLimitKey, requestCount + 1, 60 * 1000);
        
        request.headers['X-Rate-Limit-Count'] = (requestCount + 1).toString();
        request.headers['X-Rate-Limit-Max'] = maxRequests.toString();
      }
    });

    console.log('[Cache Plugin] Initialized with caching capabilities');
  }
};
