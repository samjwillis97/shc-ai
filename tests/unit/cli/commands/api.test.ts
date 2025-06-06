import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleApiCommand } from '../../../../src/cli/commands/api.js';
import * as configLoaderModule from '../../../../src/core/configLoader.js';
import * as httpClientModule from '../../../../src/core/httpClient.js';
import * as variableResolverModule from '../../../../src/core/variableResolver.js';
import * as urlBuilderModule from '../../../../src/core/urlBuilder.js';
import { HttpCraftConfig } from '../../../../src/types/config.js';
import { ApiCommandArgs } from '../../../../src/cli/commands/api.js';

// Mock modules
vi.mock('../../../../src/core/configLoader.js', () => ({
  configLoader: {
    loadConfig: vi.fn(),
    loadDefaultConfig: vi.fn()
  }
}));

vi.mock('../../../../src/core/urlBuilder.js', () => ({
  urlBuilder: {
    buildUrl: vi.fn(),
    mergeHeaders: vi.fn(),
    mergeParams: vi.fn()
  }
}));

vi.mock('../../../../src/core/httpClient.js', () => ({
  httpClient: {
    executeRequest: vi.fn(),
    setPluginManager: vi.fn()
  }
}));

vi.mock('../../../../src/core/variableResolver.js', () => ({
  variableResolver: {
    resolve: vi.fn(),
    resolveValue: vi.fn(),
    mergeProfiles: vi.fn(),
    setPluginManager: vi.fn(),
    maskSecrets: vi.fn((text: string) => text),
    createContext: vi.fn()
  },
  VariableResolutionError: class extends Error {}
}));

vi.mock('../../../../src/core/pluginManager.js', () => ({
  PluginManager: vi.fn().mockImplementation(() => ({
    loadPlugins: vi.fn().mockResolvedValue(undefined),
    loadApiPlugins: vi.fn().mockResolvedValue({
      getVariableSources: vi.fn().mockReturnValue({}),
      getParameterizedVariableSources: vi.fn().mockReturnValue({})
    }),
    getVariableSources: vi.fn().mockReturnValue({}),
    getParameterizedVariableSources: vi.fn().mockReturnValue({})
  }))
}));

const mockConfigLoader = vi.mocked(configLoaderModule.configLoader);
const mockHttpClient = vi.mocked(httpClientModule.httpClient);
const mockVariableResolver = vi.mocked(variableResolverModule.variableResolver);
const mockUrlBuilder = vi.mocked(urlBuilderModule.urlBuilder);

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

describe('API Command Query Parameters', () => {
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

    // Setup default mocks
    mockVariableResolver.createContext.mockReturnValue({
      cli: {},
      env: {},
      profiles: {},
      api: {},
      endpoint: {},
      plugins: {}
    });

    mockVariableResolver.resolveValue.mockImplementation(async (value) => value);
    mockVariableResolver.mergeProfiles.mockReturnValue({});

    // Setup URL builder mocks
    mockUrlBuilder.buildUrl.mockImplementation((api, endpoint) => {
      return `${api.baseUrl}${endpoint.path}`;
    });
    mockUrlBuilder.mergeHeaders.mockReturnValue({});
    mockUrlBuilder.mergeParams.mockImplementation((api, endpoint) => {
      return { ...(api.params || {}), ...(endpoint.params || {}) };
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

  describe('Query Parameter Functionality', () => {
    it('should add API-level params to the URL', async () => {
      const config: HttpCraftConfig = {
        apis: {
          testApi: {
            baseUrl: 'https://api.test.com',
            params: {
              'api_key': 'test123',
              'version': 'v1'
            },
            endpoints: {
              getData: {
                method: 'GET',
                path: '/data'
              }
            }
          }
        }
      };

      mockConfigLoader.loadDefaultConfig.mockResolvedValue({
        config,
        path: '/test/.httpcraft.yaml'
      });

      await handleApiCommand({
        apiName: 'testApi',
        endpointName: 'getData'
      });

      // Verify the request was made with query parameters in the URL
      expect(mockHttpClient.executeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringMatching(/\?.*api_key=test123.*version=v1|version=v1.*api_key=test123/)
        })
      );
    });

    it('should add endpoint-level params to the URL', async () => {
      const config: HttpCraftConfig = {
        apis: {
          testApi: {
            baseUrl: 'https://api.test.com',
            endpoints: {
              getData: {
                method: 'GET',
                path: '/data',
                params: {
                  'limit': '10',
                  'sort': 'name'
                }
              }
            }
          }
        }
      };

      mockConfigLoader.loadDefaultConfig.mockResolvedValue({
        config,
        path: '/test/.httpcraft.yaml'
      });

      await handleApiCommand({
        apiName: 'testApi',
        endpointName: 'getData'
      });

      // Verify the request was made with query parameters in the URL
      expect(mockHttpClient.executeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringMatching(/\?.*limit=10.*sort=name|sort=name.*limit=10/)
        })
      );
    });

    it('should merge API and endpoint params with endpoint taking precedence', async () => {
      const config: HttpCraftConfig = {
        apis: {
          testApi: {
            baseUrl: 'https://api.test.com',
            params: {
              'api_key': 'api_value',
              'version': 'v1'
            },
            endpoints: {
              getData: {
                method: 'GET',
                path: '/data',
                params: {
                  'api_key': 'endpoint_value', // Should override API value
                  'limit': '10'
                }
              }
            }
          }
        }
      };

      mockConfigLoader.loadDefaultConfig.mockResolvedValue({
        config,
        path: '/test/.httpcraft.yaml'
      });

      await handleApiCommand({
        apiName: 'testApi',
        endpointName: 'getData'
      });

      // Verify endpoint param overrides API param and both API and endpoint params are included
      expect(mockHttpClient.executeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('api_key=endpoint_value')
        })
      );
      expect(mockHttpClient.executeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('version=v1')
        })
      );
      expect(mockHttpClient.executeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('limit=10')
        })
      );
    });

    it('should work with no query parameters', async () => {
      const config: HttpCraftConfig = {
        apis: {
          testApi: {
            baseUrl: 'https://api.test.com',
            endpoints: {
              getData: {
                method: 'GET',
                path: '/data'
                // No params defined
              }
            }
          }
        }
      };

      mockConfigLoader.loadDefaultConfig.mockResolvedValue({
        config,
        path: '/test/.httpcraft.yaml'
      });

      await handleApiCommand({
        apiName: 'testApi',
        endpointName: 'getData'
      });

      // Verify the request was made with clean URL (no query parameters)
      expect(mockHttpClient.executeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.test.com/data'
        })
      );
    });

    it('should work with variable substitution in params', async () => {
      const config: HttpCraftConfig = {
        apis: {
          testApi: {
            baseUrl: 'https://api.test.com',
            params: {
              'api_key': '{{env.API_KEY}}'
            },
            endpoints: {
              getData: {
                method: 'GET',
                path: '/data',
                params: {
                  'user_id': '{{userId}}'
                }
              }
            }
          }
        }
      };

      mockConfigLoader.loadDefaultConfig.mockResolvedValue({
        config,
        path: '/test/.httpcraft.yaml'
      });

      // Mock variable resolution to resolve the template variables
      mockVariableResolver.resolveValue.mockImplementation(async (value) => {
        if (typeof value === 'object' && value !== null) {
          // Handle the API level params
          if ('api_key' in value && value.api_key === '{{env.API_KEY}}') {
            return { api_key: 'resolved_api_key' };
          }
          // Handle the endpoint level params
          if ('user_id' in value && value.user_id === '{{userId}}') {
            return { user_id: '123' };
          }
          // Handle baseUrl resolution
          if (value === 'https://api.test.com') {
            return 'https://api.test.com';
          }
          // Handle endpoint resolution
          if ('method' in value && 'path' in value) {
            return {
              ...value,
              params: { user_id: '123' } // Resolve the params inside endpoint
            };
          }
        }
        return value;
      });

      // Mock mergeParams to return the resolved values
      mockUrlBuilder.mergeParams.mockReturnValue({
        'api_key': 'resolved_api_key',
        'user_id': '123'
      });

      await handleApiCommand({
        apiName: 'testApi',
        endpointName: 'getData',
        variables: { userId: '123' }
      });

      // Verify the request was made with resolved variables in query parameters
      expect(mockHttpClient.executeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('api_key=resolved_api_key')
        })
      );
      expect(mockHttpClient.executeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('user_id=123')
        })
      );
    });

    it('should show query parameters in verbose output', async () => {
      const config: HttpCraftConfig = {
        apis: {
          testApi: {
            baseUrl: 'https://api.test.com',
            params: {
              'api_key': 'test123'
            },
            endpoints: {
              getData: {
                method: 'GET',
                path: '/data',
                params: {
                  'limit': '10'
                }
              }
            }
          }
        }
      };

      mockConfigLoader.loadDefaultConfig.mockResolvedValue({
        config,
        path: '/test/.httpcraft.yaml'
      });

      // Override mergeParams for this test to return the expected values
      mockUrlBuilder.mergeParams.mockReturnValue({
        'api_key': 'test123',
        'limit': '10'
      });

      await handleApiCommand({
        apiName: 'testApi',
        endpointName: 'getData',
        verbose: true
      });

      // Verify that the HTTP request was made with query parameters in the URL
      expect(mockHttpClient.executeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('?api_key=test123&limit=10')
        })
      );
      
      // Verify that verbose output was generated (at least the query parameters section)
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('[REQUEST] Query Parameters:')
      );
    });

    it('should show query parameters in dry-run output', async () => {
      const config: HttpCraftConfig = {
        apis: {
          testApi: {
            baseUrl: 'https://api.test.com',
            params: {
              'api_key': 'test123'
            },
            endpoints: {
              getData: {
                method: 'GET',
                path: '/data',
                params: {
                  'limit': '10'
                }
              }
            }
          }
        }
      };

      mockConfigLoader.loadDefaultConfig.mockResolvedValue({
        config,
        path: '/test/.httpcraft.yaml'
      });

      // Override mergeParams for this test to return the expected values
      mockUrlBuilder.mergeParams.mockReturnValue({
        'api_key': 'test123',
        'limit': '10'
      });

      await handleApiCommand({
        apiName: 'testApi',
        endpointName: 'getData',
        dryRun: true
      });

      // Verify no actual HTTP request was made
      expect(mockHttpClient.executeRequest).not.toHaveBeenCalled();
      
      // Verify that dry-run output was generated (at least the query parameters section)
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DRY RUN] Query Parameters:')
      );
    });

    it('should handle special characters in query parameter values', async () => {
      const config: HttpCraftConfig = {
        apis: {
          testApi: {
            baseUrl: 'https://api.test.com',
            endpoints: {
              getData: {
                method: 'GET',
                path: '/data',
                params: {
                  'query': 'hello world',
                  'filter': 'name=John&age>25',
                  'special': 'test@example.com'
                }
              }
            }
          }
        }
      };

      mockConfigLoader.loadDefaultConfig.mockResolvedValue({
        config,
        path: '/test/.httpcraft.yaml'
      });

      await handleApiCommand({
        apiName: 'testApi',
        endpointName: 'getData'
      });

      // Verify special characters are properly URL encoded
      // Note: URLSearchParams encodes spaces as '+' which is correct for query parameters
      const requestCall = mockHttpClient.executeRequest.mock.calls[0][0];
      expect(requestCall.url).toContain('query=hello+world'); // + is correct for spaces in query params
      expect(requestCall.url).toContain('filter=name%3DJohn%26age%3E25');
      expect(requestCall.url).toContain('special=test%40example.com');
    });

    it('should handle invalid URLs gracefully', async () => {
      const config: HttpCraftConfig = {
        apis: {
          testApi: {
            baseUrl: 'not-a-valid-url',
            endpoints: {
              getData: {
                method: 'GET',
                path: '/data',
                params: {
                  'test': 'value'
                }
              }
            }
          }
        }
      };

      mockConfigLoader.loadDefaultConfig.mockResolvedValue({
        config,
        path: '/test/.httpcraft.yaml'
      });

      await handleApiCommand({
        apiName: 'testApi',
        endpointName: 'getData',
        verbose: true
      });

      // Should continue without query params and show warning in verbose mode
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARNING] Invalid URL format, skipping query parameters: not-a-valid-url/data')
      );
      expect(mockHttpClient.executeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'not-a-valid-url/data' // No query parameters added
        })
      );
    });
  });
});

describe('Phase 13: Enhanced Profile Merging', () => {
  let stderrSpy: any;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    // Mock httpClient methods for Phase 13 tests
    mockHttpClient.executeRequest.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      body: 'test response'
    });
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  describe('additive profile merging', () => {
    it('should combine default profiles with CLI profiles', async () => {
      const config: HttpCraftConfig = {
        config: {
          defaultProfile: ['base', 'env']
        },
        profiles: {
          base: { baseUrl: 'https://api.example.com' },
          env: { environment: 'dev' },
          user: { userId: '123' }
        },
        apis: {
          testApi: {
            baseUrl: '{{profile.baseUrl}}',
            endpoints: {
              test: { method: 'GET', path: '/test' }
            }
          }
        }
      };

      vi.mocked(mockConfigLoader.loadDefaultConfig).mockResolvedValue({
        config: config,
        path: '/test/.httpcraft.yaml'
      });
      vi.mocked(mockVariableResolver.mergeProfiles).mockReturnValue({
        baseUrl: 'https://api.example.com',
        environment: 'dev',
        userId: '123'
      });

      const args: ApiCommandArgs = {
        apiName: 'testApi',
        endpointName: 'test',
        profiles: ['user']
      };

      await handleApiCommand(args);

      // Should call mergeProfiles with combined profile list
      expect(mockVariableResolver.mergeProfiles).toHaveBeenCalledWith(
        ['base', 'env', 'user'], // Default profiles + CLI profiles
        config.profiles,
        false
      );
    });

    it('should use only CLI profiles when --no-default-profile is used', async () => {
      const config: HttpCraftConfig = {
        config: {
          defaultProfile: ['base', 'env']
        },
        profiles: {
          base: { baseUrl: 'https://api.example.com' },
          env: { environment: 'dev' },
          user: { userId: '123' }
        },
        apis: {
          testApi: {
            baseUrl: '{{profile.baseUrl}}',
            endpoints: {
              test: { method: 'GET', path: '/test' }
            }
          }
        }
      };

      vi.mocked(mockConfigLoader.loadDefaultConfig).mockResolvedValue({
        config: config,
        path: '/test/.httpcraft.yaml'
      });
      vi.mocked(mockVariableResolver.mergeProfiles).mockReturnValue({
        userId: '123'
      });

      const args: ApiCommandArgs = {
        apiName: 'testApi',
        endpointName: 'test',
        profiles: ['user'],
        noDefaultProfile: true
      };

      await handleApiCommand(args);

      // Should call mergeProfiles with only CLI profiles
      expect(mockVariableResolver.mergeProfiles).toHaveBeenCalledWith(
        ['user'], // Only CLI profiles
        config.profiles,
        false
      );
    });

    it('should use only default profiles when no CLI profiles specified', async () => {
      const config: HttpCraftConfig = {
        config: {
          defaultProfile: ['base', 'env']
        },
        profiles: {
          base: { baseUrl: 'https://api.example.com' },
          env: { environment: 'dev' }
        },
        apis: {
          testApi: {
            baseUrl: '{{profile.baseUrl}}',
            endpoints: {
              test: { method: 'GET', path: '/test' }
            }
          }
        }
      };

      vi.mocked(mockConfigLoader.loadDefaultConfig).mockResolvedValue({
        config: config,
        path: '/test/.httpcraft.yaml'
      });
      vi.mocked(mockVariableResolver.mergeProfiles).mockReturnValue({
        baseUrl: 'https://api.example.com',
        environment: 'dev'
      });

      const args: ApiCommandArgs = {
        apiName: 'testApi',
        endpointName: 'test'
      };

      await handleApiCommand(args);

      // Should call mergeProfiles with only default profiles
      expect(mockVariableResolver.mergeProfiles).toHaveBeenCalledWith(
        ['base', 'env'], // Only default profiles
        config.profiles,
        false
      );
    });

    it('should handle single default profile (string)', async () => {
      const config: HttpCraftConfig = {
        config: {
          defaultProfile: 'base' // Single profile as string
        },
        profiles: {
          base: { baseUrl: 'https://api.example.com' },
          user: { userId: '123' }
        },
        apis: {
          testApi: {
            baseUrl: '{{profile.baseUrl}}',
            endpoints: {
              test: { method: 'GET', path: '/test' }
            }
          }
        }
      };

      vi.mocked(mockConfigLoader.loadDefaultConfig).mockResolvedValue({
        config: config,
        path: '/test/.httpcraft.yaml'
      });
      vi.mocked(mockVariableResolver.mergeProfiles).mockReturnValue({
        baseUrl: 'https://api.example.com',
        userId: '123'
      });

      const args: ApiCommandArgs = {
        apiName: 'testApi',
        endpointName: 'test',
        profiles: ['user']
      };

      await handleApiCommand(args);

      // Should call mergeProfiles with combined profile list
      expect(mockVariableResolver.mergeProfiles).toHaveBeenCalledWith(
        ['base', 'user'], // Single default profile + CLI profiles
        config.profiles,
        false
      );
    });

    it('should handle no default profiles', async () => {
      const config: HttpCraftConfig = {
        profiles: {
          user: { userId: '123' }
        },
        apis: {
          testApi: {
            baseUrl: 'https://api.example.com',
            endpoints: {
              test: { method: 'GET', path: '/test' }
            }
          }
        }
      };

      vi.mocked(mockConfigLoader.loadDefaultConfig).mockResolvedValue({
        config: config,
        path: '/test/.httpcraft.yaml'
      });
      vi.mocked(mockVariableResolver.mergeProfiles).mockReturnValue({
        userId: '123'
      });

      const args: ApiCommandArgs = {
        apiName: 'testApi',
        endpointName: 'test',
        profiles: ['user']
      };

      await handleApiCommand(args);

      // Should call mergeProfiles with only CLI profiles
      expect(mockVariableResolver.mergeProfiles).toHaveBeenCalledWith(
        ['user'], // Only CLI profiles
        config.profiles,
        false
      );
    });
  });

  describe('verbose output for profile operations', () => {
    let stderrSpy: any;

    beforeEach(() => {
      stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      stderrSpy.mockRestore();
    });

    it('should show profile loading information in verbose mode', async () => {
      const config: HttpCraftConfig = {
        config: {
          defaultProfile: ['base', 'env']
        },
        profiles: {
          base: { baseUrl: 'https://api.example.com' },
          env: { environment: 'dev' },
          user: { userId: '123' }
        },
        apis: {
          testApi: {
            baseUrl: '{{profile.baseUrl}}',
            endpoints: {
              test: { method: 'GET', path: '/test' }
            }
          }
        }
      };

      vi.mocked(mockConfigLoader.loadDefaultConfig).mockResolvedValue({
        config: config,
        path: '/test/.httpcraft.yaml'
      });
      vi.mocked(mockVariableResolver.mergeProfiles).mockReturnValue({});

      const args: ApiCommandArgs = {
        apiName: 'testApi',
        endpointName: 'test',
        profiles: ['user'],
        verbose: true
      };

      await handleApiCommand(args);

      // Check verbose output
      expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE] Loading profiles:\n');
      expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   Default profiles: base, env\n');
      expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   CLI profiles: user\n');
      expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   Final profile order: base, env, user\n');
    });

    it('should show --no-default-profile usage in verbose mode', async () => {
      const config: HttpCraftConfig = {
        config: {
          defaultProfile: ['base']
        },
        profiles: {
          base: { baseUrl: 'https://api.example.com' },
          user: { userId: '123' }
        },
        apis: {
          testApi: {
            baseUrl: '{{profile.baseUrl}}',
            endpoints: {
              test: { method: 'GET', path: '/test' }
            }
          }
        }
      };

      vi.mocked(mockConfigLoader.loadDefaultConfig).mockResolvedValue({
        config: config,
        path: '/test/.httpcraft.yaml'
      });
      vi.mocked(mockVariableResolver.mergeProfiles).mockReturnValue({});

      const args: ApiCommandArgs = {
        apiName: 'testApi',
        endpointName: 'test',
        profiles: ['user'],
        noDefaultProfile: true,
        verbose: true
      };

      await handleApiCommand(args);

      // Check verbose output shows override behavior
      expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   --no-default-profile used: ignoring default profiles\n');
      expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   Final profile order: user\n');
    });

    it('should show "none" when no profiles are used', async () => {
      const config: HttpCraftConfig = {
        apis: {
          testApi: {
            baseUrl: 'https://api.example.com',
            endpoints: {
              test: { method: 'GET', path: '/test' }
            }
          }
        }
      };

      vi.mocked(mockConfigLoader.loadDefaultConfig).mockResolvedValue({
        config: config,
        path: '/test/.httpcraft.yaml'
      });

      const args: ApiCommandArgs = {
        apiName: 'testApi',
        endpointName: 'test',
        verbose: true
      };

      await handleApiCommand(args);

      // Check verbose output shows "none"
      expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   Default profiles: none\n');
      expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   CLI profiles: none\n');
      expect(stderrSpy).toHaveBeenCalledWith('[VERBOSE]   Final profile order: none\n');
    });
  });
}); 