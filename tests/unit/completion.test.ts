import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  handleCompletionCommand, 
  handleGetApiNamesCommand, 
  handleGetEndpointNamesCommand,
  handleGetChainNamesCommand,
  handleGetProfileNamesCommand
} from '../../src/cli/commands/completion.js';
import { configLoader } from '../../src/core/configLoader.js';
import type { HttpCraftConfig } from '../../src/types/config.js';

// Mock the configLoader
vi.mock('../../src/core/configLoader.js');

// Mock console.log and console.error
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

describe('Completion Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleCompletionCommand', () => {
    it('should output ZSH completion script for zsh shell', async () => {
      await handleCompletionCommand({ shell: 'zsh' });
      
      expect(mockConsoleLog).toHaveBeenCalledOnce();
      const output = mockConsoleLog.mock.calls[0][0];
      expect(output).toContain('#compdef httpcraft');
      expect(output).toContain('_httpcraft()');
      expect(output).toContain('_httpcraft_profiles()');
      expect(output).toContain('--config');
      expect(output).toContain('--var');
      expect(output).toContain('--profile');
      expect(output).toContain(':profile:_httpcraft_profiles');
      expect(output).toContain('--verbose');
      expect(output).toContain('--dry-run');
      expect(output).toContain('--exit-on-http-error');
      expect(output).toContain('--chain-output');
      expect(output).toContain('chain:Execute a chain of HTTP requests');
      expect(output).toContain('httpcraft --get-chain-names');
      expect(output).toContain('httpcraft --get-profile-names');
    });

    it('should error for non-zsh shells', async () => {
      await handleCompletionCommand({ shell: 'bash' });
      
      expect(mockConsoleError).toHaveBeenCalledWith('Error: Only ZSH completion is currently supported');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('handleGetApiNamesCommand', () => {
    const mockConfig: HttpCraftConfig = {
      apis: {
        'github-api': {
          baseUrl: 'https://api.github.com',
          endpoints: {
            'get-user': {
              method: 'GET',
              path: '/users/{{username}}'
            }
          }
        },
        'jsonplaceholder': {
          baseUrl: 'https://jsonplaceholder.typicode.com',
          endpoints: {
            'get-posts': {
              method: 'GET',
              path: '/posts'
            }
          }
        }
      }
    };

    it('should output API names from config file', async () => {
      vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig);

      await handleGetApiNamesCommand({ config: 'test-config.yaml' });

      expect(configLoader.loadConfig).toHaveBeenCalledWith('test-config.yaml');
      expect(mockConsoleLog).toHaveBeenCalledTimes(2);
      expect(mockConsoleLog).toHaveBeenCalledWith('github-api');
      expect(mockConsoleLog).toHaveBeenCalledWith('jsonplaceholder');
    });

    it('should use default config when no config specified', async () => {
      vi.mocked(configLoader.loadDefaultConfig).mockResolvedValue({
        config: mockConfig,
        path: '.httpcraft.yaml'
      });

      await handleGetApiNamesCommand({});

      expect(configLoader.loadDefaultConfig).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledTimes(2);
      expect(mockConsoleLog).toHaveBeenCalledWith('github-api');
      expect(mockConsoleLog).toHaveBeenCalledWith('jsonplaceholder');
    });

    it('should silently exit when no config found', async () => {
      vi.mocked(configLoader.loadDefaultConfig).mockResolvedValue(null);

      await handleGetApiNamesCommand({});

      expect(configLoader.loadDefaultConfig).toHaveBeenCalled();
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should silently fail on config loading errors', async () => {
      vi.mocked(configLoader.loadConfig).mockRejectedValue(new Error('Config not found'));

      await handleGetApiNamesCommand({ config: 'nonexistent.yaml' });

      expect(mockConsoleLog).not.toHaveBeenCalled();
      expect(mockConsoleError).not.toHaveBeenCalled();
    });

    it('should handle config with no APIs', async () => {
      vi.mocked(configLoader.loadConfig).mockResolvedValue({ apis: {} });

      await handleGetApiNamesCommand({ config: 'empty-config.yaml' });

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });

  describe('handleGetEndpointNamesCommand', () => {
    const mockConfig: HttpCraftConfig = {
      apis: {
        'github-api': {
          baseUrl: 'https://api.github.com',
          endpoints: {
            'get-user': {
              method: 'GET',
              path: '/users/{{username}}'
            },
            'list-repos': {
              method: 'GET',
              path: '/users/{{username}}/repos'
            }
          }
        }
      }
    };

    it('should output endpoint names for specified API', async () => {
      vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig);

      await handleGetEndpointNamesCommand({ 
        apiName: 'github-api',
        config: 'test-config.yaml'
      });

      expect(configLoader.loadConfig).toHaveBeenCalledWith('test-config.yaml');
      expect(mockConsoleLog).toHaveBeenCalledTimes(2);
      expect(mockConsoleLog).toHaveBeenCalledWith('get-user');
      expect(mockConsoleLog).toHaveBeenCalledWith('list-repos');
    });

    it('should use default config when no config specified', async () => {
      vi.mocked(configLoader.loadDefaultConfig).mockResolvedValue({
        config: mockConfig,
        path: '.httpcraft.yaml'
      });

      await handleGetEndpointNamesCommand({ apiName: 'github-api' });

      expect(configLoader.loadDefaultConfig).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledTimes(2);
      expect(mockConsoleLog).toHaveBeenCalledWith('get-user');
      expect(mockConsoleLog).toHaveBeenCalledWith('list-repos');
    });

    it('should silently exit when no config found', async () => {
      vi.mocked(configLoader.loadDefaultConfig).mockResolvedValue(null);

      await handleGetEndpointNamesCommand({ apiName: 'github-api' });

      expect(configLoader.loadDefaultConfig).toHaveBeenCalled();
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should handle non-existent API', async () => {
      vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig);

      await handleGetEndpointNamesCommand({ 
        apiName: 'nonexistent-api',
        config: 'test-config.yaml'
      });

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should silently fail on config loading errors', async () => {
      vi.mocked(configLoader.loadConfig).mockRejectedValue(new Error('Config not found'));

      await handleGetEndpointNamesCommand({ 
        apiName: 'github-api',
        config: 'nonexistent.yaml'
      });

      expect(mockConsoleLog).not.toHaveBeenCalled();
      expect(mockConsoleError).not.toHaveBeenCalled();
    });

    it('should handle API with no endpoints', async () => {
      const configWithNoEndpoints: HttpCraftConfig = {
        apis: {
          'empty-api': {
            baseUrl: 'https://api.empty.com',
            endpoints: {}
          }
        }
      };

      vi.mocked(configLoader.loadConfig).mockResolvedValue(configWithNoEndpoints);

      await handleGetEndpointNamesCommand({ 
        apiName: 'empty-api',
        config: 'test-config.yaml'
      });

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });

  describe('handleGetChainNamesCommand', () => {
    const mockConfig: HttpCraftConfig = {
      apis: {
        'test-api': {
          baseUrl: 'https://api.test.com',
          endpoints: {
            'get-data': {
              method: 'GET',
              path: '/data'
            }
          }
        }
      },
      chains: {
        'user-workflow': {
          description: 'Create and get user',
          steps: [
            { id: 'step1', call: 'test-api.get-data' }
          ]
        },
        'simple-chain': {
          steps: [
            { id: 'step1', call: 'test-api.get-data' }
          ]
        }
      }
    };

    it('should output chain names from config file', async () => {
      vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig);

      await handleGetChainNamesCommand({ config: 'test-config.yaml' });

      expect(configLoader.loadConfig).toHaveBeenCalledWith('test-config.yaml');
      expect(mockConsoleLog).toHaveBeenCalledTimes(2);
      expect(mockConsoleLog).toHaveBeenCalledWith('user-workflow');
      expect(mockConsoleLog).toHaveBeenCalledWith('simple-chain');
    });

    it('should use default config when no config specified', async () => {
      vi.mocked(configLoader.loadDefaultConfig).mockResolvedValue({
        config: mockConfig,
        path: '.httpcraft.yaml'
      });

      await handleGetChainNamesCommand({});

      expect(configLoader.loadDefaultConfig).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledTimes(2);
      expect(mockConsoleLog).toHaveBeenCalledWith('user-workflow');
      expect(mockConsoleLog).toHaveBeenCalledWith('simple-chain');
    });

    it('should silently exit when no config found', async () => {
      vi.mocked(configLoader.loadDefaultConfig).mockResolvedValue(null);

      await handleGetChainNamesCommand({});

      expect(configLoader.loadDefaultConfig).toHaveBeenCalled();
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should silently fail on config loading errors', async () => {
      vi.mocked(configLoader.loadConfig).mockRejectedValue(new Error('Config not found'));

      await handleGetChainNamesCommand({ config: 'nonexistent.yaml' });

      expect(mockConsoleLog).not.toHaveBeenCalled();
      expect(mockConsoleError).not.toHaveBeenCalled();
    });

    it('should handle config with no chains', async () => {
      const configWithoutChains: HttpCraftConfig = {
        apis: {
          'test-api': {
            baseUrl: 'https://api.test.com',
            endpoints: {
              'get-data': {
                method: 'GET',
                path: '/data'
              }
            }
          }
        }
      };

      vi.mocked(configLoader.loadConfig).mockResolvedValue(configWithoutChains);

      await handleGetChainNamesCommand({ config: 'no-chains-config.yaml' });

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });

  describe('handleGetProfileNamesCommand', () => {
    const mockConfig: HttpCraftConfig = {
      apis: {
        'test-api': {
          baseUrl: 'https://api.test.com',
          endpoints: {
            'get-data': {
              method: 'GET',
              path: '/data'
            }
          }
        }
      },
      profiles: {
        'dev': {
          baseUrl: 'https://api-dev.example.com',
          apiKey: 'dev-key-123'
        },
        'staging': {
          baseUrl: 'https://api-staging.example.com',
          apiKey: 'staging-key-456'
        },
        'prod': {
          baseUrl: 'https://api.example.com',
          apiKey: '{{secret.PROD_API_KEY}}'
        }
      }
    };

    it('should output profile names from config file', async () => {
      vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig);

      await handleGetProfileNamesCommand({ config: 'test-config.yaml' });

      expect(configLoader.loadConfig).toHaveBeenCalledWith('test-config.yaml');
      expect(mockConsoleLog).toHaveBeenCalledTimes(3);
      expect(mockConsoleLog).toHaveBeenCalledWith('dev');
      expect(mockConsoleLog).toHaveBeenCalledWith('staging');
      expect(mockConsoleLog).toHaveBeenCalledWith('prod');
    });

    it('should use default config when no config specified', async () => {
      vi.mocked(configLoader.loadDefaultConfig).mockResolvedValue({
        config: mockConfig,
        path: '.httpcraft.yaml'
      });

      await handleGetProfileNamesCommand({});

      expect(configLoader.loadDefaultConfig).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledTimes(3);
      expect(mockConsoleLog).toHaveBeenCalledWith('dev');
      expect(mockConsoleLog).toHaveBeenCalledWith('staging');
      expect(mockConsoleLog).toHaveBeenCalledWith('prod');
    });

    it('should silently exit when no config found', async () => {
      vi.mocked(configLoader.loadDefaultConfig).mockResolvedValue(null);

      await handleGetProfileNamesCommand({});

      expect(configLoader.loadDefaultConfig).toHaveBeenCalled();
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should silently fail on config loading errors', async () => {
      vi.mocked(configLoader.loadConfig).mockRejectedValue(new Error('Config not found'));

      await handleGetProfileNamesCommand({ config: 'nonexistent.yaml' });

      expect(mockConsoleLog).not.toHaveBeenCalled();
      expect(mockConsoleError).not.toHaveBeenCalled();
    });

    it('should handle config with no profiles', async () => {
      const configWithNoProfiles: HttpCraftConfig = {
        apis: {
          'test-api': {
            baseUrl: 'https://api.test.com',
            endpoints: {
              'get-data': {
                method: 'GET',
                path: '/data'
              }
            }
          }
        }
      };

      vi.mocked(configLoader.loadConfig).mockResolvedValue(configWithNoProfiles);

      await handleGetProfileNamesCommand({ config: 'test-config.yaml' });

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });
}); 