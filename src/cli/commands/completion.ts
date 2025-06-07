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
    console.error(`Error: Shell '${args.shell}' is not supported`);
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
    '(--var)--var[Variable assignment]:variable assignment:' \\
    '(--profile)--profile[Profile to use]:profile:_httpcraft_profiles' \\
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
        'chain:Execute a chain of requests'
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

_httpcraft "$@"`;
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
    console.log(apiNames.join('\n'));
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
    console.log(endpointNames.join('\n'));
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
    console.log(chainNames.join('\n'));
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
    console.log(profileNames.join('\n'));
  } catch {
    // Silently ignore errors in completion to avoid breaking tab completion
    return;
  }
}
