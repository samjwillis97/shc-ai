/**
 * Cache Plugin for HttpCraft
 * Demonstrates T10.15 parameterized function features:
 * - Parameterized variable sources
 * - Key-based cache retrieval
 * - Environment-specific cache handling
 */

// Simple in-memory cache for demonstration
const cache = new Map();

// Initialize some sample cache data
cache.set('dev-api-key', 'dev-api-key-12345');
cache.set('prod-api-key', 'prod-api-key-67890');
cache.set('dev-base-url', 'https://api-dev.example.com');
cache.set('prod-base-url', 'https://api.example.com');
cache.set('user-token-alice', 'alice-token-abcdef');
cache.set('user-token-bob', 'bob-token-123456');

export default {
  async setup(context) {
    // Register parameterized functions for cache access
    context.registerParameterizedVariableSource('get', (key, environment = 'dev') => {
      const cacheKey = `${environment}-${key}`;
      const value = cache.get(cacheKey);
      
      if (value === undefined) {
        throw new Error(`Cache key '${cacheKey}' not found`);
      }
      
      return value;
    });
    
    context.registerParameterizedVariableSource('getToken', (username, tokenType = 'user') => {
      const cacheKey = `${tokenType}-token-${username}`;
      const value = cache.get(cacheKey);
      
      if (value === undefined) {
        throw new Error(`Token for '${username}' with type '${tokenType}' not found`);
      }
      
      return value;
    });
    
    context.registerParameterizedVariableSource('buildUrl', (environment, path = '') => {
      const baseUrl = cache.get(`${environment}-base-url`);
      
      if (!baseUrl) {
        throw new Error(`Base URL for environment '${environment}' not found`);
      }
      
      return path ? `${baseUrl}${path}` : baseUrl;
    });
    
    // Register some parameterless functions for comparison
    context.registerVariableSource('timestamp', () => {
      return Date.now().toString();
    });
    
    context.registerVariableSource('defaultEnv', () => {
      return context.config.defaultEnvironment || 'dev';
    });
  }
}; 