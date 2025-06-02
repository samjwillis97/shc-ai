/**
 * Configuration types for HttpCraft YAML files
 */

export interface HttpCraftConfig {
  config?: ConfigSection;
  profiles?: Record<string, ProfileDefinition>;
  plugins?: PluginConfiguration[];
  apis: Record<string, ApiDefinition>;
}

export interface ConfigSection {
  defaultProfile?: string | string[];
}

export interface ProfileDefinition {
  [key: string]: string | number | boolean;
}

export interface PluginConfiguration {
  path: string;
  name: string;
  config?: Record<string, any>;
}

export interface ApiDefinition {
  baseUrl: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  variables?: Record<string, string | number | boolean>;
  endpoints: Record<string, EndpointDefinition>;
}

export interface EndpointDefinition {
  method: HttpMethod;
  path: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: string | object;
  variables?: Record<string, string | number | boolean>;
  description?: string;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'; 