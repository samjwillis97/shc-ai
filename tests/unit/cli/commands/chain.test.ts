import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleChainCommand } from '../../../../src/cli/commands/chain.js';
import { configLoader } from '../../../../src/core/configLoader.js';
import type { HttpCraftConfig } from '../../../../src/types/config.js';

// Mock the configLoader
vi.mock('../../../../src/core/configLoader.js', () => ({
  configLoader: {
    loadConfig: vi.fn(),
    loadDefaultConfig: vi.fn()
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
    it('should execute a chain with description and display chain info', async () => {
      vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig);

      await handleChainCommand({
        chainName: 'simpleChain',
        config: 'test-config.yaml'
      });

      expect(configLoader.loadConfig).toHaveBeenCalledWith('test-config.yaml');
      expect(consoleLogSpy).toHaveBeenCalledWith('Executing chain: simpleChain');
      expect(consoleLogSpy).toHaveBeenCalledWith('Description: A simple test chain');
      expect(consoleLogSpy).toHaveBeenCalledWith('Chain has 2 step(s):');
      expect(consoleLogSpy).toHaveBeenCalledWith('  1. createUser: testApi.createUser');
      expect(consoleLogSpy).toHaveBeenCalledWith('     Description: Create a new user');
      expect(consoleLogSpy).toHaveBeenCalledWith('  2. getUser: testApi.getUser');
    });

    it('should execute a minimal chain without description', async () => {
      vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig);

      await handleChainCommand({
        chainName: 'minimalChain',
        config: 'test-config.yaml'
      });

      expect(consoleLogSpy).toHaveBeenCalledWith('Executing chain: minimalChain');
      expect(consoleLogSpy).toHaveBeenCalledWith('Chain has 1 step(s):');
      expect(consoleLogSpy).toHaveBeenCalledWith('  1. step1: testApi.getUser');
      
      // Should not have called with description
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringMatching(/^Description:/));
    });

    it('should use default config when no config specified', async () => {
      vi.mocked(configLoader.loadDefaultConfig).mockResolvedValue({
        config: mockConfig,
        path: '.httpcraft.yaml'
      });

      await handleChainCommand({
        chainName: 'simpleChain'
      });

      expect(configLoader.loadDefaultConfig).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('Executing chain: simpleChain');
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

    it('should accept all CLI options', async () => {
      vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig);

      await handleChainCommand({
        chainName: 'simpleChain',
        config: 'test-config.yaml',
        variables: { key: 'value' },
        profiles: ['dev', 'test'],
        verbose: true,
        dryRun: true,
        exitOnHttpError: '4xx,5xx'
      });

      // Should not throw error and should execute normally
      expect(consoleLogSpy).toHaveBeenCalledWith('Executing chain: simpleChain');
    });
  });
}); 