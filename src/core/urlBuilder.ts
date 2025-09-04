import type { ApiDefinition, EndpointDefinition } from '../types/config.js';
import { VariableResolver } from './variableResolver.js';
import type { VariableContext } from './variableResolver.js';

export class UrlBuilder {
  /**
   * Constructs a full URL from API baseUrl and endpoint path
   * @param api The API definition containing baseUrl
   * @param endpoint The endpoint definition containing path
   * @returns The constructed full URL
   */
  buildUrl(api: ApiDefinition, endpoint: EndpointDefinition): string {
    const baseUrl = api.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    const path = endpoint.path.startsWith('/') ? endpoint.path : `/${endpoint.path}`; // Ensure leading slash

    return `${baseUrl}${path}`;
  }

  /**
   * Merges query parameters from API and endpoint definitions
   * Endpoint params override API params for the same key
   * @param api The API definition
   * @param endpoint The endpoint definition
   * @returns Merged query parameters
   */
  mergeParams(api: ApiDefinition, endpoint: EndpointDefinition): Record<string, string> {
    const apiParams = api.params || {};
    const endpointParams = endpoint.params || {};

    // Convert unknown values to strings
    const convertedApiParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(apiParams)) {
      convertedApiParams[key] = String(value);
    }

    const convertedEndpointParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(endpointParams)) {
      convertedEndpointParams[key] = String(value);
    }

    return { ...convertedApiParams, ...convertedEndpointParams };
  }

  /**
   * T18.3: Merges query parameters from API and endpoint definitions with optional parameter handling
   * Excludes parameters that contain only optional variables that are undefined
   * @param api The API definition
   * @param endpoint The endpoint definition
   * @param variableResolver The variable resolver instance
   * @param context The variable context
   * @returns Promise resolving to merged query parameters with excluded optional parameters
   */
  async mergeParamsWithOptional(
    api: ApiDefinition,
    endpoint: EndpointDefinition,
    variableResolver: VariableResolver,
    context: VariableContext
  ): Promise<Record<string, string>> {
    const apiParams = api.params || {};
    const endpointParams = endpoint.params || {};

    // Merge params with endpoint taking precedence
    const mergedParams = { ...apiParams, ...endpointParams };
    const resolvedParams: Record<string, string> = {};

    // Process each parameter to handle optional variables
    for (const [key, value] of Object.entries(mergedParams)) {
      if (typeof value === 'string') {
        // Handle string values directly with optional resolution
        const result = await variableResolver.resolveWithOptionalInfo(value, context);

        // Check if any optional variables in this value should exclude the entire parameter
        let shouldIncludeParameter = true;
        let hasUndefinedOptional = false;

        for (const [, shouldInclude] of result.optionalParameters) {
          if (!shouldInclude) {
            hasUndefinedOptional = true;
            break;
          }
        }

        // If there are undefined optional variables, check if there's any meaningful content left
        if (hasUndefinedOptional) {
          // Extract all variable matches from the original template
          const matches = (variableResolver as any).extractVariableMatches(value);
          let hasDefinedContent = false;

          // Check if there are any defined variables or static content
          for (const match of matches) {
            const isIncluded = result.optionalParameters.get(match.fullMatch);
            if (isIncluded !== false) {
              // undefined means it's not optional, true means it's optional but defined
              hasDefinedContent = true;
              break;
            }
          }

          // Check for static content (non-variable text)
          let nonVariableContent = value;
          for (const match of matches) {
            nonVariableContent = nonVariableContent.replace(match.fullMatch, '');
          }
          if (nonVariableContent.trim()) {
            hasDefinedContent = true;
          }

          shouldIncludeParameter = hasDefinedContent;
        }

        if (shouldIncludeParameter) {
          resolvedParams[key] = result.resolved;
        }
      } else {
        // Handle non-string values using the original method
        const result = await variableResolver.resolveValueWithOptionalHandling(value, context);

        // Only include the parameter if it wasn't excluded due to optional variables
        if (!result.excludedKeys.includes(key) && typeof result.resolved === 'string') {
          resolvedParams[key] = result.resolved;
        }
      }
    }

    return resolvedParams;
  }

  /**
   * Merges headers from API and endpoint definitions
   * Endpoint headers override API headers for the same key
   * @param api The API definition
   * @param endpoint The endpoint definition
   * @returns Merged headers
   */
  mergeHeaders(api: ApiDefinition, endpoint: EndpointDefinition): Record<string, string> {
    const apiHeaders = api.headers || {};
    const endpointHeaders = endpoint.headers || {};

    // Convert unknown values to strings
    const convertedApiHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(apiHeaders)) {
      convertedApiHeaders[key] = String(value);
    }

    const convertedEndpointHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(endpointHeaders)) {
      convertedEndpointHeaders[key] = String(value);
    }

    return { ...convertedApiHeaders, ...convertedEndpointHeaders };
  }

  /**
   * T18.3: Merges headers from API and endpoint definitions with optional parameter handling
   * Excludes headers that contain only optional variables that are undefined
   * @param api The API definition
   * @param endpoint The endpoint definition
   * @param variableResolver The variable resolver instance
   * @param context The variable context
   * @returns Promise resolving to merged headers with excluded optional parameters
   */
  async mergeHeadersWithOptional(
    api: ApiDefinition,
    endpoint: EndpointDefinition,
    variableResolver: VariableResolver,
    context: VariableContext
  ): Promise<Record<string, string>> {
    const apiHeaders = api.headers || {};
    const endpointHeaders = endpoint.headers || {};

    // Merge headers with endpoint taking precedence
    const mergedHeaders = { ...apiHeaders, ...endpointHeaders };
    const resolvedHeaders: Record<string, string> = {};

    // Process each header to handle optional variables
    for (const [key, value] of Object.entries(mergedHeaders)) {
      if (typeof value === 'string') {
        // Handle string values directly with optional resolution
        const result = await variableResolver.resolveWithOptionalInfo(value, context);

        // Check if any optional variables in this value should exclude the entire parameter
        let shouldIncludeParameter = true;
        let hasUndefinedOptional = false;

        for (const [, shouldInclude] of result.optionalParameters) {
          if (!shouldInclude) {
            hasUndefinedOptional = true;
            break;
          }
        }

        // If there are undefined optional variables, check if there's any meaningful content left
        if (hasUndefinedOptional) {
          // Extract all variable matches from the original template
          const matches = (variableResolver as any).extractVariableMatches(value);
          let hasDefinedContent = false;

          // Check if there are any defined variables or static content
          for (const match of matches) {
            const isIncluded = result.optionalParameters.get(match.fullMatch);
            if (isIncluded !== false) {
              // undefined means it's not optional, true means it's optional but defined
              hasDefinedContent = true;
              break;
            }
          }

          // Check for static content (non-variable text)
          let nonVariableContent = value;
          for (const match of matches) {
            nonVariableContent = nonVariableContent.replace(match.fullMatch, '');
          }
          if (nonVariableContent.trim()) {
            hasDefinedContent = true;
          }

          shouldIncludeParameter = hasDefinedContent;
        }

        if (shouldIncludeParameter) {
          resolvedHeaders[key] = result.resolved;
        }
      } else {
        // Handle non-string values using the original method
        const result = await variableResolver.resolveValueWithOptionalHandling(value, context);

        // Only include the header if it wasn't excluded due to optional variables
        if (!result.excludedKeys.includes(key) && typeof result.resolved === 'string') {
          resolvedHeaders[key] = result.resolved;
        }
      }
    }

    return resolvedHeaders;
  }
}

// Singleton instance
export const urlBuilder = new UrlBuilder();
