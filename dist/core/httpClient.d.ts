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
export declare class HttpClient {
    /**
     * Executes an HTTP request
     * @param request The request configuration
     * @returns The response data
     */
    executeRequest(request: HttpRequest): Promise<HttpResponse>;
}
export declare const httpClient: HttpClient;
