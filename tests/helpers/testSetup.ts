import { MockHttpBinServer } from './mockHttpBinServer.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtemp } from 'fs/promises';

export class TestEnvironment {
  private static instance: TestEnvironment | null = null;
  private mockServer: MockHttpBinServer | null = null;
  private tempDir: string | null = null;

  private constructor() {}

  public static getInstance(): TestEnvironment {
    if (!TestEnvironment.instance) {
      TestEnvironment.instance = new TestEnvironment();
    }
    return TestEnvironment.instance;
  }

  public async setup(): Promise<void> {
    // Start mock server
    this.mockServer = new MockHttpBinServer();
    await this.mockServer.start(0); // Use random available port

    // Create temporary directory for test files
    this.tempDir = await mkdtemp(join(tmpdir(), 'httpcraft-test-'));

    console.log(`Test environment setup complete:
  - Mock server: ${this.getMockServerUrl()}
  - Temp directory: ${this.tempDir}`);
  }

  public async teardown(): Promise<void> {
    if (this.mockServer) {
      await this.mockServer.stop();
      this.mockServer = null;
    }
    
    // Note: We don't automatically clean up temp directory to allow inspection
    // Tests should clean up their own files if needed
    this.tempDir = null;
  }

  public getMockServerUrl(): string {
    if (!this.mockServer) {
      throw new Error('Mock server not started. Call setup() first.');
    }
    return this.mockServer.getBaseUrl();
  }

  public getMockServerPort(): number {
    if (!this.mockServer) {
      throw new Error('Mock server not started. Call setup() first.');
    }
    return this.mockServer.getPort();
  }

  public getTempDir(): string {
    if (!this.tempDir) {
      throw new Error('Test environment not setup. Call setup() first.');
    }
    return this.tempDir;
  }

  public async createTempFile(filename: string, content: string): Promise<string> {
    const tempDir = this.getTempDir();
    const filePath = join(tempDir, filename);
    await writeFile(filePath, content);
    return filePath;
  }

  public async createTempDir(dirName: string): Promise<string> {
    const tempDir = this.getTempDir();
    const dirPath = join(tempDir, dirName);
    await mkdir(dirPath, { recursive: true });
    return dirPath;
  }

  /**
   * Create a test configuration that uses the mock server instead of httpbin.org
   */
  public createMockConfig(originalConfig: string): string {
    const mockUrl = this.getMockServerUrl();
    return originalConfig.replace(/https:\/\/httpbin\.org/g, mockUrl);
  }

  /**
   * Helper to determine if we should use mock server or real httpbin.org
   * Based on environment variable HTTPCRAFT_TEST_SERVER
   */
  public shouldUseMockServer(): boolean {
    const testServer = process.env.HTTPCRAFT_TEST_SERVER || 'local';
    return testServer === 'local';
  }

  /**
   * Get the appropriate base URL for tests (mock or real httpbin.org)
   */
  public getTestBaseUrl(): string {
    if (this.shouldUseMockServer()) {
      return this.getMockServerUrl();
    }
    return 'https://httpbin.org';
  }
}

// Global test environment instance
export const testEnv = TestEnvironment.getInstance();

/**
 * Utility function to create configurations for testing
 */
export function createTestConfig(config: {
  apis?: Record<string, any>;
  profiles?: Record<string, any>;
  chains?: Record<string, any>;
  plugins?: any[];
  variables?: any;
  config?: any;
}): string {
  const { apis = {}, profiles = {}, chains = {}, plugins = [], variables, config: globalConfig } = config;
  
  const configObj: any = {};
  
  if (Object.keys(profiles).length > 0) {
    configObj.profiles = profiles;
  }
  
  if (globalConfig) {
    configObj.config = globalConfig;
  }
  
  if (variables) {
    configObj.variables = variables;
  }
  
  if (plugins.length > 0) {
    configObj.plugins = plugins;
  }
  
  if (Object.keys(apis).length > 0) {
    configObj.apis = apis;
  }
  
  if (Object.keys(chains).length > 0) {
    configObj.chains = chains;
  }

  return Object.keys(configObj).map(key => {
    const value = configObj[key];
    if (typeof value === 'object') {
      return `${key}:\n${formatYaml(value, 1)}`;
    }
    return `${key}: ${value}`;
  }).join('\n\n');
}

function formatYaml(obj: any, indent: number = 0): string {
  const spaces = '  '.repeat(indent);
  
  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (typeof item === 'object' && item !== null) {
        return `${spaces}- ${formatYaml(item, indent + 1).trim()}`;
      }
      return `${spaces}- ${item}`;
    }).join('\n');
  }
  
  if (typeof obj === 'object' && obj !== null) {
    return Object.entries(obj).map(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          return `${spaces}${key}:\n${formatYaml(value, indent + 1)}`;
        }
        return `${spaces}${key}:\n${formatYaml(value, indent + 1)}`;
      }
      return `${spaces}${key}: ${value}`;
    }).join('\n');
  }
  
  return String(obj);
}

export default testEnv; 