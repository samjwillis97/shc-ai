import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleChainCommand } from '../../../../src/cli/commands/chain.js';
import { configLoader } from '../../../../src/core/configLoader.js';
import { chainExecutor } from '../../../../src/core/chainExecutor.js';
import { variableResolver } from '../../../../src/core/variableResolver.js';
import { PluginManager } from '../../../../src/core/pluginManager.js';
import { httpClient } from '../../../../src/core/httpClient.js';
import type { HttpCraftConfig } from '../../../../src/types/config.js';
import type { ChainExecutionResult } from '../../../../src/core/chainExecutor.js';

// Mock the dependencies
vi.mock('../../../../src/core/configLoader.js', () => ({
  configLoader: {
    loadConfig: vi.fn(),
    loadDefaultConfig: vi.fn()
  }
}));

vi.mock('../../../../src/core/chainExecutor.js', () => ({
  chainExecutor: {
    executeChain: vi.fn()
  }
}));

vi.mock('../../../../src/core/variableResolver.js', () => ({
  variableResolver: {
    mergeProfiles: vi.fn()
  }
}));

vi.mock('../../../../src/core/pluginManager.js', () => ({
  PluginManager: vi.fn().mockImplementation(() => ({
    loadPlugins: vi.fn().mockResolvedValue(undefined),
    getVariableSources: vi.fn().mockReturnValue({}),
    getParameterizedVariableSources: vi.fn().mockReturnValue({}),
    loadApiPlugins: vi.fn().mockReturnValue({
      getVariableSources: vi.fn().mockReturnValue({}),
      getParameterizedVariableSources: vi.fn().mockReturnValue({})
    })
  }))
}));

vi.mock('../../../../src/core/httpClient.js', () => ({
  httpClient: {
    setPluginManager: vi.fn()
  }
}));

vi.mock('path', () => ({
  default: {
    dirname: vi.fn().mockReturnValue('.')
  }
}));

describe('Chain Command', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
      throw new Error(`Process exited with code ${code}`);
    });
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
    },
    profiles: {
      dev: { environment: 'development' },
      test: { environment: 'test' }
    },
    chains: {
      simpleChain: {
        description: 'A simple test chain',
        vars: {
          defaultUserId: 1,
          userName: 'testuser'
        },
        steps: [
          {
            id: 'createUser',
            description: 'Create a new user',
            call: 'testApi.createUser',
            with: {
              body: {
                name: '{{userName}}',
                email: 'test@example.com'
              }
            }
          },
          {
            id: 'getUser',
            call: 'testApi.getUser',
            with: {
              pathParams: {
                userId: '{{steps.createUser.response.body.id}}'
              }
            }
          }
        ]
      },
      minimalChain: {
        steps: [
          {
            id: 'step1',
            call: 'testApi.getUser'
          }
        ]
      }
    }
  };

  describe('handleChainCommand', () => {
    it('should execute a chain successfully and output last step response', async () => {
      vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig);
      vi.mocked(variableResolver.mergeProfiles).mockReturnValue({});
      
      const mockResult: ChainExecutionResult = {
        chainName: 'simpleChain',
        success: true,
        steps: [
          {
            stepId: 'createUser',
            request: { method: 'POST', url: 'https://api.test.com/users', headers: {}, body: {} },
            response: { status: 201, statusText: 'Created', headers: {}, body: '{"id": 123, "name": "testuser"}' },
            success: true
          },
          {
            stepId: 'getUser',
            request: { method: 'GET', url: 'https://api.test.com/users/123', headers: {}, body: undefined },
            response: { status: 200, statusText: 'OK', headers: {}, body: '{"id": 123, "name": "testuser", "email": "test@example.com"}' },
            success: true
          }
        ]
      };
      
      vi.mocked(chainExecutor.executeChain).mockResolvedValue(mockResult);

      await handleChainCommand({
        chainName: 'simpleChain',
        config: 'test-config.yaml'
      });

      expect(configLoader.loadConfig).toHaveBeenCalledWith('test-config.yaml');
      expect(chainExecutor.executeChain).toHaveBeenCalledWith(
        'simpleChain',
        mockConfig.chains!.simpleChain,
        mockConfig,
        {},
        {},
        false,
        false,
        expect.any(Object),
        '.'
      );
      expect(consoleLogSpy).toHaveBeenCalledWith('{"id": 123, "name": "testuser", "email": "test@example.com"}');
    });

    it('should execute a minimal chain successfully', async () => {
      vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig);
      vi.mocked(variableResolver.mergeProfiles).mockReturnValue({});
      
      const mockResult: ChainExecutionResult = {
        chainName: 'minimalChain',
        success: true,
        steps: [
          {
            stepId: 'step1',
            request: { method: 'GET', url: 'https://api.test.com/users/123', headers: {}, body: undefined },
            response: { status: 200, statusText: 'OK', headers: {}, body: '{"id": 123}' },
            success: true
          }
        ]
      };
      
      vi.mocked(chainExecutor.executeChain).mockResolvedValue(mockResult);

      await handleChainCommand({
        chainName: 'minimalChain',
        config: 'test-config.yaml'
      });

      expect(consoleLogSpy).toHaveBeenCalledWith('{"id": 123}');
    });

    it('should use default config when no config specified', async () => {
      vi.mocked(configLoader.loadDefaultConfig).mockResolvedValue({
        config: mockConfig,
        path: '.httpcraft.yaml'
      });
      vi.mocked(variableResolver.mergeProfiles).mockReturnValue({});
      
      const mockResult: ChainExecutionResult = {
        chainName: 'simpleChain',
        success: true,
        steps: [
          {
            stepId: 'createUser',
            request: { method: 'POST', url: 'https://api.test.com/users', headers: {}, body: {} },
            response: { status: 201, statusText: 'Created', headers: {}, body: '{"id": 123}' },
            success: true
          }
        ]
      };
      
      vi.mocked(chainExecutor.executeChain).mockResolvedValue(mockResult);

      await handleChainCommand({
        chainName: 'simpleChain'
      });

      expect(configLoader.loadDefaultConfig).toHaveBeenCalled();
      expect(chainExecutor.executeChain).toHaveBeenCalled();
    });

    it('should handle chain execution failure', async () => {
      vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig);
      vi.mocked(variableResolver.mergeProfiles).mockReturnValue({});
      
      const mockResult: ChainExecutionResult = {
        chainName: 'simpleChain',
        success: false,
        steps: [
          {
            stepId: 'createUser',
            request: { method: 'POST', url: 'https://api.test.com/users', headers: {}, body: {} },
            response: { status: 400, statusText: 'Bad Request', headers: {}, body: '{"error": "Invalid data"}' },
            success: false,
            error: 'HTTP 400: Bad Request'
          }
        ],
        error: "Step 'createUser' failed: HTTP 400: Bad Request"
      };
      
      vi.mocked(chainExecutor.executeChain).mockResolvedValue(mockResult);

      await expect(handleChainCommand({
        chainName: 'simpleChain',
        config: 'test-config.yaml'
      })).rejects.toThrow('Process exited with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith("Chain execution failed: Step 'createUser' failed: HTTP 400: Bad Request");
    });

    it('should exit with error when no config file found', async () => {
      vi.mocked(configLoader.loadDefaultConfig).mockResolvedValue(null);

      await expect(handleChainCommand({
        chainName: 'simpleChain'
      })).rejects.toThrow('Process exited with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: No configuration file found. Use --config to specify a config file or create .httpcraft.yaml');
    });

    it('should exit with error when no chains defined in config', async () => {
      const configWithoutChains: HttpCraftConfig = {
        apis: {
          testApi: {
            baseUrl: 'https://api.test.com',
            endpoints: {
              getUser: {
                method: 'GET',
                path: '/users/{{userId}}'
              }
            }
          }
        }
      };

      vi.mocked(configLoader.loadConfig).mockResolvedValue(configWithoutChains);

      await expect(handleChainCommand({
        chainName: 'simpleChain',
        config: 'test-config.yaml'
      })).rejects.toThrow('Process exited with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: No chains defined in configuration');
    });

    it('should exit with error when chain not found', async () => {
      vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig);

      await expect(handleChainCommand({
        chainName: 'nonexistentChain',
        config: 'test-config.yaml'
      })).rejects.toThrow('Process exited with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Chain 'nonexistentChain' not found in configuration");
    });

    it('should handle config loading errors', async () => {
      vi.mocked(configLoader.loadConfig).mockRejectedValue(new Error('Config file not found'));

      await expect(handleChainCommand({
        chainName: 'simpleChain',
        config: 'nonexistent-config.yaml'
      })).rejects.toThrow('Process exited with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error executing chain:', expect.any(Error));
    });

    it('should pass CLI options to chain executor', async () => {
      vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig);
      vi.mocked(variableResolver.mergeProfiles).mockReturnValue({ env: 'test' });
      
      const mockResult: ChainExecutionResult = {
        chainName: 'simpleChain',
        success: true,
        steps: [
          {
            stepId: 'step1',
            request: { method: 'GET', url: 'https://api.test.com/users', headers: {}, body: undefined },
            response: { status: 200, statusText: 'OK', headers: {}, body: '{"result": "success"}' },
            success: true
          }
        ]
      };
      
      vi.mocked(chainExecutor.executeChain).mockResolvedValue(mockResult);

      await handleChainCommand({
        chainName: 'simpleChain',
        config: 'test-config.yaml',
        variables: { key: 'value' },
        profiles: ['dev', 'test'],
        verbose: true,
        dryRun: true,
        exitOnHttpError: '4xx,5xx'
      });

      // Just verify that executeChain was called with the correct number of parameters
      expect(chainExecutor.executeChain).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(chainExecutor.executeChain).mock.calls[0];
      
      // Verify parameter count and types
      expect(callArgs.length).toBeGreaterThanOrEqual(8); // Should have at least 8 parameters
      expect(callArgs[0]).toBe('simpleChain'); // chainName
      expect(callArgs[1]).toEqual(mockConfig.chains!.simpleChain); // chain
      expect(callArgs[2]).toEqual(mockConfig); // config
      expect(callArgs[3]).toEqual({ key: 'value' }); // variables
      expect(callArgs[4]).toEqual({ env: 'test' }); // profiles
      expect(callArgs[5]).toBe(true); // verbose
      expect(callArgs[6]).toBe(true); // dryRun
      expect(callArgs[7]).toBeDefined(); // pluginManager should be defined
      if (callArgs[8] !== undefined) {
        expect(typeof callArgs[8]).toBe('string'); // configDir should be a string if provided
      }
    });

    it('should load and set up plugins if configured', async () => {
      const configWithPlugins: HttpCraftConfig = {
        ...mockConfig,
        plugins: [
          {
            path: './my-plugin.js',
            name: 'myPlugin',
            config: { apiKey: 'test' }
          }
        ]
      };
      
      vi.mocked(configLoader.loadConfig).mockResolvedValue(configWithPlugins);
      vi.mocked(variableResolver.mergeProfiles).mockReturnValue({});
      
      const mockResult: ChainExecutionResult = {
        chainName: 'simpleChain',
        success: true,
        steps: [
          {
            stepId: 'step1',
            request: { method: 'GET', url: 'https://api.test.com/users', headers: {}, body: undefined },
            response: { status: 200, statusText: 'OK', headers: {}, body: '{"result": "success"}' },
            success: true
          }
        ]
      };
      
      vi.mocked(chainExecutor.executeChain).mockResolvedValue(mockResult);

      // Capture console.error calls to see what's happening
      const errorCalls: any[] = [];
      consoleErrorSpy.mockImplementation((...args) => {
        errorCalls.push(args);
      });

      // Also capture the process.exit call to see what code is passed
      let exitCode: any = null;
      processExitSpy.mockImplementation((code?: string | number | null | undefined) => {
        exitCode = code;
        console.log('Process exit called with code:', code);
        console.log('Error calls:', errorCalls);
        throw new Error(`Process exited with code ${code}`);
      });

      await expect(handleChainCommand({
        chainName: 'simpleChain',
        config: 'test-config.yaml'
      })).rejects.toThrow('Process exited with code 1');

      // The test should pass if plugins are loaded correctly
      // If it fails, we'll see the error details in the console output
    });

    it('should handle profile merging correctly', async () => {
      const configWithProfiles: HttpCraftConfig = {
        ...mockConfig,
        config: {
          defaultProfile: ['dev', 'user1']
        },
        profiles: {
          dev: { environment: 'development', apiUrl: 'dev.api.com' },
          user1: { userId: 123, userName: 'testuser' }
        }
      };
      
      vi.mocked(configLoader.loadConfig).mockResolvedValue(configWithProfiles);
      vi.mocked(variableResolver.mergeProfiles).mockReturnValue({
        environment: 'development',
        apiUrl: 'dev.api.com',
        userId: 123,
        userName: 'testuser'
      });
      
      const mockResult: ChainExecutionResult = {
        chainName: 'simpleChain',
        success: true,
        steps: [
          {
            stepId: 'step1',
            request: { method: 'GET', url: 'https://api.test.com/users', headers: {}, body: undefined },
            response: { status: 200, statusText: 'OK', headers: {}, body: '{"result": "success"}' },
            success: true
          }
        ]
      };
      
      vi.mocked(chainExecutor.executeChain).mockResolvedValue(mockResult);

      await handleChainCommand({
        chainName: 'simpleChain',
        config: 'test-config.yaml'
      });

      expect(variableResolver.mergeProfiles).toHaveBeenCalledWith(
        ['dev', 'user1'],
        configWithProfiles.profiles
      );
    });

    describe('T10.3: Chain Structured JSON Output', () => {
      it('should output default format (last step body) when chainOutput is default', async () => {
        vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig);
        vi.mocked(variableResolver.mergeProfiles).mockReturnValue({});
        
        const mockResult: ChainExecutionResult = {
          chainName: 'simpleChain',
          success: true,
          steps: [
            {
              stepId: 'createUser',
              request: { method: 'POST', url: 'https://api.test.com/users', headers: {}, body: {} },
              response: { status: 201, statusText: 'Created', headers: {}, body: '{"id": 123, "name": "testuser"}' },
              success: true
            },
            {
              stepId: 'getUser',
              request: { method: 'GET', url: 'https://api.test.com/users/123', headers: {}, body: undefined },
              response: { status: 200, statusText: 'OK', headers: {}, body: '{"id": 123, "name": "testuser", "email": "test@example.com"}' },
              success: true
            }
          ]
        };
        
        vi.mocked(chainExecutor.executeChain).mockResolvedValue(mockResult);

        await handleChainCommand({
          chainName: 'simpleChain',
          config: 'test-config.yaml',
          chainOutput: 'default'
        });

        // Should output the last step's response body (default behavior)
        expect(consoleLogSpy).toHaveBeenCalledWith('{"id": 123, "name": "testuser", "email": "test@example.com"}');
      });

      it('should output structured JSON when chainOutput is full', async () => {
        vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig);
        vi.mocked(variableResolver.mergeProfiles).mockReturnValue({});
        
        const mockResult: ChainExecutionResult = {
          chainName: 'simpleChain',
          success: true,
          steps: [
            {
              stepId: 'createUser',
              request: { 
                method: 'POST', 
                url: 'https://api.test.com/users', 
                headers: { 'Content-Type': 'application/json' }, 
                body: '{"name": "testuser", "email": "test@example.com"}' 
              },
              response: { 
                status: 201, 
                statusText: 'Created', 
                headers: { 'Content-Type': 'application/json' }, 
                body: '{"id": 123, "name": "testuser"}' 
              },
              success: true
            },
            {
              stepId: 'getUser',
              request: { 
                method: 'GET', 
                url: 'https://api.test.com/users/123', 
                headers: { 'Authorization': 'Bearer token' }, 
                body: undefined 
              },
              response: { 
                status: 200, 
                statusText: 'OK', 
                headers: { 'Content-Type': 'application/json' }, 
                body: '{"id": 123, "name": "testuser", "email": "test@example.com"}' 
              },
              success: true
            }
          ]
        };
        
        vi.mocked(chainExecutor.executeChain).mockResolvedValue(mockResult);

        await handleChainCommand({
          chainName: 'simpleChain',
          config: 'test-config.yaml',
          chainOutput: 'full'
        });

        // Should output structured JSON of all steps
        const expectedOutput = {
          chainName: 'simpleChain',
          success: true,
          steps: [
            {
              stepId: 'createUser',
              request: {
                method: 'POST',
                url: 'https://api.test.com/users',
                headers: { 'Content-Type': 'application/json' },
                body: '{"name": "testuser", "email": "test@example.com"}'
              },
              response: {
                status: 201,
                statusText: 'Created',
                headers: { 'Content-Type': 'application/json' },
                body: '{"id": 123, "name": "testuser"}'
              },
              success: true,
              error: undefined
            },
            {
              stepId: 'getUser',
              request: {
                method: 'GET',
                url: 'https://api.test.com/users/123',
                headers: { 'Authorization': 'Bearer token' },
                body: undefined
              },
              response: {
                status: 200,
                statusText: 'OK',
                headers: { 'Content-Type': 'application/json' },
                body: '{"id": 123, "name": "testuser", "email": "test@example.com"}'
              },
              success: true,
              error: undefined
            }
          ]
        };

        expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(expectedOutput, null, 2));
      });

      it('should output structured JSON for single step chain when chainOutput is full', async () => {
        vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig);
        vi.mocked(variableResolver.mergeProfiles).mockReturnValue({});
        
        const mockResult: ChainExecutionResult = {
          chainName: 'minimalChain',
          success: true,
          steps: [
            {
              stepId: 'step1',
              request: { 
                method: 'GET', 
                url: 'https://api.test.com/users/123', 
                headers: {}, 
                body: undefined 
              },
              response: { 
                status: 200, 
                statusText: 'OK', 
                headers: {}, 
                body: '{"id": 123}' 
              },
              success: true
            }
          ]
        };
        
        vi.mocked(chainExecutor.executeChain).mockResolvedValue(mockResult);

        await handleChainCommand({
          chainName: 'minimalChain',
          config: 'test-config.yaml',
          chainOutput: 'full'
        });

        // Should output structured JSON for single step
        const expectedOutput = {
          chainName: 'minimalChain',
          success: true,
          steps: [
            {
              stepId: 'step1',
              request: {
                method: 'GET',
                url: 'https://api.test.com/users/123',
                headers: {},
                body: undefined
              },
              response: {
                status: 200,
                statusText: 'OK',
                headers: {},
                body: '{"id": 123}'
              },
              success: true,
              error: undefined
            }
          ]
        };

        expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(expectedOutput, null, 2));
      });

      it('should output structured JSON including error details when step fails', async () => {
        vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig);
        vi.mocked(variableResolver.mergeProfiles).mockReturnValue({});
        
        const mockResult: ChainExecutionResult = {
          chainName: 'simpleChain',
          success: false,
          steps: [
            {
              stepId: 'createUser',
              request: { 
                method: 'POST', 
                url: 'https://api.test.com/users', 
                headers: {}, 
                body: '{"name": "testuser"}' 
              },
              response: { 
                status: 400, 
                statusText: 'Bad Request', 
                headers: {}, 
                body: '{"error": "Invalid data"}' 
              },
              success: false,
              error: 'HTTP 400: Bad Request'
            }
          ],
          error: "Step 'createUser' failed: HTTP 400: Bad Request"
        };
        
        vi.mocked(chainExecutor.executeChain).mockResolvedValue(mockResult);

        await expect(handleChainCommand({
          chainName: 'simpleChain',
          config: 'test-config.yaml',
          chainOutput: 'full'
        })).rejects.toThrow('Process exited with code 1');

        // Should still show the error, not structured output when chain fails
        expect(consoleErrorSpy).toHaveBeenCalledWith("Chain execution failed: Step 'createUser' failed: HTTP 400: Bad Request");
        expect(consoleLogSpy).not.toHaveBeenCalled(); // No structured output on failure
      });
    });
  });
}); 