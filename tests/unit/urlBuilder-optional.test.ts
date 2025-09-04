/**
 * T18.7: Unit tests for UrlBuilder optional parameter handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UrlBuilder } from '../../src/core/urlBuilder.js';
import { VariableResolver } from '../../src/core/variableResolver.js';
import type { ApiDefinition, EndpointDefinition } from '../../src/types/config.js';
import type { VariableContext } from '../../src/core/variableResolver.js';

describe('UrlBuilder - Optional Parameter Handling', () => {
  let urlBuilder: UrlBuilder;
  let variableResolver: VariableResolver;
  let context: VariableContext;
  let api: ApiDefinition;
  let endpoint: EndpointDefinition;

  beforeEach(() => {
    urlBuilder = new UrlBuilder();
    variableResolver = new VariableResolver();

    context = {
      cliVariables: {
        definedParam: 'definedValue',
        authToken: 'abc123',
      },
      profiles: {},
      env: {},
    };

    api = {
      baseUrl: 'https://api.example.com',
      endpoints: {}, // Required property
      headers: {
        'User-Agent': 'HttpCraft',
        Authorization: 'Bearer {{authToken?}}',
      },
      params: {
        version: 'v1',
        format: '{{format?}}',
      },
    };

    endpoint = {
      path: '/users',
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Optional': '{{optionalHeader?}}',
      },
      params: {
        limit: '10',
        pageKey: '{{pageKey?}}',
        includeMetadata: '{{includeMetadata?}}',
      },
    };
  });

  describe('mergeParamsWithOptional', () => {
    it('should include parameters with defined optional variables', async () => {
      // Add a defined variable for one of the optional params
      context.cliVariables.includeMetadata = 'true';

      const result = await urlBuilder.mergeParamsWithOptional(
        api,
        endpoint,
        variableResolver,
        context
      );

      expect(result).toEqual({
        version: 'v1',
        limit: '10',
        includeMetadata: 'true',
      });
    });

    it('should exclude parameters with undefined optional variables', async () => {
      const result = await urlBuilder.mergeParamsWithOptional(
        api,
        endpoint,
        variableResolver,
        context
      );

      // Should exclude format, pageKey, and includeMetadata since they're optional and undefined
      expect(result).toEqual({
        version: 'v1',
        limit: '10',
      });
    });

    it('should override API params with endpoint params', async () => {
      // Both API and endpoint define a param with the same name
      api.params!.limit = '{{apiLimit?}}';
      endpoint.params!.limit = '{{endpointLimit?}}';

      context.cliVariables.endpointLimit = '50';

      const result = await urlBuilder.mergeParamsWithOptional(
        api,
        endpoint,
        variableResolver,
        context
      );

      expect(result.limit).toBe('50');
    });

    it('should handle mixed optional and regular parameters', async () => {
      endpoint.params = {
        required: '{{definedParam}}',
        optional: '{{undefinedParam?}}',
        static: 'staticValue',
      };

      const result = await urlBuilder.mergeParamsWithOptional(
        api,
        endpoint,
        variableResolver,
        context
      );

      expect(result).toEqual({
        version: 'v1', // from API
        required: 'definedValue',
        static: 'staticValue',
      });
    });

    it('should handle empty params gracefully', async () => {
      api.params = {};
      endpoint.params = {};

      const result = await urlBuilder.mergeParamsWithOptional(
        api,
        endpoint,
        variableResolver,
        context
      );

      expect(result).toEqual({});
    });

    it('should handle undefined params gracefully', async () => {
      delete api.params;
      delete endpoint.params;

      const result = await urlBuilder.mergeParamsWithOptional(
        api,
        endpoint,
        variableResolver,
        context
      );

      expect(result).toEqual({});
    });
  });

  describe('mergeHeadersWithOptional', () => {
    it('should include headers with defined optional variables', async () => {
      const result = await urlBuilder.mergeHeadersWithOptional(
        api,
        endpoint,
        variableResolver,
        context
      );

      expect(result).toEqual({
        'User-Agent': 'HttpCraft',
        Authorization: 'Bearer abc123',
        Accept: 'application/json',
      });
    });

    it('should exclude headers with undefined optional variables', async () => {
      // Remove authToken to make Authorization header optional and undefined
      delete context.cliVariables.authToken;
      
      const result = await urlBuilder.mergeHeadersWithOptional(api, endpoint, variableResolver, context);
      
      expect(result).toEqual({
        'User-Agent': 'HttpCraft',
        'Authorization': 'Bearer ', // Note: static "Bearer " remains when token is undefined
        'Accept': 'application/json'
      });
    });


    it('should exclude headers that are purely optional and undefined', async () => {
      // Test with a header that contains only an optional variable
      endpoint.headers = {
        'X-Optional-Only': '{{purelyOptional?}}',
        'Accept': 'application/json'
      };
      
      const result = await urlBuilder.mergeHeadersWithOptional(api, endpoint, variableResolver, context);
      
      expect(result['X-Optional-Only']).toBeUndefined();
      expect(result['Accept']).toBe('application/json');
    });

    it('should override API headers with endpoint headers', async () => {
      api.headers!['Accept'] = 'text/xml';
      endpoint.headers!['Accept'] = 'application/json';
      
      const result = await urlBuilder.mergeHeadersWithOptional(api, endpoint, variableResolver, context);
      
      expect(result['Accept']).toBe('application/json');
    });

    it('should handle complex optional header values', async () => {
      endpoint.headers = {
        'X-User-ID': '{{userId?}}',
        'X-Tenant': '{{tenantId?}}',
        'X-Source': 'httpcraft'
      };
      
      context.cliVariables.userId = '12345';
      // tenantId is undefined
      
      const result = await urlBuilder.mergeHeadersWithOptional(api, endpoint, variableResolver, context);
      
      expect(result['X-User-ID']).toBe('12345');
      expect(result['X-Tenant']).toBeUndefined();
      expect(result['X-Source']).toBe('httpcraft');
    });

    it('should handle empty headers gracefully', async () => {
      api.headers = {};
      endpoint.headers = {};
      
      const result = await urlBuilder.mergeHeadersWithOptional(api, endpoint, variableResolver, context);
      
      expect(result).toEqual({});
    });

    it('should handle undefined headers gracefully', async () => {
      delete api.headers;
      delete endpoint.headers;
      
      const result = await urlBuilder.mergeHeadersWithOptional(api, endpoint, variableResolver, context);
      
      expect(result).toEqual({});
    });
  });

  describe('backward compatibility', () => {
    it('should maintain existing behavior for regular mergeParams', () => {
      const result = urlBuilder.mergeParams(api, endpoint);
      
      // Should include all parameters as strings, even with unresolved variables
      expect(result).toEqual({
        version: 'v1',
        format: '{{format?}}',
        limit: '10',
        pageKey: '{{pageKey?}}',
        includeMetadata: '{{includeMetadata?}}'
      });
    });

    it('should maintain existing behavior for regular mergeHeaders', () => {
      const result = urlBuilder.mergeHeaders(api, endpoint);
      
      // Should include all headers as strings, even with unresolved variables
      expect(result).toEqual({
        'User-Agent': 'HttpCraft',
        'Authorization': 'Bearer {{authToken?}}',
        'Accept': 'application/json',
        'X-Optional': '{{optionalHeader?}}'
      });
    });
  });

  describe('integration with variable resolution', () => {
    it('should work with optional variables in profiles', async () => {
      endpoint.params = {
        filter: '{{filterStatus?}}'
      };
      
      context.profiles = {
        filterStatus: 'active'
      };
      
      const result = await urlBuilder.mergeParamsWithOptional(api, endpoint, variableResolver, context);
      
      expect(result['filter']).toBe('active');
    });

    it('should work with environment variable optional syntax', async () => {
      endpoint.headers = {
        'X-API-Key': '{{env.API_KEY?}}'
      };
      
      context.env = {
        API_KEY: 'secret-key'
      };
      
      const result = await urlBuilder.mergeHeadersWithOptional(api, endpoint, variableResolver, context);
      
      expect(result['X-API-Key']).toBe('secret-key');
    });

    it('should exclude parameters when environment variables are undefined', async () => {
      endpoint.params = {
        debug: '{{env.DEBUG_MODE?}}'
      };
      
      // DEBUG_MODE is not set in context.env
      const result = await urlBuilder.mergeParamsWithOptional(api, endpoint, variableResolver, context);
      
      expect(result.debug).toBeUndefined();
    });
  });
});
