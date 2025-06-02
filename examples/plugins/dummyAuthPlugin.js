/**
 * Dummy Authentication Plugin for HttpCraft
 * Demonstrates Phase 7 plugin features:
 * - Pre-request hooks
 * - Custom variable sources
 * - Configuration access
 */

export default {
  async setup(context) {
    // Register pre-request hook that adds authentication header
    context.registerPreRequestHook(async (request) => {
      // Add a plugin-generated header
      request.headers['X-Plugin-Added'] = 'Hello from Plugin!';
      
      // Add timestamp header
      request.headers['X-Plugin-Timestamp'] = new Date().toISOString();
      
      // If we have a token prefix in config, use it
      if (context.config.tokenPrefix) {
        const token = await getToken(context.config);
        request.headers['Authorization'] = `${context.config.tokenPrefix}${token}`;
      }
    });
    
    // Register variable sources
    context.registerVariableSource('getToken', async () => {
      return getToken(context.config);
    });
    
    context.registerVariableSource('getUserId', () => {
      return context.config.defaultUserId || 'unknown';
    });
    
    context.registerVariableSource('timestamp', () => {
      return Date.now().toString();
    });
  }
};

// Helper function to generate a token
async function getToken(config) {
  const prefix = config.tokenPrefix || 'Token_';
  const timestamp = Date.now();
  return `${prefix}${timestamp}`;
} 