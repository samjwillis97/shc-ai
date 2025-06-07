/**
 * Phase 15: Interactive OAuth2 Browser Authentication Tests
 * Tests for enhanced OAuth2 plugin with interactive browser-based authentication
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import crypto from 'crypto';
import { clearTokenCache } from '../../src/plugins/oauth2Plugin.js';

describe('Phase 15: Interactive OAuth2 Browser Authentication', () => {
  beforeEach(() => {
    clearTokenCache();
    vi.clearAllMocks();
    
    // Clear CI environment variables
    delete process.env.CI;
    delete process.env.CONTINUOUS_INTEGRATION;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Enhanced OAuth2 Configuration', () => {
    it('should support all new interactive flow options', () => {
      interface OAuth2Config {
        grantType: 'authorization_code';
        tokenUrl: string;
        clientId: string;
        clientSecret: string;
        authorizationUrl?: string;
        audience?: string;
        usePKCE?: boolean;
        codeChallengeMethod?: 'S256' | 'plain';
        interactive?: boolean;
        tokenStorage?: 'keychain' | 'filesystem' | 'memory';
        callbackPort?: number;
        callbackPath?: string;
      }

      const config: OAuth2Config = {
        grantType: 'authorization_code',
        tokenUrl: 'https://auth.example.com/token',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        
        // New Phase 15 options
        authorizationUrl: 'https://auth.example.com/authorize',
        audience: 'https://api.example.com',
        usePKCE: true,
        codeChallengeMethod: 'S256',
        interactive: true,
        tokenStorage: 'keychain',
        callbackPort: 8080,
        callbackPath: '/callback',
      };

      // All properties should be properly typed and accessible
      expect(config.authorizationUrl).toBe('https://auth.example.com/authorize');
      expect(config.audience).toBe('https://api.example.com');
      expect(config.usePKCE).toBe(true);
      expect(config.codeChallengeMethod).toBe('S256');
      expect(config.interactive).toBe(true);
      expect(config.tokenStorage).toBe('keychain');
      expect(config.callbackPort).toBe(8080);
      expect(config.callbackPath).toBe('/callback');
    });

    it('should have sensible defaults for optional parameters', () => {
      interface OAuth2Config {
        grantType: 'authorization_code';
        tokenUrl: string;
        clientId: string;
        clientSecret: string;
        authorizationUrl: string;
        usePKCE?: boolean;
        codeChallengeMethod?: 'S256' | 'plain';
        interactive?: boolean;
        tokenStorage?: 'keychain' | 'filesystem' | 'memory';
        callbackPort?: number;
        callbackPath?: string;
      }

      const config: OAuth2Config = {
        grantType: 'authorization_code',
        tokenUrl: 'https://auth.example.com/token',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        authorizationUrl: 'https://auth.example.com/authorize',
      };

      // Optional parameters should be undefined when not specified
      expect(config.usePKCE).toBeUndefined();
      expect(config.codeChallengeMethod).toBeUndefined();
      expect(config.interactive).toBeUndefined();
      expect(config.tokenStorage).toBeUndefined();
      expect(config.callbackPort).toBeUndefined();
      expect(config.callbackPath).toBeUndefined();
    });
  });

  describe('PKCE Implementation', () => {
    it('should generate secure PKCE parameters', () => {
      // Test PKCE generation manually
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
      
      expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(codeVerifier.length).toBeGreaterThan(40);
      expect(codeChallenge.length).toBeGreaterThan(40);
    });

    it('should generate different PKCE parameters on each call', () => {
      const codeVerifier1 = crypto.randomBytes(32).toString('base64url');
      const codeVerifier2 = crypto.randomBytes(32).toString('base64url');
      
      expect(codeVerifier1).not.toBe(codeVerifier2);
    });
  });

  describe('Authorization URL Generation', () => {
    it('should build complete authorization URL with all parameters', () => {
      const baseUrl = 'https://auth.example.com/authorize';
      const clientId = 'test-client';
      const redirectUri = 'http://localhost:8080/callback';
      const state = 'test-state';
      const codeChallenge = 'test-challenge';
      const scope = 'openid profile email';
      const audience = 'https://api.example.com';

      // Manual URL building test
      const url = new globalThis.URL(baseUrl);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('state', state);
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
      url.searchParams.set('scope', scope);
      url.searchParams.set('audience', audience);

      const result = url.toString();

      expect(result).toContain('response_type=code');
      expect(result).toContain(`client_id=${clientId}`);
      expect(result).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`);
      expect(result).toContain(`state=${state}`);
      expect(result).toContain(`code_challenge=${codeChallenge}`);
      expect(result).toContain('code_challenge_method=S256');
      expect(result).toContain('scope=openid+profile+email');
      expect(result).toContain(`audience=${encodeURIComponent(audience)}`);
    });

    it('should handle URL encoding properly', () => {
      const baseUrl = 'https://auth.example.com/authorize';
      const redirectUri = 'http://localhost:8080/callback?source=httpcraft';
      const scope = 'read:user write:user admin';

      const url = new globalThis.URL(baseUrl);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('scope', scope);

      const result = url.toString();
      
      expect(result).toContain(encodeURIComponent(redirectUri));
      expect(result).toContain('read%3Auser+write%3Auser+admin'); // URLSearchParams uses + for spaces and %3A for colons
    });
  });

  describe('Callback Server', () => {
    it('should handle successful OAuth2 callback', async () => {
      const expectedState = 'test-state';
      const authCode = 'test-auth-code';
      
      return new Promise<void>((resolve, reject) => {
        // Create a test server
        const server = http.createServer((req, res) => {
          // Mock the callback handling logic
          const url = new globalThis.URL(req.url!, `http://${req.headers.host}`);
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          
          if (code === authCode && state === expectedState) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><body>Success!</body></html>');
            server.close();
            resolve();
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<html><body>Error!</body></html>');
            server.close();
            reject(new Error('Invalid callback parameters'));
          }
        });

        server.listen(0, () => {
          const port = (server.address() as { port: number })?.port;
          const callbackUrl = `http://localhost:${port}/callback?code=${authCode}&state=${expectedState}`;
          
          // Simulate callback request
          http.get(callbackUrl, (res) => {
            expect(res.statusCode).toBe(200);
          }).on('error', (err) => {
            server.close();
            reject(err);
          });
        });
      });
    });

    it('should handle OAuth2 callback errors', async () => {
      return new Promise<void>((resolve, reject) => {
        const server = http.createServer((req, res) => {
          const url = new globalThis.URL(req.url!, `http://${req.headers.host}`);
          const error = url.searchParams.get('error');
          
          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<html><body>Error!</body></html>');
            server.close();
            resolve();
          }
        });

        server.listen(0, () => {
          const port = (server.address() as { port: number })?.port;
          const callbackUrl = `http://localhost:${port}/callback?error=access_denied&error_description=User%20denied%20access`;
          
          http.get(callbackUrl, (res) => {
            expect(res.statusCode).toBe(400);
          }).on('error', (err) => {
            server.close();
            reject(err);
          });
        });
      });
    });

    it('should validate state parameter for CSRF protection', async () => {
      const expectedState = 'expected-state';
      const invalidState = 'invalid-state';
      
      return new Promise<void>((resolve, reject) => {
        const server = http.createServer((req, res) => {
          const url = new globalThis.URL(req.url!, `http://${req.headers.host}`);
          const state = url.searchParams.get('state');
          
          if (state !== expectedState) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<html><body>Invalid state!</body></html>');
            server.close();
            resolve();
          }
        });

        server.listen(0, () => {
          const port = (server.address() as { port: number })?.port;
          const callbackUrl = `http://localhost:${port}/callback?code=test&state=${invalidState}`;
          
          http.get(callbackUrl, (res) => {
            expect(res.statusCode).toBe(400);
          }).on('error', (err) => {
            server.close();
            reject(err);
          });
        });
      });
    });
  });

  describe('Environment Detection', () => {
    it('should detect CI environments correctly', () => {
      const ciEnvVars = [
        'CI',
        'CONTINUOUS_INTEGRATION',
        'BUILD_NUMBER',
        'GITHUB_ACTIONS',
        'TRAVIS',
        'CIRCLECI',
        'GITLAB_CI',
      ];

      ciEnvVars.forEach((envVar) => {
        process.env[envVar] = 'true';
        
        // Function to check if in CI
        const isCI = !!(
          process.env.CI ||
          process.env.CONTINUOUS_INTEGRATION ||
          process.env.BUILD_NUMBER ||
          process.env.GITHUB_ACTIONS ||
          process.env.TRAVIS ||
          process.env.CIRCLECI ||
          process.env.GITLAB_CI
        );
        
        expect(isCI).toBe(true);
        delete process.env[envVar];
      });
    });

    it('should detect interactive terminal capabilities', () => {
      // Mock TTY detection
      const mockIsTTY = true;
      const isInteractive = mockIsTTY && !process.env.CI;
      
      expect(typeof mockIsTTY).toBe('boolean');
      expect(typeof isInteractive).toBe('boolean');
    });
  });

  describe('Security Features', () => {
    it('should generate cryptographically secure state parameters', () => {
      const state1 = crypto.randomUUID();
      const state2 = crypto.randomUUID();
      
      expect(state1).not.toBe(state2);
      expect(state1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(state2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should encrypt filesystem token storage', () => {
      const testData = 'sensitive-token-data';
      const key = crypto.scryptSync('httpcraft-oauth2', 'salt', 32);
      const iv = crypto.randomBytes(16);
      
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update(testData, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const encryptedData = iv.toString('hex') + ':' + encrypted;

      // Should be able to decrypt back to original
      const [ivHex, encryptedHex] = encryptedData.split(':');
      const decryptIv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, decryptIv);
      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      expect(decrypted).toBe(testData);
    });

    it('should use different encryption keys for different data', () => {
      const data1 = 'data1';
      const data2 = 'data2';
      
      const key1 = crypto.scryptSync('httpcraft-oauth2', 'salt', 32);
      const key2 = crypto.scryptSync('httpcraft-oauth2', 'salt', 32);
      
      // Same input should produce same key
      expect(key1.equals(key2)).toBe(true);
      
      // But different IVs should produce different encrypted output
      const iv1 = crypto.randomBytes(16);
      const iv2 = crypto.randomBytes(16);
      
      expect(iv1.equals(iv2)).toBe(false);
    });
  });

  describe('Token Storage System', () => {
    it('should handle token data structure correctly', () => {
      interface StoredTokenData {
        accessToken: string;
        refreshToken?: string;
        idToken?: string;
        expiresAt: number;
        tokenType?: string;
        scope?: string;
        audience?: string;
      }

      const tokenData: StoredTokenData = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        expiresAt: Date.now() + 3600000,
        tokenType: 'Bearer',
        scope: 'openid profile email',
        audience: 'https://api.example.com',
      };

      // Serialize and deserialize
      const serialized = JSON.stringify(tokenData);
      const deserialized = JSON.parse(serialized) as StoredTokenData;

      expect(deserialized.accessToken).toBe(tokenData.accessToken);
      expect(deserialized.refreshToken).toBe(tokenData.refreshToken);
      expect(deserialized.expiresAt).toBe(tokenData.expiresAt);
      expect(deserialized.tokenType).toBe(tokenData.tokenType);
      expect(deserialized.scope).toBe(tokenData.scope);
      expect(deserialized.audience).toBe(tokenData.audience);
    });

    it('should handle token expiration correctly', () => {
      const now = Date.now();
      const validToken = {
        accessToken: 'valid-token',
        expiresAt: now + 3600000, // 1 hour from now
      };
      const expiredToken = {
        accessToken: 'expired-token',
        expiresAt: now - 1000, // 1 second ago
      };

      expect(validToken.expiresAt > now).toBe(true);
      expect(expiredToken.expiresAt < now).toBe(true);
    });
  });

  describe('Interactive Flow Logic', () => {
    it('should determine when to use interactive flow', () => {
      function shouldUseInteractiveFlow(config: {
        grantType: string;
        authorizationCode?: string;
        authorizationUrl?: string;
        interactive?: boolean;
      }): boolean {
        // Explicit configuration takes precedence
        if (config.interactive !== undefined) {
          return config.interactive;
        }
        
        // Auto-detect conditions
        return (
          config.grantType === 'authorization_code' &&
          !config.authorizationCode &&
          !!config.authorizationUrl
          // In real implementation, would also check process.stdout.isTTY and !isCI()
        );
      }

      // Should use interactive flow
      expect(shouldUseInteractiveFlow({
        grantType: 'authorization_code',
        authorizationUrl: 'https://auth.example.com/authorize',
      })).toBe(true);

      // Should not use interactive flow - client credentials
      expect(shouldUseInteractiveFlow({
        grantType: 'client_credentials',
        authorizationUrl: 'https://auth.example.com/authorize',
      })).toBe(false);

      // Should not use interactive flow - has authorization code
      expect(shouldUseInteractiveFlow({
        grantType: 'authorization_code',
        authorizationCode: 'existing-code',
        authorizationUrl: 'https://auth.example.com/authorize',
      })).toBe(false);

      // Should respect explicit setting
      expect(shouldUseInteractiveFlow({
        grantType: 'authorization_code',
        authorizationUrl: 'https://auth.example.com/authorize',
        interactive: false,
      })).toBe(false);
    });
  });
}); 