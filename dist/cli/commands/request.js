import { httpClient } from '../../core/httpClient.js';
export async function handleRequestCommand(options) {
    try {
        // Make the HTTP GET request
        const response = await httpClient.executeRequest({
            method: 'GET',
            url: options.url,
        });
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
        if (error instanceof Error) {
            process.stderr.write(`Error: ${error.message}\n`);
        }
        else {
            process.stderr.write(`Error: Unknown error occurred\n`);
        }
        // Exit with non-zero code for tool errors
        process.exit(1);
    }
}
//# sourceMappingURL=request.js.map