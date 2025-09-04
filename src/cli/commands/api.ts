import { configLoader } from '../../core/configLoader.js';
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
import type { HttpResponse } from '../../types/plugin.js';
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
  json?: boolean;
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
        const defaultProfilesList = Array.isArray(defaultProfiles)
          ? defaultProfiles
          : [defaultProfiles];
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
    let mergedProfileVars: Record<string, unknown> = {};
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

      mergedProfileVars = variableResolver.mergeProfiles(
        profileNames,
        config.profiles,
        args.verbose
      );
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

    // T14.5: Apply two-pass loading strategy to global plugins (same as API-level plugins)
    // This resolves the issue where global plugins depend on other global plugins for secret resolution
    if (config.plugins && config.plugins.length > 0) {
      try {
        // IMPORTANT: Store global plugin configurations for later merging with API-level configs
        // This must happen before we start loading plugins individually
        globalPluginManager.setGlobalPluginConfigs(config.plugins);

        // Two-pass loading for global plugins: load plugins without variables first, then resolve variables for remaining plugins
        const configsToLoad: PluginConfiguration[] = [];
        const configsToResolve: PluginConfiguration[] = [];

        // First pass: identify configs that need variable resolution vs those that don't
        for (const pluginConfig of config.plugins) {
          const configStr = JSON.stringify(pluginConfig.config || {});
          if (configStr.includes('{{')) {
            configsToResolve.push(pluginConfig);
          } else {
            configsToLoad.push(pluginConfig);
          }
        }

        // Enhanced dependency-aware loading: prioritize secret providers
        const secretProviders: PluginConfiguration[] = [];
        const secretConsumers: PluginConfiguration[] = [];

        for (const config of configsToResolve) {
          const configStr = JSON.stringify(config.config || {});
          // Detect secret providers (plugins that likely register secret resolvers)
          if (
            configStr.includes('secretMapping') ||
            config.name.includes('secret') ||
            config.name.includes('vault') ||
            config.name.includes('keystore')
          ) {
            secretProviders.push(config);
          } else {
            secretConsumers.push(config);
          }
        }

        // Load secret providers first, then consumers
        const sortedConfigsToResolve = [...secretProviders, ...secretConsumers];

        // Load plugins that don't need variable resolution first
        for (const pluginConfig of configsToLoad) {
          await globalPluginManager.loadPlugin(pluginConfig, configDir);
        }

        // Set plugin manager on variable resolver to enable secret resolution for subsequent plugins
        variableResolver.setPluginManager(globalPluginManager);

        // Now resolve variables in remaining configs and load those plugins
        const resolvedConfigs: PluginConfiguration[] = [...configsToLoad];
        for (const pluginConfig of sortedConfigsToResolve) {
          try {
            // Resolve variables in the plugin configuration with updated context that includes already loaded plugins
            const updatedContext = variableResolver.createContext(
              args.variables || {},
              mergedProfileVars,
              api.variables,
              endpoint.variables,
              globalPluginManager.getVariableSources(), // Include plugin sources from already loaded plugins
              config.globalVariables,
              globalPluginManager.getParameterizedVariableSources()
            );

            const resolvedConfig = (await variableResolver.resolveValue(
              pluginConfig,
              updatedContext
            )) as PluginConfiguration;
            await globalPluginManager.loadPlugin(resolvedConfig, configDir);
            resolvedConfigs.push(resolvedConfig);

            // Update the plugin manager on variable resolver after each plugin load
            variableResolver.setPluginManager(globalPluginManager);
          } catch (error) {
            throw new Error(
              `Failed to resolve variables in global plugin configuration for '${pluginConfig.name}': ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
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
    } else {
      // No global plugins to load
      await globalPluginManager.loadPlugins([], configDir);
    }
    // T14.3: Set global plugin manager on variable resolver for secret resolution
    // This needs to happen BEFORE resolving API-level plugin configurations
    // so that {{secret.*}} variables in API-level plugin configs can be resolved
    variableResolver.setPluginManager(globalPluginManager);

    // T14.5: Create API-specific plugin manager with merged configurations
    // Pass unresolved API-level plugin configurations - they will be resolved
    // within the plugin manager where the complete merged configuration context is available
    const apiPluginManager = await globalPluginManager.loadApiPlugins(
      api.plugins,
      configDir,
      initialVariableContext
    );

    // Set the plugin manager on the HTTP client
    httpClient.setPluginManager(apiPluginManager);

    // T14.3: Update variable resolver with API-specific plugin manager for secret resolution
    variableResolver.setPluginManager(apiPluginManager);

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
        endpoints?: Record<string, EndpointDefinition>;
      } = {
        baseUrl: (await variableResolver.resolveValue(api.baseUrl, variableContext)) as string,
        headers: api.headers
          ? ((await variableResolver.resolveValue(api.headers, variableContext)) as Record<
              string,
              unknown
            >)
          : undefined,
        params: api.params
          ? ((await variableResolver.resolveValue(api.params, variableContext)) as Record<
              string,
              unknown
            >)
          : undefined,
        variables: api.variables, // Don't resolve variables themselves, just pass them through
        endpoints: {}, // Add empty endpoints to satisfy ApiDefinition interface
      };

      resolvedApi = resolvedApiBase as ApiDefinition;

      // Resolve endpoint properties individually, excluding params and headers which are handled separately
      const resolvedEndpointBase: EndpointDefinition = {
        method: endpoint.method,
        path: (await variableResolver.resolveValue(endpoint.path, variableContext)) as string,
        // Don't resolve params/headers here - they're handled separately with optional parameter logic
        params: endpoint.params,
        headers: endpoint.headers,
        body: endpoint.body
          ? ((await variableResolver.resolveValue(endpoint.body, variableContext)) as unknown)
          : undefined,
        description: endpoint.description,
        variables: endpoint.variables, // Don't resolve variables themselves, just pass them through
      };

      resolvedEndpoint = resolvedEndpointBase;
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

    // T18.4: Use optional parameter handling for headers and params
    const headers = await urlBuilder.mergeHeadersWithOptional(
      resolvedApi,
      resolvedEndpoint,
      variableResolver,
      variableContext
    );
    const params = await urlBuilder.mergeParamsWithOptional(
      resolvedApi,
      resolvedEndpoint,
      variableResolver,
      variableContext
    );

    // Add query parameters to the URL if present (similar to ChainExecutor)
    let finalUrl = url;
    if (Object.keys(params).length > 0) {
      try {
        const urlObj = new globalThis.URL(finalUrl);
        Object.entries(params).forEach(([key, value]) => {
          urlObj.searchParams.set(key, String(value));
        });
        finalUrl = urlObj.toString();
      } catch {
        // If URL is invalid, just log the error but continue without query params
        if (args.verbose) {
          process.stderr.write(
            `[WARNING] Invalid URL format, skipping query parameters: ${finalUrl}\n`
          );
        }
      }
    }

    // Prepare request details for verbose output / dry-run
    const requestDetails = {
      method: resolvedEndpoint.method,
      url: finalUrl,
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
        if (!args.json) {
          process.stderr.write(`HTTP ${response.status} ${response.statusText}\n`);
        }
        process.exit(1);
      } else {
        // If exit pattern doesn't match but we have an error status, still write to stderr
        if (!args.json) {
          process.stderr.write(`HTTP ${response.status} ${response.statusText}\n`);
        }
      }
    }

    // Output response body to stdout (handle binary data correctly for shell redirection)
    if (args.json) {
      // JSON output format with headers, data, and timings
      const jsonResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers || {},
        timing: {
          duration: duration,
          startTime: startTime,
          endTime: endTime,
        },
        data:
          response.isBinary && Buffer.isBuffer(response.body)
            ? `<binary data: ${response.body.length} bytes>`
            : response.body,
        isBinary: response.isBinary,
        contentType: response.contentType,
        contentLength: response.contentLength,
      };
      console.log(JSON.stringify(jsonResponse, null, 2));
    } else if (response.isBinary && Buffer.isBuffer(response.body)) {
      // Write raw binary data to stdout for shell redirection
      process.stdout.write(response.body);
    } else {
      // Write text data normally
      console.log(response.body as string);
    }

    // If HTTP error status, print error info to stderr but exit 0 (as per T1.6) only when no exitOnHttpError is set
    if (response.status >= 400 && !args.exitOnHttpError && !args.json) {
      process.stderr.write(`HTTP ${response.status} ${response.statusText}\n`);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      // Check for variable resolution errors by message content
      const errorMessage = error.message;

      // Check for variable-related errors
      if (
        errorMessage.includes('could not be resolved') ||
        errorMessage.includes('Variable ') ||
        errorMessage.includes('not defined') ||
        errorMessage.includes('resolution failed')
      ) {
        process.stderr.write(`Variable Error: ${errorMessage}\n`);
      } else {
        process.stderr.write(`Configuration Error: ${errorMessage}\n`);
      }
    } else {
      process.stderr.write(`Configuration Error: ${String(error)}\n`);
    }
    process.exit(1);
  }
}

interface RequestDetails {
  method: string;
  url: string;
  headers: Record<string, string>;
  params: Record<string, unknown>;
  body?: unknown;
}

/**
 * Print request details to stderr
 * T9.5: Added secret masking support
 */
function printRequestDetails(
  request: RequestDetails,
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
 * Print response details to stderr (enhanced for binary data)
 */
function printResponseDetails(response: HttpResponse, duration: number): void {
  process.stderr.write(`[RESPONSE] ${response.status} ${response.statusText} (${duration}ms)\n`);

  // Handle binary response metadata
  if (response.isBinary) {
    process.stderr.write(`[RESPONSE] Binary Content-Type: ${response.contentType || 'unknown'}\n`);
    const size =
      response.contentLength || (Buffer.isBuffer(response.body) ? response.body.length : 0);
    process.stderr.write(`[RESPONSE] Content-Length: ${size} bytes\n`);
  }

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
