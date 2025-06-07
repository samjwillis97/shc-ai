# HttpCraft Nix Integration

This document explains how to use HttpCraft with Nix flakes for easy development, testing, and distribution.

## Features

The Nix flake provides:

1. **Built HttpCraft package** - Automatically builds from source
2. **Development shell** - Includes HttpCraft in PATH with completions
3. **ZSH completions** - Automatically set up in the development shell
4. **Package distribution** - Can be installed or used in other Nix environments

## Quick Start

### Enter Development Shell

```bash
# From the project directory
nix develop

# Or use direnv (if .envrc is set up)
direnv allow
```

This will:
- ✅ Build HttpCraft from source
- ✅ Add `httpcraft` command to PATH  
- ✅ Set up ZSH completions (if using ZSH)
- ✅ Show helpful getting started messages

### Build the Package

```bash
# Build HttpCraft package
nix build .#httpcraft

# Run the built package
./result/bin/httpcraft --version
```

### Run Checks

```bash
# Run all flake checks (build + tests)
nix flake check
```

## Development Workflow

1. **Start development**:
   ```bash
   nix develop
   # or with direnv: direnv allow
   ```

2. **Make changes** to TypeScript source files

3. **Test immediately**:
   ```bash
   # HttpCraft is automatically rebuilt and available
   httpcraft --version
   httpcraft completion zsh
   ```

4. **Test completions**:
   ```bash
   # If using ZSH, completions are already loaded
   httpcraft <TAB>
   httpcraft --get-api-names --config test-phase5-demo.yaml
   ```

## Package Usage

### Install in Another Project

Add to your `flake.nix`:

```nix
{
  inputs.httpcraft.url = "github:your-org/httpcraft";
  
  outputs = { nixpkgs, httpcraft, ... }: {
    devShells.default = pkgs.mkShell {
      packages = [
        httpcraft.packages.${system}.httpcraft
      ];
    };
  };
}
```

### Use as a Tool

```bash
# Run directly from GitHub
nix run github:your-org/httpcraft -- --version

# Install globally
nix profile install github:your-org/httpcraft
```

## Shell Integration

### ZSH Completions

When entering the development shell with ZSH, completions are automatically set up:

```bash
# These work immediately:
httpcraft <TAB>                    # Shows commands + API names
httpcraft myapi <TAB>              # Shows endpoints for myapi
httpcraft --config <TAB>           # Shows *.yaml files
```

### Manual Completion Setup

If you want to set up completions in another environment:

```bash
# Add to your .zshrc
eval "$(httpcraft completion zsh)"
```

## Testing Configuration

The development shell automatically detects test configs:

```bash
# If test-phase5-demo.yaml exists, you'll see:
httpcraft --get-api-names --config ./test-phase5-demo.yaml

# Test with the example config
httpcraft jsonplaceholder getTodo --config ./test-phase5-demo.yaml --var id=1
```

## Benefits

1. **Reproducible Builds** - Same build on any machine with Nix
2. **No Installation Required** - Just `nix develop` and start using
3. **Isolated Dependencies** - No conflicts with system packages
4. **Easy Testing** - Completions and CLI ready immediately
5. **Cross-Platform** - Works on Linux, macOS (and WSL)

## Troubleshooting

### "command not found: httpcraft"

Make sure you're in the development shell:
```bash
nix develop
# or
direnv allow
```

### Completions not working

1. Make sure you're using ZSH
2. The shell hook should automatically set up completions
3. Try manually: `eval "$(httpcraft completion zsh)"`

### Build fails

1. Make sure you have Nix installed
2. Update flake inputs: `nix flake update`
3. Clean build: `nix build .#httpcraft --rebuild`

### Old version showing

The development shell caches builds. Exit and re-enter:
```bash
exit
nix develop
```

## Advanced Usage

### Custom Build

```bash
# Build for specific system
nix build .#httpcraft --system x86_64-linux

# Build with specific Node.js version
# (edit flake.nix to change nodejs version)
```

### Integration Testing

```bash
# Run all checks including build tests
nix flake check --all-systems

# Test specific package
nix build .#checks.x86_64-linux.httpcraft-test
``` 