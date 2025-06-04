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