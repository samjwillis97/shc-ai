import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChainExecutor } from '../../../src/core/chainExecutor.js';
import { httpClient } from '../../../src/core/httpClient.js';
import { variableResolver, VariableResolutionError } from '../../../src/core/variableResolver.js';
import { urlBuilder } from '../../../src/core/urlBuilder.js';
import type { HttpCraftConfig, ChainDefinition } from '../../../src/types/config.js';
import type { HttpRequest, HttpResponse } from '../../../src/types/plugin.js';

// Mock the dependencies
vi.mock('../../../src/core/httpClient.js', () => ({
  httpClient: {
    executeRequest: vi.fn()
  }
}));

vi.mock('../../../src/core/variableResolver.js', () => ({
  variableResolver: {
    createContext: vi.fn(),
    resolveValue: vi.fn(),
    maskSecrets: vi.fn((text: string) => text.replace(/secret/gi, '[SECRET]'))
  },
  VariableResolutionError: class VariableResolutionError extends Error {
    constructor(message: string, public variableName: string) {
      super(message);
      this.name = 'VariableResolutionError';
    }
  }
}));

vi.mock('../../../src/core/urlBuilder.js', () => ({
  urlBuilder: {
    buildUrl: vi.fn(),
    mergeHeaders: vi.fn(),
    mergeParams: vi.fn()
  }
}));

describe('ChainExecutor', () => {
  let chainExecutor: ChainExecutor;
  let consoleErrorSpy: any;

  beforeEach(() => {
    chainExecutor = new ChainExecutor();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Setup default mocks
    vi.mocked(variableResolver.createContext).mockReturnValue({
      cli: {},
      env: {},
      profiles: {},
      api: {},
      endpoint: {},
      chainVars: {}
    });

    vi.mocked(urlBuilder.buildUrl).mockReturnValue('https://api.test.com/users/123');
    vi.mocked(urlBuilder.mergeHeaders).mockReturnValue({});
    vi.mocked(urlBuilder.mergeParams).mockReturnValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockConfig: HttpCraftConfig = {
    apis: {
      testApi: {
        baseUrl: 'https://api.test.com',
        endpoints: {
          getUser: {
            method: 'GET',
            path: '/users/{{userId}}'
          },
          createUser: {
            method: 'POST',
            path: '/users',
            body: {
              name: '{{name}}',
              email: '{{email}}'
            }
          }
        }
      }
    }
  };

  describe('parseStepCall', () => {
    it('should parse valid step call format', () => {
      const result = (chainExecutor as any).parseStepCall('testApi.getUser');
      expect(result).toEqual({
        apiName: 'testApi',
        endpointName: 'getUser'
      });
    });

    it('should throw error for invalid format', () => {
      expect(() => (chainExecutor as any).parseStepCall('invalid')).toThrow(
        "Invalid step call format 'invalid'. Expected format: 'api_name.endpoint_name'"
      );
    });

    it('should throw error for too many dots', () => {
      expect(() => (chainExecutor as any).parseStepCall('api.endpoint.extra')).toThrow(
        "Invalid step call format 'api.endpoint.extra'. Expected format: 'api_name.endpoint_name'"
      );
    });

    it('should throw error for empty parts', () => {
      expect(() => (chainExecutor as any).parseStepCall('.endpoint')).toThrow(
        "Invalid step call format '.endpoint'. API name and endpoint name cannot be empty"
      );
    });
  });

  describe('executeChain', () => {
    it('should execute a simple single-step chain successfully', async () => {
      const chain: ChainDefinition = {
        steps: [
          {
            id: 'getUser',
            call: 'testApi.getUser'
          }
        ]
      };

      const mockResponse: HttpResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: '{"id": 123, "name": "John Doe"}'
      };

      // Mock successful resolution and request
      vi.mocked(variableResolver.resolveValue).mockResolvedValue(mockConfig.apis.testApi);
      vi.mocked(httpClient.executeRequest).mockResolvedValue(mockResponse);

      const result = await chainExecutor.executeChain(
        'testChain',
        chain,
        mockConfig,
        {},
        {},
        false,
        false
      );

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].stepId).toBe('getUser');
      expect(result.steps[0].success).toBe(true);
      expect(result.steps[0].response).toEqual(mockResponse);
    });

    it('should execute a multi-step chain successfully', async () => {
      const chain: ChainDefinition = {
        description: 'Create and get user',
        vars: {
          userName: 'testuser'
        },
        steps: [
          {
            id: 'createUser',
            call: 'testApi.createUser'
          },
          {
            id: 'getUser',
            call: 'testApi.getUser'
          }
        ]
      };

      const createResponse: HttpResponse = {
        status: 201,
        statusText: 'Created',
        headers: {},
        body: '{"id": 456, "name": "testuser"}'
      };

      const getResponse: HttpResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: '{"id": 456, "name": "testuser", "email": "test@example.com"}'
      };

      // Mock successful resolutions and requests
      vi.mocked(variableResolver.resolveValue).mockResolvedValue(mockConfig.apis.testApi);
      vi.mocked(httpClient.executeRequest)
        .mockResolvedValueOnce(createResponse)
        .mockResolvedValueOnce(getResponse);

      const result = await chainExecutor.executeChain(
        'testChain',
        chain,
        mockConfig,
        {},
        {},
        false,
        false
      );

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].stepId).toBe('createUser');
      expect(result.steps[0].success).toBe(true);
      expect(result.steps[1].stepId).toBe('getUser');
      expect(result.steps[1].success).toBe(true);
      expect(httpClient.executeRequest).toHaveBeenCalledTimes(2);
    });

    it('should stop execution on step failure', async () => {
      const chain: ChainDefinition = {
        steps: [
          {
            id: 'failingStep',
            call: 'testApi.getUser'
          },
          {
            id: 'neverExecuted',
            call: 'testApi.createUser'
          }
        ]
      };

      const errorResponse: HttpResponse = {
        status: 404,
        statusText: 'Not Found',
        headers: {},
        body: '{"error": "User not found"}'
      };

      // Mock failing request
      vi.mocked(variableResolver.resolveValue).mockResolvedValue(mockConfig.apis.testApi);
      vi.mocked(httpClient.executeRequest).mockResolvedValue(errorResponse);

      const result = await chainExecutor.executeChain(
        'testChain',
        chain,
        mockConfig,
        {},
        {},
        false,
        false
      );

      expect(result.success).toBe(false);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].stepId).toBe('failingStep');
      expect(result.steps[0].success).toBe(false);
      expect(result.steps[0].error).toBe('HTTP 404: Not Found');
      expect(result.error).toBe("Step 'failingStep' failed: HTTP 404: Not Found");
      expect(httpClient.executeRequest).toHaveBeenCalledTimes(1);
    });

    it('should handle API not found error', async () => {
      const chain: ChainDefinition = {
        steps: [
          {
            id: 'step1',
            call: 'nonexistentApi.getUser'
          }
        ]
      };

      const result = await chainExecutor.executeChain(
        'testChain',
        chain,
        mockConfig,
        {},
        {},
        false,
        false
      );

      expect(result.success).toBe(false);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].success).toBe(false);
      expect(result.steps[0].error).toBe("API 'nonexistentApi' not found in configuration");
    });

    it('should handle endpoint not found error', async () => {
      const chain: ChainDefinition = {
        steps: [
          {
            id: 'step1',
            call: 'testApi.nonexistentEndpoint'
          }
        ]
      };

      const result = await chainExecutor.executeChain(
        'testChain',
        chain,
        mockConfig,
        {},
        {},
        false,
        false
      );

      expect(result.success).toBe(false);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].success).toBe(false);
      expect(result.steps[0].error).toBe("Endpoint 'nonexistentEndpoint' not found in API 'testApi'");
    });

    it('should support dry run mode', async () => {
      const chain: ChainDefinition = {
        steps: [
          {
            id: 'getUser',
            call: 'testApi.getUser'
          }
        ]
      };

      // Mock successful resolution
      vi.mocked(variableResolver.resolveValue).mockResolvedValue(mockConfig.apis.testApi);

      const result = await chainExecutor.executeChain(
        'testChain',
        chain,
        mockConfig,
        {},
        {},
        false,
        true // dry run
      );

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].stepId).toBe('getUser');
      expect(result.steps[0].success).toBe(true);
      expect(result.steps[0].response.statusText).toBe('OK (DRY RUN)');
      expect(httpClient.executeRequest).not.toHaveBeenCalled();
    });

    it('should include chain variables in context', async () => {
      const chain: ChainDefinition = {
        vars: {
          userId: 123,
          active: true
        },
        steps: [
          {
            id: 'getUser',
            call: 'testApi.getUser'
          }
        ]
      };

      const mockResponse: HttpResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: '{"id": 123}'
      };

      vi.mocked(variableResolver.resolveValue).mockResolvedValue(mockConfig.apis.testApi);
      vi.mocked(httpClient.executeRequest).mockResolvedValue(mockResponse);

      await chainExecutor.executeChain(
        'testChain',
        chain,
        mockConfig,
        {},
        {},
        false,
        false
      );

      // Verify that chain variables were added to context
      expect(variableResolver.createContext).toHaveBeenCalled();
      const contextCall = vi.mocked(variableResolver.createContext).mock.calls[0];
      expect(contextCall).toBeDefined();
    });

    it('should provide verbose output when enabled', async () => {
      const chain: ChainDefinition = {
        description: 'Test chain with description',
        steps: [
          {
            id: 'getUser',
            call: 'testApi.getUser'
          }
        ]
      };

      const mockResponse: HttpResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: '{"id": 123}'
      };

      vi.mocked(variableResolver.resolveValue).mockResolvedValue(mockConfig.apis.testApi);
      vi.mocked(httpClient.executeRequest).mockResolvedValue(mockResponse);

      await chainExecutor.executeChain(
        'testChain',
        chain,
        mockConfig,
        {},
        {},
        true, // verbose
        false
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith('[CHAIN] Starting execution of chain: testChain');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[CHAIN] Description: Test chain with description');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[CHAIN] Steps to execute: 1');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[CHAIN] Executing step 1/1: getUser');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[CHAIN] Step getUser completed successfully');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[CHAIN] Chain execution completed successfully');
    });

    it('should handle variable resolution errors', async () => {
      const chain: ChainDefinition = {
        steps: [
          {
            id: 'getUser',
            call: 'testApi.getUser'
          }
        ]
      };

      // Mock variable resolution error
      vi.mocked(variableResolver.resolveValue).mockRejectedValue(
        new VariableResolutionError('Variable "userId" could not be resolved', 'userId')
      );

      const result = await chainExecutor.executeChain(
        'testChain',
        chain,
        mockConfig,
        {},
        {},
        false,
        false
      );

      expect(result.success).toBe(false);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].success).toBe(false);
      expect(result.steps[0].error).toContain('Variable resolution failed');
    });

    it('should handle URL with query parameters correctly', async () => {
      const chain: ChainDefinition = {
        steps: [
          {
            id: 'getUser',
            call: 'testApi.getUser'
          }
        ]
      };

      const mockResponse: HttpResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: '{"id": 123}'
      };

      // Mock with query parameters
      vi.mocked(variableResolver.resolveValue).mockResolvedValue(mockConfig.apis.testApi);
      vi.mocked(urlBuilder.mergeParams).mockReturnValue({ limit: '10', active: 'true' });
      vi.mocked(httpClient.executeRequest).mockResolvedValue(mockResponse);

      await chainExecutor.executeChain(
        'testChain',
        chain,
        mockConfig,
        {},
        {},
        false,
        false
      );

      // Verify that the request was made with parameters in the URL
      expect(httpClient.executeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('limit=10'),
        })
      );
    });

    // T8.5: Tests for step.with overrides
    describe('T8.5: step.with overrides', () => {
      it('should override headers with step.with', async () => {
        const chain: ChainDefinition = {
          steps: [
            {
              id: 'createUser',
              call: 'testApi.createUser',
              with: {
                headers: {
                  'Authorization': 'Bearer custom-token',
                  'X-Custom': 'override-value'
                }
              }
            }
          ]
        };

        const mockResponse: HttpResponse = {
          status: 201,
          statusText: 'Created',
          headers: {},
          body: '{"id": 123}'
        };

        // Mock variableResolver.resolveValue to handle different inputs
        vi.mocked(variableResolver.resolveValue).mockImplementation(async (value) => {
          // Return the value as-is for API and endpoint (no variables to resolve)
          if (value === mockConfig.apis.testApi) {
            return mockConfig.apis.testApi;
          }
          if (value === mockConfig.apis.testApi.endpoints.createUser) {
            return mockConfig.apis.testApi.endpoints.createUser;
          }
          // For step.with, return the resolved values
          if (value && typeof value === 'object' && 'headers' in value) {
            return value; // step.with headers should be returned as-is (no variables to resolve)
          }
          return value;
        });

        vi.mocked(urlBuilder.mergeHeaders).mockReturnValue({ 'Content-Type': 'application/json' });
        vi.mocked(httpClient.executeRequest).mockResolvedValue(mockResponse);

        await chainExecutor.executeChain(
          'testChain',
          chain,
          mockConfig,
          {},
          {},
          false,
          false
        );

        // Verify that step.with headers were merged with base headers
        expect(httpClient.executeRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            headers: {
              'Content-Type': 'application/json', // From base
              'Authorization': 'Bearer custom-token', // From step.with
              'X-Custom': 'override-value' // From step.with
            }
          })
        );
      });

      it('should override query params with step.with', async () => {
        const chain: ChainDefinition = {
          steps: [
            {
              id: 'getUser',
              call: 'testApi.getUser',
              with: {
                params: {
                  'limit': '20',
                  'include': 'profile'
                }
              }
            }
          ]
        };

        const mockResponse: HttpResponse = {
          status: 200,
          statusText: 'OK',
          headers: {},
          body: '{"id": 123}'
        };

        // Mock variableResolver.resolveValue to handle different inputs
        vi.mocked(variableResolver.resolveValue).mockImplementation(async (value) => {
          // Return the value as-is for API and endpoint (no variables to resolve)
          if (value === mockConfig.apis.testApi) {
            return mockConfig.apis.testApi;
          }
          if (value === mockConfig.apis.testApi.endpoints.getUser) {
            return mockConfig.apis.testApi.endpoints.getUser;
          }
          // For step.with, return the resolved values
          if (value && typeof value === 'object' && 'params' in value) {
            return value; // step.with params should be returned as-is (no variables to resolve)
          }
          return value;
        });

        vi.mocked(urlBuilder.mergeParams).mockReturnValue({ 'limit': '10' }); // Base params
        vi.mocked(httpClient.executeRequest).mockResolvedValue(mockResponse);

        await chainExecutor.executeChain(
          'testChain',
          chain,
          mockConfig,
          {},
          {},
          false,
          false
        );

        // Verify that the request was made with merged parameters
        expect(httpClient.executeRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            url: expect.stringMatching(/limit=20/), // step.with overrides base
          })
        );
        expect(httpClient.executeRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            url: expect.stringMatching(/include=profile/), // step.with addition
          })
        );
      });

      it('should override body with step.with', async () => {
        const chain: ChainDefinition = {
          steps: [
            {
              id: 'createUser',
              call: 'testApi.createUser',
              with: {
                body: {
                  name: 'Override Name',
                  email: 'override@example.com',
                  customField: 'custom-value'
                }
              }
            }
          ]
        };

        const mockResponse: HttpResponse = {
          status: 201,
          statusText: 'Created',
          headers: {},
          body: '{"id": 123}'
        };

        // Mock variableResolver.resolveValue to handle different inputs
        vi.mocked(variableResolver.resolveValue).mockImplementation(async (value) => {
          // Return the value as-is for API and endpoint (no variables to resolve)
          if (value === mockConfig.apis.testApi) {
            return mockConfig.apis.testApi;
          }
          if (value === mockConfig.apis.testApi.endpoints.createUser) {
            return mockConfig.apis.testApi.endpoints.createUser;
          }
          // For step.with, return the resolved values
          if (value && typeof value === 'object' && 'body' in value) {
            return value; // step.with body should be returned as-is (no variables to resolve)
          }
          return value;
        });

        vi.mocked(httpClient.executeRequest).mockResolvedValue(mockResponse);

        await chainExecutor.executeChain(
          'testChain',
          chain,
          mockConfig,
          {},
          {},
          false,
          false
        );

        // Verify that step.with body completely replaced the endpoint body
        expect(httpClient.executeRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            body: {
              name: 'Override Name',
              email: 'override@example.com',
              customField: 'custom-value'
            }
          })
        );
      });

      it('should apply pathParams substitution with step.with', async () => {
        const chain: ChainDefinition = {
          steps: [
            {
              id: 'getUser',
              call: 'testApi.getUser',
              with: {
                pathParams: {
                  'userId': '456',
                  'orgId': 'org-123'
                }
              }
            }
          ]
        };

        const mockResponse: HttpResponse = {
          status: 200,
          statusText: 'OK',
          headers: {},
          body: '{"id": 456}'
        };

        // Mock endpoint with path parameters
        const mockEndpoint = {
          method: 'GET' as const,
          path: '/users/{{userId}}/org/{{orgId}}'
        };

        const mockApiWithPathParams = {
          ...mockConfig.apis.testApi,
          endpoints: {
            getUser: mockEndpoint
          }
        };

        // Mock variableResolver.resolveValue to handle different inputs
        vi.mocked(variableResolver.resolveValue).mockImplementation(async (value) => {
          // Return the value as-is for API and endpoint (no variables to resolve)
          if (value === mockConfig.apis.testApi) {
            return mockApiWithPathParams;
          }
          if (value === mockConfig.apis.testApi.endpoints.getUser) {
            return mockEndpoint;
          }
          // For step.with, return the resolved values
          if (value && typeof value === 'object' && 'pathParams' in value) {
            return value; // step.with pathParams should be returned as-is (no variables to resolve)
          }
          return value;
        });

        vi.mocked(urlBuilder.buildUrl).mockReturnValue('https://api.test.com/users/{{userId}}/org/{{orgId}}');
        vi.mocked(httpClient.executeRequest).mockResolvedValue(mockResponse);

        await chainExecutor.executeChain(
          'testChain',
          chain,
          mockConfig,
          {},
          {},
          false,
          false
        );

        // Verify that pathParams were substituted in the URL
        expect(httpClient.executeRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://api.test.com/users/456/org/org-123'
          })
        );
      });

      it('should resolve variables in step.with overrides', async () => {
        const chain: ChainDefinition = {
          vars: {
            customToken: 'chain-token-123',
            userName: 'Chain User'
          },
          steps: [
            {
              id: 'createUser',
              call: 'testApi.createUser',
              with: {
                headers: {
                  'Authorization': 'Bearer {{customToken}}'
                },
                body: {
                  name: '{{userName}}',
                  source: 'chain'
                }
              }
            }
          ]
        };

        const mockResponse: HttpResponse = {
          status: 201,
          statusText: 'Created',
          headers: {},
          body: '{"id": 123}'
        };

        vi.mocked(variableResolver.resolveValue).mockImplementation(async (value) => {
          // Return the value as-is for API and endpoint (no variables to resolve)
          if (value === mockConfig.apis.testApi) {
            return mockConfig.apis.testApi;
          }
          if (value === mockConfig.apis.testApi.endpoints.createUser) {
            return mockConfig.apis.testApi.endpoints.createUser;
          }
          // For step.with, resolve variables
          if (value && typeof value === 'object' && ('headers' in value || 'body' in value)) {
            const resolved: any = {};
            for (const [key, val] of Object.entries(value)) {
              if (typeof val === 'string') {
                resolved[key] = val
                  .replace('{{customToken}}', 'chain-token-123')
                  .replace('{{userName}}', 'Chain User');
              } else if (val && typeof val === 'object') {
                resolved[key] = {};
                for (const [subKey, subVal] of Object.entries(val)) {
                  if (typeof subVal === 'string') {
                    resolved[key][subKey] = subVal
                      .replace('{{customToken}}', 'chain-token-123')
                      .replace('{{userName}}', 'Chain User');
                  } else {
                    resolved[key][subKey] = subVal;
                  }
                }
              } else {
                resolved[key] = val;
              }
            }
            return resolved;
          }
          return value;
        });

        vi.mocked(httpClient.executeRequest).mockResolvedValue(mockResponse);

        await chainExecutor.executeChain(
          'testChain',
          chain,
          mockConfig,
          {},
          {},
          false,
          false
        );

        // Verify that variables were resolved in step.with overrides
        expect(httpClient.executeRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            headers: expect.objectContaining({
              'Authorization': 'Bearer chain-token-123'
            }),
            body: {
              name: 'Chain User',
              source: 'chain'
            }
          })
        );
      });

      it('should handle step.with without overriding undefined fields', async () => {
        const chain: ChainDefinition = {
          steps: [
            {
              id: 'getUser',
              call: 'testApi.getUser',
              with: {
                headers: {
                  'X-Custom': 'custom-value'
                }
                // No params, pathParams, or body overrides
              }
            }
          ]
        };

        const mockResponse: HttpResponse = {
          status: 200,
          statusText: 'OK',
          headers: {},
          body: '{"id": 123}'
        };

        // Mock variableResolver.resolveValue to handle different inputs
        vi.mocked(variableResolver.resolveValue).mockImplementation(async (value) => {
          // Return the value as-is for API and endpoint (no variables to resolve)
          if (value === mockConfig.apis.testApi) {
            return mockConfig.apis.testApi;
          }
          if (value === mockConfig.apis.testApi.endpoints.getUser) {
            return mockConfig.apis.testApi.endpoints.getUser;
          }
          // For step.with, return the resolved values
          if (value && typeof value === 'object' && 'headers' in value) {
            return value; // step.with headers should be returned as-is (no variables to resolve)
          }
          return value;
        });

        vi.mocked(urlBuilder.mergeHeaders).mockReturnValue({ 'Content-Type': 'application/json' });
        vi.mocked(urlBuilder.mergeParams).mockReturnValue({ 'limit': '10' });
        vi.mocked(httpClient.executeRequest).mockResolvedValue(mockResponse);

        await chainExecutor.executeChain(
          'testChain',
          chain,
          mockConfig,
          {},
          {},
          false,
          false
        );

        // Verify that only headers were overridden, other fields use defaults
        expect(httpClient.executeRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            headers: {
              'Content-Type': 'application/json', // From base
              'X-Custom': 'custom-value' // From step.with
            },
            url: expect.stringContaining('limit=10'), // Base params preserved
            body: undefined // No body override, uses endpoint default
          })
        );
      });
    });

    describe('T8.8 & T8.9: Step Variable Resolution', () => {
      it('should pass previous step results to variable context', async () => {
        const chain: ChainDefinition = {
          steps: [
            {
              id: 'createUser',
              call: 'testApi.createUser'
            },
            {
              id: 'getUser',
              call: 'testApi.getUser'
            }
          ]
        };

        const createResponse: HttpResponse = {
          status: 201,
          statusText: 'Created',
          headers: { 'location': '/users/456' },
          body: '{"id": 456, "name": "testuser"}'
        };

        const getResponse: HttpResponse = {
          status: 200,
          statusText: 'OK',
          headers: {},
          body: '{"id": 456, "name": "testuser", "email": "test@example.com"}'
        };

        // Mock successful resolutions and requests
        vi.mocked(variableResolver.resolveValue).mockResolvedValue(mockConfig.apis.testApi);
        vi.mocked(httpClient.executeRequest)
          .mockResolvedValueOnce(createResponse)
          .mockResolvedValueOnce(getResponse);

        const result = await chainExecutor.executeChain(
          'testChain',
          chain,
          mockConfig,
          {},
          {},
          false,
          false
        );

        expect(result.success).toBe(true);
        expect(result.steps).toHaveLength(2);

        // Verify that createContext was called with step data for the second step
        const createContextCalls = vi.mocked(variableResolver.createContext).mock.calls;
        expect(createContextCalls).toHaveLength(2);
        
        // First step should have no previous steps
        const firstStepContext = createContextCalls[0];
        expect(firstStepContext[0]).toEqual({}); // cliVars
        
        // Second step should have access to first step's results
        const secondStepContext = createContextCalls[1];
        expect(secondStepContext[0]).toEqual({}); // cliVars
        
        // Verify that the variable context gets the steps data added
        expect(vi.mocked(variableResolver.createContext)).toHaveBeenCalledTimes(2);
      });

      it('should store complete request and response data for each step', async () => {
        const chain: ChainDefinition = {
          steps: [
            {
              id: 'step1',
              call: 'testApi.createUser'
            }
          ]
        };

        const mockRequest: HttpRequest = {
          method: 'POST',
          url: 'https://api.test.com/users',
          headers: { 'Content-Type': 'application/json' },
          body: { name: 'test', email: 'test@example.com' }
        };

        const mockResponse: HttpResponse = {
          status: 201,
          statusText: 'Created',
          headers: { 'location': '/users/456' },
          body: '{"id": 456, "name": "test"}'
        };

        // Mock successful resolution and request
        vi.mocked(variableResolver.resolveValue).mockResolvedValue(mockConfig.apis.testApi);
        vi.mocked(httpClient.executeRequest).mockResolvedValue(mockResponse);

        const result = await chainExecutor.executeChain(
          'testChain',
          chain,
          mockConfig,
          {},
          {},
          false,
          false
        );

        expect(result.success).toBe(true);
        expect(result.steps).toHaveLength(1);
        
        const step = result.steps[0];
        expect(step.stepId).toBe('step1');
        expect(step.request).toBeDefined();
        expect(step.response).toEqual(mockResponse);
        expect(step.success).toBe(true);
      });

      it('should handle step execution with step.with overrides and variable resolution', async () => {
        const chain: ChainDefinition = {
          steps: [
            {
              id: 'step1',
              call: 'testApi.createUser',
              with: {
                headers: { 'X-Custom': 'value' },
                body: { name: 'override' }
              }
            }
          ]
        };

        const mockResponse: HttpResponse = {
          status: 201,
          statusText: 'Created',
          headers: {},
          body: '{"id": 456}'
        };

        // Mock successful resolution and request
        vi.mocked(variableResolver.resolveValue)
          .mockResolvedValueOnce(mockConfig.apis.testApi) // API resolution
          .mockResolvedValueOnce(mockConfig.apis.testApi.endpoints.createUser) // Endpoint resolution
          .mockResolvedValueOnce({ headers: { 'X-Custom': 'value' }, body: { name: 'override' } }); // step.with resolution

        vi.mocked(httpClient.executeRequest).mockResolvedValue(mockResponse);

        const result = await chainExecutor.executeChain(
          'testChain',
          chain,
          mockConfig,
          {},
          {},
          false,
          false
        );

        expect(result.success).toBe(true);
        expect(result.steps).toHaveLength(1);
        
        // Verify that resolveValue was called for step.with
        expect(vi.mocked(variableResolver.resolveValue)).toHaveBeenCalledTimes(3);
      });
    });
  });
}); 