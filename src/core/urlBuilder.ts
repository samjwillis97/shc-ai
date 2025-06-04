import type { ApiDefinition, EndpointDefinition } from '../types/config.js';

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

    return { ...apiParams, ...endpointParams };
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

    return { ...apiHeaders, ...endpointHeaders };
  }
}

// Singleton instance
export const urlBuilder = new UrlBuilder();
