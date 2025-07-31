import axios from 'axios';
import { HttpRequest, HttpResponse } from '../types/plugin.js';
import { PluginManager } from './pluginManager.js';
import { BinaryDetector } from './binaryDetector.js';

export class HttpClient {
  private pluginManager?: PluginManager;

  /**
   * Set the plugin manager for this HTTP client
   */
  setPluginManager(pluginManager: PluginManager): void {
    this.pluginManager = pluginManager;
  }

  /**
   * Execute an HTTP request
   * @param request - The HTTP request details
   * @returns The response data
   */
  async executeRequest(request: HttpRequest): Promise<HttpResponse> {
    try {
      // Create a mutable copy of the request for plugins to modify
      const mutableRequest: HttpRequest = {
        ...request,
        headers: { ...request.headers },
      };

      // Execute pre-request hooks from plugins (T7.3 and T7.6)
      if (this.pluginManager) {
        await this.pluginManager.executePreRequestHooks(mutableRequest);
      }

      const response = await axios({
        method: mutableRequest.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch',
        url: mutableRequest.url,
        headers: mutableRequest.headers,
        data: mutableRequest.body,
        // Always get raw data to preserve binary content
        responseType: 'arraybuffer',
        // Don't throw on HTTP error status codes - we'll handle them
        validateStatus: () => true,
      });

      // Detect if response should be treated as binary
      const isBinary = BinaryDetector.shouldTreatAsBinary(response.headers, response.data);
      const contentType = response.headers['content-type'] || response.headers['Content-Type'];
      const contentLength = response.headers['content-length']
        ? parseInt(response.headers['content-length'])
        : undefined;

      // Process response data based on type
      let body: string | Buffer;
      if (isBinary) {
        // Keep binary data as Buffer
        body = Buffer.from(response.data as ArrayBuffer);
      } else {
        // Convert to string with proper encoding for text content
        const encoding = BinaryDetector.detectTextEncoding(contentType);
        body = Buffer.from(response.data as ArrayBuffer).toString(encoding);
      }

      // Create response object with binary support
      const httpResponse: HttpResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as Record<string, string>,
        body,
        isBinary,
        contentType,
        contentLength,
      };

      // Execute post-response hooks from plugins (T10.1)
      if (this.pluginManager) {
        await this.pluginManager.executePostResponseHooks(mutableRequest, httpResponse);
      }

      return httpResponse;
    } catch (error: unknown) {
      // Check if it's an axios error with proper type checking
      if (error && typeof error === 'object' && 'isAxiosError' in error && 'message' in error) {
        const axiosError = error as { code?: string; message: string; isAxiosError: boolean };
        if (axiosError.code === 'ENOTFOUND' || axiosError.code === 'ECONNREFUSED') {
          throw new Error(`Network error: ${axiosError.message}`);
        }
        if (axiosError.code === 'ETIMEDOUT') {
          throw new Error(`Request timeout: ${axiosError.message}`);
        }
        throw new Error(`HTTP error: ${axiosError.message}`);
      }
      throw new Error(`Unknown error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Singleton instance
export const httpClient = new HttpClient();
