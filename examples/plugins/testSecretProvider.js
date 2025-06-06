/**
 * Test Secret Provider Plugin for HttpCraft (Phase 14)
 * 
 * This is a simple test plugin that demonstrates the Custom Secret Resolver System.
 * It provides hardcoded test secrets for development and testing purposes.
 * 
 * Configuration:
 * plugins:
 *   - path: "./examples/plugins/testSecretProvider.js"
 *     name: "testSecrets"
 *     config:
 *       secretMapping:
 *         TEST_API_KEY: "test-api-key-12345"
 *         TEST_TOKEN: "test-token-abcdef"
 * 
 * Usage:
 * headers:
 *   Authorization: "Bearer {{secret.TEST_API_KEY}}"
 */

export default {
  async setup(context) {
    const config = context.config;
    
    // Register a custom secret resolver
    context.registerSecretResolver(async (secretName) => {
      // Only handle secrets mapped for this specific API
      if (config.secretMapping && config.secretMapping[secretName]) {
        const secretValue = config.secretMapping[secretName];
        
        if (config.debug) {
          console.error(`[TestSecrets] Providing secret ${secretName}: ${secretValue.substring(0, 4)}...`);
        }
        
        return secretValue;
      }
      
      // Return undefined if we don't handle this secret
      return undefined;
    });
    
    console.error(`[TestSecrets] Registered secret resolver with ${Object.keys(config.secretMapping || {}).length} secrets`);
  }
}; 