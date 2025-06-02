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

_httpcraft() {
    local state line
    typeset -A opt_args

    _arguments -C \\
        '1: :->command' \\
        '2: :->endpoint' \\
        '--config[Path to configuration file]:config file:_files -g "*.yaml"' \\
        '--var[Set or override a variable]:variable:' \\
        '--profile[Select profile(s) to use]:profile:' \\
        '--verbose[Output detailed request and response information]' \\
        '--dry-run[Display the request without sending it]' \\
        '--exit-on-http-error[Exit with non-zero code for HTTP errors]:error pattern:' \\
        '--help[Show help]' \\
        '--version[Show version]' \\
        '*: :->args' && return 0

    case $state in
        command)
            local -a commands
            commands=(
                'request:Make an HTTP GET request to the specified URL'
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
        endpoint)
            local api_name=$line[1]
            
            # Get endpoint names for the selected API
            local -a endpoint_names
            endpoint_names=($(httpcraft --get-endpoint-names "$api_name" 2>/dev/null))
            
            _describe 'endpoint' endpoint_names
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