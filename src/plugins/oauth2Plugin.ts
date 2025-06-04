/**
 * OAuth2 Authentication Plugin for HttpCraft
 * Supports multiple OAuth2 flows:
 * - Client Credentials Grant
 * - Authorization Code Grant
 * - Refresh Token flow
 */

import crypto from 'crypto';
import axios from 'axios';
import { Plugin, PluginContext, HttpRequest } from '../types/plugin.js';

// Token cache to store tokens across requests
const tokenCache = new Map<
  string,
  {
    accessToken: string;
    expiresAt: number;
    refreshToken?: string;
  }
>();

interface OAuth2Config {
  grantType: 'client_credentials' | 'authorization_code' | 'refresh_token';
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  authMethod?: 'basic' | 'post';
  timeout?: number;
  tokenType?: string;

  // For authorization_code grant
  authorizationCode?: string;
  redirectUri?: string;
  codeVerifier?: string; // For PKCE

  // For refresh_token grant
  refreshToken?: string;

  // Additional OAuth2 parameters
  additionalParams?: Record<string, string>;
}

interface OAuth2TokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  token_type?: string;
}

const plugin: Plugin = {
  async setup(context: PluginContext): Promise<void> {
    const config = context.config as OAuth2Config;

    // Validate required configuration
    if (!config.tokenUrl) {
      throw new Error('OAuth2 plugin requires tokenUrl in configuration');
    }

    if (!config.clientId) {
      throw new Error('OAuth2 plugin requires clientId in configuration');
    }

    // Register pre-request hook for automatic token injection
    context.registerPreRequestHook(async (request: HttpRequest) => {
      try {
        const token = await getAccessToken(config);
        if (token) {
          const authHeader = `${config.tokenType || 'Bearer'} ${token}`;
          request.headers['Authorization'] = authHeader;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('OAuth2 Plugin Error:', errorMessage);
        throw error;
      }
    });

    // Register variable sources for manual token access
    context.registerVariableSource('accessToken', async () => {
      return await getAccessToken(config);
    });

    context.registerVariableSource('tokenType', () => {
      return config.tokenType || 'Bearer';
    });

    // Register parameterized function for custom scopes
    context.registerParameterizedVariableSource('getTokenWithScope', async (scope: string) => {
      const scopedConfig = { ...config, scope };
      return await getAccessToken(scopedConfig);
    });
  },
};

export default plugin;

// Export cache clearing function for testing
export function clearTokenCache(): void {
  tokenCache.clear();
}

/**
 * Main function to get access token based on configured flow
 */
async function getAccessToken(config: OAuth2Config): Promise<string> {
  const cacheKey = generateCacheKey(config);

  // Check if we have a valid cached token
  if (tokenCache.has(cacheKey)) {
    const cachedToken = tokenCache.get(cacheKey)!;
    if (cachedToken.expiresAt > Date.now()) {
      return cachedToken.accessToken;
    }
    // Token expired, remove from cache
    tokenCache.delete(cacheKey);
  }

  let tokenResponse: OAuth2TokenResponse;

  // Determine which OAuth2 flow to use
  switch (config.grantType || 'client_credentials') {
    case 'client_credentials':
      tokenResponse = await clientCredentialsFlow(config);
      break;
    case 'authorization_code':
      tokenResponse = await authorizationCodeFlow(config);
      break;
    case 'refresh_token':
      tokenResponse = await refreshTokenFlow(config);
      break;
    default:
      throw new Error(`Unsupported OAuth2 grant type: ${config.grantType}`);
  }

  // Cache the token
  const expiresIn = tokenResponse.expires_in || 3600; // Default to 1 hour
  const expiresAt = Date.now() + expiresIn * 1000 - 60000; // Subtract 1 minute for safety

  tokenCache.set(cacheKey, {
    accessToken: tokenResponse.access_token,
    expiresAt,
    refreshToken: tokenResponse.refresh_token,
  });

  return tokenResponse.access_token;
}

/**
 * OAuth2 Client Credentials Grant Flow
 */
async function clientCredentialsFlow(config: OAuth2Config): Promise<OAuth2TokenResponse> {
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', config.clientId);

  if (config.clientSecret) {
    params.append('client_secret', config.clientSecret);
  }

  if (config.scope) {
    params.append('scope', config.scope);
  }

  // Add any additional parameters
  if (config.additionalParams) {
    for (const [key, value] of Object.entries(config.additionalParams)) {
      params.append(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  // Support for client authentication methods
  if (config.authMethod === 'basic' && config.clientSecret) {
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
    // Remove client credentials from body when using basic auth
    params.delete('client_id');
    params.delete('client_secret');
  }

  try {
    const response = await axios.post(config.tokenUrl, params.toString(), {
      headers,
      timeout: config.timeout || 30000,
    });

    return response.data as OAuth2TokenResponse;
  } catch (error: any) {
    if (error.response) {
      throw new Error(
        `OAuth2 token request failed: ${error.response.status} ${error.response.statusText} - ${JSON.stringify(error.response.data)}`
      );
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`OAuth2 token request failed: ${errorMessage}`);
  }
}

/**
 * OAuth2 Authorization Code Grant Flow
 * Note: This assumes the authorization code is already obtained and provided in config
 */
async function authorizationCodeFlow(config: OAuth2Config): Promise<OAuth2TokenResponse> {
  if (!config.authorizationCode) {
    throw new Error('Authorization code is required for authorization_code grant type');
  }

  if (!config.redirectUri) {
    throw new Error('Redirect URI is required for authorization_code grant type');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('client_id', config.clientId);
  params.append('code', config.authorizationCode);
  params.append('redirect_uri', config.redirectUri);

  if (config.clientSecret) {
    params.append('client_secret', config.clientSecret);
  }

  if (config.codeVerifier) {
    params.append('code_verifier', config.codeVerifier);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  if (config.authMethod === 'basic' && config.clientSecret) {
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
    params.delete('client_id');
    params.delete('client_secret');
  }

  try {
    const response = await axios.post(config.tokenUrl, params.toString(), {
      headers,
      timeout: config.timeout || 30000,
    });

    return response.data as OAuth2TokenResponse;
  } catch (error: any) {
    if (error.response) {
      throw new Error(
        `OAuth2 authorization code exchange failed: ${error.response.status} ${error.response.statusText} - ${JSON.stringify(error.response.data)}`
      );
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`OAuth2 authorization code exchange failed: ${errorMessage}`);
  }
}

/**
 * OAuth2 Refresh Token Flow
 */
async function refreshTokenFlow(config: OAuth2Config): Promise<OAuth2TokenResponse> {
  if (!config.refreshToken) {
    throw new Error('Refresh token is required for refresh_token grant type');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', config.refreshToken);
  params.append('client_id', config.clientId);

  if (config.clientSecret) {
    params.append('client_secret', config.clientSecret);
  }

  if (config.scope) {
    params.append('scope', config.scope);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  if (config.authMethod === 'basic' && config.clientSecret) {
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
    params.delete('client_id');
    params.delete('client_secret');
  }

  try {
    const response = await axios.post(config.tokenUrl, params.toString(), {
      headers,
      timeout: config.timeout || 30000,
    });

    return response.data as OAuth2TokenResponse;
  } catch (error: any) {
    if (error.response) {
      throw new Error(
        `OAuth2 refresh token failed: ${error.response.status} ${error.response.statusText} - ${JSON.stringify(error.response.data)}`
      );
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`OAuth2 refresh token failed: ${errorMessage}`);
  }
}

/**
 * Generate cache key for token storage
 */
function generateCacheKey(config: OAuth2Config): string {
  const keyData = {
    tokenUrl: config.tokenUrl,
    clientId: config.clientId,
    grantType: config.grantType || 'client_credentials',
    scope: config.scope || '',
  };

  return crypto.createHash('md5').update(JSON.stringify(keyData)).digest('hex');
}

/**
 * Utility function to generate PKCE challenge (for authorization code flow)
 */
function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest()
    .toString('base64url');

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

// Export utility functions for advanced usage
export { generatePKCE };
