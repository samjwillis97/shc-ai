/**
 * Chain executor for sequential HTTP request execution
 */

import { httpClient } from './httpClient.js';
import { urlBuilder } from './urlBuilder.js';
import { variableResolver, VariableResolutionError } from './variableResolver.js';
import type { HttpCraftConfig, ChainDefinition, ChainStep, ApiDefinition, EndpointDefinition } from '../types/config.js';
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
   * Executes a chain by sequentially executing each step
   */
  async executeChain(
    chainName: string,
    chain: ChainDefinition,
    config: HttpCraftConfig,
    cliVariables: Record<string, string> = {},
    profiles: Record<string, any> = {},
    verbose: boolean = false,
    dryRun: boolean = false
  ): Promise<ChainExecutionResult> {
    
    const result: ChainExecutionResult = {
      chainName,
      success: false,
      steps: []
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
          const stepResult = await this.executeStep(
            step,
            config,
            cliVariables,
            profiles,
            chain.vars || {},
            verbose,
            dryRun
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
            error: errorMessage
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
   */
  private async executeStep(
    step: ChainStep,
    config: HttpCraftConfig,
    cliVariables: Record<string, string>,
    profiles: Record<string, any>,
    chainVars: Record<string, any>,
    verbose: boolean,
    dryRun: boolean
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

    // Create variable context for this step
    const variableContext = variableResolver.createContext(
      cliVariables,
      profiles,
      api.variables,
      endpoint.variables
    );
    
    // Add chain variables to the context
    variableContext.chainVars = chainVars;

    try {
      // Resolve variables in API and endpoint configurations first
      const resolvedApi = await variableResolver.resolveValue(api, variableContext) as ApiDefinition;
      const resolvedEndpoint = await variableResolver.resolveValue(endpoint, variableContext) as EndpointDefinition;

      // T8.5: Resolve step.with overrides using the full variable context
      let resolvedStepWith: any = null;
      if (step.with) {
        resolvedStepWith = await variableResolver.resolveValue(step.with, variableContext);
      }

      // Build request details with step.with overrides
      let url = urlBuilder.buildUrl(resolvedApi, resolvedEndpoint);
      
      // T8.5: Apply pathParams substitution if provided in step.with
      if (resolvedStepWith?.pathParams) {
        url = this.applyPathParams(url, resolvedStepWith.pathParams);
      }
      
      // T8.5: Merge headers with step.with overrides (step.with has highest precedence)
      const baseHeaders = urlBuilder.mergeHeaders(resolvedApi, resolvedEndpoint);
      const headers = resolvedStepWith?.headers 
        ? { ...baseHeaders, ...resolvedStepWith.headers }
        : baseHeaders;
      
      // T8.5: Merge params with step.with overrides (step.with has highest precedence)
      const baseParams = urlBuilder.mergeParams(resolvedApi, resolvedEndpoint);
      const params = resolvedStepWith?.params
        ? { ...baseParams, ...resolvedStepWith.params }
        : baseParams;

      // T8.5: Use step.with body override if provided, otherwise use endpoint body
      const body = resolvedStepWith?.body !== undefined 
        ? resolvedStepWith.body 
        : resolvedEndpoint.body;

      const request: HttpRequest = {
        method: resolvedEndpoint.method,
        url,
        headers,
        body
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
        console.error(`[STEP ${step.id}] ${request.method} ${request.url}`);
        if (Object.keys(request.headers || {}).length > 0) {
          console.error(`[STEP ${step.id}] Headers:`, request.headers);
        }
        if (request.body) {
          const bodyStr = typeof request.body === 'string' ? request.body : JSON.stringify(request.body, null, 2);
          console.error(`[STEP ${step.id}] Body:`, bodyStr);
        }
      }

      // If dry run, don't actually execute the request
      if (dryRun) {
        const mockResponse: HttpResponse = {
          status: 200,
          statusText: 'OK (DRY RUN)',
          headers: {},
          body: '{"message": "This is a dry run response"}'
        };

        return {
          stepId: step.id,
          request,
          response: mockResponse,
          success: true
        };
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
        error: success ? undefined : `HTTP ${response.status}: ${response.statusText}`
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
      result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(paramValue));
    }
    
    return result;
  }

  /**
   * Parses a step call string in format "api_name.endpoint_name"
   */
  private parseStepCall(call: string): { apiName: string; endpointName: string } {
    const parts = call.split('.');
    if (parts.length !== 2) {
      throw new Error(`Invalid step call format '${call}'. Expected format: 'api_name.endpoint_name'`);
    }
    
    const [apiName, endpointName] = parts;
    
    if (!apiName || !endpointName) {
      throw new Error(`Invalid step call format '${call}'. API name and endpoint name cannot be empty`);
    }
    
    return { apiName, endpointName };
  }
}

// Singleton instance
export const chainExecutor = new ChainExecutor(); 