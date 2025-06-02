import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleChainCommand } from '../../src/cli/commands/chain.js';
import { configLoader } from '../../src/core/configLoader.js';
import { httpClient } from '../../src/core/httpClient.js';
import { variableResolver } from '../../src/core/variableResolver.js';
import { urlBuilder } from '../../src/core/urlBuilder.js';
import type { HttpRequest, HttpResponse } from '../../src/types/plugin.js';
import type { HttpCraftConfig } from '../../src/types/config.js';

// Mock httpClient to simulate HTTP responses
vi.mock('../../src/core/httpClient.js', () => ({
  httpClient: {
    executeRequest: vi.fn(),
    setPluginManager: vi.fn()
  }
}));

// Mock variable resolver
vi.mock('../../src/core/variableResolver.js', () => ({
  variableResolver: {
    createContext: vi.fn(),
    resolveValue: vi.fn(),
    mergeProfiles: vi.fn()
  }
}));

// Mock url builder
vi.mock('../../src/core/urlBuilder.js', () => ({
  urlBuilder: {
    buildUrl: vi.fn(),
    mergeHeaders: vi.fn(),
    mergeParams: vi.fn()
  }
}));

describe('Chain Execution Integration', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // Store actual error messages for debugging
    const actualErrors: string[] = [];
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      actualErrors.push(args.join(' '));
    });
    
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
      // Log the console.error calls before throwing
      console.log('Process exit called with code:', code);
      console.log('Actual error messages:', actualErrors);
      throw new Error(`Process exited with code ${code}`);
    });

    // Setup variable resolver mocks
    let currentContext: any = {};
    
    vi.mocked(variableResolver.createContext).mockImplementation((cliVars, profiles, apiVars, endpointVars) => {
      const context = {
        cli: cliVars || {},
        env: {},
        profiles: profiles || {},
        api: apiVars || {},
        endpoint: endpointVars || {},
        chainVars: {}
      };
      currentContext = context;
      return context;
    });

    vi.mocked(variableResolver.resolveValue).mockImplementation(async (value) => {
      // Helper function for recursive resolution using the current context
      const resolve = async (val: any): Promise<any> => {
        if (typeof val === 'string') {
          let resolved = val;
          
          // Handle CLI variables (highest precedence)
          Object.entries(currentContext.cli).forEach(([key, value]) => {
            resolved = resolved.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
          });
          
          // Handle chain variables  
          Object.entries(currentContext.chainVars || {}).forEach(([key, value]) => {
            resolved = resolved.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
          });
          
          return resolved;
        }
        
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          const resolved: any = {};
          for (const [key, nestedVal] of Object.entries(val)) {
            resolved[key] = await resolve(nestedVal);
          }
          return resolved;
        }
        
        return val;
      };
      
      return resolve(value);
    });

    vi.mocked(variableResolver.mergeProfiles).mockReturnValue({});

    // Setup url builder mocks
    vi.mocked(urlBuilder.buildUrl).mockImplementation((api, endpoint) => {
      // Return different URLs based on endpoint path
      if (endpoint.path === '/users') {
        return 'https://api.users.com/users';
      } else if (endpoint.path === '/users/{{userId}}') {
        return 'https://api.users.com/users/{{userId}}';
      }
      return `${api.baseUrl}${endpoint.path}`;
    });
    vi.mocked(urlBuilder.mergeHeaders).mockReturnValue({ 'Content-Type': 'application/json' });
    vi.mocked(urlBuilder.mergeParams).mockReturnValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const testConfig: HttpCraftConfig = {
    apis: {
      userApi: {
        baseUrl: 'https://api.users.com',
        endpoints: {
          createUser: {
            method: 'POST',
            path: '/users',
            headers: {
              'Content-Type': 'application/json'
            },
            body: {
              name: '{{userName}}',
              email: '{{userEmail}}'
            }
          },
          getUser: {
            method: 'GET',
            path: '/users/{{userId}}'
          }
        }
      }
    },
    chains: {
      userWorkflow: {
        description: 'Create a user and then retrieve it',
        vars: {
          userName: 'John Doe',
          userEmail: 'john@example.com'
        },
        steps: [
          {
            id: 'createUser',
            description: 'Create a new user',
            call: 'userApi.createUser'
          },
          {
            id: 'getCreatedUser',
            description: 'Get the created user',
            call: 'userApi.getUser'
          }
        ]
      }
    }
  };

  it('should execute a complete chain with sequential steps', async () => {
    // Mock config loading
    vi.spyOn(configLoader, 'loadConfig').mockResolvedValue(testConfig);

    // Mock HTTP responses
    const createUserResponse: HttpResponse = {
      status: 201,
      statusText: 'Created',
      headers: { 'content-type': 'application/json' },
      body: '{"id": 123, "name": "John Doe", "email": "john@example.com"}'
    };

    const getUserResponse: HttpResponse = {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: '{"id": 123, "name": "John Doe", "email": "john@example.com", "created_at": "2023-12-01T10:00:00Z"}'
    };

    vi.mocked(httpClient.executeRequest)
      .mockResolvedValueOnce(createUserResponse)
      .mockResolvedValueOnce(getUserResponse);

    // Execute chain
    await handleChainCommand({
      chainName: 'userWorkflow',
      config: 'test-config.yaml'
    });

    // Verify both HTTP requests were made
    expect(httpClient.executeRequest).toHaveBeenCalledTimes(2);

    // Verify first request (createUser)
    const firstRequest = vi.mocked(httpClient.executeRequest).mock.calls[0][0] as HttpRequest;
    expect(firstRequest.method).toBe('POST');
    expect(firstRequest.url).toBe('https://api.users.com/users');
    expect(firstRequest.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(firstRequest.body).toEqual({
      name: 'John Doe',
      email: 'john@example.com'
    });

    // Verify second request (getUser)
    const secondRequest = vi.mocked(httpClient.executeRequest).mock.calls[1][0] as HttpRequest;
    expect(secondRequest.method).toBe('GET');
    expect(secondRequest.url).toBe('https://api.users.com/users/{{userId}}'); // Note: userId not resolved yet

    // Verify final output (last step's response body)
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '{"id": 123, "name": "John Doe", "email": "john@example.com", "created_at": "2023-12-01T10:00:00Z"}'
    );
  });

  it('should stop chain execution on HTTP error', async () => {
    vi.spyOn(configLoader, 'loadConfig').mockResolvedValue(testConfig);

    // Mock first request failing
    const errorResponse: HttpResponse = {
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      body: '{"error": "Invalid email format"}'
    };

    vi.mocked(httpClient.executeRequest).mockResolvedValue(errorResponse);

    // Chain should fail and exit
    await expect(handleChainCommand({
      chainName: 'userWorkflow',
      config: 'test-config.yaml'
    })).rejects.toThrow('Process exited with code 1');

    // Only first request should be made
    expect(httpClient.executeRequest).toHaveBeenCalledTimes(1);

    // Error should be reported
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Chain execution failed:")
    );
  });

  it('should support dry run mode for chains', async () => {
    vi.spyOn(configLoader, 'loadConfig').mockResolvedValue(testConfig);

    // Execute chain in dry run mode
    await handleChainCommand({
      chainName: 'userWorkflow',
      config: 'test-config.yaml',
      dryRun: true
    });

    // No actual HTTP requests should be made
    expect(httpClient.executeRequest).not.toHaveBeenCalled();

    // Should output dry run response
    expect(consoleLogSpy).toHaveBeenCalledWith('{"message": "This is a dry run response"}');
  });

  it('should support verbose output for chains', async () => {
    vi.spyOn(configLoader, 'loadConfig').mockResolvedValue(testConfig);

    const createUserResponse: HttpResponse = {
      status: 201,
      statusText: 'Created',
      headers: {},
      body: '{"id": 123}'
    };

    const getUserResponse: HttpResponse = {
      status: 200,
      statusText: 'OK',
      headers: {},
      body: '{"id": 123, "name": "John Doe"}'
    };

    vi.mocked(httpClient.executeRequest)
      .mockResolvedValueOnce(createUserResponse)
      .mockResolvedValueOnce(getUserResponse);

    // Execute chain with verbose output
    await handleChainCommand({
      chainName: 'userWorkflow',
      config: 'test-config.yaml',
      verbose: true
    });

    // Verify verbose logging occurred
    expect(consoleErrorSpy).toHaveBeenCalledWith('[CHAIN] Starting execution of chain: userWorkflow');
    expect(consoleErrorSpy).toHaveBeenCalledWith('[CHAIN] Description: Create a user and then retrieve it');
    expect(consoleErrorSpy).toHaveBeenCalledWith('[CHAIN] Steps to execute: 2');
    expect(consoleErrorSpy).toHaveBeenCalledWith('[CHAIN] Executing step 1/2: createUser');
    expect(consoleErrorSpy).toHaveBeenCalledWith('[CHAIN] Step createUser completed successfully');
    expect(consoleErrorSpy).toHaveBeenCalledWith('[CHAIN] Executing step 2/2: getCreatedUser');
    expect(consoleErrorSpy).toHaveBeenCalledWith('[CHAIN] Step getCreatedUser completed successfully');
    expect(consoleErrorSpy).toHaveBeenCalledWith('[CHAIN] Chain execution completed successfully');
  });

  it('should handle chain variables correctly', async () => {
    const configWithVariables: HttpCraftConfig = {
      ...testConfig,
      chains: {
        userWorkflow: {
          vars: {
            userName: 'Jane Smith',
            userEmail: 'jane@example.com'
          },
          steps: [
            {
              id: 'createUser',
              call: 'userApi.createUser'
            }
          ]
        }
      }
    };

    vi.spyOn(configLoader, 'loadConfig').mockResolvedValue(configWithVariables);

    const createUserResponse: HttpResponse = {
      status: 201,
      statusText: 'Created',
      headers: {},
      body: '{"id": 456, "name": "Jane Smith"}'
    };

    vi.mocked(httpClient.executeRequest).mockResolvedValue(createUserResponse);

    await handleChainCommand({
      chainName: 'userWorkflow',
      config: 'test-config.yaml'
    });

    // Verify the request used chain variables
    const request = vi.mocked(httpClient.executeRequest).mock.calls[0][0] as HttpRequest;
    expect(request.body).toEqual({
      name: 'Jane Smith',
      email: 'jane@example.com'
    });

    expect(consoleLogSpy).toHaveBeenCalledWith('{"id": 456, "name": "Jane Smith"}');
  });

  it('should handle CLI variables overriding chain variables', async () => {
    vi.spyOn(configLoader, 'loadConfig').mockResolvedValue(testConfig);

    const createUserResponse: HttpResponse = {
      status: 201,
      statusText: 'Created',
      headers: {},
      body: '{"id": 789, "name": "CLI User"}'
    };

    vi.mocked(httpClient.executeRequest).mockResolvedValue(createUserResponse);

    // Execute chain with CLI variable overrides
    await handleChainCommand({
      chainName: 'userWorkflow',
      config: 'test-config.yaml',
      variables: {
        userName: 'CLI User',
        userEmail: 'cli@example.com'
      }
    });

    // Verify CLI variables took precedence
    const request = vi.mocked(httpClient.executeRequest).mock.calls[0][0] as HttpRequest;
    expect(request.body).toEqual({
      name: 'CLI User',
      email: 'cli@example.com'
    });
  });

  it('should handle missing API gracefully', async () => {
    const configWithMissingApi: HttpCraftConfig = {
      apis: {
        // userApi missing
      },
      chains: {
        userWorkflow: testConfig.chains!.userWorkflow
      }
    };

    vi.spyOn(configLoader, 'loadConfig').mockResolvedValue(configWithMissingApi);

    await expect(handleChainCommand({
      chainName: 'userWorkflow',
      config: 'test-config.yaml'
    })).rejects.toThrow('Process exited with code 1');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("API 'userApi' not found in configuration")
    );
  });

  it('should handle missing endpoint gracefully', async () => {
    const configWithMissingEndpoint: HttpCraftConfig = {
      apis: {
        userApi: {
          baseUrl: 'https://api.users.com',
          endpoints: {
            // createUser endpoint missing
            getUser: testConfig.apis.userApi.endpoints.getUser
          }
        }
      },
      chains: {
        userWorkflow: testConfig.chains!.userWorkflow
      }
    };

    vi.spyOn(configLoader, 'loadConfig').mockResolvedValue(configWithMissingEndpoint);

    await expect(handleChainCommand({
      chainName: 'userWorkflow',
      config: 'test-config.yaml'
    })).rejects.toThrow('Process exited with code 1');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Endpoint 'createUser' not found in API 'userApi'")
    );
  });
}); 