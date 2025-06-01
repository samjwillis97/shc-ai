/**
 * Configuration types for HttpCraft YAML files
 */

export interface HttpCraftConfig {
  apis: Record<string, ApiDefinition>;
}

export interface ApiDefinition {
  baseUrl: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  endpoints: Record<string, EndpointDefinition>;
}

export interface EndpointDefinition {
  method: HttpMethod;
  path: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: string | object;
  description?: string;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'; 