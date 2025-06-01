import axios from 'axios';
import type { HttpMethod } from '../types/config.js';

export interface HttpRequest {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: string | object;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

export class HttpClient {
  /**
   * Executes an HTTP request
   * @param request The request configuration
   * @returns The response data
   */
  async executeRequest(request: HttpRequest): Promise<HttpResponse> {
    try {
      const response = await axios({
        method: request.method.toLowerCase() as any,
        url: request.url,
        headers: request.headers,
        params: request.params,
        data: request.body,
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