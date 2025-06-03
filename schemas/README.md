# HttpCraft Configuration Schema

This directory contains the JSON Schema for HttpCraft configuration files. The schema provides validation and autocompletion support in editors and YAML linters.

## Files

- `httpcraft-config.schema.json` - The main configuration schema for HttpCraft YAML files

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

apis:
  myapi:
    baseUrl: "https://api.example.com"
    # ... rest of configuration
```

### With IntelliJ IDEA / WebStorm

1. Go to **Settings** → **Languages & Frameworks** → **Schemas and DTDs** → **JSON Schema Mappings**
2. Click **+** to add a new mapping
3. Set **Schema file or URL** to the path of `httpcraft-config.schema.json`
4. Add file patterns: `*.httpcraft.yaml`, `*.httpcraft.yml`, `.httpcraft.yaml`, `.httpcraft.yml`

### With yamllint

Add the schema to your `.yamllint.yml` configuration:

```yaml
extends: default
rules:
  line-length:
    max: 120
```

Then validate your configuration:

```bash
yamllint .httpcraft.yaml
```

### Command-line Validation

You can validate your configuration files using tools like `ajv-cli`:

```bash
# Install ajv-cli
npm install -g ajv-cli

# Validate a config file
ajv validate -s schemas/httpcraft-config.schema.json -d .httpcraft.yaml
```

## Schema Features

The schema provides validation and autocompletion for:

- **Configuration structure** - All top-level sections (config, profiles, apis, chains, etc.)
- **API definitions** - Base URLs, headers, endpoints, variables
- **Endpoint definitions** - HTTP methods, paths, request bodies, parameters
- **Chain definitions** - Multi-step request sequences with data passing
- **Variable systems** - All variable scopes and precedence rules
- **Plugin configurations** - Local and npm plugin settings
- **Import specifications** - Modular configuration imports

## Schema Validation Rules

### Required Properties
- `apis` is required at the root level
- `baseUrl` and `endpoints` are required for each API
- `method` and `path` are required for each endpoint
- `id`, `call`, and `steps` are required for chain steps

### Pattern Validation
- API names: `^[a-zA-Z][a-zA-Z0-9_-]*$`
- Endpoint names: `^[a-zA-Z][a-zA-Z0-9_-]*$`
- Chain step IDs: `^[a-zA-Z][a-zA-Z0-9_-]*$`
- Variable names: `^[a-zA-Z_][a-zA-Z0-9_]*$`
- Header names: `^[a-zA-Z][a-zA-Z0-9-]*$`
- Base URLs: Must start with `http://` or `https://`
- Paths: Must start with `/`
- Step calls: Must be in format `api_name.endpoint_name`

### HTTP Methods
Supported HTTP methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`

### Variable Support
Variables can be:
- Strings (most common)
- Numbers
- Booleans
- null values

### Body Types
Request bodies can be:
- Objects (for JSON)
- Arrays
- Strings (for raw content)
- Numbers, booleans, or null

## Example Configuration

Here's a minimal valid configuration that follows the schema:

```yaml
apis:
  jsonplaceholder:
    baseUrl: "https://jsonplaceholder.typicode.com"
    endpoints:
      getTodo:
        method: GET
        path: "/todos/1"
```

For more comprehensive examples, see the `examples/` directory in the project root.

## Troubleshooting

### Schema Not Loading
- Ensure the file path in your editor configuration is correct
- Check that the schema file exists and is valid JSON
- Restart your editor after adding schema configuration

### Validation Errors
- Check that required properties are present
- Verify naming patterns match the regex requirements
- Ensure HTTP methods are from the allowed list
- Confirm URLs and paths follow the expected format

### Autocompletion Not Working
- Make sure your YAML extension supports JSON Schema
- Verify the schema is properly associated with your file patterns
- Check editor console for any schema loading errors 