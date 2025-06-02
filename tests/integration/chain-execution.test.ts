import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleChainCommand } from '../../src/cli/commands/chain.js';
import { configLoader } from '../../src/core/configLoader.js';
import { httpClient } from '../../src/core/httpClient.js';
import { variableResolver } from '../../src/core/variableResolver.js';
import { urlBuilder } from '../../src/core/urlBuilder.js';
import type { HttpRequest, HttpResponse } from '../../src/types/plugin.js';
import type { HttpCraftConfig } from '../../src/types/config.js';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { runCli } from '../helpers/cli-runner.js';

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
  let testConfigFile: string;
  let testChainConfigFile: string;

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
    vi.mocked(urlBuilder.mergeHeaders).mockImplementation((api, endpoint) => {
      // Base headers from API
      const headers = { ...api.headers };
      // Merge endpoint headers if they exist
      if (endpoint.headers) {
        Object.assign(headers, endpoint.headers);
      }
      return headers;
    });
    vi.mocked(urlBuilder.mergeParams).mockReturnValue({});

    testConfigFile = join(process.cwd(), 'test-config-phase8.yaml');
    testChainConfigFile = join(process.cwd(), 'test-chain-config-phase8.yaml');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up test files
    [testConfigFile, testChainConfigFile].forEach(file => {
      if (existsSync(file)) {
        unlinkSync(file);
      }
    });
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

  // T8.5: Integration test for step.with overrides
  it('should handle step.with overrides correctly', async () => {
    const configWithStepOverrides: HttpCraftConfig = {
      apis: {
        userApi: {
          baseUrl: 'https://api.users.com',
          headers: {
            'Content-Type': 'application/json'
          },
          endpoints: {
            createUser: {
              method: 'POST',
              path: '/users',
              body: {
                name: '{{defaultName}}',
                email: '{{defaultEmail}}'
              }
            },
            updateUser: {
              method: 'PUT',
              path: '/users/{{userId}}',
              headers: {
                'X-Default': 'default-value'
              }
            }
          }
        }
      },
      chains: {
        userWorkflow: {
          vars: {
            defaultName: 'Default User',
            defaultEmail: 'default@example.com',
            customToken: 'chain-token-123'
          },
          steps: [
            {
              id: 'createUser',
              call: 'userApi.createUser',
              with: {
                headers: {
                  'Authorization': 'Bearer {{customToken}}',
                  'X-Custom': 'step-override'
                },
                body: {
                  name: 'Step Override Name',
                  email: 'step@example.com',
                  source: 'step-with'
                }
              }
            },
            {
              id: 'updateUser',
              call: 'userApi.updateUser',
              with: {
                pathParams: {
                  userId: '123'
                },
                headers: {
                  'Authorization': 'Bearer {{customToken}}'
                },
                params: {
                  'force': 'true'
                }
              }
            }
          ]
        }
      }
    };

    vi.spyOn(configLoader, 'loadConfig').mockResolvedValue(configWithStepOverrides);

    const createUserResponse: HttpResponse = {
      status: 201,
      statusText: 'Created',
      headers: {},
      body: '{"id": 123, "name": "Step Override Name"}'
    };

    const updateUserResponse: HttpResponse = {
      status: 200,
      statusText: 'OK',
      headers: {},
      body: '{"id": 123, "name": "Updated User"}'
    };

    vi.mocked(httpClient.executeRequest)
      .mockResolvedValueOnce(createUserResponse)
      .mockResolvedValueOnce(updateUserResponse);

    await handleChainCommand({
      chainName: 'userWorkflow',
      config: 'test-config.yaml'
    });

    // Verify first request (createUser) used step.with overrides
    const firstRequest = vi.mocked(httpClient.executeRequest).mock.calls[0][0] as HttpRequest;
    expect(firstRequest.method).toBe('POST');
    expect(firstRequest.url).toBe('https://api.users.com/users');
    expect(firstRequest.headers).toEqual({
      'Content-Type': 'application/json', // From API
      'Authorization': 'Bearer chain-token-123', // From step.with (resolved)
      'X-Custom': 'step-override' // From step.with
    });
    expect(firstRequest.body).toEqual({
      name: 'Step Override Name', // From step.with (overrides endpoint)
      email: 'step@example.com', // From step.with (overrides endpoint)
      source: 'step-with' // From step.with (addition)
    });

    // Verify second request (updateUser) used pathParams and other overrides
    const secondRequest = vi.mocked(httpClient.executeRequest).mock.calls[1][0] as HttpRequest;
    expect(secondRequest.method).toBe('PUT');
    expect(secondRequest.url).toBe('https://api.users.com/users/123?force=true'); // pathParams + query params
    expect(secondRequest.headers).toEqual({
      'Content-Type': 'application/json', // From API
      'X-Default': 'default-value', // From endpoint
      'Authorization': 'Bearer chain-token-123' // From step.with (resolved)
    });

    // Verify final output (last step's response)
    expect(consoleLogSpy).toHaveBeenCalledWith('{"id": 123, "name": "Updated User"}');
  });

  describe('T8.8 & T8.9: Step Variable Resolution', () => {
    it('should resolve step response variables in subsequent steps', async () => {
      // Create a test config with a chain that uses step variables
      const config = `
apis:
  jsonplaceholder:
    baseUrl: "https://jsonplaceholder.typicode.com"
    endpoints:
      createPost:
        method: POST
        path: "/posts"
        headers:
          Content-Type: "application/json"
        body:
          title: "{{title}}"
          body: "{{content}}"
          userId: 1
      getPost:
        method: GET
        path: "/posts/{{postId}}"

chains:
  createAndGetPost:
    description: "Create a post and then retrieve it using the ID from the response"
    vars:
      title: "Test Post"
      content: "This is a test post"
    steps:
      - id: createPost
        call: jsonplaceholder.createPost
      - id: getPost
        call: jsonplaceholder.getPost
        with:
          pathParams:
            postId: "{{steps.createPost.response.body.id}}"
`;

      writeFileSync(testChainConfigFile, config);

      const result = await runCli(['chain', 'createAndGetPost', '--config', testChainConfigFile, '--verbose']);

      expect(result.exitCode).toBe(0);
      
      // The output should be the response body of the last step (getPost)
      const output = JSON.parse(result.stdout);
      expect(output).toHaveProperty('id');
      expect(output).toHaveProperty('title');
      expect(output).toHaveProperty('body');
      expect(output).toHaveProperty('userId');
      
      // Verify verbose output shows both steps
      expect(result.stderr).toContain('[CHAIN] Starting execution of chain: createAndGetPost');
      expect(result.stderr).toContain('[STEP createPost]');
      expect(result.stderr).toContain('[STEP getPost]');
    });

    it('should resolve step request variables', async () => {
      // Create a test config that uses step request data
      const config = `
apis:
  httpbin:
    baseUrl: "https://httpbin.org"
    endpoints:
      post:
        method: POST
        path: "/post"
        headers:
          Content-Type: "application/json"
        body:
          message: "{{message}}"
      echo:
        method: POST
        path: "/post"
        headers:
          Content-Type: "application/json"
        body:
          original_message: "{{steps.firstPost.request.body.message}}"
          original_url: "{{steps.firstPost.request.url}}"

chains:
  echoRequest:
    description: "Make a request and echo the original request data"
    vars:
      message: "Hello World"
    steps:
      - id: firstPost
        call: httpbin.post
      - id: echoPost
        call: httpbin.echo
`;

      writeFileSync(testChainConfigFile, config);

      const result = await runCli(['chain', 'echoRequest', '--config', testChainConfigFile]);

      expect(result.exitCode).toBe(0);
      
      // The output should be the response body of the last step
      const output = JSON.parse(result.stdout);
      expect(output.json).toHaveProperty('original_message', 'Hello World');
      expect(output.json).toHaveProperty('original_url', 'https://httpbin.org/post');
    });

    it('should handle complex JSONPath expressions in step variables', async () => {
      // Create a test config that uses complex JSONPath
      const config = `
apis:
  jsonplaceholder:
    baseUrl: "https://jsonplaceholder.typicode.com"
    endpoints:
      getUsers:
        method: GET
        path: "/users"
      getFirstUserPosts:
        method: GET
        path: "/users/{{userId}}/posts"

chains:
  getFirstUserPosts:
    description: "Get all users and then get posts for the first user"
    steps:
      - id: getUsers
        call: jsonplaceholder.getUsers
      - id: getUserPosts
        call: jsonplaceholder.getFirstUserPosts
        with:
          pathParams:
            userId: "{{steps.getUsers.response.body[0].id}}"
`;

      writeFileSync(testChainConfigFile, config);

      const result = await runCli(['chain', 'getFirstUserPosts', '--config', testChainConfigFile]);

      expect(result.exitCode).toBe(0);
      
      // The output should be an array of posts
      const output = JSON.parse(result.stdout);
      expect(Array.isArray(output)).toBe(true);
      if (output.length > 0) {
        expect(output[0]).toHaveProperty('userId', 1); // First user should have ID 1
      }
    });
  });

  describe('T8.11: Chain Output', () => {
    it('should output the last step response body for successful chains', async () => {
      const config = `
apis:
  jsonplaceholder:
    baseUrl: "https://jsonplaceholder.typicode.com"
    endpoints:
      getPost:
        method: GET
        path: "/posts/1"
      getComments:
        method: GET
        path: "/posts/1/comments"

chains:
  getPostAndComments:
    description: "Get a post and its comments"
    steps:
      - id: getPost
        call: jsonplaceholder.getPost
      - id: getComments
        call: jsonplaceholder.getComments
`;

      writeFileSync(testChainConfigFile, config);

      const result = await runCli(['chain', 'getPostAndComments', '--config', testChainConfigFile]);

      expect(result.exitCode).toBe(0);
      
      // The output should be the comments (last step), not the post
      const output = JSON.parse(result.stdout);
      expect(Array.isArray(output)).toBe(true);
      if (output.length > 0) {
        expect(output[0]).toHaveProperty('postId', 1);
        expect(output[0]).toHaveProperty('email');
        expect(output[0]).toHaveProperty('body');
      }
    });

    it('should handle single-step chains correctly', async () => {
      const config = `
apis:
  jsonplaceholder:
    baseUrl: "https://jsonplaceholder.typicode.com"
    endpoints:
      getPost:
        method: GET
        path: "/posts/1"

chains:
  singleStep:
    description: "Single step chain"
    steps:
      - id: getPost
        call: jsonplaceholder.getPost
`;

      writeFileSync(testChainConfigFile, config);

      const result = await runCli(['chain', 'singleStep', '--config', testChainConfigFile]);

      expect(result.exitCode).toBe(0);
      
      // The output should be the post data
      const output = JSON.parse(result.stdout);
      expect(output).toHaveProperty('id', 1);
      expect(output).toHaveProperty('title');
      expect(output).toHaveProperty('body');
    });
  });

  describe('Error Handling', () => {
    it('should fail gracefully when step variable references non-existent step', async () => {
      const config = `
apis:
  jsonplaceholder:
    baseUrl: "https://jsonplaceholder.typicode.com"
    endpoints:
      getPost:
        method: GET
        path: "/posts/{{postId}}"

chains:
  invalidStepRef:
    description: "Chain with invalid step reference"
    steps:
      - id: getPost
        call: jsonplaceholder.getPost
        with:
          pathParams:
            postId: "{{steps.nonExistentStep.response.body.id}}"
`;

      writeFileSync(testChainConfigFile, config);

      const result = await runCli(['chain', 'invalidStepRef', '--config', testChainConfigFile]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Variable resolution failed');
      expect(result.stderr).toContain('nonExistentStep');
    });

    it('should fail gracefully when JSONPath finds no matches', async () => {
      const config = `
apis:
  jsonplaceholder:
    baseUrl: "https://jsonplaceholder.typicode.com"
    endpoints:
      getPost:
        method: GET
        path: "/posts/1"
      getAnotherPost:
        method: GET
        path: "/posts/{{postId}}"

chains:
  invalidJsonPath:
    description: "Chain with invalid JSONPath"
    steps:
      - id: getPost
        call: jsonplaceholder.getPost
      - id: getAnotherPost
        call: jsonplaceholder.getAnotherPost
        with:
          pathParams:
            postId: "{{steps.getPost.response.body.nonExistentField}}"
`;

      writeFileSync(testChainConfigFile, config);

      const result = await runCli(['chain', 'invalidJsonPath', '--config', testChainConfigFile]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Variable resolution failed');
      expect(result.stderr).toContain('JSONPath');
      expect(result.stderr).toContain('found no matches');
    });
  });
}); 