import { describe, it, expect } from 'vitest';
import { UrlBuilder } from '../../src/core/urlBuilder.js';
import type { ApiDefinition, EndpointDefinition } from '../../src/types/config.js';

describe('UrlBuilder', () => {
  const urlBuilder = new UrlBuilder();

  describe('buildUrl', () => {
    it('should construct URL from baseUrl and path', () => {
      const api: ApiDefinition = {
        baseUrl: 'https://api.example.com',
        endpoints: {}
      };
      
      const endpoint: EndpointDefinition = {
        method: 'GET',
        path: '/users/1'
      };
      
      const url = urlBuilder.buildUrl(api, endpoint);
      expect(url).toBe('https://api.example.com/users/1');
    });

    it('should handle baseUrl with trailing slash', () => {
      const api: ApiDefinition = {
        baseUrl: 'https://api.example.com/',
        endpoints: {}
      };
      
      const endpoint: EndpointDefinition = {
        method: 'GET',
        path: '/users/1'
      };
      
      const url = urlBuilder.buildUrl(api, endpoint);
      expect(url).toBe('https://api.example.com/users/1');
    });

    it('should handle path without leading slash', () => {
      const api: ApiDefinition = {
        baseUrl: 'https://api.example.com',
        endpoints: {}
      };
      
      const endpoint: EndpointDefinition = {
        method: 'GET',
        path: 'users/1'
      };
      
      const url = urlBuilder.buildUrl(api, endpoint);
      expect(url).toBe('https://api.example.com/users/1');
    });
  });

  describe('mergeParams', () => {
    it('should merge API and endpoint params', () => {
      const api: ApiDefinition = {
        baseUrl: 'https://api.example.com',
        params: { 'api_key': 'abc123', 'version': 'v1' },
        endpoints: {}
      };
      
      const endpoint: EndpointDefinition = {
        method: 'GET',
        path: '/users',
        params: { 'limit': '10', 'version': 'v2' } // Should override API version
      };
      
      const merged = urlBuilder.mergeParams(api, endpoint);
      expect(merged).toEqual({
        'api_key': 'abc123',
        'version': 'v2', // Endpoint overrides API
        'limit': '10'
      });
    });

    it('should handle missing params', () => {
      const api: ApiDefinition = {
        baseUrl: 'https://api.example.com',
        endpoints: {}
      };
      
      const endpoint: EndpointDefinition = {
        method: 'GET',
        path: '/users'
      };
      
      const merged = urlBuilder.mergeParams(api, endpoint);
      expect(merged).toEqual({});
    });
  });

  describe('mergeHeaders', () => {
    it('should merge API and endpoint headers', () => {
      const api: ApiDefinition = {
        baseUrl: 'https://api.example.com',
        headers: { 'Authorization': 'Bearer token', 'User-Agent': 'HttpCraft' },
        endpoints: {}
      };
      
      const endpoint: EndpointDefinition = {
        method: 'POST',
        path: '/users',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'HttpCraft-Endpoint' } // Should override API User-Agent
      };
      
      const merged = urlBuilder.mergeHeaders(api, endpoint);
      expect(merged).toEqual({
        'Authorization': 'Bearer token',
        'User-Agent': 'HttpCraft-Endpoint', // Endpoint overrides API
        'Content-Type': 'application/json'
      });
    });

    it('should handle missing headers', () => {
      const api: ApiDefinition = {
        baseUrl: 'https://api.example.com',
        endpoints: {}
      };
      
      const endpoint: EndpointDefinition = {
        method: 'GET',
        path: '/users'
      };
      
      const merged = urlBuilder.mergeHeaders(api, endpoint);
      expect(merged).toEqual({});
    });
  });
}); 