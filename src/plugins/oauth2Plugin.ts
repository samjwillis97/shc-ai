/**
 * OAuth2 Authentication Plugin for HttpCraft
 * Supports multiple OAuth2 flows:
 * - Client Credentials Grant
 * - Authorization Code Grant (with interactive browser flow)
 * - Refresh Token flow
 */

import crypto from 'crypto';
import http from 'http';
import { URL } from 'url';
import axios from 'axios';
import open from 'open';
import keytar from 'keytar';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Plugin, PluginContext, HttpRequest } from '../types/plugin.js';

// Enhanced token cache to store tokens across requests
const tokenCache = new Map<
  string,
  {
    accessToken: string;
    expiresAt: number;
    refreshToken?: string;
    tokenType?: string;
    scope?: string;
  }
>();

// Enhanced OAuth2Config interface for interactive flow
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

  // **NEW: Interactive flow options (T15.1)**
  authorizationUrl?: string;           // OAuth2 authorization endpoint
  audience?: string;                   // Optional audience parameter
  usePKCE?: boolean;                   // Enable PKCE (default: true)
  codeChallengeMethod?: 'S256' | 'plain'; // PKCE method (default: 'S256')
  interactive?: boolean;               // Enable interactive browser flow (auto-detected)
  tokenStorage?: 'keychain' | 'filesystem' | 'memory'; // Storage method (auto-detect)
  callbackPort?: number;               // Specific callback port (optional)
  callbackPath?: string;               // Callback path (default: '/callback')

  // **NEW: T11.15 Cache Key Customization**
  cacheKey?: string;                   // Optional manual cache key (supports variable substitution)
}

// **NEW: Token storage interfaces (T15.2)**
interface StoredTokenData {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number;
  tokenType?: string;
  scope?: string;
  audience?: string;
}

interface TokenStorage {
  store(key: string, tokens: StoredTokenData): Promise<void>;
  retrieve(key: string): Promise<StoredTokenData | null>;
  remove(key: string): Promise<void>;
  isAvailable(): Promise<boolean>;
}

interface OAuth2TokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  token_type?: string;
  id_token?: string;
}

// **NEW: Interactive flow state (T15.3)**
interface InteractiveFlowState {
  codeVerifier?: string;
  state: string;
  server?: http.Server;
  promise?: Promise<string>;
}

// **NEW: Token storage implementations (T15.2)**
class KeychainTokenStorage implements TokenStorage {
  private serviceName = 'httpcraft-oauth2';

  async isAvailable(): Promise<boolean> {
    try {
      // Test keychain availability
      await keytar.getPassword(this.serviceName, 'test-key');
      return true;
    } catch {
      return false;
    }
  }

  async store(key: string, tokens: StoredTokenData): Promise<void> {
    await keytar.setPassword(this.serviceName, key, JSON.stringify(tokens));
  }

  async retrieve(key: string): Promise<StoredTokenData | null> {
    try {
      const data = await keytar.getPassword(this.serviceName, key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await keytar.deletePassword(this.serviceName, key);
    } catch {
      // Ignore errors - key might not exist
    }
  }
}

class FilesystemTokenStorage implements TokenStorage {
  private storageDir = path.join(os.homedir(), '.config', 'httpcraft', 'tokens');

  async isAvailable(): Promise<boolean> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true, mode: 0o700 });
      return true;
    } catch {
      return false;
    }
  }

  async store(key: string, tokens: StoredTokenData): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true, mode: 0o700 });
    const filePath = path.join(this.storageDir, `${key}.json`);
    const encryptedData = this.encrypt(JSON.stringify(tokens));
    await fs.writeFile(filePath, encryptedData, { mode: 0o600 });
  }

  async retrieve(key: string): Promise<StoredTokenData | null> {
    try {
      const filePath = path.join(this.storageDir, `${key}.json`);
      const encryptedData = await fs.readFile(filePath, 'utf8');
      const decryptedData = this.decrypt(encryptedData);
      return JSON.parse(decryptedData);
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const filePath = path.join(this.storageDir, `${key}.json`);
      await fs.unlink(filePath);
    } catch {
      // Ignore errors - file might not exist
    }
  }

  private encrypt(data: string): string {
    const key = crypto.scryptSync('httpcraft-oauth2', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedData: string): string {
    const key = crypto.scryptSync('httpcraft-oauth2', 'salt', 32);
    const [ivHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

class MemoryTokenStorage implements TokenStorage {
  private tokens = new Map<string, StoredTokenData>();

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async store(key: string, tokens: StoredTokenData): Promise<void> {
    this.tokens.set(key, tokens);
  }

  async retrieve(key: string): Promise<StoredTokenData | null> {
    return this.tokens.get(key) || null;
  }

  async remove(key: string): Promise<void> {
    this.tokens.delete(key);
  }
}

// Global storage instance
let tokenStorage: TokenStorage;

// **NEW: Interactive flow detection (T15.8)**
function isCI(): boolean {
  return !!(
    process.env.CI ||
    process.env.CONTINUOUS_INTEGRATION ||
    process.env.BUILD_NUMBER ||
    process.env.GITHUB_ACTIONS ||
    process.env.TRAVIS ||
    process.env.CIRCLECI ||
    process.env.GITLAB_CI
  );
}

function shouldUseInteractiveFlow(config: OAuth2Config): boolean {
  // Explicit configuration takes precedence
  if (config.interactive !== undefined) {
    return config.interactive;
  }
  
  // Auto-detect conditions
  return (
    config.grantType === 'authorization_code' &&
    !config.authorizationCode &&              // No pre-obtained code
    !!config.authorizationUrl &&              // Authorization URL provided
    process.stdout.isTTY &&                   // Interactive terminal
    !isCI()                                   // Not in CI environment
  );
}

// **NEW: Initialize token storage with fallback hierarchy (T15.2)**
async function initializeTokenStorage(config: OAuth2Config): Promise<TokenStorage> {
  if (tokenStorage) {
    return tokenStorage;
  }

  const storageType = config.tokenStorage;
  
  // Try in order: keychain → filesystem → memory
  const storageOptions: TokenStorage[] = [
    new KeychainTokenStorage(),
    new FilesystemTokenStorage(),
    new MemoryTokenStorage(),
  ];

  // If specific storage type requested, try it first
  if (storageType) {
    let preferredStorage: TokenStorage;
    switch (storageType) {
      case 'keychain':
        preferredStorage = new KeychainTokenStorage();
        break;
      case 'filesystem':
        preferredStorage = new FilesystemTokenStorage();
        break;
      case 'memory':
        preferredStorage = new MemoryTokenStorage();
        break;
      default:
        preferredStorage = new KeychainTokenStorage();
    }
    
    if (await preferredStorage.isAvailable()) {
      tokenStorage = preferredStorage;
      return tokenStorage;
    }
  }

  // Fallback to first available storage
  for (const storage of storageOptions) {
    if (await storage.isAvailable()) {
      tokenStorage = storage;
      return tokenStorage;
    }
  }

  // This should never happen since MemoryTokenStorage is always available
  tokenStorage = new MemoryTokenStorage();
  return tokenStorage;
}

const plugin: Plugin = {
  async setup(context: PluginContext): Promise<void> {
    const config = context.config as unknown as OAuth2Config;

    // Don't validate required configuration here since plugins can be loaded
    // globally (without complete config) and then at API level (with complete config)
    // Validation will happen when the plugin is actually used

    // Initialize token storage (this is safe to do multiple times)
    await initializeTokenStorage(config);

    // Register pre-request hook for automatic token injection
    context.registerPreRequestHook(async (request: HttpRequest) => {
      try {
        // Validate required configuration when actually using the plugin
        if (!config.tokenUrl) {
          throw new Error('OAuth2 plugin requires tokenUrl in configuration');
        }

        if (!config.clientId) {
          throw new Error('OAuth2 plugin requires clientId in configuration');
        }

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
      // Validate required configuration when accessing variables
      if (!config.tokenUrl) {
        throw new Error('OAuth2 plugin requires tokenUrl in configuration');
      }

      if (!config.clientId) {
        throw new Error('OAuth2 plugin requires clientId in configuration');
      }

      return await getAccessToken(config);
    });

    context.registerVariableSource('tokenType', () => {
      return config.tokenType || 'Bearer';
    });

    // Register parameterized function for custom scopes
    context.registerParameterizedVariableSource('getTokenWithScope', async (...args: unknown[]) => {
      const scope = args[0] as string;
      
      // Validate required configuration when accessing parameterized variables
      if (!config.tokenUrl) {
        throw new Error('OAuth2 plugin requires tokenUrl in configuration');
      }

      if (!config.clientId) {
        throw new Error('OAuth2 plugin requires clientId in configuration');
      }

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
 * Enhanced with persistent storage integration (T15.6)
 */
async function getAccessToken(config: OAuth2Config): Promise<string> {
  const cacheKey = generateCacheKey(config);
  const storage = await initializeTokenStorage(config);

  // Check in-memory cache first
  if (tokenCache.has(cacheKey)) {
    const cachedToken = tokenCache.get(cacheKey)!;
    if (cachedToken.expiresAt > Date.now()) {
      return cachedToken.accessToken;
    }
    tokenCache.delete(cacheKey);
  }

  // Check persistent storage
  const storedTokens = await storage.retrieve(cacheKey);
  if (storedTokens && storedTokens.expiresAt > Date.now()) {
    // Update in-memory cache
    tokenCache.set(cacheKey, {
      accessToken: storedTokens.accessToken,
      expiresAt: storedTokens.expiresAt,
      refreshToken: storedTokens.refreshToken,
      tokenType: storedTokens.tokenType,
      scope: storedTokens.scope,
    });
    console.error('🔑 Using stored access token');
    return storedTokens.accessToken;
  }

  // Try refresh token if available
  if (storedTokens?.refreshToken) {
    try {
      const refreshConfig = {
        ...config,
        grantType: 'refresh_token' as const,
        refreshToken: storedTokens.refreshToken,
      };
      
      console.error('🔄 Access token expired, refreshing...');
      const tokenResponse = await refreshTokenFlow(refreshConfig);
      
      // Store refreshed tokens
      await storeTokens(storage, cacheKey, tokenResponse, config);
      console.error('✅ Token refreshed successfully');
      
      return tokenResponse.access_token;
    } catch (error) {
      // Refresh failed, remove stored tokens and continue to get new ones
      await storage.remove(cacheKey);
    }
  }

  let tokenResponse: OAuth2TokenResponse;

  // Determine which OAuth2 flow to use
  switch (config.grantType || 'client_credentials') {
    case 'client_credentials':
      tokenResponse = await clientCredentialsFlow(config);
      break;
    case 'authorization_code':
      // Check if interactive flow should be used
      if (shouldUseInteractiveFlow(config)) {
        console.error('🔐 Authentication required...');
        tokenResponse = await interactiveAuthorizationCodeFlow(config);
        console.error('✅ Authentication successful! Tokens stored securely.');
      } else {
        tokenResponse = await authorizationCodeFlow(config);
      }
      break;
    case 'refresh_token':
      tokenResponse = await refreshTokenFlow(config);
      break;
    default:
      throw new Error(`Unsupported OAuth2 grant type: ${config.grantType}`);
  }

  // Store tokens in both cache and persistent storage
  await storeTokens(storage, cacheKey, tokenResponse, config);

  return tokenResponse.access_token;
}

/**
 * Store tokens in both memory cache and persistent storage
 */
async function storeTokens(
  storage: TokenStorage,
  cacheKey: string,
  tokenResponse: OAuth2TokenResponse,
  config: OAuth2Config
): Promise<void> {
  const expiresIn = tokenResponse.expires_in || 3600; // Default to 1 hour
  const expiresAt = Date.now() + expiresIn * 1000 - 60000; // Subtract 1 minute for safety

  // Store in memory cache
  tokenCache.set(cacheKey, {
    accessToken: tokenResponse.access_token,
    expiresAt,
    refreshToken: tokenResponse.refresh_token,
    tokenType: tokenResponse.token_type,
    scope: config.scope,
  });

  // Store in persistent storage
  const storedTokens: StoredTokenData = {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    idToken: tokenResponse.id_token,
    expiresAt,
    tokenType: tokenResponse.token_type,
    scope: config.scope,
    audience: config.audience,
  };

  await storage.store(cacheKey, storedTokens);
}

/**
 * OAuth2 Client Credentials Grant Flow
 */
async function clientCredentialsFlow(config: OAuth2Config): Promise<OAuth2TokenResponse> {
  const params = new globalThis.URLSearchParams();
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
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response: { status: number; statusText: string; data: unknown } };
      throw new Error(
        `OAuth2 token request failed: ${axiosError.response.status} ${axiosError.response.statusText} - ${JSON.stringify(axiosError.response.data)}`
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

  const params = new globalThis.URLSearchParams();
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
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response: { status: number; statusText: string; data: unknown } };
      throw new Error(
        `OAuth2 authorization code exchange failed: ${axiosError.response.status} ${axiosError.response.statusText} - ${JSON.stringify(axiosError.response.data)}`
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

  const params = new globalThis.URLSearchParams();
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
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response: { status: number; statusText: string; data: unknown } };
      throw new Error(
        `OAuth2 refresh token failed: ${axiosError.response.status} ${axiosError.response.statusText} - ${JSON.stringify(axiosError.response.data)}`
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
  // T11.15: Use custom cache key if provided (already resolved by PluginManager)
  if (config.cacheKey && config.cacheKey.trim() !== '') {
    return config.cacheKey;
  }
  
  // Fall back to automatic cache key generation for backward compatibility
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

/**
 * **NEW: Interactive Authorization Code Flow (T15.5, T15.7)**
 * Complete interactive authentication workflow with browser launch
 */
async function interactiveAuthorizationCodeFlow(config: OAuth2Config): Promise<OAuth2TokenResponse> {
  // Generate PKCE parameters
  const pkceParams = generatePKCE();
  const state = crypto.randomUUID();
  
  // Start local callback server
  const callbackServer = await startCallbackServer(config, state);
  
  try {
    // Generate authorization URL
    const authUrl = buildAuthorizationUrl(config, {
      codeChallenge: pkceParams.codeChallenge,
      codeChallengeMethod: config.codeChallengeMethod || 'S256',
      state,
      // redirectUri: callbackServer.redirectUri,
      redirectUri: callbackServer.redirectUri,
    });
    
    // Launch browser
    console.error('🌐 Opening browser for OAuth2 authentication...');
    console.error('🌐 Authorization URL: ', authUrl);
    console.error('⏳ Waiting for authorization (timeout: 5 minutes)...');
    
    try {
      await open(authUrl);
    } catch (error) {
      console.error('❌ Failed to open browser automatically.');
      console.error('📋 Please open this URL manually in your browser:');
      console.error(`   ${authUrl}`);
    }
    
    // Wait for callback
    const authorizationCode = await callbackServer.promise;
    
    // Exchange code for tokens
    const tokenResponse = await authorizationCodeFlow({
      ...config,
      authorizationCode,
      redirectUri: callbackServer.redirectUri,
      codeVerifier: pkceParams.codeVerifier,
    });
    
    return tokenResponse;
  } finally {
    // Clean up server
    if (callbackServer.server) {
      callbackServer.server.close();
    }
  }
}

/**
 * **NEW: Local callback server implementation (T15.3)**
 */
async function startCallbackServer(
  config: OAuth2Config,
  expectedState: string
): Promise<{
  server: http.Server;
  redirectUri: string;
  promise: Promise<string>;
}> {
  const callbackPath = config.callbackPath || '/callback';
  const startPort = config.callbackPort || 8080;
  
  let server: http.Server;
  let port: number;
  let resolvePromise: (code: string) => void;
  let rejectPromise: (error: Error) => void;
  
  const promise = new Promise<string>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
    
    // Set timeout
    globalThis.setTimeout(() => {
      reject(new Error('OAuth2 authorization timeout (5 minutes)'));
    }, 5 * 60 * 1000);
  });
  
  // Try to find available port
  for (port = startPort; port < startPort + 100; port++) {
    try {
      server = await new Promise<http.Server>((resolve, reject) => {
        const srv = http.createServer((req, res) => {
          handleCallback(req, res, expectedState, resolvePromise, rejectPromise);
        });
        
        srv.on('error', reject);
        srv.on('listening', () => resolve(srv));
        
        srv.listen(port, 'localhost');
        console.error('🌐 Callback server listening on port: ', port);
      });
      break;
    } catch {
      // Port not available, try next one
      continue;
    }
  }
  
  if (!server!) {
    throw new Error('Could not find available port for OAuth2 callback server');
  }
  
  const redirectUri = `http://localhost:${port}${callbackPath}`;
  
  return {
    server,
    redirectUri,
    promise,
  };
}

/**
 * **NEW: Handle OAuth2 callback requests (T15.3)**
 */
function handleCallback(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  expectedState: string,
  resolve: (code: string) => void,
  reject: (error: Error) => void
): void {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  
  // Extract parameters
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');
  
  if (error) {
    const errorMessage = errorDescription || error;
    sendErrorPage(res, `Authorization failed: ${errorMessage}`);
    reject(new Error(`OAuth2 authorization failed: ${errorMessage}`));
    return;
  }
  
  if (!code) {
    sendErrorPage(res, 'Authorization code not received');
    reject(new Error('OAuth2 authorization code not received'));
    return;
  }
  
  if (state !== expectedState) {
    sendErrorPage(res, 'Invalid state parameter (possible CSRF attack)');
    reject(new Error('OAuth2 state parameter validation failed'));
    return;
  }
  
  // Success!
  sendSuccessPage(res);
  resolve(code);
}

/**
 * **NEW: Send success page to browser (T15.3)**
 */
function sendSuccessPage(res: http.ServerResponse): void {
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>HttpCraft OAuth2 - Success</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f0f8ff; }
        .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
        .message { color: #333; font-size: 16px; line-height: 1.5; }
        .emoji { font-size: 48px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="emoji">✅</div>
        <div class="success">Authentication Successful!</div>
        <div class="message">
            You have successfully authenticated with OAuth2.<br>
            You can now close this browser tab and return to your terminal.
        </div>
    </div>
</body>
</html>`;
  
  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Content-Length': Buffer.byteLength(html),
  });
  res.end(html);
}

/**
 * **NEW: Send error page to browser (T15.3)**
 */
function sendErrorPage(res: http.ServerResponse, errorMessage: string): void {
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>HttpCraft OAuth2 - Error</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #fff0f0; }
        .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .error { color: #dc3545; font-size: 24px; margin-bottom: 20px; }
        .message { color: #333; font-size: 16px; line-height: 1.5; }
        .emoji { font-size: 48px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="emoji">❌</div>
        <div class="error">Authentication Failed</div>
        <div class="message">
            ${errorMessage}<br><br>
            Please close this browser tab and try again in your terminal.
        </div>
    </div>
</body>
</html>`;
  
  res.writeHead(400, {
    'Content-Type': 'text/html',
    'Content-Length': Buffer.byteLength(html),
  });
  res.end(html);
}

/**
 * **NEW: Build OAuth2 authorization URL (T15.4)**
 */
function buildAuthorizationUrl(
  config: OAuth2Config,
  params: {
    codeChallenge: string;
    codeChallengeMethod: string;
    state: string;
    redirectUri: string;
  }
): string {
  if (!config.authorizationUrl) {
    throw new Error('authorizationUrl is required for interactive flow');
  }
  
  const url = new URL(config.authorizationUrl);
  
  // Required OAuth2 parameters
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.state);
  
  // PKCE parameters (enabled by default)
  if (config.usePKCE !== false) {
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', params.codeChallengeMethod);
  }
  
  // Optional parameters
  if (config.scope) {
    url.searchParams.set('scope', config.scope);
  }
  
  if (config.audience) {
    url.searchParams.set('audience', config.audience);
  }
  
  // Additional parameters
  if (config.additionalParams) {
    for (const [key, value] of Object.entries(config.additionalParams)) {
      url.searchParams.set(key, String(value));
    }
  }
  
  return url.toString();
}
