# HttpCraft Configuration Schema

This directory contains the JSON Schema for HttpCraft configuration files. The schema provides validation and autocompletion support in editors and YAML linters for the comprehensive feature set of HttpCraft v1.

## Files

- `httpcraft-config.schema.json` - The main configuration schema for HttpCraft YAML files

## Schema Coverage

The schema supports all HttpCraft v1 features including:

- **Built-in OAuth2 Plugin** - Complete authentication support with multiple grant types
- **Enhanced Profile Merging** - Additive profile behavior with `--no-default-profile` support
- **Custom Secret Resolvers** - Plugin-based secret management beyond environment variables
- **Advanced Variable System** - Full precedence chain with 10+ variable scopes
- **Request Chaining** - Multi-step workflows with data passing between steps
- **Plugin System** - Local files, npm packages, and built-in plugins
- **Modular Configuration** - Import APIs, chains, and variables from directories
- **Comprehensive Variable Support** - All variable types including `{{steps.*}}`, `{{plugins.*}}`, `{{secret.*}}`

## Using the Schema

### With VS Code

1. Install the "YAML" extension by Red Hat
2. Add this to your VS Code settings (`settings.json`):

```json
{
  "yaml.schemas": {
    "./schemas/httpcraft-config.schema.json": [
      ".httpcraft.yaml",
      ".httpcraft.yml",
      "**/httpcraft.yaml",
      "**/httpcraft.yml"
    ]
  }
}
```

Alternatively, add a schema reference to the top of your YAML file:

```yaml
# yaml-language-server: $schema=./schemas/httpcraft-config.schema.json

config:
  defaultProfile: ["development", "auth"]
plugins:
  - name: "oauth2"
    config:
      grantType: "client_credentials"
      tokenUrl: "https://auth.example.com/oauth2/token"
      clientId: "{{env.OAUTH2_CLIENT_ID}}"
      clientSecret: "{{secret.OAUTH2_CLIENT_SECRET}}"
apis:
  myapi:
    baseUrl: "https://api.example.com"
    # ... rest of configuration with full autocompletion
```

### With IntelliJ IDEA / WebStorm

1. Go to **Settings** → **Languages & Frameworks** → **Schemas and DTDs** → **JSON Schema Mappings**
2. Click **+** to add a new mapping
3. Set **Schema file or URL** to the path of `httpcraft-config.schema.json`
4. Add file patterns: `*.httpcraft.yaml`, `*.httpcraft.yml`, `.httpcraft.yaml`, `.httpcraft.yml`

### Command-line Validation

You can validate your configuration files using tools like `ajv-cli`:

```bash
# Install ajv-cli
npm install -g ajv-cli

# Validate a config file
ajv validate -s schemas/httpcraft-config.schema.json -d .httpcraft.yaml

# Validate with verbose output
ajv validate -s schemas/httpcraft-config.schema.json -d .httpcraft.yaml --verbose
```

## Schema Features

### Core Configuration Support

- **Global Settings** - `config.defaultProfile` with enhanced merging behavior
- **Profile System** - Named variable sets with precedence rules
- **Plugin Management** - Local files, npm packages, and built-in plugins
- **Secret Management** - Environment variables and custom secret resolvers
- **Modular Imports** - APIs, chains, and variables from files or directories

### API Definitions

- **Base Configuration** - URLs, headers, parameters with variable substitution
- **Endpoint Definitions** - Full HTTP method support with path parameters
- **API-Level Plugins** - Override global plugin configurations per API
- **Variable Scoping** - API and endpoint-level variables with precedence

### Chain Definitions

- **Multi-Step Workflows** - Sequential request execution with data flow
- **Step Overrides** - Headers, parameters, path parameters, and body overrides
- **Data Passing** - Access previous step data with `{{steps.stepId.*}}` syntax
- **Variable Context** - Full variable resolution including chain variables

### Variable System

The schema supports the complete HttpCraft variable precedence chain:

1. **CLI Variables** - `--var key=value`
2. **Step Overrides** - `step.with` configurations
3. **Chain Variables** - `chain.vars` definitions
4. **Endpoint Variables** - Endpoint-level variables
5. **API Variables** - API-level variables
6. **Profile Variables** - From active profiles (enhanced merging)
7. **Global Variables** - From imported variable files
8. **Plugin Variables** - From loaded plugins (`{{plugins.name.variable}}`)
9. **Secret Variables** - From secret resolvers (`{{secret.NAME}}`)
10. **Environment Variables** - OS environment (`{{env.VAR_NAME}}`)
11. **Dynamic Variables** - Built-in functions (`{{$timestamp}}`, `{{$guid}}`)

### Plugin Support

#### Built-in OAuth2 Plugin

Complete schema support for the built-in OAuth2 plugin:

```yaml
plugins:
  - name: "oauth2"  # Built-in plugin - no path required
    config:
      grantType: "client_credentials"  # or "authorization_code", "refresh_token"
      tokenUrl: "https://auth.example.com/oauth2/token"
      clientId: "{{env.OAUTH2_CLIENT_ID}}"
      clientSecret: "{{secret.OAUTH2_CLIENT_SECRET}}"
      scope: "api:read api:write"
      authMethod: "basic"  # or "post"
      
      # Interactive browser flow support (future)
      authorizationUrl: "https://auth.example.com/authorize"
      usePKCE: true
      interactive: true
      tokenStorage: "keychain"  # or "filesystem", "memory"
```

#### Plugin Configuration Features

- **Built-in Plugins** - Schema recognizes `oauth2` as built-in
- **Local Plugins** - Path-based plugin loading with JavaScript/TypeScript support
- **npm Plugins** - Package-based plugin loading
- **API-Level Overrides** - Plugin configuration customization per API
- **Variable Substitution** - Full variable support in plugin configurations

## Schema Validation Rules

### Required Properties
- `apis` is required at the root level
- `baseUrl` and `endpoints` are required for each API
- `method` and `path` are required for each endpoint
- `id` and `call` are required for chain steps
- `name` is required for plugin configurations
- `tokenUrl` and `clientId` are required for OAuth2 plugin

### Pattern Validation
- API names: `^[a-zA-Z][a-zA-Z0-9_-]*$`
- Endpoint names: `^[a-zA-Z][a-zA-Z0-9_-]*$`
- Chain step IDs: `^[a-zA-Z][a-zA-Z0-9_-]*$`
- Variable names: `^[a-zA-Z_][a-zA-Z0-9_]*$`
- Header names: `^[a-zA-Z][a-zA-Z0-9-]*$`
- Step calls: `^[a-zA-Z][a-zA-Z0-9_-]*\\.[a-zA-Z][a-zA-Z0-9_-]*$` (api.endpoint format)
- Base URLs: Must start with `http://`, `https://`, or `{{variable}}`
- Paths: Must start with `/` or `{{variable}}`

### HTTP Methods
Supported: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`

### OAuth2 Grant Types
Supported: `client_credentials`, `authorization_code`, `refresh_token`

### Variable Types
Variables support:
- **Strings** - Most common, supports nested variable references
- **Numbers** - Integer and floating point values
- **Booleans** - true/false values
- **null** - Explicit null values

### Body Types
Request bodies support:
- **Objects** - For JSON payloads with variable substitution
- **Arrays** - For JSON array payloads
- **Strings** - For raw content, XML, form data, etc.
- **Numbers, booleans, null** - For simple payloads

## Example Configurations

### Minimal Configuration

```yaml
apis:
  jsonplaceholder:
    baseUrl: "https://jsonplaceholder.typicode.com"
    endpoints:
      getTodo:
        method: GET
        path: "/todos/1"
```

### Complete Configuration with OAuth2

```yaml
config:
  defaultProfile: ["development", "auth"]

profiles:
  development:
    apiUrl: "https://dev-api.example.com"
    debug: true
  auth:
    clientId: "dev-client-id"
  user:
    userId: "user123"
    userName: "Test User"

plugins:
  - name: "oauth2"
    config:
      grantType: "client_credentials"
      tokenUrl: "https://auth.example.com/oauth2/token"
      clientId: "{{env.OAUTH2_CLIENT_ID}}"
      clientSecret: "{{secret.OAUTH2_CLIENT_SECRET}}"

apis:
  userApi:
    baseUrl: "{{profile.apiUrl}}/v1"
    plugins:
      - name: "oauth2"
        config:
          scope: "user:read user:write"  # API-specific scope override
    endpoints:
      getUser:
        method: GET
        path: "/users/{{userId}}"
        headers:
          Accept: "application/json"
      
      createUser:
        method: POST
        path: "/users"
        headers:
          Content-Type: "application/json"
        body:
          name: "{{userName}}"
          email: "{{userEmail}}"

chains:
  userWorkflow:
    description: "Create and retrieve user workflow"
    vars:
      userName: "{{profile.userName}}"
      userEmail: "{{profile.userId}}@example.com"
    
    steps:
      - id: createUser
        call: userApi.createUser
        with:
          body:
            name: "{{chain.vars.userName}}"
            email: "{{chain.vars.userEmail}}"
            timestamp: "{{$isoTimestamp}}"
      
      - id: getCreatedUser
        call: userApi.getUser
        with:
          pathParams:
            userId: "{{steps.createUser.response.body.id}}"
          headers:
            X-Created-By: "{{steps.createUser.request.body.name}}"
```

### Enhanced Profile Merging Example

```yaml
config:
  defaultProfile: ["base", "environment"]  # Always loaded

profiles:
  base:
    timeout: 30
    userAgent: "HttpCraft/1.0"
  environment:
    apiUrl: "https://dev-api.example.com"
    debug: true
  user:
    credentials: "{{secret.USER_CREDENTIALS}}"

# Usage:
# httpcraft --profile user myapi endpoint
# Loads: base → environment → user (additive merging)
#
# httpcraft --no-default-profile --profile user myapi endpoint  
# Loads: user only (override behavior)
```

## Advanced Features

### Secret Resolver System

The schema supports custom secret resolvers for advanced secret management:

```yaml
plugins:
  - path: "./plugins/vaultSecretProvider.js"
    name: "vault-secrets"
    config:
      provider: "vault"
      baseUrl: "{{env.VAULT_URL}}"
      token: "{{env.VAULT_TOKEN}}"

apis:
  secureApi:
    plugins:
      - name: "vault-secrets"
        config:
          secretMapping:
            API_KEY: "secure-api/credentials#key"
            DATABASE_PASSWORD: "secure-api/db#password"
    headers:
      Authorization: "Bearer {{secret.API_KEY}}"
      # Secrets automatically fetched from Vault and masked in logs
```

### Step Data Passing

Comprehensive support for data flow between chain steps:

```yaml
chains:
  complexWorkflow:
    steps:
      - id: authenticate
        call: auth.login
        with:
          body:
            username: "{{env.USERNAME}}"
            password: "{{secret.PASSWORD}}"
      
      - id: fetchData
        call: api.getData
        with:
          headers:
            Authorization: "{{steps.authenticate.response.headers.Authorization}}"
            X-Session: "{{steps.authenticate.response.body.sessionId}}"
          params:
            filter: "{{steps.authenticate.response.body.user.id}}"
      
      - id: processData
        call: api.process
        with:
          body:
            data: "{{steps.fetchData.response.body}}"
            metadata:
              originalRequest: "{{steps.fetchData.request.url}}"
              userAgent: "{{steps.fetchData.request.headers.User-Agent}}"
```

## Troubleshooting

### Schema Not Loading
- Ensure the file path in your editor configuration is correct
- Check that the schema file exists and is valid JSON
- Restart your editor after adding schema configuration
- Verify JSON Schema extension is installed and enabled

### Validation Errors
- **Required Properties**: Check that all required fields are present
- **Pattern Validation**: Verify naming follows regex requirements (alphanumeric with hyphens/underscores)
- **HTTP Methods**: Ensure methods are from the supported list
- **URLs and Paths**: Confirm format follows schema rules
- **Plugin Configuration**: Check built-in plugins use correct names (`oauth2`)
- **Variable References**: Ensure variable syntax uses `{{variable}}` format
- **Chain Steps**: Verify `call` format is `api.endpoint`

### Autocompletion Not Working
- Make sure your YAML extension supports JSON Schema
- Verify the schema is properly associated with your file patterns
- Check editor console for any schema loading errors
- Try adding explicit schema reference to your YAML file
- Ensure file extension is recognized (`.yaml`, `.yml`)

### OAuth2 Configuration Issues
- Check that `tokenUrl` and `clientId` are provided
- Verify `grantType` is one of the supported values
- For authorization_code flow, ensure `authorizationCode` and `redirectUri` are provided
- For refresh_token flow, ensure `refreshToken` is provided

### Variable Resolution Issues
- Check variable precedence order in schema documentation
- Ensure variable names follow naming patterns
- Verify variable scope (profile, api, endpoint, chain, etc.)
- For step variables, ensure step ID exists and format is correct (`{{steps.stepId.response.body.field}}`)

For more examples and detailed usage, see the `examples/` directory in the project root. 