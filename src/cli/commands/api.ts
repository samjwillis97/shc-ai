import { configLoader, ConfigWithPath } from '../../core/configLoader.js';
import { urlBuilder } from '../../core/urlBuilder.js';
import { httpClient } from '../../core/httpClient.js';
import { variableResolver, VariableResolutionError } from '../../core/variableResolver.js';
import { VariableResolver } from '../../core/variableResolver.js';
import { PluginManager } from '../../core/pluginManager.js';
import type {
  HttpCraftConfig,
  ApiDefinition,
  EndpointDefinition,
  PluginConfiguration,
} from '../../types/config.js';
import path from 'path';

export interface ApiCommandArgs {
  apiName: string;
  endpointName: string;
  config?: string;
  variables?: Record<string, string>;
  profiles?: string[];
  noDefaultProfile?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  exitOnHttpError?: string;
}

export async function handleApiCommand(args: ApiCommandArgs): Promise<void> {
  try {
    // Load configuration
    let config: HttpCraftConfig;
    let configPath: string;

    if (args.config) {
      config = await configLoader.loadConfig(args.config);
      configPath = args.config;
    } else {
      const defaultConfig = await configLoader.loadDefaultConfig();
      if (!defaultConfig) {
        console.error(
          'Error: No configuration file found. Use --config to specify a config file or create .httpcraft.yaml'
        );
        process.exit(1);
      }
      config = defaultConfig.config;
      configPath = defaultConfig.path;
    }

    // Initialize global plugin manager to store global configurations
    const globalPluginManager = new PluginManager();
    let configDir = path.dirname(configPath);

    // Find API
    const api = config.apis[args.apiName];
    if (!api) {
      console.error(`Error: API '${args.apiName}' not found in configuration`);
      process.exit(1);
    }

    // Find endpoint
    const endpoint = api.endpoints[args.endpointName];
    if (!endpoint) {
      console.error(`Error: Endpoint '${args.endpointName}' not found in API '${args.apiName}'`);
      process.exit(1);
    }

    // Determine which profiles to use - T13.1 & T13.2: Additive profile merging
    let profileNames: string[] = [];
    
    // Always start with default profiles (if any)
    if (config.config?.defaultProfile) {
      profileNames = Array.isArray(config.config.defaultProfile) 
        ? [...config.config.defaultProfile] 
        : [config.config.defaultProfile];
    }
    
    // Add CLI-specified profiles (unless --no-default-profile is used)
    if (args.profiles && args.profiles.length > 0) {
      if (args.noDefaultProfile) {
        // Override: use only CLI profiles
        profileNames = args.profiles;
      } else {
        // Additive: combine default + CLI profiles
        profileNames = [...profileNames, ...args.profiles];
      }
    }

    // T13.6: Enhanced verbose output for profile operations
    if (args.verbose) {
      process.stderr.write('[VERBOSE] Loading profiles:\n');
      
      // Show default profiles
      const defaultProfiles = config.config?.defaultProfile;
      if (defaultProfiles) {
        const defaultProfilesList = Array.isArray(defaultProfiles) ? defaultProfiles : [defaultProfiles];
        process.stderr.write(`[VERBOSE]   Default profiles: ${defaultProfilesList.join(', ')}\n`);
      } else {
        process.stderr.write(`[VERBOSE]   Default profiles: none\n`);
      }
      
      // Show CLI profiles
      if (args.profiles && args.profiles.length > 0) {
        process.stderr.write(`[VERBOSE]   CLI profiles: ${args.profiles.join(', ')}\n`);
      } else {
        process.stderr.write(`[VERBOSE]   CLI profiles: none\n`);
      }
      
      // Show override behavior
      if (args.noDefaultProfile && args.profiles && args.profiles.length > 0) {
        process.stderr.write(`[VERBOSE]   --no-default-profile used: ignoring default profiles\n`);
      }
      
      // Show final profile order
      if (profileNames.length > 0) {
        process.stderr.write(`[VERBOSE]   Final profile order: ${profileNames.join(', ')}\n`);
      } else {
        process.stderr.write(`[VERBOSE]   Final profile order: none\n`);
      }
    }

    // Load and merge profile variables
    let mergedProfileVars: Record<string, any> = {};
    if (profileNames.length > 0) {
      if (!config.profiles) {
        console.error(
          `Error: No profiles defined in configuration, but profile(s) requested: ${profileNames.join(', ')}`
        );
        process.exit(1);
      }

      // Validate that all requested profiles exist
      for (const profileName of profileNames) {
        if (!config.profiles[profileName]) {
          console.error(`Error: Profile '${profileName}' not found in configuration`);
          process.exit(1);
        }
      }

      mergedProfileVars = variableResolver.mergeProfiles(profileNames, config.profiles, args.verbose);
    }

    // Create initial variable context for global plugin configuration resolution
    const initialVariableContext = variableResolver.createContext(
      args.variables || {},
      mergedProfileVars,
      api.variables,
      endpoint.variables,
      undefined, // No plugin variables yet
      config.globalVariables // T9.3: Global variables
    );

    // Resolve variables in global plugin configurations before loading plugins
    let resolvedGlobalPluginConfigs: PluginConfiguration[] | undefined;
    if (config.plugins && config.plugins.length > 0) {
      try {
        resolvedGlobalPluginConfigs = (await variableResolver.resolveValue(
          config.plugins,
          initialVariableContext
        )) as PluginConfiguration[];
      } catch (error) {
        if (error instanceof VariableResolutionError) {
          console.error(
            `Error: Failed to resolve variables in global plugin configuration: ${error.message}`
          );
          process.exit(1);
        } else {
          throw error;
        }
      }
    }

    // Load global plugins with resolved configurations
    if (resolvedGlobalPluginConfigs && resolvedGlobalPluginConfigs.length > 0) {
      await globalPluginManager.loadPlugins(resolvedGlobalPluginConfigs, configDir);
    }

    // T10.4: Apply variable substitution to API-level plugin configurations
    let resolvedApiPluginConfigs: PluginConfiguration[] | undefined;
    if (api.plugins && api.plugins.length > 0) {
      try {
        resolvedApiPluginConfigs = (await variableResolver.resolveValue(
          api.plugins,
          initialVariableContext
        )) as PluginConfiguration[];
      } catch (error) {
        if (error instanceof VariableResolutionError) {
          console.error(
            `Error: Failed to resolve variables in API-level plugin configuration: ${error.message}`
          );
          process.exit(1);
        } else {
          throw error;
        }
      }
    }

    // T10.2: Create API-specific plugin manager with resolved configurations
    const apiPluginManager = await globalPluginManager.loadApiPlugins(
      resolvedApiPluginConfigs,
      configDir
    );

    // Set API-specific plugin manager on HTTP client
    httpClient.setPluginManager(apiPluginManager);

    // Get plugin variable sources from resolved API plugin manager (T7.4 and T7.5)
    const pluginVariableSources = apiPluginManager.getVariableSources();
    // T10.15: Get parameterized plugin variable sources
    const parameterizedPluginSources = apiPluginManager.getParameterizedVariableSources();

    // Create final variable context with resolved plugin variable sources
    const variableContext = variableResolver.createContext(
      args.variables || {},
      mergedProfileVars,
      api.variables,
      endpoint.variables,
      pluginVariableSources,
      config.globalVariables, // T9.3: Global variables
      parameterizedPluginSources // T10.15: Parameterized plugin sources
    );

    // Apply variable resolution to configuration elements
    // Note: We catch variable resolution errors and handle them appropriately
    let resolvedApi: ApiDefinition;
    let resolvedEndpoint: EndpointDefinition;

    try {
      // Only resolve the specific API properties we need, not all endpoints
      // This prevents variable resolution errors from other endpoints affecting the current request
      const resolvedApiBase: Pick<ApiDefinition, 'baseUrl' | 'headers' | 'params' | 'variables'> & {
        endpoints?: any;
      } = {
        baseUrl: await variableResolver.resolveValue(api.baseUrl, variableContext),
        headers: api.headers
          ? await variableResolver.resolveValue(api.headers, variableContext)
          : undefined,
        params: api.params
          ? await variableResolver.resolveValue(api.params, variableContext)
          : undefined,
        variables: api.variables, // Don't resolve variables themselves, just pass them through
        endpoints: {}, // Add empty endpoints to satisfy ApiDefinition interface
      };

      resolvedApi = resolvedApiBase as ApiDefinition;
      resolvedEndpoint = (await variableResolver.resolveValue(
        endpoint,
        variableContext
      )) as EndpointDefinition;
    } catch (error) {
      if (error instanceof VariableResolutionError) {
        // If it's a dry run, we still want to try to show what we can
        if (args.dryRun) {
          process.stderr.write(`[DRY RUN] Warning: ${error.message}\n`);
          process.stderr.write(`[DRY RUN] Showing configuration with unresolved variables:\n\n`);

          // Show the raw configuration for dry run
          const baseUrl = api.baseUrl || '';
          const path = endpoint.path || '';
          const url = baseUrl + path;

          // T9.5: Mask secrets even in unresolved configuration
          const maskedUrl = variableResolver.maskSecrets(url);
          process.stderr.write(`[DRY RUN] ${endpoint.method} ${maskedUrl}\n`);

          if (api.headers || endpoint.headers) {
            process.stderr.write(`[DRY RUN] Headers:\n`);
            const headers = { ...(api.headers || {}), ...(endpoint.headers || {}) };
            for (const [key, value] of Object.entries(headers)) {
              // T9.5: Mask secrets in header values
              const maskedValue = variableResolver.maskSecrets(String(value));
              process.stderr.write(`[DRY RUN]   ${key}: ${maskedValue}\n`);
            }
          }

          if (api.params || endpoint.params) {
            process.stderr.write(`[DRY RUN] Query Parameters:\n`);
            const params = { ...(api.params || {}), ...(endpoint.params || {}) };
            for (const [key, value] of Object.entries(params)) {
              // T9.5: Mask secrets in parameter values
              const maskedValue = variableResolver.maskSecrets(String(value));
              process.stderr.write(`[DRY RUN]   ${key}: ${maskedValue}\n`);
            }
          }

          if (endpoint.body) {
            process.stderr.write(`[DRY RUN] Body:\n`);
            const bodyStr =
              typeof endpoint.body === 'string'
                ? endpoint.body
                : JSON.stringify(endpoint.body, null, 2);
            // T9.5: Mask secrets in body
            const maskedBodyStr = variableResolver.maskSecrets(bodyStr);
            process.stderr.write(`[DRY RUN] ${maskedBodyStr}\n`);
          }

          process.stderr.write('\n');
          return;
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    // Build request
    const url = urlBuilder.buildUrl(resolvedApi, resolvedEndpoint);
    const headers = urlBuilder.mergeHeaders(resolvedApi, resolvedEndpoint);
    const params = urlBuilder.mergeParams(resolvedApi, resolvedEndpoint);

    // Prepare request details for verbose output / dry-run
    const requestDetails = {
      method: resolvedEndpoint.method,
      url,
      headers,
      params,
      body: resolvedEndpoint.body,
    };

    // If dry-run, display request details and exit
    if (args.dryRun) {
      printRequestDetails(requestDetails, true, variableResolver);
      return;
    }

    // If verbose, print request details to stderr
    if (args.verbose) {
      printRequestDetails(requestDetails, false, variableResolver);
    }

    // Execute HTTP request (with pre-request hooks if plugins are loaded)
    const startTime = Date.now();
    const response = await httpClient.executeRequest(requestDetails);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // If verbose, print response details to stderr
    if (args.verbose) {
      printResponseDetails(response, duration);
    }

    // Check if we should exit on HTTP error
    if (args.exitOnHttpError && response.status >= 400) {
      const shouldExit = shouldExitOnHttpError(response.status, args.exitOnHttpError);
      if (shouldExit) {
        process.stderr.write(`HTTP ${response.status} ${response.statusText}\n`);
        process.exit(1);
      }
    }

    // Output response body to stdout (as per PRD requirement)
    console.log(response.body);

    // If HTTP error status, print error info to stderr but exit 0 (as per T1.6) unless --exit-on-http-error
    if (response.status >= 400 && !args.exitOnHttpError) {
      process.stderr.write(`HTTP ${response.status} ${response.statusText}\n`);
    }
  } catch (error) {
    if (error instanceof VariableResolutionError) {
      console.error(`Variable Error: ${error.message}`);
      process.exit(1);
    } else if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('Error: Unknown error occurred');
    }
    process.exit(1);
  }
}

/**
 * Print request details to stderr
 * T9.5: Added secret masking support
 */
function printRequestDetails(
  request: any,
  isDryRun: boolean,
  variableResolver?: VariableResolver
): void {
  const prefix = isDryRun ? '[DRY RUN] ' : '[REQUEST] ';

  // T9.5: Mask secrets in URL
  const maskedUrl = variableResolver ? variableResolver.maskSecrets(request.url) : request.url;
  process.stderr.write(`${prefix}${request.method} ${maskedUrl}\n`);

  if (request.headers && Object.keys(request.headers).length > 0) {
    process.stderr.write(`${prefix}Headers:\n`);
    for (const [key, value] of Object.entries(request.headers)) {
      // T9.5: Mask secrets in header values
      const maskedValue = variableResolver ? variableResolver.maskSecrets(String(value)) : value;
      process.stderr.write(`${prefix}  ${key}: ${maskedValue}\n`);
    }
  }

  if (request.params && Object.keys(request.params).length > 0) {
    process.stderr.write(`${prefix}Query Parameters:\n`);
    for (const [key, value] of Object.entries(request.params)) {
      // T9.5: Mask secrets in parameter values
      const maskedValue = variableResolver ? variableResolver.maskSecrets(String(value)) : value;
      process.stderr.write(`${prefix}  ${key}: ${maskedValue}\n`);
    }
  }

  if (request.body) {
    process.stderr.write(`${prefix}Body:\n`);
    const bodyStr =
      typeof request.body === 'string' ? request.body : JSON.stringify(request.body, null, 2);
    // T9.5: Mask secrets in request body
    const maskedBodyStr = variableResolver ? variableResolver.maskSecrets(bodyStr) : bodyStr;
    process.stderr.write(`${prefix}${maskedBodyStr}\n`);
  }

  process.stderr.write('\n');
}

/**
 * Print response details to stderr
 */
function printResponseDetails(response: any, duration: number): void {
  process.stderr.write(`[RESPONSE] ${response.status} ${response.statusText} (${duration}ms)\n`);

  if (response.headers && Object.keys(response.headers).length > 0) {
    process.stderr.write('[RESPONSE] Headers:\n');
    for (const [key, value] of Object.entries(response.headers)) {
      process.stderr.write(`[RESPONSE]   ${key}: ${value}\n`);
    }
  }

  process.stderr.write('\n');
}

/**
 * Determine if we should exit on HTTP error based on the provided pattern
 */
function shouldExitOnHttpError(statusCode: number, pattern: string): boolean {
  const patterns = pattern.split(',').map((p) => p.trim());

  for (const p of patterns) {
    if (p === '4xx' && statusCode >= 400 && statusCode < 500) {
      return true;
    }
    if (p === '5xx' && statusCode >= 500 && statusCode < 600) {
      return true;
    }
    if (p === statusCode.toString()) {
      return true;
    }
  }

  return false;
}
