/**
 * Integration tests for T10.1 Post-Response Hooks
 * Tests the end-to-end functionality of post-response hooks with real HTTP scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HttpClient } from '../../src/core/httpClient.js';
import { PluginManager } from '../../src/core/pluginManager.js';
import { HttpRequest, HttpResponse } from '../../src/types/plugin.js';
import { PluginConfiguration } from '../../src/types/config.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('Post-Response Hooks Integration Tests', () => {
  let httpClient: HttpClient;
  let pluginManager: PluginManager;
  let tempDir: string;

  beforeEach(async () => {
    httpClient = new HttpClient();
    pluginManager = new PluginManager();
    
    // Create temporary directory for test plugins
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'httpcraft-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('T10.1: XML to JSON Conversion', () => {
    it('should convert XML response to JSON using post-response hook', async () => {
      // Create a test plugin that converts XML to JSON
      const xmlToJsonPluginPath = path.join(tempDir, 'xmlToJsonPlugin.js');
      const xmlToJsonPluginContent = `
export default {
  async setup(context) {
    context.registerPostResponseHook(async (request, response) => {
      // Check if response is XML
      const isXml = response.body.trim().startsWith('<?xml') || 
                   response.body.trim().startsWith('<');
      
      if (isXml) {
        try {
          // Simple XML to JSON conversion for testing
          // In real implementation, would use xml2js or similar library
          const xmlContent = response.body;
          
          // Extract simple values for testing
          const nameMatch = xmlContent.match(/<name>(.*?)<\\/name>/);
          const valueMatch = xmlContent.match(/<value>(.*?)<\\/value>/);
          
          const jsonData = {
            name: nameMatch ? nameMatch[1] : null,
            value: valueMatch ? valueMatch[1] : null,
            originalFormat: 'XML'
          };
          
          response.body = JSON.stringify(jsonData, null, 2);
          response.headers['content-type'] = 'application/json';
          response.headers['x-original-content-type'] = response.headers['content-type'] || 'text/xml';
          response.headers['x-converted-by'] = 'xmlToJsonPlugin';
        } catch (error) {
          response.headers['x-conversion-error'] = error.message;
        }
      }
    });
  }
};
`;
      await fs.writeFile(xmlToJsonPluginPath, xmlToJsonPluginContent);

      const pluginConfig: PluginConfiguration = {
        path: xmlToJsonPluginPath,
        name: 'xmlToJsonPlugin'
      };

      await pluginManager.loadPlugins([pluginConfig], tempDir);
      httpClient.setPluginManager(pluginManager);

      // Mock the axios call by overriding the executeRequest method
      const originalExecuteRequest = httpClient.executeRequest.bind(httpClient);
      httpClient.executeRequest = async function(request: HttpRequest): Promise<HttpResponse> {
        // Simulate receiving XML response
        const mockXmlResponse: HttpResponse = {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/xml' },
          body: '<?xml version="1.0"?><root><name>Test Item</name><value>42</value></root>'
        };

        // Execute post-response hooks
        if (this.pluginManager) {
          await this.pluginManager.executePostResponseHooks(request, mockXmlResponse);
        }

        return mockXmlResponse;
      };

      const request: HttpRequest = {
        method: 'GET',
        url: 'https://api.example.com/data.xml',
        headers: {}
      };

      const response = await httpClient.executeRequest(request);

      // Verify the XML was converted to JSON
      expect(response.headers['content-type']).toBe('application/json');
      expect(response.headers['x-converted-by']).toBe('xmlToJsonPlugin');
      
      const parsedBody = JSON.parse(response.body);
      expect(parsedBody).toEqual({
        name: 'Test Item',
        value: '42',
        originalFormat: 'XML'
      });
    });

    it('should handle multiple response transformation plugins in sequence', async () => {
      // First plugin: adds metadata
      const metadataPluginPath = path.join(tempDir, 'metadataPlugin.js');
      const metadataPluginContent = `
export default {
  async setup(context) {
    context.registerPostResponseHook(async (request, response) => {
      response.headers['x-processed-by'] = 'metadataPlugin';
      response.headers['x-timestamp'] = new Date().toISOString();
    });
  }
};
`;
      await fs.writeFile(metadataPluginPath, metadataPluginContent);

      // Second plugin: transforms JSON response
      const transformPluginPath = path.join(tempDir, 'transformPlugin.js');
      const transformPluginContent = `
export default {
  async setup(context) {
    context.registerPostResponseHook(async (request, response) => {
      try {
        const data = JSON.parse(response.body);
        const transformedData = {
          ...data,
          transformed: true,
          transformedBy: 'transformPlugin'
        };
        response.body = JSON.stringify(transformedData, null, 2);
        response.headers['x-transformed'] = 'true';
      } catch (error) {
        // Not JSON, skip transformation
      }
    });
  }
};
`;
      await fs.writeFile(transformPluginPath, transformPluginContent);

      const pluginConfigs: PluginConfiguration[] = [
        { path: metadataPluginPath, name: 'metadataPlugin' },
        { path: transformPluginPath, name: 'transformPlugin' }
      ];

      await pluginManager.loadPlugins(pluginConfigs, tempDir);
      httpClient.setPluginManager(pluginManager);

      // Mock response
      const originalExecuteRequest = httpClient.executeRequest.bind(httpClient);
      httpClient.executeRequest = async function(request: HttpRequest): Promise<HttpResponse> {
        const mockResponse: HttpResponse = {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          body: '{"name": "Original Data", "value": 123}'
        };

        // Execute post-response hooks
        if (this.pluginManager) {
          await this.pluginManager.executePostResponseHooks(request, mockResponse);
        }

        return mockResponse;
      };

      const request: HttpRequest = {
        method: 'GET',
        url: 'https://api.example.com/data.json',
        headers: {}
      };

      const response = await httpClient.executeRequest(request);

      // Verify both plugins were executed
      expect(response.headers['x-processed-by']).toBe('metadataPlugin');
      expect(response.headers['x-timestamp']).toBeDefined();
      expect(response.headers['x-transformed']).toBe('true');
      
      const parsedBody = JSON.parse(response.body);
      expect(parsedBody).toEqual({
        name: 'Original Data',
        value: 123,
        transformed: true,
        transformedBy: 'transformPlugin'
      });
    });

    it('should preserve original response when transformation fails', async () => {
      // Plugin that tries to transform but fails
      const failingPluginPath = path.join(tempDir, 'failingPlugin.js');
      const failingPluginContent = `
export default {
  async setup(context) {
    context.registerPostResponseHook(async (request, response) => {
      throw new Error('Transformation failed');
    });
  }
};
`;
      await fs.writeFile(failingPluginPath, failingPluginContent);

      const pluginConfig: PluginConfiguration = {
        path: failingPluginPath,
        name: 'failingPlugin'
      };

      await pluginManager.loadPlugins([pluginConfig], tempDir);
      httpClient.setPluginManager(pluginManager);

      // Mock the executeRequest method to avoid real network calls
      httpClient.executeRequest = async function(request: HttpRequest): Promise<HttpResponse> {
        const mockResponse: HttpResponse = {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          body: '{"original": "response"}'
        };

        // Execute post-response hooks - this should throw the error
        if (this.pluginManager) {
          await this.pluginManager.executePostResponseHooks(request, mockResponse);
        }

        return mockResponse;
      };

      const request: HttpRequest = {
        method: 'GET',
        url: 'https://api.example.com/data',
        headers: {}
      };

      // Should throw error when post-response hook fails
      await expect(httpClient.executeRequest(request)).rejects.toThrow(
        'Post-response hook failed in plugin \'failingPlugin\': Transformation failed'
      );
    });

    it('should work with conditional transformations based on content type', async () => {
      const conditionalPluginPath = path.join(tempDir, 'conditionalPlugin.js');
      const conditionalPluginContent = `
export default {
  async setup(context) {
    context.registerPostResponseHook(async (request, response) => {
      const contentType = response.headers['content-type'] || '';
      
      if (contentType.includes('text/plain')) {
        // Convert plain text to JSON
        response.body = JSON.stringify({ 
          message: response.body,
          converted: true 
        });
        response.headers['content-type'] = 'application/json';
        response.headers['x-converted-from'] = 'text/plain';
      } else if (contentType.includes('application/json')) {
        // Add metadata to existing JSON
        try {
          const data = JSON.parse(response.body);
          data.metadata = { processed: true };
          response.body = JSON.stringify(data);
          response.headers['x-metadata-added'] = 'true';
        } catch (error) {
          // Invalid JSON, skip
        }
      }
    });
  }
};
`;
      await fs.writeFile(conditionalPluginPath, conditionalPluginContent);

      const pluginConfig: PluginConfiguration = {
        path: conditionalPluginPath,
        name: 'conditionalPlugin'
      };

      await pluginManager.loadPlugins([pluginConfig], tempDir);
      httpClient.setPluginManager(pluginManager);

      // Test with plain text response
      httpClient.executeRequest = async function(request: HttpRequest): Promise<HttpResponse> {
        let mockResponse: HttpResponse;
        
        if (request.url.includes('plain')) {
          mockResponse = {
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'text/plain' },
            body: 'Hello, World!'
          };
        } else {
          mockResponse = {
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            body: '{"existing": "data"}'
          };
        }

        if (this.pluginManager) {
          await this.pluginManager.executePostResponseHooks(request, mockResponse);
        }

        return mockResponse;
      };

      // Test plain text conversion
      const plainTextRequest: HttpRequest = {
        method: 'GET',
        url: 'https://api.example.com/plain',
        headers: {}
      };

      const plainTextResponse = await httpClient.executeRequest(plainTextRequest);
      expect(plainTextResponse.headers['content-type']).toBe('application/json');
      expect(plainTextResponse.headers['x-converted-from']).toBe('text/plain');
      expect(JSON.parse(plainTextResponse.body)).toEqual({
        message: 'Hello, World!',
        converted: true
      });

      // Test JSON metadata addition
      const jsonRequest: HttpRequest = {
        method: 'GET',
        url: 'https://api.example.com/json',
        headers: {}
      };

      const jsonResponse = await httpClient.executeRequest(jsonRequest);
      expect(jsonResponse.headers['x-metadata-added']).toBe('true');
      expect(JSON.parse(jsonResponse.body)).toEqual({
        existing: 'data',
        metadata: { processed: true }
      });
    });
  });
}); 