/**
 * RQP Secrets Plugin for HttpCraft - RECOMMENDED APPROACH
 * 
 * This demonstrates the IDEAL solution for custom secret providers using
 * the Custom Secret Resolver System (Phase 14). This approach:
 * 
 * ✅ Eliminates plugin dependency ordering issues
 * ✅ Enables API-specific secret mappings  
 * ✅ Only fetches secrets on-demand for the API being used
 * ✅ Maintains automatic secret masking through {{secret.*}} syntax
 * ✅ Works with HttpCraft's existing API-level plugin override system
 * 
 * IMPORTANT: This plugin requires Phase 14 implementation (Custom Secret Resolver System)
 * which adds registerSecretResolver() functionality to the plugin context.
 * 
 * Global Configuration (~/.config/httpcraft/config.yaml):
 * plugins:
 *   - path: "./plugins/rqp-secrets.js"
 *     name: "rqp-secrets"
 *     config:
 *       provider: "vault"
 *       baseUrl: "{{env.VAULT_URL}}"
 *       token: "{{env.VAULT_TOKEN}}"
 *       mountPath: "secret"
 *       apiVersion: "v2"
 * 
 * API-Specific Usage (different secret mappings per API):
 * apis:
 *   userServiceAPI:
 *     baseUrl: "https://user-api.example.com"
 *     plugins:
 *       - name: "rqp-secrets"
 *         config:
 *           secretMapping:
 *             USER_API_KEY: "user-service/api#key"
 *             USER_DB_PASSWORD: "user-service/db#password"
 *     headers:
 *       Authorization: "Bearer {{secret.USER_API_KEY}}"
 * 
 *   paymentServiceAPI:
 *     baseUrl: "https://payment-api.example.com"  
 *     plugins:
 *       - name: "rqp-secrets"
 *         config:
 *           secretMapping:
 *             PAYMENT_API_KEY: "payment-service/api#key"
 *             STRIPE_SECRET: "payment-service/stripe#secret"
 *     headers:
 *       Authorization: "Bearer {{secret.PAYMENT_API_KEY}}"
 * 
 * Benefits:
 * - Different APIs get different secrets automatically
 * - Plugin loading order doesn't matter
 * - Only fetches secrets for the specific API being called
 * - Standard {{secret.NAME}} syntax with automatic masking
 * - Caching prevents repeated secret store API calls
 */

import axios from 'axios';

export default {
  async setup(context) {
    const config = context.config;
    
    // Validate required configuration
    if (!config.baseUrl) {
      throw new Error('RQP Secrets provider requires baseUrl in configuration');
    }
    
    if (!config.token) {
      throw new Error('RQP Secrets provider requires token in configuration');
    }

    // Cache for secrets to avoid repeated API calls (per API instance)
    const secretCache = new Map();
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    
    /**
     * Fetch secret from configured provider using path#field syntax
     */
    async function fetchSecret(secretPath) {
      // Check cache first
      if (secretCache.has(secretPath)) {
        const cached = secretCache.get(secretPath);
        if (cached.expiresAt > Date.now()) {
          return cached.value;
        }
        secretCache.delete(secretPath);
      }

      try {
        // Parse path#field syntax (e.g., "user-service/api#key")
        const [path, field] = secretPath.includes('#') 
          ? secretPath.split('#', 2) 
          : [secretPath, null];

        let secretValue;

        // Support multiple providers
        switch (config.provider) {
          case 'vault':
            secretValue = await fetchFromVault(path, field);
            break;
          case 'aws':
            secretValue = await fetchFromAWS(path, field);
            break;
          case 'azure':
            secretValue = await fetchFromAzure(path, field);
            break;
          default:
            throw new Error(`Unsupported secret provider: ${config.provider}`);
        }

        // Cache the result
        const finalValue = String(secretValue);
        secretCache.set(secretPath, {
          value: finalValue,
          expiresAt: Date.now() + CACHE_TTL
        });

        return finalValue;
      } catch (error) {
        throw new Error(`Failed to fetch secret from ${secretPath}: ${error.message}`);
      }
    }

    /**
     * Vault-specific secret fetching
     */
    async function fetchFromVault(secretPath, field) {
      // Construct Vault API URL based on KV version
      let url;
      if (config.apiVersion === 'v1') {
        url = `${config.baseUrl}/v1/${config.mountPath || 'secret'}/${secretPath}`;
      } else {
        // Default to KV v2
        url = `${config.baseUrl}/v1/${config.mountPath || 'secret'}/data/${secretPath}`;
      }

      const response = await axios.get(url, {
        headers: {
          'X-Vault-Token': config.token,
          'Accept': 'application/json'
        },
        timeout: config.timeout || 10000
      });

      let secretData;
      if (config.apiVersion === 'v1') {
        secretData = response.data.data;
      } else {
        // KV v2 has nested data structure
        secretData = response.data.data?.data;
      }

      if (!secretData) {
        throw new Error(`No secret data found at Vault path: ${secretPath}`);
      }

      // Extract the specific field or return the whole secret
      if (field) {
        if (!(field in secretData)) {
          throw new Error(`Field '${field}' not found in Vault secret at path: ${secretPath}`);
        }
        return secretData[field];
      } else {
        // If no field specified, return first value or JSON string
        const keys = Object.keys(secretData);
        return keys.length === 1 ? secretData[keys[0]] : JSON.stringify(secretData);
      }
    }

    /**
     * AWS Secrets Manager fetching (example)
     */
    async function fetchFromAWS(secretId, field) {
      // Implementation would go here
      throw new Error('AWS provider not implemented yet');
    }

    /**
     * Azure Key Vault fetching (example)
     */
    async function fetchFromAzure(secretName, field) {
      // Implementation would go here
      throw new Error('Azure provider not implemented yet');
    }

    // THE KEY: Register a custom secret resolver
    // This gets called whenever {{secret.NAME}} is encountered
    context.registerSecretResolver(async (secretName) => {
      // Only handle secrets mapped for this specific API
      if (config.secretMapping && config.secretMapping[secretName]) {
        const secretPath = config.secretMapping[secretName];
        
        if (config.debug) {
          console.error(`[RQP-Secrets] Fetching ${secretName} from ${secretPath} using ${config.provider}`);
        }
        
        try {
          return await fetchSecret(secretPath);
        } catch (error) {
          if (config.failOnError) {
            throw new Error(`[RQP-Secrets] Failed to fetch secret ${secretName}: ${error.message}`);
          } else {
            console.error(`[RQP-Secrets] Failed to fetch secret ${secretName}: ${error.message}`);
            // Fall back to environment variable
            return process.env[secretName];
          }
        }
      }
      
      // Not mapped for this API, fall back to environment variable
      return process.env[secretName];
    });

    // Optional: Register utility functions for debugging
    context.registerVariableSource('secretProvider', () => {
      return config.provider || 'unknown';
    });

    context.registerVariableSource('secretsConfigured', () => {
      return config.secretMapping ? Object.keys(config.secretMapping).length.toString() : '0';
    });

    context.registerVariableSource('secretsBaseUrl', () => {
      return config.baseUrl || 'not-configured';
    });

    // Cleanup cache periodically to prevent memory leaks
    setInterval(() => {
      const now = Date.now();
      for (const [key, cached] of secretCache.entries()) {
        if (cached.expiresAt <= now) {
          secretCache.delete(key);
        }
      }
    }, 60000); // Clean up every minute
    
    if (config.secretMapping) {
      console.error(`[RQP-Secrets] Initialized with ${Object.keys(config.secretMapping).length} mapped secrets for ${config.provider}`);
    } else {
      console.error(`[RQP-Secrets] Initialized with no secret mappings (global config only)`);
    }
  }
}; 