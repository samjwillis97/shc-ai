# OAuth2 Authentication Plugin

The OAuth2 plugin provides comprehensive OAuth2 authentication support for HttpCraft, enabling automatic token management for protected APIs.

## Features

- **Multiple OAuth2 Flows**: Client Credentials, Authorization Code, and Refresh Token
- **Automatic Token Management**: Handles token acquisition, caching, and renewal
- **Flexible Configuration**: Support for various OAuth2 providers and configurations
- **Token Caching**: Intelligent caching with automatic expiration handling
- **Variable Integration**: Expose tokens as variables for manual use
- **PKCE Support**: Proof Key for Code Exchange for enhanced security

## Supported Grant Types

### 1. Client Credentials Grant
Best for server-to-server authentication where no user interaction is required.

```yaml
plugins:
  - path: "../src/plugins/oauth2Plugin.js"
    name: "oauth2"
    config:
      grantType: "client_credentials"
      tokenUrl: "https://auth.example.com/oauth2/token"
      clientId: "{{env.OAUTH2_CLIENT_ID}}"
      clientSecret: "{{secret.OAUTH2_CLIENT_SECRET}}"
      scope: "api:read api:write"
      authMethod: "basic"  # or "post"
```

### 2. Authorization Code Grant
For user authentication flows (requires pre-obtained authorization code).

```yaml
plugins:
  - path: "../src/plugins/oauth2Plugin.js"
    name: "oauth2"
    config:
      grantType: "authorization_code"
      tokenUrl: "https://auth.example.com/oauth2/token"
      clientId: "{{env.OAUTH2_CLIENT_ID}}"
      clientSecret: "{{secret.OAUTH2_CLIENT_SECRET}}"
      authorizationCode: "{{env.OAUTH2_AUTH_CODE}}"
      redirectUri: "https://myapp.com/callback"
      codeVerifier: "{{env.PKCE_CODE_VERIFIER}}"  # Optional, for PKCE
```

### 3. Refresh Token Grant
For refreshing expired access tokens.

```yaml
plugins:
  - path: "../src/plugins/oauth2Plugin.js"
    name: "oauth2"
    config:
      grantType: "refresh_token"
      tokenUrl: "https://auth.example.com/oauth2/token"
      clientId: "{{env.OAUTH2_CLIENT_ID}}"
      clientSecret: "{{secret.OAUTH2_CLIENT_SECRET}}"
      refreshToken: "{{secret.OAUTH2_REFRESH_TOKEN}}"
```

## Configuration Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `grantType` | No | `client_credentials` | OAuth2 grant type |
| `tokenUrl` | Yes | - | OAuth2 token endpoint URL |
| `clientId` | Yes | - | OAuth2 client ID |
| `clientSecret` | No* | - | OAuth2 client secret |
| `scope` | No | - | Requested OAuth2 scopes |
| `authMethod` | No | `post` | Client authentication method (`post` or `basic`) |
| `tokenType` | No | `Bearer` | Token type for Authorization header |
| `timeout` | No | `30000` | Request timeout in milliseconds |
| `additionalParams` | No | - | Additional parameters for token request |

**Authorization Code Grant Additional Options:**

| Option | Required | Description |
|--------|----------|-------------|
| `authorizationCode` | Yes | Authorization code from OAuth2 flow |
| `redirectUri` | Yes | Redirect URI used in authorization |
| `codeVerifier` | No | PKCE code verifier |

**Refresh Token Grant Additional Options:**

| Option | Required | Description |
|--------|----------|-------------|
| `refreshToken` | Yes | Refresh token for token renewal |

**Cache Key Customization**

The OAuth2 plugin supports custom cache key specification to enable multi-user workflows and tenant isolation. This feature allows different users, environments, or tenants to maintain separate OAuth2 token caches.

### Configuration

Add the `cacheKey` parameter to your OAuth2 plugin configuration:

```yaml
plugins:
  - name: "oauth2"
    config:
      grantType: "client_credentials"
      tokenUrl: "https://auth.example.com/oauth2/token"
      clientId: "{{env.OAUTH2_CLIENT_ID}}"
      clientSecret: "{{secret.OAUTH2_CLIENT_SECRET}}"
      
      # Custom cache key with variable substitution
      cacheKey: "{{profile.userId}}-{{api.name}}-{{profile.environment}}"
```

### Variable Support

Cache keys support full variable substitution including:
- **Profile variables**: `{{profile.userId}}`, `{{profile.tenantId}}`
- **Environment variables**: `{{env.TENANT_ID}}`
- **CLI variables**: `{{cli.userId}}`
- **API context**: `{{api.name}}`
- **Secret variables**: `{{secret.CACHE_SUFFIX}}`

### Use Cases

#### 1. Multi-User Support
Different users maintain separate token caches:

```yaml
profiles:
  alice:
    userId: "alice"
  bob:
    userId: "bob"

apis:
  userAPI:
    plugins:
      - name: "oauth2"
        config:
          cacheKey: "{{profile.userId}}-userapi"
```

Usage:
```bash
# Alice gets her own token cache
httpcraft --profile alice userAPI getProfile

# Bob gets a separate token cache  
httpcraft --profile bob userAPI getProfile
```

#### 2. Multi-Tenant Isolation
Separate token caches per tenant:

```yaml
profiles:
  tenant1:
    tenantId: "org-123"
    userId: "alice"
  tenant2:
    tenantId: "org-456" 
    userId: "alice"

apis:
  adminAPI:
    plugins:
      - name: "oauth2"
        config:
          cacheKey: "{{profile.tenantId}}-{{profile.userId}}-admin"
```

#### 3. Environment Isolation
Different token caches for dev/staging/prod:

```yaml
profiles:
  dev:
    environment: "development"
  prod:
    environment: "production"

apis:
  paymentAPI:
    plugins:
      - name: "oauth2"
        config:
          cacheKey: "payment-{{profile.environment}}-{{profile.userId}}"
```

#### 4. API-Specific Strategies
Different cache strategies per API:

```yaml
apis:
  userAPI:
    plugins:
      - name: "oauth2"
        config:
          cacheKey: "{{profile.userId}}-user"
          
  adminAPI:
    plugins:
      - name: "oauth2"
        config:
          cacheKey: "{{profile.tenantId}}-admin"
          
  legacyAPI:
    plugins:
      - name: "oauth2"
        config:
          # No cacheKey - uses automatic generation
```

### Benefits

- **User Isolation**: Each user maintains separate authenticated sessions
- **Tenant Security**: Multi-tenant applications prevent token leakage between tenants
- **Environment Safety**: Development tokens don't interfere with production
- **Performance**: Optimized token reuse within appropriate boundaries
- **Flexibility**: Custom cache strategies per API or use case

### Backward Compatibility

When `cacheKey` is not specified, the plugin automatically generates cache keys based on:
- Token URL
- Client ID  
- Grant type
- Scope

This ensures existing configurations continue to work without changes.

### Example: Complete Multi-User Setup

```yaml
profiles:
  alice:
    userId: "alice"
    tenantId: "company-a"
  bob:
    userId: "bob"
    tenantId: "company-b"
  production:
    environment: "prod"

plugins:
  - name: "oauth2"
    config:
      grantType: "client_credentials"
      tokenUrl: "https://auth.example.com/oauth2/token"
      clientId: "{{env.OAUTH2_CLIENT_ID}}"
      clientSecret: "{{secret.OAUTH2_CLIENT_SECRET}}"

apis:
  userAPI:
    baseUrl: "https://api.example.com/users"
    plugins:
      - name: "oauth2"
        config:
          cacheKey: "{{profile.userId}}-{{profile.environment}}"
          scope: "user:read user:write"
          
  adminAPI:
    baseUrl: "https://api.example.com/admin"
    plugins:
      - name: "oauth2"
        config:
          cacheKey: "{{profile.tenantId}}-{{profile.userId}}-admin"
          scope: "admin:full"
```

Usage scenarios:
```bash
# Alice user operations (cache: "alice-prod")
httpcraft --profile alice --profile production userAPI getProfile

# Bob user operations (cache: "bob-prod") 
httpcraft --profile bob --profile production userAPI getProfile

# Alice admin operations (cache: "company-a-alice-admin")
httpcraft --profile alice --profile production adminAPI getUsers

# Bob admin operations (cache: "company-b-bob-admin")
httpcraft --profile bob --profile production adminAPI getUsers
```

## Authentication Methods

### Basic Authentication (`authMethod: "basic"`)
Sends client credentials in the Authorization header using HTTP Basic authentication.

```yaml
config:
  authMethod: "basic"
  clientId: "my-client-id"
  clientSecret: "{{secret.CLIENT_SECRET}}"
```

### Post Authentication (`authMethod: "post"`)
Sends client credentials in the request body (default behavior).

```yaml
config:
  authMethod: "post"
  clientId: "my-client-id" 
  clientSecret: "{{secret.CLIENT_SECRET}}"
```

## Usage Patterns

### 1. Automatic Authentication
The plugin automatically adds the Authorization header to all requests:

```yaml
apis:
  myApi:
    baseUrl: "https://api.example.com"
    plugins:
      - name: "oauth2"
    endpoints:
      getUsers:
        method: GET
        path: "/users"
        # Authorization header automatically added
```

### 2. Manual Token Access
Access tokens directly using plugin variables:

```yaml
apis:
  myApi:
    endpoints:
      getUsers:
        method: GET
        path: "/users"
        headers:
          Authorization: "{{plugins.oauth2.tokenType}} {{plugins.oauth2.accessToken}}"
```

### 3. Dynamic Scopes
Use parameterized functions for custom scopes:

```yaml
apis:
  myApi:
    endpoints:
      getAdminData:
        method: GET
        path: "/admin"
        headers:
          Authorization: "Bearer {{plugins.oauth2.getTokenWithScope('admin:read')}}"
```

### 4. API-Level Configuration
Override plugin configuration per API:

```yaml
plugins:
  - name: "oauth2"
    config:
      grantType: "client_credentials"
      tokenUrl: "https://auth.example.com/token"
      clientId: "{{env.CLIENT_ID}}"
      clientSecret: "{{secret.CLIENT_SECRET}}"

apis:
  adminApi:
    baseUrl: "https://admin.example.com"
    plugins:
      - name: "oauth2"
        config:
          scope: "admin:full"  # Override scope for this API
  
  readOnlyApi:
    baseUrl: "https://api.example.com"
    plugins:
      - name: "oauth2"
        config:
          scope: "read:only"   # Different scope for this API
```

## Environment Variables

Recommended environment variables for OAuth2 configuration:

```bash
# Required
export OAUTH2_CLIENT_ID="your-client-id"
export OAUTH2_CLIENT_SECRET="your-client-secret"

# For Authorization Code Grant
export OAUTH2_AUTH_CODE="authorization-code-from-oauth-flow"
export OAUTH2_CODE_VERIFIER="pkce-code-verifier"

# For Refresh Token Grant
export OAUTH2_REFRESH_TOKEN="your-refresh-token"
```

## Token Caching

The plugin automatically caches tokens to avoid unnecessary requests:

- **Cache Key**: Based on token URL, client ID, grant type, and scope
- **Expiration**: Automatically handles token expiration (with 1-minute safety margin)
- **Refresh**: Automatically requests new tokens when cached tokens expire
- **Memory Storage**: Tokens are cached in memory for the duration of the HttpCraft process

## Error Handling

The plugin provides detailed error messages for common issues:

- **Configuration Errors**: Missing required configuration parameters
- **Authentication Errors**: Invalid client credentials or authorization codes
- **Network Errors**: Connection issues with OAuth2 provider
- **Token Errors**: Invalid or expired tokens

Example error output:
```
OAuth2 Plugin Error: OAuth2 token request failed: 401 Unauthorized - {"error":"invalid_client","error_description":"Client authentication failed"}
```

## Security Considerations

1. **Store Secrets Securely**: Use environment variables or secure secret management for sensitive data
2. **Use HTTPS**: Always use HTTPS for OAuth2 endpoints
3. **Scope Limitation**: Request only the minimum required scopes
4. **Token Masking**: Tokens are automatically masked in verbose output and logs
5. **PKCE Support**: Use PKCE for authorization code flows when supported

## Provider Examples

### Auth0
```yaml
plugins:
  - name: "oauth2"
    config:
      tokenUrl: "https://your-domain.auth0.com/oauth/token"
      clientId: "{{env.AUTH0_CLIENT_ID}}"
      clientSecret: "{{secret.AUTH0_CLIENT_SECRET}}"
      scope: "read:users write:users"
      authMethod: "post"
```

### Okta
```yaml
plugins:
  - name: "oauth2"
    config:
      tokenUrl: "https://your-domain.okta.com/oauth2/default/v1/token"
      clientId: "{{env.OKTA_CLIENT_ID}}"
      clientSecret: "{{secret.OKTA_CLIENT_SECRET}}"
      scope: "api.read api.write"
      authMethod: "basic"
```

### Azure AD
```yaml
plugins:
  - name: "oauth2"
    config:
      tokenUrl: "https://login.microsoftonline.com/your-tenant-id/oauth2/v2.0/token"
      clientId: "{{env.AZURE_CLIENT_ID}}"
      clientSecret: "{{secret.AZURE_CLIENT_SECRET}}"
      scope: "https://graph.microsoft.com/.default"
      authMethod: "post"
```

### Google OAuth2
```yaml
plugins:
  - name: "oauth2"
    config:
      tokenUrl: "https://oauth2.googleapis.com/token"
      clientId: "{{env.GOOGLE_CLIENT_ID}}"
      clientSecret: "{{secret.GOOGLE_CLIENT_SECRET}}"
      scope: "https://www.googleapis.com/auth/userinfo.profile"
      authMethod: "post"
```

## Advanced Usage

### Multiple OAuth2 Configurations
You can configure multiple OAuth2 plugins for different providers or scopes:

```yaml
plugins:
  - name: "oauth2Primary"
    path: "../src/plugins/oauth2Plugin.js"
    config:
      tokenUrl: "https://primary.auth.com/token"
      clientId: "{{env.PRIMARY_CLIENT_ID}}"
      clientSecret: "{{secret.PRIMARY_CLIENT_SECRET}}"
      scope: "api:read api:write"
  
  - name: "oauth2Analytics"
    path: "../src/plugins/oauth2Plugin.js"
    config:
      tokenUrl: "https://analytics.auth.com/token"
      clientId: "{{env.ANALYTICS_CLIENT_ID}}"
      clientSecret: "{{secret.ANALYTICS_CLIENT_SECRET}}"
      scope: "analytics:read"
```

### Chain Integration
OAuth2 works seamlessly with HttpCraft chains:

```yaml
chains:
  userManagement:
    steps:
      - id: createUser
        call: userApi.createUser
        # OAuth2 token automatically applied
      
      - id: assignRole
        call: adminApi.assignRole
        # Different OAuth2 token for admin API
        with:
          body:
            userId: "{{steps.createUser.response.body.id}}"
            role: "editor"
```

## Troubleshooting

### Common Issues

1. **Token Request Fails**
   - Verify client ID and secret are correct
   - Check that the token URL is accessible
   - Ensure required scopes are available for the client

2. **Authorization Header Not Added**
   - Verify the plugin is configured in the `plugins` section
   - Check that the API references the plugin correctly
   - Ensure no conflicting Authorization headers in endpoint config

3. **Token Caching Issues**
   - Tokens are cached per configuration combination
   - Restart HttpCraft to clear token cache
   - Verify token expiration handling

### Debug Mode

Use HttpCraft's verbose mode to debug OAuth2 issues:

```bash
httpcraft --verbose myapi getusers
```

This will show:
- OAuth2 token acquisition attempts
- Request headers including Authorization
- Token caching behavior
- Any OAuth2-related errors

## Migration from Other Tools

### From Postman
Convert Postman OAuth2 configurations to HttpCraft format:

**Postman:**
```
Grant Type: Client Credentials
Access Token URL: https://auth.example.com/token
Client ID: your-client-id
Client Secret: your-secret
Scope: api read write
```

**HttpCraft:**
```yaml
plugins:
  - name: "oauth2"
    config:
      grantType: "client_credentials"
      tokenUrl: "https://auth.example.com/token"
      clientId: "{{env.CLIENT_ID}}"
      clientSecret: "{{secret.CLIENT_SECRET}}"
      scope: "api read write"
```

### From curl
Convert curl OAuth2 commands:

**curl:**
```bash
# Get token
TOKEN=$(curl -X POST https://auth.example.com/token \
  -d "grant_type=client_credentials&client_id=your-id&client_secret=your-secret" \
  | jq -r .access_token)

# Use token
curl -H "Authorization: Bearer $TOKEN" https://api.example.com/users
```

**HttpCraft:**
```yaml
# Configuration handles token automatically
plugins:
  - name: "oauth2"
    config:
      grantType: "client_credentials"
      tokenUrl: "https://auth.example.com/token"
      clientId: "your-id"
      clientSecret: "your-secret"

apis:
  myApi:
    baseUrl: "https://api.example.com"
    endpoints:
      getUsers:
        method: GET
        path: "/users"
```

```bash
# Single command
httpcraft myApi getUsers
``` 