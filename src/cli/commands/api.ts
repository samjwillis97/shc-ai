import { configLoader } from '../../core/configLoader.js';
import { urlBuilder } from '../../core/urlBuilder.js';
import { httpClient } from '../../core/httpClient.js';
import { variableResolver, VariableResolutionError } from '../../core/variableResolver.js';
import type { HttpCraftConfig, ApiDefinition, EndpointDefinition } from '../../types/config.js';

export interface ApiCommandArgs {
  apiName: string;
  endpointName: string;
  config?: string;
  variables?: Record<string, string>;
}

export async function handleApiCommand(args: ApiCommandArgs): Promise<void> {
  try {
    // Load configuration
    let config: HttpCraftConfig;
    
    if (args.config) {
      config = await configLoader.loadConfig(args.config);
    } else {
      const defaultConfig = await configLoader.loadDefaultConfig();
      if (!defaultConfig) {
        console.error('Error: No configuration file found. Use --config to specify a config file or create .httpcraft.yaml');
        process.exit(1);
      }
      config = defaultConfig;
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
    
    // Create variable context
    const variableContext = variableResolver.createContext(args.variables || {});
    
    // Apply variable resolution to configuration elements
    const resolvedApi = variableResolver.resolveValue(api, variableContext) as ApiDefinition;
    const resolvedEndpoint = variableResolver.resolveValue(endpoint, variableContext) as EndpointDefinition;
    
    // Build request
    const url = urlBuilder.buildUrl(resolvedApi, resolvedEndpoint);
    const headers = urlBuilder.mergeHeaders(resolvedApi, resolvedEndpoint);
    const params = urlBuilder.mergeParams(resolvedApi, resolvedEndpoint);
    
    // Execute HTTP request
    const response = await httpClient.executeRequest({
      method: resolvedEndpoint.method,
      url,
      headers,
      params,
      body: resolvedEndpoint.body,
    });
    
    // Output response body to stdout (as per PRD requirement)
    console.log(response.body);
    
    // If HTTP error status, print error info to stderr but exit 0 (as per T1.6)
    if (response.status >= 400) {
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