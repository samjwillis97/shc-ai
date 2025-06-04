import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleApiCommand } from '../../../../src/cli/commands/api.js';
import * as configLoaderModule from '../../../../src/core/configLoader.js';
import * as httpClientModule from '../../../../src/core/httpClient.js';

// Mock modules
vi.mock('../../../../src/core/configLoader.js');
vi.mock('../../../../src/core/httpClient.js');

const mockConfigLoader = vi.mocked(configLoaderModule.configLoader);
const mockHttpClient = vi.mocked(httpClientModule.httpClient);

describe('API Command Phase 5 Features', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let stderrWriteSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // Default mocks
    mockConfigLoader.loadDefaultConfig.mockResolvedValue({
      config: {
        apis: {
          testapi: {
            baseUrl: 'https://api.test.com',
            endpoints: {
              getTest: {
                method: 'GET',
                path: '/test',
              },
            },
          },
        },
      },
      path: '/test/.httpcraft.yaml'
    });

    mockHttpClient.executeRequest.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: '{"result": "success"}',
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Verbose Output', () => {
    it('should print request details to stderr when verbose is enabled', async () => {
      await handleApiCommand({
        apiName: 'testapi',
        endpointName: 'getTest',
        verbose: true,
      });

      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('[REQUEST] GET https://api.test.com/test'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('[RESPONSE] 200 OK'));
      expect(consoleLogSpy).toHaveBeenCalledWith('{"result": "success"}');
    });

    it('should print response timing information when verbose is enabled', async () => {
      await handleApiCommand({
        apiName: 'testapi',
        endpointName: 'getTest',
        verbose: true,
      });

      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringMatching(/\[RESPONSE\] 200 OK \(\d+ms\)/));
    });

    it('should print headers and params when verbose is enabled and they exist', async () => {
      mockConfigLoader.loadDefaultConfig.mockResolvedValue({
        config: {
          apis: {
            testapi: {
              baseUrl: 'https://api.test.com',
              headers: { 'X-API-Key': 'test123' },
              params: { 'version': 'v1' },
              endpoints: {
                getTest: {
                  method: 'GET',
                  path: '/test',
                  headers: { 'Accept': 'application/json' },
                  params: { 'limit': '10' },
                },
              },
            },
          },
        },
        path: '/test/.httpcraft.yaml'
      });

      await handleApiCommand({
        apiName: 'testapi',
        endpointName: 'getTest',
        verbose: true,
      });

      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('[REQUEST] Headers:'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('X-API-Key: test123'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('Accept: application/json'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('[REQUEST] Query Parameters:'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('version: v1'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('limit: 10'));
    });

    it('should print request body when verbose is enabled and body exists', async () => {
      mockConfigLoader.loadDefaultConfig.mockResolvedValue({
        config: {
          apis: {
            testapi: {
              baseUrl: 'https://api.test.com',
              endpoints: {
                postTest: {
                  method: 'POST',
                  path: '/test',
                  body: { name: 'test', value: 123 },
                },
              },
            },
          },
        },
        path: '/test/.httpcraft.yaml'
      });

      await handleApiCommand({
        apiName: 'testapi',
        endpointName: 'postTest',
        verbose: true,
      });

      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('[REQUEST] Body:'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('"name": "test"'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('"value": 123'));
    });

    it('should not print verbose output when verbose is disabled', async () => {
      await handleApiCommand({
        apiName: 'testapi',
        endpointName: 'getTest',
        verbose: false,
      });

      expect(stderrWriteSpy).not.toHaveBeenCalledWith(expect.stringContaining('[REQUEST]'));
      expect(stderrWriteSpy).not.toHaveBeenCalledWith(expect.stringContaining('[RESPONSE]'));
      expect(consoleLogSpy).toHaveBeenCalledWith('{"result": "success"}');
    });
  });

  describe('Dry Run', () => {
    it('should print request details and not execute HTTP request when dry-run is enabled', async () => {
      await handleApiCommand({
        apiName: 'testapi',
        endpointName: 'getTest',
        dryRun: true,
      });

      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN] GET https://api.test.com/test'));
      expect(mockHttpClient.executeRequest).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should print headers, params, and body in dry-run mode when they exist', async () => {
      mockConfigLoader.loadDefaultConfig.mockResolvedValue({
        config: {
          apis: {
            testapi: {
              baseUrl: 'https://api.test.com',
              headers: { 'X-API-Key': 'test123' },
              params: { 'version': 'v1' },
              endpoints: {
                postTest: {
                  method: 'POST',
                  path: '/test',
                  headers: { 'Content-Type': 'application/json' },
                  params: { 'format': 'json' },
                  body: '{"test": true}',
                },
              },
            },
          },
        },
        path: '/test/.httpcraft.yaml'
      });

      await handleApiCommand({
        apiName: 'testapi',
        endpointName: 'postTest',
        dryRun: true,
      });

      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN] POST https://api.test.com/test'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN] Headers:'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('X-API-Key: test123'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('Content-Type: application/json'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN] Query Parameters:'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('version: v1'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('format: json'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN] Body:'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('{"test": true}'));
    });

    it('should work with both verbose and dry-run flags', async () => {
      await handleApiCommand({
        apiName: 'testapi',
        endpointName: 'getTest',
        verbose: true,
        dryRun: true,
      });

      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN] GET https://api.test.com/test'));
      expect(mockHttpClient.executeRequest).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('Exit on HTTP Error', () => {
    it('should exit with code 1 for 4xx errors when exit-on-http-error is "4xx"', async () => {
      mockHttpClient.executeRequest.mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
        headers: {},
        body: 'Not found',
      });

      await expect(handleApiCommand({
        apiName: 'testapi',
        endpointName: 'getTest',
        exitOnHttpError: '4xx',
      })).rejects.toThrow('process.exit called');

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(stderrWriteSpy).toHaveBeenCalledWith('HTTP 404 Not Found\n');
    });

    it('should exit with code 1 for 5xx errors when exit-on-http-error is "5xx"', async () => {
      mockHttpClient.executeRequest.mockResolvedValue({
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        body: 'Server error',
      });

      await expect(handleApiCommand({
        apiName: 'testapi',
        endpointName: 'getTest',
        exitOnHttpError: '5xx',
      })).rejects.toThrow('process.exit called');

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(stderrWriteSpy).toHaveBeenCalledWith('HTTP 500 Internal Server Error\n');
    });

    it('should exit with code 1 for specific status codes', async () => {
      mockHttpClient.executeRequest.mockResolvedValue({
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        body: 'Unauthorized',
      });

      await expect(handleApiCommand({
        apiName: 'testapi',
        endpointName: 'getTest',
        exitOnHttpError: '401,403',
      })).rejects.toThrow('process.exit called');

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(stderrWriteSpy).toHaveBeenCalledWith('HTTP 401 Unauthorized\n');
    });

    it('should not exit for errors not matching the pattern', async () => {
      mockHttpClient.executeRequest.mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
        headers: {},
        body: 'Not found',
      });

      await handleApiCommand({
        apiName: 'testapi',
        endpointName: 'getTest',
        exitOnHttpError: '5xx',
      });

      expect(processExitSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('Not found');
    });

    it('should not exit for success responses even with exit-on-http-error set', async () => {
      mockHttpClient.executeRequest.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        body: '{"success": true}',
      });

      await handleApiCommand({
        apiName: 'testapi',
        endpointName: 'getTest',
        exitOnHttpError: '4xx,5xx',
      });

      expect(processExitSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('{"success": true}');
    });

    it('should use default behavior (print to stderr, exit 0) when exit-on-http-error is not set', async () => {
      mockHttpClient.executeRequest.mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
        headers: {},
        body: 'Not found',
      });

      await handleApiCommand({
        apiName: 'testapi',
        endpointName: 'getTest',
      });

      expect(processExitSpy).not.toHaveBeenCalled();
      expect(stderrWriteSpy).toHaveBeenCalledWith('HTTP 404 Not Found\n');
      expect(consoleLogSpy).toHaveBeenCalledWith('Not found');
    });
  });

  describe('Combined Features', () => {
    it('should work with verbose and exit-on-http-error together', async () => {
      mockHttpClient.executeRequest.mockResolvedValue({
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'content-type': 'text/plain' },
        body: 'Server error',
      });

      await expect(handleApiCommand({
        apiName: 'testapi',
        endpointName: 'getTest',
        verbose: true,
        exitOnHttpError: '5xx',
      })).rejects.toThrow('process.exit called');

      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('[REQUEST] GET https://api.test.com/test'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringMatching(/\[RESPONSE\] 500 Internal Server Error \(\d+ms\)/));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should respect variable resolution in verbose output', async () => {
      mockConfigLoader.loadDefaultConfig.mockResolvedValue({
        config: {
          apis: {
            testapi: {
              baseUrl: 'https://api.{{env.ENVIRONMENT}}.com',
              headers: { 'X-API-Key': '{{api_key}}' },
              endpoints: {
                getTest: {
                  method: 'GET',
                  path: '/test/{{user_id}}',
                },
              },
            },
          },
        },
        path: '/test/.httpcraft.yaml'
      });

      // Mock environment variable
      process.env.ENVIRONMENT = 'prod';

      await handleApiCommand({
        apiName: 'testapi',
        endpointName: 'getTest',
        variables: { api_key: 'secret123', user_id: '456' },
        verbose: true,
      });

      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('[REQUEST] GET https://api.prod.com/test/456'));
      expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('X-API-Key: secret123'));

      // Clean up
      delete process.env.ENVIRONMENT;
    });
  });
}); 