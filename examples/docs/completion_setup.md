# HttpCraft ZSH Completion Setup

This guide explains how to set up ZSH tab completion for HttpCraft.

## Prerequisites

- ZSH shell
- HttpCraft installed and available in your PATH

## Setup Instructions

### Option 1: Add to .zshrc (Recommended)

Add the following line to your `~/.zshrc` file:

```bash
eval "$(httpcraft completion zsh)"
```

Then reload your shell:

```bash
source ~/.zshrc
```

### Option 2: Install to completion directory

Generate the completion script and save it to your ZSH completions directory:

```bash
httpcraft completion zsh > ~/.local/share/zsh/site-functions/_httpcraft
```

Or for system-wide installation:

```bash
sudo httpcraft completion zsh > /usr/local/share/zsh/site-functions/_httpcraft
```

Then restart your shell or run:

```bash
compinit
```

## Usage

Once set up, you can use tab completion with HttpCraft:

### Complete API names

```bash
httpcraft <TAB>
# Shows: request, completion, and any API names from your config
```

### Complete endpoint names

```bash
httpcraft github-api <TAB>
# Shows: get-user, list-repos, etc. (endpoints for github-api)
```

### Complete CLI options

```bash
httpcraft --<TAB>
# Shows: --config, --var, --profile, --verbose, --dry-run, --exit-on-http-error, --help, --version
```

### Complete config files

```bash
httpcraft --config <TAB>
# Shows: *.yaml files in current directory
```

## Features

- **Dynamic API completion**: API names are loaded from your configuration file
- **Contextual endpoint completion**: Endpoint names are shown based on the selected API
- **Option completion**: All CLI options are available for completion
- **File completion**: Config files (*.yaml) are completed for the --config option
- **Error handling**: Completion gracefully handles missing or invalid config files

## Troubleshooting

### Completion not working

1. Verify HttpCraft is in your PATH:
   ```bash
   which httpcraft
   ```

2. Test the completion command manually:
   ```bash
   httpcraft completion zsh
   ```

3. Check if your config file is valid:
   ```bash
   httpcraft --get-api-names
   ```

4. Verify the completion function is loaded:
   ```bash
   # After running eval "$(httpcraft completion zsh)"
   which _httpcraft
   ```

### No API names showing

- Ensure you have a valid configuration file (`.httpcraft.yaml` in current directory or specify with `--config`)
- Check that your config file has an `apis` section with defined APIs

### Slow completion

- Completion performance depends on config file size and complexity
- Consider using a local config file rather than a remote one

### Error: "_arguments:comparguments:327: can only be called from completion function"

This error has been fixed in the latest version. Make sure you're using the updated completion script by running:

```bash
eval "$(httpcraft completion zsh)" 