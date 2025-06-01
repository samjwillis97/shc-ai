import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  handleCompletionCommand, 
  handleGetApiNamesCommand, 
  handleGetEndpointNamesCommand 
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
      expect(output).toContain('--config');
      expect(output).toContain('--var');
      expect(output).toContain('--profile');
      expect(output).toContain('--verbose');
      expect(output).toContain('--dry-run');
      expect(output).toContain('--exit-on-http-error');
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
        'test-api': {
          baseUrl: 'http://test.com',
          endpoints: {}
        },
        'another-api': {
          baseUrl: 'http://another.com',
          endpoints: {}
        }
      }
    };

    it('should output API names from config', async () => {
      vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig);
      
      await handleGetApiNamesCommand({ config: 'test.yaml' });
      
      expect(configLoader.loadConfig).toHaveBeenCalledWith('test.yaml');
      expect(mockConsoleLog).toHaveBeenCalledTimes(2);
      expect(mockConsoleLog).toHaveBeenCalledWith('test-api');
      expect(mockConsoleLog).toHaveBeenCalledWith('another-api');
    });

    it('should use default config when no config specified', async () => {
      vi.mocked(configLoader.loadDefaultConfig).mockResolvedValue(mockConfig);
      
      await handleGetApiNamesCommand({});
      
      expect(configLoader.loadDefaultConfig).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledTimes(2);
      expect(mockConsoleLog).toHaveBeenCalledWith('test-api');
      expect(mockConsoleLog).toHaveBeenCalledWith('another-api');
    });

    it('should silently exit when no default config found', async () => {
      vi.mocked(configLoader.loadDefaultConfig).mockResolvedValue(null);
      
      await handleGetApiNamesCommand({});
      
      expect(configLoader.loadDefaultConfig).toHaveBeenCalled();
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should silently handle errors', async () => {
      vi.mocked(configLoader.loadConfig).mockRejectedValue(new Error('Config error'));
      
      await handleGetApiNamesCommand({ config: 'bad.yaml' });
      
      expect(mockConsoleLog).not.toHaveBeenCalled();
      expect(mockConsoleError).not.toHaveBeenCalled();
    });
  });

  describe('handleGetEndpointNamesCommand', () => {
    const mockConfig: HttpCraftConfig = {
      apis: {
        'test-api': {
          baseUrl: 'http://test.com',
          endpoints: {
            'get-user': {
              path: '/users/:id',
              method: 'GET'
            },
            'create-user': {
              path: '/users',
              method: 'POST'
            }
          }
        },
        'empty-api': {
          baseUrl: 'http://empty.com',
          endpoints: {}
        }
      }
    };

    it('should output endpoint names for specified API', async () => {
      vi.mocked(configLoader.loadConfig).mockResolvedValue(mockConfig);
      
      await handleGetEndpointNamesCommand({ apiName: 'test-api', config: 'test.yaml' });
      
      expect(configLoader.loadConfig).toHaveBeenCalledWith('test.yaml');
      expect(mockConsoleLog).toHaveBeenCalledTimes(2);
      expect(mockConsoleLog).toHaveBeenCalledWith('get-user');
      expect(mockConsoleLog).toHaveBeenCalledWith('create-user');
    });

    it('should handle API with no endpoints', async () => {
      vi.mocked(configLoader.loadDefaultConfig).mockResolvedValue(mockConfig);
      
      await handleGetEndpointNamesCommand({ apiName: 'empty-api' });
      
      expect(configLoader.loadDefaultConfig).toHaveBeenCalled();
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should handle non-existent API', async () => {
      vi.mocked(configLoader.loadDefaultConfig).mockResolvedValue(mockConfig);
      
      await handleGetEndpointNamesCommand({ apiName: 'non-existent' });
      
      expect(configLoader.loadDefaultConfig).toHaveBeenCalled();
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should silently handle errors', async () => {
      vi.mocked(configLoader.loadConfig).mockRejectedValue(new Error('Config error'));
      
      await handleGetEndpointNamesCommand({ apiName: 'test-api', config: 'bad.yaml' });
      
      expect(mockConsoleLog).not.toHaveBeenCalled();
      expect(mockConsoleError).not.toHaveBeenCalled();
    });

    it('should silently exit when no default config found', async () => {
      vi.mocked(configLoader.loadDefaultConfig).mockResolvedValue(null);
      
      await handleGetEndpointNamesCommand({ apiName: 'test-api' });
      
      expect(configLoader.loadDefaultConfig).toHaveBeenCalled();
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });
}); 