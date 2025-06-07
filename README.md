# HttpCraft

**A powerful CLI tool for HTTP API testing and automation**

HttpCraft is a command-line interface (CLI) tool designed to simplify testing and interacting with HTTP/S endpoints. It provides a highly ergonomic, configurable, and extensible experience for developers, QA engineers, and DevOps professionals who need to make HTTP requests frequently.

## ✨ Features

- **🔧 Configuration-driven**: Define APIs, endpoints, and workflows in YAML files
- **🔄 Variable substitution**: Dynamic variables with multiple scopes and precedence rules  
- **📝 Profiles**: Switch between different environments (dev, staging, prod) or user contexts
- **🔗 Request chaining**: Execute sequences of requests with data passing between steps
- **🧩 Plugin system**: Extend functionality with custom JavaScript/TypeScript plugins
- **⚡ Tab completion**: Full ZSH completion for commands, API names, and options
- **🔍 Verbose output**: Detailed request/response information for debugging
- **🏃 Dry run mode**: Preview requests without sending them
- **🔐 Secret management**: Secure handling of API keys and tokens
- **🎯 Exit code control**: Scriptable with controllable exit codes
- **🔐 OAuth2 Authentication**: Built-in support for multiple OAuth2 flows

## 📦 Installation

### From Source

```bash
# Clone the repository
git clone <repository-url>
cd httpcraft

# Install dependencies
npm install

# Build the project
npm run build

# Link globally (optional)
npm link
```

### Development Mode

```bash
# Run directly with ts-node
npm run dev <command>
```

## 🚀 Quick Start

### 1. Create a basic configuration file

Create `.httpcraft.yaml` in your current directory:

```yaml
# .httpcraft.yaml
apis:
  jsonplaceholder:
    baseUrl: "https://jsonplaceholder.typicode.com"
    endpoints:
      getTodo:
        description: "Fetches a single todo item."
        method: GET
        path: "/todos/1"
      
      createPost:
        description: "Creates a new post."
        method: POST
        path: "/posts"
        headers:
          Content-Type: "application/json; charset=UTF-8"
        body:
          title: "My New Post"
          body: "This is the post content."
          userId: 1
```

### 2. Make your first request

```bash
# Fetch a todo item
httpcraft jsonplaceholder getTodo

# Create a new post
httpcraft jsonplaceholder createPost
```

### 3. Use variables and profiles

```yaml
profiles:
  dev:
    baseUrl: "https://api-dev.example.com"
    apiKey: "dev-key-123"
  prod:
    baseUrl: "https://api.example.com"
    apiKey: "{{secret.PROD_API_KEY}}"

apis:
  myapi:
    baseUrl: "{{profile.baseUrl}}"
    headers:
      Authorization: "Bearer {{profile.apiKey}}"
    endpoints:
      getUser:
        method: GET
        path: "/users/{{userId}}"
```

```bash
# Use different profiles
httpcraft --profile dev myapi getUser --var userId=123
httpcraft --profile prod myapi getUser --var userId=123
```

## 📖 Usage

### Basic Commands

```bash
# Make a simple HTTP request
httpcraft request <url>

# Call a configured API endpoint
httpcraft <api_name> <endpoint_name>

# Execute a request chain
httpcraft chain <chain_name>

# Generate ZSH completion script
httpcraft completion zsh
```

### Command Options

| Option | Description |
|--------|-------------|
| `--config, -c` | Path to configuration file |
| `--var` | Set or override variables (can be used multiple times) |
| `--profile, -p` | Select profile(s) to use (can be used multiple times) |
| `--no-default-profile` | Skip default profiles and use only CLI-specified profiles |
| `--verbose` | Output detailed request/response information to stderr |
| `--dry-run` | Preview request without sending it |
| `--exit-on-http-error` | Exit with non-zero code for specified HTTP errors |
| `--chain-output` | Output format for chains ("default" or "full") |

### Examples

```bash
# Basic API call
httpcraft myapi getUser

# With variables
httpcraft myapi getUser --var userId=123 --var format=json

# With profiles
httpcraft --profile prod myapi getUser --var userId=123

# Enhanced profile merging (combines default + CLI profiles)
httpcraft --profile user-alice myapi getUser

# Override default profiles (use only CLI profiles)
httpcraft --no-default-profile --profile user-alice myapi getUser

# Verbose output
httpcraft --verbose myapi getUser --var userId=123

# Dry run (preview without sending)
httpcraft --dry-run myapi getUser --var userId=123

# Exit on HTTP errors
httpcraft --exit-on-http-error "4xx,5xx" myapi getUser --var userId=123

# Execute a chain
httpcraft chain createAndGetUser --var userName="John Doe"

# Chain with full output
httpcraft chain createAndGetUser --chain-output full
```

## 🔧 Enhanced Profile Merging

HttpCraft now supports **additive profile merging**, making it easier to work with layered configurations:

### Default Behavior (Additive Merging)
When you specify profiles via `--profile`, they are **combined** with your `config.defaultProfile`:

```yaml
# .httpcraft.yaml
config:
  defaultProfile: ["base", "dev"]  # Base environment setup

profiles:
  base:
    apiUrl: "https://api.example.com"
    timeout: 30
  dev:
    environment: "development"
    debug: true
  user-alice:
    userId: "alice123"
    apiKey: "alice-key"
```

```bash
# This combines ALL profiles: base + dev + user-alice
httpcraft --profile user-alice myapi getUser

# Equivalent to the old behavior:
# httpcraft --profile base --profile dev --profile user-alice myapi getUser
```

### Override Behavior
Use `--no-default-profile` when you want **only** the CLI-specified profiles:

```bash
# Uses ONLY user-alice profile (skips base + dev)
httpcraft --no-default-profile --profile user-alice myapi getUser
```

### Profile Precedence
Variables from later profiles override earlier ones:
1. Default profiles (in order specified)
2. CLI profiles (in order specified)

```bash
# Order: base → dev → user-alice → admin
httpcraft --profile user-alice --profile admin myapi getUser
```

### Verbose Output
See exactly which profiles are being merged:

```bash
httpcraft --verbose --profile user-alice myapi getUser
```

Output:
```
[VERBOSE] Loading profiles:
[VERBOSE]   Default profiles: base, dev
[VERBOSE]   CLI profiles: user-alice
[VERBOSE]   Final profile order: base, dev, user-alice
[VERBOSE] Merged profile variables:
[VERBOSE]   apiUrl: https://api.example.com (from base profile)
[VERBOSE]   environment: development (from dev profile)
[VERBOSE]   userId: alice123 (from user-alice profile)
```

### Migration from Previous Versions
**No breaking changes** - existing configurations work unchanged:

- If you don't use `config.defaultProfile`, behavior is identical
- If you do use `config.defaultProfile`, you get the improved UX automatically
- Use `--no-default-profile` to restore old behavior if needed

### Common Patterns

**Environment + User Pattern:**
```yaml
config:
  defaultProfile: ["base", "production"]

profiles:
  base:
    apiUrl: "https://api.example.com"
    timeout: 30
  production:
    environment: "prod"
    logLevel: "warn"
  user-alice:
    userId: "alice"
    apiKey: "{{secret.ALICE_API_KEY}}"
```

```bash
# Production environment with Alice's credentials
httpcraft --profile user-alice myapi getUser
```

**Team + Environment Pattern:**
```yaml
config:
  defaultProfile: "team-defaults"

profiles:
  team-defaults:
    apiUrl: "https://api.company.com"
    userAgent: "CompanyTool/1.0"
  staging:
    environment: "staging"
    apiUrl: "https://staging-api.company.com"
  production:
    environment: "production"
```

```bash
# Team defaults + staging environment
httpcraft --profile staging myapi getUser

# Only staging (no team defaults)
httpcraft --no-default-profile --profile staging myapi getUser
```

## ⚙️ Configuration

### Configuration File Locations

HttpCraft searches for configuration files in this order:

1. File specified via `--config <path>` (highest priority)
2. `.httpcraft.yaml` or `.httpcraft.yml` in current directory  
3. `$HOME/.config/httpcraft/config.yaml` (global default)

### Configuration Structure

```yaml
# Global configuration
config:
  defaultProfile: "dev"

# Variable profiles  
profiles:
  dev:
    baseUrl: "https://api-dev.example.com"
    apiKey: "dev-key"
  prod:
    baseUrl: "https://api.example.com"
    apiKey: "{{secret.PROD_API_KEY}}"

# Global variable files
variables:
  - "./vars/global.yaml"

# Secret configuration
secrets:
  provider: "environment" # Default: OS environment variables

# Plugin configuration
plugins:
  - path: "./plugins/auth-plugin.js"
    config:
      authEndpoint: "https://auth.example.com"

# API definitions
apis:
  myapi:
    baseUrl: "{{profile.baseUrl}}"
    headers:
      Authorization: "Bearer {{profile.apiKey}}"
    variables:
      version: "v1"
    endpoints:
      getUser:
        method: GET
        path: "/{{api.version}}/users/{{userId}}"
        variables:
          format: "json"

# Request chains
chains:
  userWorkflow:
    description: "Create user and fetch profile"
    vars:
      userName: "Default User"
    steps:
      - id: createUser
        call: myapi.createUser
        with:
          body:
            name: "{{userName}}"
      - id: getUser
        call: myapi.getUser
        with:
          pathParams:
            userId: "{{steps.createUser.response.body.id}}"
```

### Variable System

Variables use `{{variable_name}}` syntax and follow this precedence (highest to lowest):

1. CLI arguments (`--var key=value`)
2. Step `with` overrides (in chains)
3. Chain variables (`chain.vars`)
4. Endpoint variables
5. API variables  
6. Profile variables
7. Global variable files
8. Secret variables (`{{secret.KEY}}`)
9. Environment variables (`{{env.VAR}}`)
10. Plugin variables (`{{plugins.name.var}}`)
11. Dynamic variables (`{{$timestamp}}`, `{{$randomInt}}`, etc.)

### Built-in Dynamic Variables

- `{{$timestamp}}` - Unix timestamp
- `{{$isoTimestamp}}` - ISO 8601 timestamp
- `{{$randomInt}}` - Random integer
- `{{$guid}}` - UUID v4

### Request Chains

Chains allow you to execute sequences of requests with data passing:

```yaml
chains:
  userOnboarding:
    description: "Complete user registration flow"
    vars:
      email: "user@example.com"
    steps:
      - id: register
        call: auth.register
        with:
          body:
            email: "{{email}}"
            password: "temppass123"
            
      - id: verify
        call: auth.verify
        with:
          body:
            token: "{{steps.register.response.body.verificationToken}}"
            
      - id: getProfile
        call: users.getProfile
        with:
          pathParams:
            userId: "{{steps.register.response.body.userId}}"
```

Access step data using:
- `{{steps.stepId.response.body.field}}` - Response body data
- `{{steps.stepId.response.headers['Header-Name']}}` - Response headers
- `{{steps.stepId.response.status}}` - Response status code
- `{{steps.stepId.request.url}}` - Request URL
- `{{steps.stepId.request.body.field}}` - Request body data

### Plugin System

Extend HttpCraft with custom JavaScript/TypeScript plugins:

```javascript
// plugins/auth-plugin.js
export default {
  name: 'authPlugin',
  
  setup(config, context) {
    // Plugin initialization
  },
  
  // Pre-request hook
  async preRequest(request, context) {
    // Modify request before sending
    request.headers['X-Custom-Auth'] = await getAuthToken();
    return request;
  },
  
  // Post-response hook  
  async postResponse(response, context) {
    // Transform response after receiving
    if (response.headers['content-type']?.includes('xml')) {
      response.body = await xmlToJson(response.body);
    }
    return response;
  },
  
  // Custom variables
  variables: {
    authToken: async () => await getAuthToken(),
    timestamp: () => Date.now()
  }
};
```

## 🔧 ZSH Completion Setup

### Quick Setup

Add to your `~/.zshrc`:

```bash
eval "$(httpcraft completion zsh)"
```

Then reload your shell:

```bash
source ~/.zshrc
```

### Manual Installation

```bash
# Generate and save completion script
httpcraft completion zsh > ~/.local/share/zsh/site-functions/_httpcraft

# Reload completions
compinit
```

### Features

- Complete API names: `httpcraft <TAB>`
- Complete endpoint names: `httpcraft myapi <TAB>`
- Complete chain names: `httpcraft chain <TAB>`
- Complete CLI options: `httpcraft --<TAB>`
- Complete config files: `httpcraft --config <TAB>`

## 🧪 Examples

### Simple API Testing

```bash
# Test a REST API
httpcraft jsonplaceholder getTodo
httpcraft jsonplaceholder createPost --var title="Test Post"
```

### Environment Management

```bash
# Test against different environments
httpcraft --profile dev myapi getUser --var userId=123
httpcraft --profile staging myapi getUser --var userId=123
httpcraft --profile prod myapi getUser --var userId=123
```

### Complex Workflows

```bash
# Execute multi-step workflow
httpcraft chain userOnboarding --var email="test@example.com"

# Debug workflow with verbose output
httpcraft --verbose chain userOnboarding --var email="test@example.com"

# Get detailed chain output
httpcraft chain userOnboarding --chain-output full
```

### Scripting and Automation

```bash
#!/bin/bash
# deployment-test.sh

# Test API endpoints after deployment
httpcraft --profile prod --exit-on-http-error "4xx,5xx" api healthCheck
httpcraft --profile prod --exit-on-http-error "4xx,5xx" api getVersion

# Run integration test chain
httpcraft --profile prod chain integrationTest --var testId="deploy-$(date +%s)"

echo "Deployment tests completed successfully!"
```

## 📋 Configuration Schema & Validation

HttpCraft includes a comprehensive JSON Schema for configuration validation and editor integration.

### Schema Features

- ✅ **Validation**: Catch configuration errors before runtime
- ✅ **Autocompletion**: Get intelligent suggestions in your editor
- ✅ **Documentation**: Hover help for all configuration options
- ✅ **Type checking**: Ensure correct data types and formats

### Editor Integration

#### VS Code

Install the "YAML" extension by Red Hat, then add to your VS Code settings:

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

Or add a schema reference directly to your config file:

```yaml
# yaml-language-server: $schema=./schemas/httpcraft-config.schema.json

apis:
  myapi:
    baseUrl: "https://api.example.com"
    # Editor will provide autocompletion and validation here!
```

#### IntelliJ IDEA / WebStorm

1. Go to **Settings** → **Languages & Frameworks** → **Schemas and DTDs** → **JSON Schema Mappings**
2. Click **+** to add a new mapping
3. Set **Schema file or URL** to `./schemas/httpcraft-config.schema.json`
4. Add file patterns: `*.httpcraft.yaml`, `*.httpcraft.yml`

### Command-Line Validation

Validate your configuration files using `ajv-cli`:

```bash
# Install ajv-cli globally
npm install -g ajv-cli

# Validate your config
ajv validate -s schemas/httpcraft-config.schema.json -d .httpcraft.yaml
```

### Schema Validation Rules

The schema enforces:

- **Required properties**: `apis` at root, `baseUrl`/`endpoints` for APIs
- **HTTP methods**: Only valid methods (`GET`, `POST`, `PUT`, etc.)
- **URL formats**: Base URLs must be HTTP/HTTPS or contain variables
- **Naming conventions**: API/endpoint names must follow identifier patterns
- **Variable syntax**: Supports `{{variable}}` substitutions
- **Chain structure**: Proper step definitions with `id` and `call`

### Example Validated Configuration

```yaml
# This configuration is fully validated by the schema
config:
  defaultProfile: "development"

profiles:
  development:
    baseUrl: "https://jsonplaceholder.typicode.com"
    apiKey: "dev-key-123"

apis:
  jsonplaceholder:
    baseUrl: "{{profile.baseUrl}}"
    headers:
      Authorization: "Bearer {{profile.apiKey}}"
    endpoints:
      getTodo:
        method: GET
        path: "/todos/{{todoId}}"
        variables:
          todoId: 1

chains:
  testFlow:
    steps:
      - id: getTodo
        call: jsonplaceholder.getTodo
```

## 🏗️ Development

### Project Structure

```
src/
├── cli/           # CLI command handlers
├── core/          # Core HTTP and configuration logic
└── types/         # TypeScript type definitions

tests/
├── unit/          # Unit tests
└── integration/   # Integration tests

examples/          # Example configurations
└── plugins/       # Example plugins
```

### Building and Testing

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run linting
npm run lint

# Format code
npm run format
```

### Using Nix (Optional)

This project includes Nix flake support for reproducible development environments:

```bash
# Enter development shell
nix develop

# Or use direnv for automatic activation
echo "use flake" > .envrc
direnv allow
```

## 🐛 Troubleshooting

### Common Issues

**Configuration file not found:**
```bash
# Check config file search paths
httpcraft --config ./my-config.yaml myapi endpoint
```

**Variable resolution errors:**
```bash
# Use dry-run to debug variable resolution
httpcraft --dry-run myapi endpoint --var debug=true
```

**Plugin loading issues:**
```bash
# Check plugin syntax and exports
node -c ./plugins/my-plugin.js
```

**Completion not working:**
```bash
# Verify completion script generation
httpcraft completion zsh

# Test completion commands
httpcraft --get-api-names
```

### Getting Help

- Use `httpcraft --help` for command help
- Use `httpcraft <command> --help` for command-specific help
- Check the `examples/` directory for configuration examples
- Enable `--verbose` for detailed request/response information

## 📄 License

[License information here]

## 🤝 Contributing

[Contributing guidelines here]

## 🔐 OAuth2 Authentication

HttpCraft includes built-in OAuth2 authentication support that works seamlessly with the plugin system:

### Built-in OAuth2 Plugin

The OAuth2 plugin is included with HttpCraft - no need to install or reference external files:

```yaml
plugins:
  # OAuth2 as built-in plugin - no path required!
  - name: "oauth2"
    config:
      grantType: "client_credentials"
      tokenUrl: "https://auth.example.com/oauth2/token"
      clientId: "{{env.OAUTH2_CLIENT_ID}}"
      clientSecret: "{{secret.OAUTH2_CLIENT_SECRET}}"
      scope: "api:read api:write"
      authMethod: "basic"

apis:
  protectedApi:
    baseUrl: "https://api.example.com/v1"
    endpoints:
      getUsers:
        method: GET
        path: "/users"
        # Authorization header automatically added by OAuth2 plugin
```

### OAuth2 Grant Types

- **Client Credentials**: Server-to-server authentication
- **Authorization Code**: User authentication with PKCE support  
- **Refresh Token**: Automatic token renewal

### OAuth2 Providers

Ready-to-use configurations for major providers:

#### Auth0
```yaml
plugins:
  - name: "oauth2"
    config:
      grantType: "client_credentials"
      tokenUrl: "https://{{env.AUTH0_DOMAIN}}/oauth/token"
      clientId: "{{env.AUTH0_CLIENT_ID}}"
      clientSecret: "{{secret.AUTH0_CLIENT_SECRET}}"
      scope: "read:users write:users"
      authMethod: "post"
```

#### Azure AD
```yaml
plugins:
  - name: "oauth2"
    config:
      grantType: "client_credentials"
      tokenUrl: "https://login.microsoftonline.com/{{env.AZURE_TENANT_ID}}/oauth2/v2.0/token"
      clientId: "{{env.AZURE_CLIENT_ID}}"
      clientSecret: "{{secret.AZURE_CLIENT_SECRET}}"
      scope: "https://graph.microsoft.com/.default"
```

#### Google OAuth2
```yaml
plugins:
  - name: "oauth2"
    config:
      grantType: "client_credentials"
      tokenUrl: "https://oauth2.googleapis.com/token"
      clientId: "{{env.GOOGLE_CLIENT_ID}}"
      clientSecret: "{{secret.GOOGLE_CLIENT_SECRET}}"
      scope: "https://www.googleapis.com/auth/cloud-platform"
```

### Manual Token Access

Access tokens directly in your configurations:

```yaml
apis:
  manualApi:
    baseUrl: "https://api.example.com"
    endpoints:
      getData:
        method: GET
        path: "/data"
        headers:
          # Use plugin variables directly
          Authorization: "{{plugins.oauth2.tokenType}} {{plugins.oauth2.accessToken}}"
      
      getAdminData:
        method: GET
        path: "/admin"
        headers:
          # Use parameterized functions for custom scopes
          Authorization: "Bearer {{plugins.oauth2.getTokenWithScope('admin:read')}}"
```

### Features

- **Automatic Token Management**: Intelligent caching and renewal
- **Provider Support**: Works with any OAuth2-compliant provider
- **Security**: Token masking in logs and dry-run output
- **Flexibility**: API-level configuration overrides
- **Integration**: Seamless integration with profiles, variables, and chains

See `examples/features/oauth2/builtin_oauth2.yaml` for a complete working example.

### Interactive Browser Authentication

HttpCraft supports modern browser-based OAuth2 authentication similar to Insomnia, automatically opening your browser for user authentication:

#### Configuration

```yaml
plugins:
  - name: "oauth2"
    config:
      # Interactive Authorization Code Grant Flow
      grantType: "authorization_code"
      
      # OAuth2 Provider Configuration
      authorizationUrl: "https://auth.example.com/oauth2/authorize"
      tokenUrl: "https://auth.example.com/oauth2/token"
      clientId: "{{env.OAUTH2_CLIENT_ID}}"
      clientSecret: "{{env.OAUTH2_CLIENT_SECRET}}"
      
      # Scopes and Audience
      scope: "openid profile email api:read api:write"
      audience: "https://api.example.com"
      
      # Interactive Flow Options (all optional - auto-detected)
      # interactive: true              # Auto-detected when conditions are met
      # usePKCE: true                  # Enabled by default for security
      # codeChallengeMethod: "S256"    # Default PKCE method
      # tokenStorage: "keychain"       # Auto-detected: keychain → filesystem → memory
      # callbackPort: 8080             # Auto-selected if not specified
      # callbackPath: "/callback"      # Default callback path

apis:
  userApi:
    baseUrl: "https://api.example.com"
    endpoints:
      getProfile:
        path: "/user/profile"
        method: GET
        # Authorization header automatically added by OAuth2 plugin
```

#### User Experience

**First-time authentication:**
```bash
$ httpcraft userApi getProfile
🔐 Authentication required...                        # stderr
🌐 Opening browser for OAuth2 authentication...      # stderr
⏳ Waiting for authorization (timeout: 5 minutes)... # stderr
✅ Authentication successful! Tokens stored securely. # stderr
{"user": {"id": 123, "name": "John Doe"}}            # stdout (for piping)
```

**Subsequent requests:**
```bash
$ httpcraft userApi getProfile
🔑 Using stored access token                         # stderr
{"user": {"id": 123, "name": "John Doe"}}            # stdout (for piping)
```

**Automatic token refresh:**
```bash
$ httpcraft userApi getProfile
🔄 Access token expired, refreshing...               # stderr
✅ Token refreshed successfully                      # stderr
{"user": {"id": 123, "name": "John Doe"}}            # stdout (for piping)
```

#### Features

- **Automatic Browser Launch**: Opens system browser for authorization
- **Secure Token Storage**: OS keychain integration with encrypted filesystem fallback
- **PKCE Security**: Proof Key for Code Exchange enabled by default
- **Environment Detection**: Graceful degradation in CI/automated environments
- **Unix Piping Compatible**: Auth messages go to stderr, response to stdout
- **Zero Configuration**: Interactive mode auto-detected when appropriate

#### Provider Examples

**Auth0:**
```yaml
authorizationUrl: "https://your-tenant.auth0.com/authorize"
tokenUrl: "https://your-tenant.auth0.com/oauth/token"
audience: "https://api.your-app.com"
```

**Azure AD:**
```yaml
authorizationUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize"
tokenUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
scope: "https://graph.microsoft.com/.default"
```

**Google OAuth2:**
```yaml
authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth"
tokenUrl: "https://oauth2.googleapis.com/token"
scope: "https://www.googleapis.com/auth/userinfo.profile"
```

See `examples/features/oauth2/interactive_oauth2.yaml` for complete working examples.

## 🚀 Quick Start

### 1. Create Configuration

Create `.httpcraft.yaml` in your project directory:

```yaml
profiles:
  dev:
    baseUrl: "https://dev-api.example.com"
  prod:
    baseUrl: "https://api.example.com"

apis:
  jsonplaceholder:
    baseUrl: "{{profile.baseUrl}}/v1"
    endpoints:
      getTodos:
        method: GET
        path: "/todos"
      
      getTodo:
        method: GET
        path: "/todos/{{todoId}}"
      
      createTodo:
        method: POST
        path: "/todos"
        headers:
          Content-Type: "application/json"
        body:
          title: "{{title}}"
          completed: false
```

### 2. Make Requests

```bash
# Basic request
httpcraft jsonplaceholder getTodos

# With variables
httpcraft jsonplaceholder getTodo --var todoId=1

# With profile
httpcraft --profile dev jsonplaceholder getTodos

# Create a todo
httpcraft jsonplaceholder createTodo --var title="Test Todo"
```

### 3. Use Verbose Mode

```bash
# See request/response details
httpcraft --verbose jsonplaceholder getTodos

# Dry run (see what would be sent)
httpcraft --dry-run jsonplaceholder getTodos
```

## 📋 Configuration Structure

```yaml
# Global configuration
config:
  defaultProfile: "dev"

# Environment profiles
profiles:
  dev:
    api_base: "https://dev-api.example.com"
    debug: true
  prod:
    api_base: "https://api.example.com"
    debug: false

# Global variables
variables:
  - "globals.yaml"

# Plugin configuration
plugins:
  - path: "./plugins/auth.js"
    name: "customAuth"
    config:
      apiKey: "{{secret.API_KEY}}"

# API definitions
apis:
  myService:
    baseUrl: "{{profile.api_base}}"
    headers:
      User-Agent: "HttpCraft/1.0"
    variables:
      version: "v1"
    endpoints:
      getUsers:
        method: GET
        path: "/{{version}}/users"

# Request chains
chains:
  userWorkflow:
    vars:
      email: "test@example.com"
    steps:
      - id: createUser
        call: myService.createUser
      - id: getUser
        call: myService.getUser
        with:
          pathParams:
            userId: "{{steps.createUser.response.body.id}}"
```

## 🔗 Request Chaining

Chain multiple requests together with data passing:

```yaml
chains:
  userRegistration:
    description: "Complete user registration flow"
    vars:
      email: "user@example.com"
      password: "secure123"
    
    steps:
      - id: register
        call: auth.register
        with:
          body:
            email: "{{email}}"
            password: "{{password}}"
      
      - id: login
        call: auth.login
        with:
          body:
            email: "{{email}}"
            password: "{{password}}"
      
      - id: getProfile
        call: users.getProfile
        with:
          headers:
            Authorization: "Bearer {{steps.login.response.body.token}}"
      
      - id: updateProfile
        call: users.updateProfile
        with:
          headers:
            Authorization: "Bearer {{steps.login.response.body.token}}"
          body:
            name: "{{steps.getProfile.response.body.name}}"
            verified: true
```

```bash
# Execute the chain
httpcraft chain userRegistration

# Chain with verbose output
httpcraft chain userRegistration --chain-output full
```

## 🧩 Variable System

HttpCraft provides a powerful variable system with multiple scopes and precedence:

### Variable Precedence (highest to lowest)
1. CLI arguments (`--var key=value`)
2. Step `with` overrides (in chains)
3. Chain variables
4. Endpoint variables
5. API variables
6. Profile variables
7. Global variable files
8. Plugin variables
9. Secret variables (`{{secret.KEY}}`)
10. Environment variables (`{{env.KEY}}`)
11. Dynamic variables (`{{$timestamp}}`)

### Built-in Dynamic Variables
- `{{$timestamp}}` - Unix timestamp
- `{{$isoTimestamp}}` - ISO 8601 timestamp
- `{{$randomInt}}` - Random integer
- `{{$guid}}` - UUID v4

### Examples

```bash
# Override variables from CLI
httpcraft myApi getUser --var userId=123 --var format=json

# Use environment variables
export USER_ID=456
httpcraft myApi getUser  # Uses {{env.USER_ID}}

# Use secrets (masked in logs)
export API_SECRET=secret123
httpcraft myApi secureEndpoint  # Uses {{secret.API_SECRET}}
```

## 🔌 Plugin System

Extend HttpCraft with custom plugins for authentication, response transformation, and more:

### Example Plugin

```javascript
// plugins/customAuth.js
export default {
  async setup(context) {
    // Pre-request hook
    context.registerPreRequestHook(async (request) => {
      const token = await getApiToken(context.config.apiKey);
      request.headers['Authorization'] = `Bearer ${token}`;
    });
    
    // Custom variables
    context.registerVariableSource('apiToken', async () => {
      return await getApiToken(context.config.apiKey);
    });
    
    // Post-response hook
    context.registerPostResponseHook(async (request, response) => {
      if (response.headers['content-type']?.includes('xml')) {
        response.body = convertXmlToJson(response.body);
      }
    });
  }
};
```

### Plugin Configuration

```yaml
plugins:
  - path: "./plugins/customAuth.js"
    name: "auth"
    config:
      apiKey: "{{secret.API_KEY}}"
      timeout: 30000

apis:
  secureApi:
    baseUrl: "https://secure-api.example.com"
    plugins:
      - name: "auth"
        config:
          # Override plugin config for this API
          timeout: 60000
```

## 🏗️ ZSH Tab Completion

Enable intelligent tab completion for faster workflows:

### Setup

```bash
# Generate completion script
httpcraft completion zsh > ~/.zsh/completions/_httpcraft

# Add to .zshrc
echo 'fpath=(~/.zsh/completions $fpath)' >> ~/.zshrc
echo 'autoload -Uz compinit && compinit' >> ~/.zshrc

# Reload shell
source ~/.zshrc
```

### Usage

```bash
httpcraft <TAB>              # Complete API names
httpcraft myApi <TAB>        # Complete endpoint names
httpcraft --profile <TAB>    # Complete profile names
httpcraft chain <TAB>        # Complete chain names
```

## 📊 Output Options

### Default Output
Raw response body sent to `stdout` (perfect for piping):

```bash
httpcraft api getUsers | jq '.[] | .name'
```

### Verbose Output
Detailed request/response information to `stderr`:

```bash
httpcraft --verbose api getUsers
```

### Dry Run
See what would be sent without making the request:

```bash
httpcraft --dry-run api getUsers
```

### Chain Output
Structured JSON output for chains:

```bash
httpcraft chain workflow --chain-output full | jq .
```

## 🐛 Error Handling

### Exit Codes
- `0`: Success (including HTTP 4xx/5xx by default)
- `1`: Tool errors, configuration errors, network failures

### Custom Exit Codes
```bash
# Exit with non-zero for HTTP errors
httpcraft --exit-on-http-error 4xx,5xx api getUsers
```

### Debugging
```bash
# Verbose mode shows request/response details
httpcraft --verbose api getUsers

# Dry run shows resolved configuration
httpcraft --dry-run api getUsers

# Check configuration loading
httpcraft --get-api-names
httpcraft --get-endpoint-names myApi
```

## 📁 Project Structure

```
.httpcraft.yaml          # Main configuration
apis/                    # Modular API definitions
  auth.yaml
  users.yaml
chains/                  # Modular chain definitions
  workflows.yaml
plugins/                 # Custom plugins
  oauth.js
  transforms.js
variables/               # Global variables
  environments.yaml
  secrets.yaml
```

## 🔧 Development

### Prerequisites
- Node.js 18+
- npm

### Setup
```bash
git clone <repository>
cd httpcraft
npm install
npm run build
```

### Testing
```bash
npm test
npm run test:integration
```

### Development Environment (Nix)
```bash
nix develop
```

## 📚 Advanced Examples

### Multi-Environment Setup

```yaml
profiles:
  dev:
    auth_url: "https://dev-auth.example.com"
    api_url: "https://dev-api.example.com"
  staging:
    auth_url: "https://staging-auth.example.com"
    api_url: "https://staging-api.example.com"
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
  users:
    baseUrl: "{{profile.api_url}}/v1"
    plugins:
      - name: "oauth2"
```

### Complex Workflow Chain

```yaml
chains:
  deploymentTest:
    description: "End-to-end deployment testing"
    vars:
      version: "1.2.3"
      environment: "staging"
    
    steps:
      - id: healthCheck
        call: monitoring.health
      
      - id: deploy
        call: deployment.deploy
        with:
          body:
            version: "{{version}}"
            environment: "{{environment}}"
      
      - id: waitForDeployment
        call: deployment.status
        with:
          pathParams:
            deployId: "{{steps.deploy.response.body.id}}"
      
      - id: smokeTest
        call: testing.smokeTest
        with:
          body:
            deploymentId: "{{steps.deploy.response.body.id}}"
            tests: ["api", "database", "cache"]
      
      - id: notifySuccess
        call: notifications.slack
        with:
          body:
            message: "Deployment {{version}} to {{environment}} completed successfully"
            results: "{{steps.smokeTest.response.body}}"
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

[License details here]

## 🆘 Support

- [Documentation](docs/)
- [GitHub Issues](https://github.com/your-repo/issues)
- [Examples](examples/)

---

**HttpCraft** - Making HTTP testing simple, powerful, and enjoyable! 🚀 