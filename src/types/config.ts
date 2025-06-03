/**
 * Configuration types for HttpCraft YAML files
 */

export interface HttpCraftConfig {
  config?: ConfigSection;
  profiles?: Record<string, ProfileDefinition>;
  plugins?: PluginConfiguration[];
  apis: Record<string, ApiDefinition>;
  chains?: Record<string, ChainDefinition>;
  variables?: string[]; // T9.3: Global variable file paths
}

/**
 * Raw configuration that may contain import specifications
 * Used during parsing before modular imports are resolved
 */
export interface RawHttpCraftConfig {
  config?: ConfigSection;
  profiles?: Record<string, ProfileDefinition>;
  plugins?: PluginConfiguration[];
  apis: Record<string, ApiDefinition> | string[];
  chains?: Record<string, ChainDefinition> | string[];
  variables?: string[]; // T9.3: Global variable file paths
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

/**
 * Chain definition for sequential request execution
 */
export interface ChainDefinition {
  description?: string;
  vars?: Record<string, string | number | boolean>;
  steps: ChainStep[];
}

/**
 * Individual step within a chain
 */
export interface ChainStep {
  id: string;
  description?: string;
  call: string; // Format: "api_name.endpoint_name"
  with?: StepOverrides;
}

/**
 * Step-specific overrides for endpoint configuration
 */
export interface StepOverrides {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  pathParams?: Record<string, string>;
  body?: string | object;
} 