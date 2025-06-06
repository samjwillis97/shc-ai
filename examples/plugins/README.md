# HttpCraft Plugin Examples

This directory contains example plugins demonstrating various HttpCraft plugin capabilities.

## Plugin Types

### Secret Providers (Recommended: Custom Secret Resolver)

**`vaultSecretProvider.js`** - ⭐ **RECOMMENDED APPROACH**
- Demonstrates the ideal pattern for secret providers using the Custom Secret Resolver System (Phase 14)
- Eliminates plugin dependency ordering issues  
- Enables API-specific secret mappings
- Maintains automatic secret masking through `{{secret.*}}` syntax
- **Requires**: Phase 14 implementation (adds `registerSecretResolver()` to plugin context)

### Authentication & Utility Plugins

**`dummyAuthPlugin.js`** - Example authentication plugin
- Shows pre-request hook usage for adding authentication headers
- Demonstrates plugin configuration and variable exposure

**`cachePlugin.js`** - Example caching plugin  
- Shows how to implement response caching with TTL
- Demonstrates post-response hooks and data transformation

**`xmlToJsonPlugin.js`** - Example transformation plugin
- Shows post-response hook for converting XML responses to JSON
- Demonstrates response body transformation

## Usage Patterns

### Basic Plugin Usage
```yaml
plugins:
  - path: "./plugins/dummyAuthPlugin.js"
    name: "auth"
    config:
      apiKey: "{{env.API_KEY}}"
```

### Secret Provider Usage (Recommended)
```yaml
# Global plugin definition
plugins:
  - path: "./plugins/vaultSecretProvider.js"
    name: "rqp-secrets"
    config:
      provider: "vault"
      baseUrl: "{{env.VAULT_URL}}"
      token: "{{env.VAULT_TOKEN}}"

# API-specific secret mappings
apis:
  userAPI:
    plugins:
      - name: "rqp-secrets"
        config:
          secretMapping:
            API_KEY: "user-service/credentials#key"
    headers:
      Authorization: "Bearer {{secret.API_KEY}}"  # Fetched on-demand
```

### Multiple Plugins
```yaml
plugins:
  - path: "./plugins/vaultSecretProvider.js"
    name: "secrets"
    config:
      provider: "vault"
      # ... config
      
  - path: "./plugins/dummyAuthPlugin.js"  
    name: "auth"
    config:
      apiKey: "{{secret.API_KEY}}"  # Uses secret from provider
```

## Development Guidelines

### For Secret Providers
1. **Use Custom Secret Resolver pattern** (`registerSecretResolver()`)
2. **Support API-specific configurations** via plugin overrides
3. **Implement caching** with TTL to avoid repeated API calls
4. **Handle errors gracefully** with fallback to environment variables
5. **Support path#field syntax** for extracting specific secret fields

### For Other Plugins
1. **Use TypeScript types** for better development experience
2. **Implement proper error handling** for network operations
3. **Support async operations** where needed
4. **Document configuration options** clearly
5. **Follow single responsibility principle** 

## Configuration Examples

See `../custom_secret_resolver_example.yaml` for a comprehensive example of the recommended secret provider pattern.

## Plugin Development

For detailed plugin development guidance, see the main HttpCraft documentation on creating custom plugins and integrating with the variable system.

### Phase 14 Note

The `vaultSecretProvider.js` example requires the Custom Secret Resolver System (Phase 14) implementation. This adds the `registerSecretResolver()` method to the plugin context, enabling on-demand secret resolution that eliminates plugin ordering dependencies.

Until Phase 14 is implemented, secret providers must use alternative approaches like pre-request hooks or environment variable population. 