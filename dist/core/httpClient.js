import axios from 'axios';
export class HttpClient {
    /**
     * Set the plugin manager for this HTTP client
     */
    setPluginManager(pluginManager) {
        this.pluginManager = pluginManager;
    }
    /**
     * Executes an HTTP request with plugin pre-request and post-response hooks
     * @param request The request configuration
     * @returns The response data
     */
    async executeRequest(request) {
        try {
            // Create a mutable copy of the request for plugins to modify
            const mutableRequest = {
                ...request,
                headers: { ...request.headers }
            };
            // Execute pre-request hooks from plugins (T7.3 and T7.6)
            if (this.pluginManager) {
                await this.pluginManager.executePreRequestHooks(mutableRequest);
            }
            const response = await axios({
                method: mutableRequest.method.toLowerCase(),
                url: mutableRequest.url,
                headers: mutableRequest.headers,
                data: mutableRequest.body,
                // Don't throw on HTTP error status codes - we'll handle them
                validateStatus: () => true,
            });
            // Create response object
            const httpResponse = {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                body: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
            };
            // Execute post-response hooks from plugins (T10.1)
            if (this.pluginManager) {
                await this.pluginManager.executePostResponseHooks(mutableRequest, httpResponse);
            }
            return httpResponse;
        }
        catch (error) {
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
//# sourceMappingURL=httpClient.js.map