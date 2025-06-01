import axios from 'axios';
export class HttpClient {
    async makeRequest(url, method = 'GET') {
        try {
            const response = await axios({
                method: method.toUpperCase(),
                url,
                timeout: 30000, // 30 second timeout
                validateStatus: () => true, // Don't throw on HTTP error status codes
            });
            return {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                body: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
                url: response.config.url || url,
                method: response.config.method?.toUpperCase() || method.toUpperCase(),
            };
        }
        catch (error) {
            // Check if it's an axios error with a response (HTTP error)
            if (error && typeof error === 'object' && 'isAxiosError' in error && error.isAxiosError) {
                const axiosError = error;
                // Network error (no response received)
                if (!axiosError.response) {
                    throw {
                        message: `Network error: ${axiosError.message}`,
                        isNetworkError: true,
                    };
                }
                // Should not reach here due to validateStatus: () => true
                // but keeping for safety
                throw {
                    message: `HTTP error: ${axiosError.response.status} ${axiosError.response.statusText}`,
                    status: axiosError.response.status,
                    statusText: axiosError.response.statusText,
                    isNetworkError: false,
                };
            }
            // Non-axios error
            throw {
                message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
                isNetworkError: true,
            };
        }
    }
}
//# sourceMappingURL=httpClient.js.map