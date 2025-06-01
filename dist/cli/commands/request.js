import { HttpClient } from '../../core/httpClient.js';
export async function handleRequestCommand(options) {
    const httpClient = new HttpClient();
    try {
        // Make the HTTP GET request
        const response = await httpClient.makeRequest(options.url, 'GET');
        // T1.4: Print raw response body to stdout
        process.stdout.write(response.body);
        // T1.6: Handle HTTP error statuses - for now, print body to stdout and error info to stderr, exit 0
        if (response.status >= 400) {
            process.stderr.write(`HTTP ${response.status} ${response.statusText}\n`);
        }
        // Exit with code 0 for successful execution (including HTTP error responses)
        process.exit(0);
    }
    catch (error) {
        // T1.5: Handle network issues and other errors
        const httpError = error;
        if (httpError.isNetworkError) {
            process.stderr.write(`Error: ${httpError.message}\n`);
        }
        else {
            process.stderr.write(`HTTP Error: ${httpError.message}\n`);
        }
        // Exit with non-zero code for tool errors
        process.exit(1);
    }
}
//# sourceMappingURL=request.js.map