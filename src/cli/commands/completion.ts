import { configLoader } from '../../core/configLoader.js';
import type {
  HttpCraftConfig,
} from '../../types/config.js';

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
  if (args.shell === 'zsh') {
    console.log(generateZshCompletion());
  } else {
    console.error('Error: Only ZSH completion is currently supported');
    process.exit(1);
  }
}

/**
 * Generate the ZSH completion script
 */
function generateZshCompletion(): string {
  return `#compdef httpcraft

_httpcraft_apis() {
  local apis
  apis=($(httpcraft --get-api-names 2>/dev/null))
  _describe 'API' apis
}

_httpcraft_endpoints() {
  local endpoints
  if [[ -n $words[3] ]]; then
    endpoints=($(httpcraft --get-endpoint-names $words[3] 2>/dev/null))
    _describe 'endpoint' endpoints
  fi
}

_httpcraft_chains() {
  local chains
  chains=($(httpcraft --get-chain-names 2>/dev/null))
  _describe 'chain' chains
}

_httpcraft_profiles() {
  local profiles
  profiles=($(httpcraft --get-profile-names 2>/dev/null))
  _describe 'profile' profiles
}

_httpcraft() {
  local context state line
  typeset -A opt_args

  _arguments -C \\
    '1: :->command' \\
    '*: :->args' \\
    '(--config)--config[Configuration file]:config file:_files -g "*.yaml" -g "*.yml"' \\
    '*--var[Set or override a variable]:variable:' \\
    '*--profile[Select profile(s) to use]:profile:_httpcraft_profiles' \\
    '(--verbose)--verbose[Verbose output]' \\
    '(--dry-run)--dry-run[Dry run mode]' \\
    '(--exit-on-http-error)--exit-on-http-error[Exit on HTTP error]:error pattern:' \\
    '(--no-default-profile)--no-default-profile[Do not use default profiles]' \\
    '(--chain-output)--chain-output[Chain output format]:format:(default full)' \\
    '(--version)--version[Show version]' \\
    '(--help)--help[Show help]'

  case $state in
    (command)
      local commands
      commands=(
        'completion:Generate shell completion script'
        'request:Make a direct HTTP request'
        'chain:Execute a chain of HTTP requests'
      )
      
      # Add API commands dynamically
      local apis
      apis=($(httpcraft --get-api-names 2>/dev/null))
      for api in $apis; do
        commands+=("$api:Execute API endpoints")
      done
      
      _describe 'command' commands
      ;;
    (args)
      case $words[2] in
        (completion)
          _arguments \\
            '1: :_values "shell" zsh'
          ;;
        (request)
          _arguments \\
            '1: :_urls'
          ;;
        (chain)
          _arguments \\
            '1: :_httpcraft_chains'
          ;;
        (*)
          # Handle API endpoints
          local apis
          apis=($(httpcraft --get-api-names 2>/dev/null))
          if [[ " $apis " =~ " $words[2] " ]]; then
            _httpcraft_endpoints
          fi
          ;;
      esac
      ;;
  esac
}

# Only set up completion when script is sourced
if [[ $ZSH_EVAL_CONTEXT == 'toplevel' ]] || [[ -n $BASH_VERSION ]]; then
  # Script is being sourced, set up completion
  # Ensure completion system is loaded
  autoload -Uz compinit
  compinit -i
  compdef _httpcraft httpcraft
fi`;
}

/**
 * Handle the hidden --get-api-names command
 */
export async function handleGetApiNamesCommand(args: GetApiNamesArgs): Promise<void> {
  try {
    let config: HttpCraftConfig;

    if (args.config) {
      config = await configLoader.loadConfig(args.config);
    } else {
      const defaultConfig = await configLoader.loadDefaultConfig();
      if (!defaultConfig) {
        // Silently exit if no config found - completion should be graceful
        return;
      }
      config = defaultConfig.config;
    }

    const apiNames = Object.keys(config.apis || {});
    if (apiNames.length === 0) {
      // Don't log anything if there are no APIs
      return;
    }
    
    // Log each API name separately
    for (const apiName of apiNames) {
      console.log(apiName);
    }
  } catch {
    // Silently ignore errors in completion to avoid breaking tab completion
    return;
  }
}

/**
 * Handle the hidden --get-endpoint-names command
 */
export async function handleGetEndpointNamesCommand(args: GetEndpointNamesArgs): Promise<void> {
  try {
    let config: HttpCraftConfig;

    if (args.config) {
      config = await configLoader.loadConfig(args.config);
    } else {
      const defaultConfig = await configLoader.loadDefaultConfig();
      if (!defaultConfig) {
        // Silently exit if no config found - completion should be graceful
        return;
      }
      config = defaultConfig.config;
    }

    const api = config.apis?.[args.apiName];
    if (!api) {
      // Silently exit if API not found - completion should be graceful
      return;
    }

    const endpointNames = Object.keys(api.endpoints || {});
    if (endpointNames.length === 0) {
      // Don't log anything if there are no endpoints
      return;
    }
    
    // Log each endpoint name separately
    for (const endpointName of endpointNames) {
      console.log(endpointName);
    }
  } catch {
    // Silently ignore errors in completion to avoid breaking tab completion
    return;
  }
}

/**
 * Handle the hidden --get-chain-names command
 */
export async function handleGetChainNamesCommand(args: GetChainNamesArgs): Promise<void> {
  try {
    let config: HttpCraftConfig;

    if (args.config) {
      config = await configLoader.loadConfig(args.config);
    } else {
      const defaultConfig = await configLoader.loadDefaultConfig();
      if (!defaultConfig) {
        // Silently exit if no config found - completion should be graceful
        return;
      }
      config = defaultConfig.config;
    }

    const chainNames = Object.keys(config.chains || {});
    if (chainNames.length === 0) {
      // Don't log anything if there are no chains
      return;
    }
    
    // Log each chain name separately
    for (const chainName of chainNames) {
      console.log(chainName);
    }
  } catch {
    // Silently ignore errors in completion to avoid breaking tab completion
    return;
  }
}

/**
 * Handle the hidden --get-profile-names command
 */
export async function handleGetProfileNamesCommand(args: GetProfileNamesArgs): Promise<void> {
  try {
    let config: HttpCraftConfig;

    if (args.config) {
      config = await configLoader.loadConfig(args.config);
    } else {
      const defaultConfig = await configLoader.loadDefaultConfig();
      if (!defaultConfig) {
        // Silently exit if no config found - completion should be graceful
        return;
      }
      config = defaultConfig.config;
    }

    const profileNames = Object.keys(config.profiles || {});
    if (profileNames.length === 0) {
      // Don't log anything if there are no profiles
      return;
    }
    
    // Log each profile name separately
    for (const profileName of profileNames) {
      console.log(profileName);
    }
  } catch {
    // Silently ignore errors in completion to avoid breaking tab completion
    return;
  }
}
