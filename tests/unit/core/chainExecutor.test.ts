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
    resolveValue: vi.fn()
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
  });
}); 