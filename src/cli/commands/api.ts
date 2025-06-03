import { configLoader, ConfigWithPath } from '../../core/configLoader.js';
import { urlBuilder } from '../../core/urlBuilder.js';
import { httpClient } from '../../core/httpClient.js';
import { variableResolver, VariableResolutionError } from '../../core/variableResolver.js';
import { PluginManager } from '../../core/pluginManager.js';
import type { HttpCraftConfig, ApiDefinition, EndpointDefinition } from '../../types/config.js';
import path from 'path';

export interface ApiCommandArgs {
  apiName: string;
  endpointName: string;
  config?: string;
  variables?: Record<string, string>;
  profiles?: string[];
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
        console.error('Error: No configuration file found. Use --config to specify a config file or create .httpcraft.yaml');
        process.exit(1);
      }
      config = defaultConfig.config;
      configPath = defaultConfig.path;
    }
    
    // Initialize and load plugins (T7.2 and T7.7)
    const pluginManager = new PluginManager();
    if (config.plugins && config.plugins.length > 0) {
      const configDir = path.dirname(configPath);
      await pluginManager.loadPlugins(config.plugins, configDir);
      
      // Set plugin manager on HTTP client for pre-request hooks
      httpClient.setPluginManager(pluginManager);
    }
    
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
    
    // Determine which profiles to use
    let profileNames: string[] = [];
    if (args.profiles && args.profiles.length > 0) {
      // Use profiles specified via CLI
      profileNames = args.profiles;
    } else if (config.config?.defaultProfile) {
      // Use default profile(s) from config
      if (Array.isArray(config.config.defaultProfile)) {
        profileNames = config.config.defaultProfile;
      } else {
        profileNames = [config.config.defaultProfile];
      }
    }
    
    // Load and merge profile variables
    let mergedProfileVars: Record<string, any> = {};
    if (profileNames.length > 0) {
      if (!config.profiles) {
        console.error(`Error: No profiles defined in configuration, but profile(s) requested: ${profileNames.join(', ')}`);
        process.exit(1);
      }
      
      // Validate that all requested profiles exist
      for (const profileName of profileNames) {
        if (!config.profiles[profileName]) {
          console.error(`Error: Profile '${profileName}' not found in configuration`);
          process.exit(1);
        }
      }
      
      mergedProfileVars = variableResolver.mergeProfiles(profileNames, config.profiles);
    }
    
    // Get plugin variable sources (T7.4 and T7.5)
    const pluginVariableSources = pluginManager.getVariableSources();
    
    // Create variable context with Phase 9 precedence including global variables
    const variableContext = variableResolver.createContext(
      args.variables || {},
      mergedProfileVars,
      api.variables,
      endpoint.variables,
      pluginVariableSources,
      config.globalVariables // T9.3: Global variables
    );
    
    // Apply variable resolution to configuration elements
    // Note: We catch variable resolution errors and handle them appropriately
    let resolvedApi: ApiDefinition;
    let resolvedEndpoint: EndpointDefinition;
    
    try {
      // Only resolve the specific API properties we need, not all endpoints
      // This prevents variable resolution errors from other endpoints affecting the current request
      const resolvedApiBase: Pick<ApiDefinition, 'baseUrl' | 'headers' | 'params' | 'variables'> & { endpoints?: any } = {
        baseUrl: await variableResolver.resolveValue(api.baseUrl, variableContext),
        headers: api.headers ? await variableResolver.resolveValue(api.headers, variableContext) : undefined,
        params: api.params ? await variableResolver.resolveValue(api.params, variableContext) : undefined,
        variables: api.variables, // Don't resolve variables themselves, just pass them through
        endpoints: {} // Add empty endpoints to satisfy ApiDefinition interface
      };
      
      resolvedApi = resolvedApiBase as ApiDefinition;
      resolvedEndpoint = await variableResolver.resolveValue(endpoint, variableContext) as EndpointDefinition;
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
          
          process.stderr.write(`[DRY RUN] ${endpoint.method} ${url}\n`);
          
          if (api.headers || endpoint.headers) {
            process.stderr.write(`[DRY RUN] Headers:\n`);
            const headers = { ...(api.headers || {}), ...(endpoint.headers || {}) };
            for (const [key, value] of Object.entries(headers)) {
              process.stderr.write(`[DRY RUN]   ${key}: ${value}\n`);
            }
          }
          
          if (api.params || endpoint.params) {
            process.stderr.write(`[DRY RUN] Query Parameters:\n`);
            const params = { ...(api.params || {}), ...(endpoint.params || {}) };
            for (const [key, value] of Object.entries(params)) {
              process.stderr.write(`[DRY RUN]   ${key}: ${value}\n`);
            }
          }
          
          if (endpoint.body) {
            process.stderr.write(`[DRY RUN] Body:\n`);
            const bodyStr = typeof endpoint.body === 'string' ? endpoint.body : JSON.stringify(endpoint.body, null, 2);
            process.stderr.write(`[DRY RUN] ${bodyStr}\n`);
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
      printRequestDetails(requestDetails, true);
      return;
    }
    
    // If verbose, print request details to stderr
    if (args.verbose) {
      printRequestDetails(requestDetails, false);
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
 */
function printRequestDetails(request: any, isDryRun: boolean): void {
  const prefix = isDryRun ? '[DRY RUN] ' : '[REQUEST] ';
  
  process.stderr.write(`${prefix}${request.method} ${request.url}\n`);
  
  if (request.headers && Object.keys(request.headers).length > 0) {
    process.stderr.write(`${prefix}Headers:\n`);
    for (const [key, value] of Object.entries(request.headers)) {
      process.stderr.write(`${prefix}  ${key}: ${value}\n`);
    }
  }
  
  if (request.params && Object.keys(request.params).length > 0) {
    process.stderr.write(`${prefix}Query Parameters:\n`);
    for (const [key, value] of Object.entries(request.params)) {
      process.stderr.write(`${prefix}  ${key}: ${value}\n`);
    }
  }
  
  if (request.body) {
    process.stderr.write(`${prefix}Body:\n`);
    const bodyStr = typeof request.body === 'string' ? request.body : JSON.stringify(request.body, null, 2);
    process.stderr.write(`${prefix}${bodyStr}\n`);
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
  const patterns = pattern.split(',').map(p => p.trim());
  
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