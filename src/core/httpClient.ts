import axios from 'axios';
import type { HttpMethod } from '../types/config.js';
import { HttpRequest, HttpResponse } from '../types/plugin.js';
import { PluginManager } from './pluginManager.js';

export class HttpClient {
  private pluginManager?: PluginManager;

  /**
   * Set the plugin manager for this HTTP client
   */
  setPluginManager(pluginManager: PluginManager): void {
    this.pluginManager = pluginManager;
  }

  /**
   * Executes an HTTP request with plugin pre-request hooks
   * @param request The request configuration
   * @returns The response data
   */
  async executeRequest(request: HttpRequest): Promise<HttpResponse> {
    try {
      // Create a mutable copy of the request for plugins to modify
      const mutableRequest: HttpRequest = {
        ...request,
        headers: { ...request.headers }
      };

      // Execute pre-request hooks from plugins (T7.3 and T7.6)
      if (this.pluginManager) {
        await this.pluginManager.executePreRequestHooks(mutableRequest);
      }

      const response = await axios({
        method: mutableRequest.method.toLowerCase() as any,
        url: mutableRequest.url,
        headers: mutableRequest.headers,
        data: mutableRequest.body,
        // Don't throw on HTTP error status codes - we'll handle them
        validateStatus: () => true,
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as Record<string, string>,
        body: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
      };
    } catch (error: any) {
      if (error.isAxiosError) {
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
          throw new Error(`Network error: ${error.message}`);
        }
        if (error.code === 'ETIMEDOUT') {
          throw new Error(`Request timeout: ${error.message}`);
        }
        throw new Error(`HTTP error: ${error.message}`);
      }
      throw new Error(`Unknown error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Singleton instance
export const httpClient = new HttpClient(); 