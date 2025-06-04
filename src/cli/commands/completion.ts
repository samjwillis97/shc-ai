import { configLoader, ConfigWithPath } from '../../core/configLoader.js';
import type { HttpCraftConfig } from '../../types/config.js';

export interface CompletionCommandArgs {
  shell: string;
}

export interface GetApiNamesArgs {
  config?: string;
}

export interface GetEndpointNamesArgs {
  apiName: string;
  config?: string;
}

export interface GetChainNamesArgs {
  config?: string;
}

export interface GetProfileNamesArgs {
  config?: string;
}

/**
 * Handle the completion zsh command that outputs the ZSH completion script
 */
export async function handleCompletionCommand(args: CompletionCommandArgs): Promise<void> {
  if (args.shell !== 'zsh') {
    console.error('Error: Only ZSH completion is currently supported');
    process.exit(1);
  }

  const completionScript = generateZshCompletionScript();
  console.log(completionScript);
}

/**
 * Generate the ZSH completion script
 */
function generateZshCompletionScript(): string {
  return `#compdef httpcraft

_httpcraft_profiles() {
    local -a profile_names
    profile_names=($(httpcraft --get-profile-names 2>/dev/null))
    _describe 'profile' profile_names
}

_httpcraft() {
    local state line
    typeset -A opt_args

    _arguments -C \\
        '1: :->command' \\
        '2: :->subcommand' \\
        '--config[Path to configuration file]:config file:_files -g "*.yaml"' \\
        '--var[Set or override a variable]:variable:' \\
        '--profile[Select profile(s) to use]:profile:_httpcraft_profiles' \\
        '--verbose[Output detailed request and response information]' \\
        '--dry-run[Display the request without sending it]' \\
        '--exit-on-http-error[Exit with non-zero code for HTTP errors]:error pattern:' \\
        '--chain-output[Output format for chains]:output format:(default full)' \\
        '--help[Show help]' \\
        '--version[Show version]' \\
        '*: :->args' && return 0

    case $state in
        command)
            local -a commands
            commands=(
                'request:Make an HTTP GET request to the specified URL'
                'chain:Execute a chain of HTTP requests'
                'completion:Generate shell completion script'
            )
            
            # Get API names dynamically
            local -a api_names
            api_names=($(httpcraft --get-api-names 2>/dev/null))
            
            # Add API names to commands
            for api_name in $api_names; do
                commands+=("$api_name")
            done
            
            _describe 'command' commands
            ;;
        subcommand)
            local cmd=$line[1]
            
            case $cmd in
                chain)
                    # Complete chain names after 'httpcraft chain'
                    local -a chain_names
                    chain_names=($(httpcraft --get-chain-names 2>/dev/null))
                    _describe 'chain name' chain_names
                    ;;
                completion)
                    # Complete shell types for completion command
                    _describe 'shell' '(zsh)'
                    ;;
                request)
                    # Complete URLs - just show a placeholder message
                    _message 'URL to request'
                    ;;
                *)
                    # For API names, complete endpoint names
                    local -a endpoint_names
                    endpoint_names=($(httpcraft --get-endpoint-names "$cmd" 2>/dev/null))
                    _describe 'endpoint' endpoint_names
                    ;;
            esac
            ;;
    esac
}

# Register the completion function with compdef
compdef _httpcraft httpcraft`;
}

/**
 * Handle the hidden --get-api-names command
 */
export async function handleGetApiNamesCommand(args: GetApiNamesArgs): Promise<void> {
  try {
    // Load configuration
    let config: HttpCraftConfig;
    
    if (args.config) {
      config = await configLoader.loadConfig(args.config);
    } else {
      const defaultConfigResult = await configLoader.loadDefaultConfig();
      if (!defaultConfigResult) {
        // Silently exit if no config found - completion should not error
        return;
      }
      config = defaultConfigResult.config;
    }
    
    // Output API names, one per line
    const apiNames = Object.keys(config.apis || {});
    for (const apiName of apiNames) {
      console.log(apiName);
    }
  } catch (error) {
    // Silently fail for completion - errors would break tab completion
    // User can use regular commands to see actual errors
  }
}

/**
 * Handle the hidden --get-endpoint-names command
 */
export async function handleGetEndpointNamesCommand(args: GetEndpointNamesArgs): Promise<void> {
  try {
    // Load configuration
    let config: HttpCraftConfig;
    
    if (args.config) {
      config = await configLoader.loadConfig(args.config);
    } else {
      const defaultConfigResult = await configLoader.loadDefaultConfig();
      if (!defaultConfigResult) {
        // Silently exit if no config found - completion should not error
        return;
      }
      config = defaultConfigResult.config;
    }
    
    // Find the API and output its endpoint names
    const api = config.apis?.[args.apiName];
    if (api && api.endpoints) {
      const endpointNames = Object.keys(api.endpoints);
      for (const endpointName of endpointNames) {
        console.log(endpointName);
      }
    }
  } catch (error) {
    // Silently fail for completion - errors would break tab completion
    // User can use regular commands to see actual errors
  }
}

/**
 * Handle the hidden --get-chain-names command
 */
export async function handleGetChainNamesCommand(args: GetChainNamesArgs): Promise<void> {
  try {
    // Load configuration
    let config: HttpCraftConfig;
    
    if (args.config) {
      config = await configLoader.loadConfig(args.config);
    } else {
      const defaultConfigResult = await configLoader.loadDefaultConfig();
      if (!defaultConfigResult) {
        // Silently exit if no config found - completion should not error
        return;
      }
      config = defaultConfigResult.config;
    }
    
    // Output chain names, one per line
    const chainNames = Object.keys(config.chains || {});
    for (const chainName of chainNames) {
      console.log(chainName);
    }
  } catch (error) {
    // Silently fail for completion - errors would break tab completion
    // User can use regular commands to see actual errors
  }
}

/**
 * Handle the hidden --get-profile-names command
 */
export async function handleGetProfileNamesCommand(args: GetProfileNamesArgs): Promise<void> {
  try {
    // Load configuration
    let config: HttpCraftConfig;
    
    if (args.config) {
      config = await configLoader.loadConfig(args.config);
    } else {
      const defaultConfigResult = await configLoader.loadDefaultConfig();
      if (!defaultConfigResult) {
        // Silently exit if no config found - completion should not error
        return;
      }
      config = defaultConfigResult.config;
    }
    
    // Output profile names, one per line
    const profileNames = Object.keys(config.profiles || {});
    for (const profileName of profileNames) {
      console.log(profileName);
    }
  } catch (error) {
    // Silently fail for completion - errors would break tab completion
    // User can use regular commands to see actual errors
  }
} 