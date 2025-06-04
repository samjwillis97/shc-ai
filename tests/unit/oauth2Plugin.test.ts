import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock axios before importing the plugin
const mockAxios = {
  post: vi.fn()
};
vi.mock('axios', () => mockAxios);

// Mock crypto module
const mockCrypto = {
  createHash: vi.fn(),
  randomBytes: vi.fn()
};
vi.mock('crypto', () => mockCrypto);

describe('OAuth2 Plugin', () => {
  let plugin: any;
  let mockContext: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Setup crypto mocks
    const mockHashInstance = {
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue('mocked-hash')
    };
    mockCrypto.createHash.mockReturnValue(mockHashInstance);
    mockCrypto.randomBytes.mockReturnValue({
      toString: vi.fn().mockReturnValue('mocked-random-bytes')
    });

    // Import the plugin dynamically to ensure mocks are in place
    const { default: OAuth2Plugin } = await import('../../src/plugins/oauth2Plugin.js');
    plugin = OAuth2Plugin;

    // Setup mock context
    mockContext = {
      config: {
        tokenUrl: 'https://auth.example.com/oauth2/token',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret'
      },
      registerPreRequestHook: vi.fn(),
      registerVariableSource: vi.fn(),
      registerParameterizedVariableSource: vi.fn()
    };
  });

  describe('Plugin Setup', () => {
    it('should register hooks and variable sources successfully', async () => {
      await plugin.setup(mockContext);

      expect(mockContext.registerPreRequestHook).toHaveBeenCalledTimes(1);
      expect(mockContext.registerVariableSource).toHaveBeenCalledTimes(2);
      expect(mockContext.registerParameterizedVariableSource).toHaveBeenCalledTimes(1);
      
      // Check variable source names
      expect(mockContext.registerVariableSource).toHaveBeenCalledWith('accessToken', expect.any(Function));
      expect(mockContext.registerVariableSource).toHaveBeenCalledWith('tokenType', expect.any(Function));
      expect(mockContext.registerParameterizedVariableSource).toHaveBeenCalledWith('getTokenWithScope', expect.any(Function));
    });

    it('should throw error if tokenUrl is missing', async () => {
      delete mockContext.config.tokenUrl;
      
      await expect(plugin.setup(mockContext)).rejects.toThrow('OAuth2 plugin requires tokenUrl in configuration');
    });

    it('should throw error if clientId is missing', async () => {
      delete mockContext.config.clientId;
      
      await expect(plugin.setup(mockContext)).rejects.toThrow('OAuth2 plugin requires clientId in configuration');
    });
  });

  describe('Client Credentials Grant', () => {
    beforeEach(() => {
      mockAxios.post.mockResolvedValue({
        data: {
          access_token: 'test-access-token',
          token_type: 'Bearer',
          expires_in: 3600
        }
      });
    });

    it('should successfully get access token with client credentials', async () => {
      await plugin.setup(mockContext);
      
      // Get the pre-request hook
      const preRequestHook = mockContext.registerPreRequestHook.mock.calls[0][0];
      
      const mockRequest = {
        headers: {}
      };
      
      await preRequestHook(mockRequest);
      
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://auth.example.com/oauth2/token',
        expect.stringContaining('grant_type=client_credentials'),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          }
        })
      );
      
      expect(mockRequest.headers['Authorization']).toBe('Bearer test-access-token');
    });

    it('should include scope in token request when provided', async () => {
      mockContext.config.scope = 'read write';
      await plugin.setup(mockContext);
      
      const preRequestHook = mockContext.registerPreRequestHook.mock.calls[0][0];
      const mockRequest = { headers: {} };
      
      await preRequestHook(mockRequest);
      
      const requestBody = mockAxios.post.mock.calls[0][1];
      expect(requestBody).toContain('scope=read%20write');
    });

    it('should use basic auth when authMethod is basic', async () => {
      mockContext.config.authMethod = 'basic';
      await plugin.setup(mockContext);
      
      const preRequestHook = mockContext.registerPreRequestHook.mock.calls[0][0];
      const mockRequest = { headers: {} };
      
      await preRequestHook(mockRequest);
      
      const requestConfig = mockAxios.post.mock.calls[0][2];
      expect(requestConfig.headers['Authorization']).toMatch(/^Basic /);
    });

    it('should include additional parameters when provided', async () => {
      mockContext.config.additionalParams = {
        resource: 'https://api.example.com',
        audience: 'test-audience'
      };
      await plugin.setup(mockContext);
      
      const preRequestHook = mockContext.registerPreRequestHook.mock.calls[0][0];
      const mockRequest = { headers: {} };
      
      await preRequestHook(mockRequest);
      
      const requestBody = mockAxios.post.mock.calls[0][1];
      expect(requestBody).toContain('resource=https%3A%2F%2Fapi.example.com');
      expect(requestBody).toContain('audience=test-audience');
    });
  });

  describe('Authorization Code Grant', () => {
    beforeEach(() => {
      mockContext.config = {
        ...mockContext.config,
        grantType: 'authorization_code',
        authorizationCode: 'test-auth-code',
        redirectUri: 'https://app.example.com/callback'
      };
      
      mockAxios.post.mockResolvedValue({
        data: {
          access_token: 'test-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'test-refresh-token'
        }
      });
    });

    it('should successfully exchange authorization code for token', async () => {
      await plugin.setup(mockContext);
      
      const preRequestHook = mockContext.registerPreRequestHook.mock.calls[0][0];
      const mockRequest = { headers: {} };
      
      await preRequestHook(mockRequest);
      
      const requestBody = mockAxios.post.mock.calls[0][1];
      expect(requestBody).toContain('grant_type=authorization_code');
      expect(requestBody).toContain('code=test-auth-code');
      expect(requestBody).toContain('redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback');
      
      expect(mockRequest.headers['Authorization']).toBe('Bearer test-access-token');
    });

    it('should include PKCE code verifier when provided', async () => {
      mockContext.config.codeVerifier = 'test-code-verifier';
      await plugin.setup(mockContext);
      
      const preRequestHook = mockContext.registerPreRequestHook.mock.calls[0][0];
      const mockRequest = { headers: {} };
      
      await preRequestHook(mockRequest);
      
      const requestBody = mockAxios.post.mock.calls[0][1];
      expect(requestBody).toContain('code_verifier=test-code-verifier');
    });

    it('should throw error if authorization code is missing', async () => {
      delete mockContext.config.authorizationCode;
      await plugin.setup(mockContext);
      
      const preRequestHook = mockContext.registerPreRequestHook.mock.calls[0][0];
      const mockRequest = { headers: {} };
      
      await expect(preRequestHook(mockRequest)).rejects.toThrow('Authorization code is required');
    });

    it('should throw error if redirect URI is missing', async () => {
      delete mockContext.config.redirectUri;
      await plugin.setup(mockContext);
      
      const preRequestHook = mockContext.registerPreRequestHook.mock.calls[0][0];
      const mockRequest = { headers: {} };
      
      await expect(preRequestHook(mockRequest)).rejects.toThrow('Redirect URI is required');
    });
  });

  describe('Refresh Token Grant', () => {
    beforeEach(() => {
      mockContext.config = {
        ...mockContext.config,
        grantType: 'refresh_token',
        refreshToken: 'test-refresh-token'
      };
      
      mockAxios.post.mockResolvedValue({
        data: {
          access_token: 'new-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'new-refresh-token'
        }
      });
    });

    it('should successfully refresh token', async () => {
      await plugin.setup(mockContext);
      
      const preRequestHook = mockContext.registerPreRequestHook.mock.calls[0][0];
      const mockRequest = { headers: {} };
      
      await preRequestHook(mockRequest);
      
      const requestBody = mockAxios.post.mock.calls[0][1];
      expect(requestBody).toContain('grant_type=refresh_token');
      expect(requestBody).toContain('refresh_token=test-refresh-token');
      
      expect(mockRequest.headers['Authorization']).toBe('Bearer new-access-token');
    });

    it('should throw error if refresh token is missing', async () => {
      delete mockContext.config.refreshToken;
      await plugin.setup(mockContext);
      
      const preRequestHook = mockContext.registerPreRequestHook.mock.calls[0][0];
      const mockRequest = { headers: {} };
      
      await expect(preRequestHook(mockRequest)).rejects.toThrow('Refresh token is required');
    });
  });

  describe('Variable Sources', () => {
    beforeEach(() => {
      mockAxios.post.mockResolvedValue({
        data: {
          access_token: 'test-access-token',
          token_type: 'Bearer',
          expires_in: 3600
        }
      });
    });

    it('should provide accessToken variable source', async () => {
      await plugin.setup(mockContext);
      
      const accessTokenSource = mockContext.registerVariableSource.mock.calls
        .find(call => call[0] === 'accessToken')[1];
      
      const token = await accessTokenSource();
      expect(token).toBe('test-access-token');
    });

    it('should provide tokenType variable source', async () => {
      await plugin.setup(mockContext);
      
      const tokenTypeSource = mockContext.registerVariableSource.mock.calls
        .find(call => call[0] === 'tokenType')[1];
      
      const tokenType = tokenTypeSource();
      expect(tokenType).toBe('Bearer');
    });

    it('should provide custom tokenType when configured', async () => {
      mockContext.config.tokenType = 'CustomToken';
      await plugin.setup(mockContext);
      
      const tokenTypeSource = mockContext.registerVariableSource.mock.calls
        .find(call => call[0] === 'tokenType')[1];
      
      const tokenType = tokenTypeSource();
      expect(tokenType).toBe('CustomToken');
    });

    it('should provide getTokenWithScope parameterized function', async () => {
      await plugin.setup(mockContext);
      
      const getTokenWithScope = mockContext.registerParameterizedVariableSource.mock.calls
        .find(call => call[0] === 'getTokenWithScope')[1];
      
      const token = await getTokenWithScope('admin:read');
      expect(token).toBe('test-access-token');
      
      // Should have made a request with the custom scope
      const requestBody = mockAxios.post.mock.calls[0][1];
      expect(requestBody).toContain('scope=admin%3Aread');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockAxios.post.mockRejectedValue(new Error('Network error'));
      await plugin.setup(mockContext);
      
      const preRequestHook = mockContext.registerPreRequestHook.mock.calls[0][0];
      const mockRequest = { headers: {} };
      
      await expect(preRequestHook(mockRequest)).rejects.toThrow('OAuth2 token request failed: Network error');
    });

    it('should handle HTTP error responses', async () => {
      const errorResponse = {
        response: {
          status: 401,
          statusText: 'Unauthorized',
          data: {
            error: 'invalid_client',
            error_description: 'Client authentication failed'
          }
        }
      };
      mockAxios.post.mockRejectedValue(errorResponse);
      await plugin.setup(mockContext);
      
      const preRequestHook = mockContext.registerPreRequestHook.mock.calls[0][0];
      const mockRequest = { headers: {} };
      
      await expect(preRequestHook(mockRequest)).rejects.toThrow(
        'OAuth2 token request failed: 401 Unauthorized - {"error":"invalid_client","error_description":"Client authentication failed"}'
      );
    });

    it('should throw error for unsupported grant type', async () => {
      mockContext.config.grantType = 'unsupported_grant';
      await plugin.setup(mockContext);
      
      const preRequestHook = mockContext.registerPreRequestHook.mock.calls[0][0];
      const mockRequest = { headers: {} };
      
      await expect(preRequestHook(mockRequest)).rejects.toThrow('Unsupported OAuth2 grant type: unsupported_grant');
    });
  });

  describe('Token Caching', () => {
    beforeEach(() => {
      mockAxios.post.mockResolvedValue({
        data: {
          access_token: 'cached-token',
          token_type: 'Bearer',
          expires_in: 3600
        }
      });
    });

    it('should cache tokens and reuse them', async () => {
      await plugin.setup(mockContext);
      
      const preRequestHook = mockContext.registerPreRequestHook.mock.calls[0][0];
      const mockRequest1 = { headers: {} };
      const mockRequest2 = { headers: {} };
      
      // First request should make HTTP call
      await preRequestHook(mockRequest1);
      expect(mockAxios.post).toHaveBeenCalledTimes(1);
      expect(mockRequest1.headers['Authorization']).toBe('Bearer cached-token');
      
      // Second request should use cached token
      await preRequestHook(mockRequest2);
      expect(mockAxios.post).toHaveBeenCalledTimes(1); // Still only one call
      expect(mockRequest2.headers['Authorization']).toBe('Bearer cached-token');
    });

    it('should generate different cache keys for different configurations', async () => {
      // First setup with one scope
      await plugin.setup(mockContext);
      const preRequestHook1 = mockContext.registerPreRequestHook.mock.calls[0][0];
      
      // Second setup with different scope
      const mockContext2 = {
        ...mockContext,
        config: {
          ...mockContext.config,
          scope: 'different-scope'
        }
      };
      await plugin.setup(mockContext2);
      const preRequestHook2 = mockContext.registerPreRequestHook.mock.calls[1][0];
      
      const mockRequest1 = { headers: {} };
      const mockRequest2 = { headers: {} };
      
      await preRequestHook1(mockRequest1);
      await preRequestHook2(mockRequest2);
      
      // Should make two separate HTTP calls for different configurations
      expect(mockAxios.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('Configuration Timeout', () => {
    beforeEach(() => {
      mockAxios.post.mockResolvedValue({
        data: {
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600
        }
      });
    });

    it('should use default timeout of 30 seconds', async () => {
      await plugin.setup(mockContext);
      
      const preRequestHook = mockContext.registerPreRequestHook.mock.calls[0][0];
      const mockRequest = { headers: {} };
      
      await preRequestHook(mockRequest);
      
      const requestConfig = mockAxios.post.mock.calls[0][2];
      expect(requestConfig.timeout).toBe(30000);
    });

    it('should use custom timeout when configured', async () => {
      mockContext.config.timeout = 60000;
      await plugin.setup(mockContext);
      
      const preRequestHook = mockContext.registerPreRequestHook.mock.calls[0][0];
      const mockRequest = { headers: {} };
      
      await preRequestHook(mockRequest);
      
      const requestConfig = mockAxios.post.mock.calls[0][2];
      expect(requestConfig.timeout).toBe(60000);
    });
  });
}); 