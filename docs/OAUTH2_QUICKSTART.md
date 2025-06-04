# OAuth2 Quick Start Guide

Get up and running with OAuth2 authentication in HttpCraft in just a few minutes.

## 🚀 Basic Setup (Client Credentials)

### 1. Create Configuration

Create `.httpcraft.yaml`:

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

apis:
  myApi:
    baseUrl: "https://api.example.com"
    plugins:
      - name: "oauth2"
    endpoints:
      getUsers:
        method: GET
        path: "/users"
      
      createUser:
        method: POST
        path: "/users"
        headers:
          Content-Type: "application/json"
        body:
          name: "{{username}}"
          email: "{{email}}"
```

### 2. Set Environment Variables

```bash
export OAUTH2_CLIENT_ID="your-client-id"
export OAUTH2_CLIENT_SECRET="your-client-secret"
```

### 3. Make Authenticated Requests

```bash
# Authorization header automatically added
httpcraft myApi getUsers

# Create a user
httpcraft myApi createUser --var username="John Doe" --var email="john@example.com"

# See what's happening with verbose mode
httpcraft --verbose myApi getUsers
```

## 🌟 Provider-Specific Examples

### Auth0

```yaml
plugins:
  - name: "oauth2"
    config:
      tokenUrl: "https://your-domain.auth0.com/oauth/token"
      clientId: "{{env.AUTH0_CLIENT_ID}}"
      clientSecret: "{{secret.AUTH0_CLIENT_SECRET}}"
      scope: "read:users write:users"
```

```bash
export AUTH0_CLIENT_ID="your-auth0-client-id"
export AUTH0_CLIENT_SECRET="your-auth0-client-secret"
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
```

```bash
export AZURE_CLIENT_ID="your-azure-client-id"
export AZURE_CLIENT_SECRET="your-azure-client-secret"
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
```

```bash
export GOOGLE_CLIENT_ID="your-google-client-id"
export GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

## 🔧 Advanced Usage

### Multiple Environments

```yaml
profiles:
  dev:
    auth_url: "https://dev-auth.example.com"
    api_url: "https://dev-api.example.com"
  prod:
    auth_url: "https://auth.example.com"
    api_url: "https://api.example.com"

plugins:
  - name: "oauth2"
    config:
      tokenUrl: "{{profile.auth_url}}/oauth2/token"
      clientId: "{{env.CLIENT_ID}}"
      clientSecret: "{{secret.CLIENT_SECRET}}"

apis:
  myApi:
    baseUrl: "{{profile.api_url}}/v1"
    plugins:
      - name: "oauth2"
```

```bash
# Use different environments
httpcraft --profile dev myApi getUsers
httpcraft --profile prod myApi getUsers
```

### API-Specific Scopes

```yaml
plugins:
  - name: "oauth2"
    config:
      tokenUrl: "https://auth.example.com/oauth2/token"
      clientId: "{{env.CLIENT_ID}}"
      clientSecret: "{{secret.CLIENT_SECRET}}"
      scope: "api:read"  # Default scope

apis:
  readOnlyApi:
    baseUrl: "https://api.example.com"
    plugins:
      - name: "oauth2"
        config:
          scope: "api:read"  # Read-only scope
  
  adminApi:
    baseUrl: "https://admin.example.com"
    plugins:
      - name: "oauth2"
        config:
          scope: "admin:full"  # Admin scope
```

### Using Tokens in Chains

```yaml
chains:
  userWorkflow:
    steps:
      - id: createUser
        call: myApi.createUser
        # OAuth2 token automatically applied
      
      - id: assignRole
        call: adminApi.assignRole
        # Different OAuth2 scope for admin API
        with:
          body:
            userId: "{{steps.createUser.response.body.id}}"
            role: "editor"
```

```bash
httpcraft chain userWorkflow
```

## 🐛 Troubleshooting

### Check Token Acquisition

```bash
# Verbose mode shows OAuth2 token requests
httpcraft --verbose myApi getUsers
```

### Dry Run

```bash
# See resolved configuration without making requests
httpcraft --dry-run myApi getUsers
```

### Common Issues

1. **401 Unauthorized**: Check client ID and secret
2. **403 Forbidden**: Check scope permissions
3. **Token not added**: Verify plugin configuration in API definition

### Debug Variables

```yaml
apis:
  debug:
    endpoints:
      showToken:
        method: GET
        path: "/debug"
        headers:
          # Manually access token for debugging
          Authorization: "{{plugins.oauth2.tokenType}} {{plugins.oauth2.accessToken}}"
```

## 📚 Next Steps

- [Complete OAuth2 Documentation](oauth2-plugin.md)
- [HttpCraft Main Documentation](../README.md)
- [More Examples](../examples/07_oauth2_examples.yaml)

---

🎉 **You're ready to use OAuth2 with HttpCraft!** The plugin handles all the complexity of token management automatically. 