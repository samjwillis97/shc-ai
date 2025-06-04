/**
 * Chain executor for sequential HTTP request execution
 */

import { httpClient } from './httpClient.js';
import { urlBuilder } from './urlBuilder.js';
import { variableResolver, VariableResolutionError } from './variableResolver.js';
import type {
  HttpCraftConfig,
  ChainDefinition,
  ChainStep,
  ApiDefinition,
  EndpointDefinition,
} from '../types/config.js';
import type { HttpRequest, HttpResponse } from '../types/plugin.js';

export interface StepExecutionResult {
  stepId: string;
  request: HttpRequest;
  response: HttpResponse;
  success: boolean;
  error?: string;
}

export interface ChainExecutionResult {
  chainName: string;
  success: boolean;
  steps: StepExecutionResult[];
  error?: string;
}

export class ChainExecutor {
  /**
   * Executes a chain of HTTP requests in sequence
   * T8.8 & T8.9: Enhanced to pass step results for variable resolution
   * T10.15: Enhanced to support plugin variable sources
   */
  async executeChain(
    chainName: string,
    chain: ChainDefinition,
    config: HttpCraftConfig,
    cliVariables: Record<string, string> = {},
    profiles: Record<string, any> = {},
    verbose: boolean = false,
    dryRun: boolean = false,
    pluginManager?: import('./pluginManager.js').PluginManager, // T10.15: Plugin manager for variable sources
    configDir: string = process.cwd() // Config directory for resolving plugin paths
  ): Promise<ChainExecutionResult> {
    const result: ChainExecutionResult = {
      chainName,
      success: false,
      steps: [],
    };

    try {
      if (verbose) {
        console.error(`[CHAIN] Starting execution of chain: ${chainName}`);
        if (chain.description) {
          console.error(`[CHAIN] Description: ${chain.description}`);
        }
        console.error(`[CHAIN] Steps to execute: ${chain.steps.length}`);
      }

      // Execute each step sequentially
      for (let i = 0; i < chain.steps.length; i++) {
        const step = chain.steps[i];

        if (verbose) {
          console.error(`[CHAIN] Executing step ${i + 1}/${chain.steps.length}: ${step.id}`);
        }

        try {
          // T8.8 & T8.9: Pass previously executed steps to variable resolution
          const stepResult = await this.executeStep(
            step,
            config,
            cliVariables,
            profiles,
            chain.vars || {},
            result.steps, // Pass completed steps for variable resolution
            verbose,
            dryRun,
            pluginManager, // T10.15: Pass plugin manager for parameterized function support
            configDir // Pass config directory for plugin loading
          );

          result.steps.push(stepResult);

          if (!stepResult.success) {
            result.error = `Step '${step.id}' failed: ${stepResult.error}`;
            if (verbose) {
              console.error(`[CHAIN] Step failed: ${stepResult.error}`);
            }
            return result;
          }

          if (verbose) {
            console.error(`[CHAIN] Step ${step.id} completed successfully`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.error = `Step '${step.id}' failed with exception: ${errorMessage}`;

          result.steps.push({
            stepId: step.id,
            request: {} as HttpRequest, // Placeholder since we couldn't create the request
            response: {} as HttpResponse,
            success: false,
            error: errorMessage,
          });

          if (verbose) {
            console.error(`[CHAIN] Step failed with exception: ${errorMessage}`);
          }
          return result;
        }
      }

      result.success = true;

      if (verbose) {
        console.error(`[CHAIN] Chain execution completed successfully`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.error = `Chain execution failed: ${errorMessage}`;

      if (verbose) {
        console.error(`[CHAIN] Chain execution failed: ${errorMessage}`);
      }
    }

    return result;
  }

  /**
   * Executes a single step in the chain
   * T10.15: Enhanced to support plugin variable sources
   */
  private async executeStep(
    step: ChainStep,
    config: HttpCraftConfig,
    cliVariables: Record<string, string>,
    profiles: Record<string, any>,
    chainVars: Record<string, any>,
    previousSteps: StepExecutionResult[], // T8.8 & T8.9: Previous step results for variable resolution
    verbose: boolean,
    dryRun: boolean,
    globalPluginManager?: import('./pluginManager.js').PluginManager, // T10.15: Global plugin manager for creating API-specific instances
    configDir: string = process.cwd() // Config directory for resolving plugin paths
  ): Promise<StepExecutionResult> {
    // Parse the call to get API and endpoint names
    const { apiName, endpointName } = this.parseStepCall(step.call);

    // Find the API definition
    const api = config.apis[apiName];
    if (!api) {
      throw new Error(`API '${apiName}' not found in configuration`);
    }

    // Find the endpoint definition
    const endpoint = api.endpoints[endpointName];
    if (!endpoint) {
      throw new Error(`Endpoint '${endpointName}' not found in API '${apiName}'`);
    }

    // Create API-specific plugin manager for this step (similar to API command)
    let stepPluginManager = globalPluginManager;
    let pluginVariableSources:
      | Record<string, Record<string, import('../types/plugin.js').VariableSource>>
      | undefined;
    let parameterizedPluginSources:
      | Record<string, Record<string, import('../types/plugin.js').ParameterizedVariableSource>>
      | undefined;

    if (globalPluginManager && api.plugins && api.plugins.length > 0) {
      // Create initial variable context for resolving API-level plugin configurations
      const initialVariableContext = variableResolver.createContext(
        cliVariables,
        profiles,
        undefined, // No API variables yet
        undefined, // No endpoint variables yet
        undefined, // No plugin variables yet (we're setting them up)
        config.globalVariables
      );

      // Add chain variables and step data to the context
      initialVariableContext.chainVars = chainVars;
      initialVariableContext.steps = previousSteps;

      try {
        // Resolve variables in API-level plugin configurations
        const resolvedApiPluginConfigs = (await variableResolver.resolveValue(
          api.plugins,
          initialVariableContext
        )) as import('../types/config.js').PluginConfiguration[];

        // Create API-specific plugin manager with merged configurations
        stepPluginManager = await globalPluginManager.loadApiPlugins(
          resolvedApiPluginConfigs,
          configDir
        );

        // Get plugin variable sources from the API-specific plugin manager
        pluginVariableSources = stepPluginManager.getVariableSources();
        parameterizedPluginSources = stepPluginManager.getParameterizedVariableSources();
      } catch (error) {
        if (error instanceof VariableResolutionError) {
          throw new Error(
            `Failed to resolve variables in API-level plugin configuration for API '${apiName}': ${error.message}`
          );
        }
        throw error;
      }
    } else if (globalPluginManager) {
      // No API-specific plugins, use global plugin manager
      pluginVariableSources = globalPluginManager.getVariableSources();
      parameterizedPluginSources = globalPluginManager.getParameterizedVariableSources();
    }

    const variableContext = variableResolver.createContext(
      cliVariables,
      profiles,
      api.variables,
      endpoint.variables,
      pluginVariableSources, // T10.15: Plugin variable sources from API-specific manager
      config.globalVariables, // T9.3: Global variables
      parameterizedPluginSources // T10.15: Parameterized plugin variable sources
    );

    // Add chain variables to the context
    variableContext.chainVars = chainVars;

    // T8.8 & T8.9: Add step data to context for {{steps.*}} variable resolution
    variableContext.steps = previousSteps;

    try {
      // T8.5: First resolve step.with overrides using the full variable context (including steps)
      let resolvedStepWith: any = null;
      if (step.with) {
        resolvedStepWith = await variableResolver.resolveValue(step.with, variableContext);
      }

      // If step.with provides pathParams, add them to the variable context
      // so they can be used during endpoint variable resolution
      if (resolvedStepWith?.pathParams) {
        variableContext.stepWith = resolvedStepWith.pathParams;
      }

      // Resolve only the API-level properties (not all endpoints) and the specific endpoint we need
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

      const resolvedEndpoint = (await variableResolver.resolveValue(
        endpoint,
        variableContext
      )) as EndpointDefinition;

      // Build request details with step.with overrides
      let url = urlBuilder.buildUrl(resolvedApiBase as ApiDefinition, resolvedEndpoint);

      // T8.5: Apply pathParams substitution if provided in step.with
      if (resolvedStepWith?.pathParams) {
        url = this.applyPathParams(url, resolvedStepWith.pathParams);
      }

      // T8.5: Merge headers with step.with overrides (step.with has highest precedence)
      const baseHeaders = urlBuilder.mergeHeaders(
        resolvedApiBase as ApiDefinition,
        resolvedEndpoint
      );
      const headers = resolvedStepWith?.headers
        ? { ...baseHeaders, ...resolvedStepWith.headers }
        : baseHeaders;

      // T8.5: Merge params with step.with overrides (step.with has highest precedence)
      const baseParams = urlBuilder.mergeParams(resolvedApiBase as ApiDefinition, resolvedEndpoint);
      const params = resolvedStepWith?.params
        ? { ...baseParams, ...resolvedStepWith.params }
        : baseParams;

      // T8.5: Use step.with body override if provided, otherwise use endpoint body
      const body =
        resolvedStepWith?.body !== undefined ? resolvedStepWith.body : resolvedEndpoint.body;

      const request: HttpRequest = {
        method: resolvedEndpoint.method,
        url,
        headers,
        body,
      };

      // Add query parameters to the URL if present
      if (Object.keys(params).length > 0) {
        const urlObj = new URL(request.url);
        Object.entries(params).forEach(([key, value]) => {
          urlObj.searchParams.set(key, String(value));
        });
        request.url = urlObj.toString();
      }

      if (verbose) {
        // T9.5: Mask secrets in verbose output
        const maskedUrl = variableResolver.maskSecrets(request.url);
        console.error(`[STEP ${step.id}] ${request.method} ${maskedUrl}`);

        if (Object.keys(request.headers || {}).length > 0) {
          // T9.5: Mask secrets in headers
          const maskedHeaders = { ...request.headers };
          for (const [key, value] of Object.entries(maskedHeaders)) {
            maskedHeaders[key] = variableResolver.maskSecrets(String(value));
          }
          console.error(`[STEP ${step.id}] Headers:`, maskedHeaders);
        }

        if (request.body) {
          const bodyStr =
            typeof request.body === 'string' ? request.body : JSON.stringify(request.body, null, 2);
          // T9.5: Mask secrets in body
          const maskedBodyStr = variableResolver.maskSecrets(bodyStr);
          console.error(`[STEP ${step.id}] Body:`, maskedBodyStr);
        }
      }

      // If dry run, don't actually execute the request
      if (dryRun) {
        const mockResponse: HttpResponse = {
          status: 200,
          statusText: 'OK (DRY RUN)',
          headers: {},
          body: '{"message": "This is a dry run response"}',
        };

        return {
          stepId: step.id,
          request,
          response: mockResponse,
          success: true,
        };
      }

      // Set the API-specific plugin manager on HTTP client for this request
      if (stepPluginManager) {
        httpClient.setPluginManager(stepPluginManager);
      }

      // Execute the HTTP request
      const response = await httpClient.executeRequest(request);

      if (verbose) {
        console.error(`[STEP ${step.id}] Response: ${response.status} ${response.statusText}`);
      }

      // Consider 4xx and 5xx as failures for chain execution
      const success = response.status < 400;

      return {
        stepId: step.id,
        request,
        response,
        success,
        error: success ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      if (error instanceof VariableResolutionError) {
        throw new Error(`Variable resolution failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * T8.5: Applies path parameter substitution to a URL
   * Replaces {{paramName}} in the URL with the corresponding value from pathParams
   */
  private applyPathParams(url: string, pathParams: Record<string, string>): string {
    let result = url;

    for (const [paramName, paramValue] of Object.entries(pathParams)) {
      const placeholder = `{{${paramName}}}`;
      result = result.replace(
        new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        String(paramValue)
      );
    }

    return result;
  }

  /**
   * Parses a step call string in format "api_name.endpoint_name"
   */
  private parseStepCall(call: string): { apiName: string; endpointName: string } {
    const parts = call.split('.');
    if (parts.length !== 2) {
      throw new Error(
        `Invalid step call format '${call}'. Expected format: 'api_name.endpoint_name'`
      );
    }

    const [apiName, endpointName] = parts;

    if (!apiName || !endpointName) {
      throw new Error(
        `Invalid step call format '${call}'. API name and endpoint name cannot be empty`
      );
    }

    return { apiName, endpointName };
  }
}

// Singleton instance
export const chainExecutor = new ChainExecutor();
