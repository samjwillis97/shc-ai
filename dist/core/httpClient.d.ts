import { HttpRequest, HttpResponse } from '../types/plugin.js';
import { PluginManager } from './pluginManager.js';
export declare class HttpClient {
    private pluginManager?;
    /**
     * Set the plugin manager for this HTTP client
     */
    setPluginManager(pluginManager: PluginManager): void;
    /**
     * Executes an HTTP request with plugin pre-request hooks
     * @param request The request configuration
     * @returns The response data
     */
    executeRequest(request: HttpRequest): Promise<HttpResponse>;
}
export declare const httpClient: HttpClient;
