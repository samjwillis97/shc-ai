/**
 * Type definitions for HttpCraft configuration files
 * Supports both raw configurations (with import specifications) and processed configurations
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/**
 * Raw configuration as loaded from YAML files
 * May contain import specifications before processing
 */
export interface RawHttpCraftConfig {
  apis?: Record<string, ApiDefinition> | string[];
  chains?: Record<string, ChainDefinition> | string[];
  profiles?: Record<string, ProfileDefinition> | string[];
  variables?: string[];
  plugins?: PluginConfiguration[];
  config?: {
    defaultProfile?: string | string[];
  };
  globalVariables?: Record<string, unknown>;
}

/**
 * Processed configuration with all imports resolved
 */
export interface HttpCraftConfig extends Omit<RawHttpCraftConfig, 'apis' | 'chains' | 'profiles'> {
  apis: Record<string, ApiDefinition>;
  chains?: Record<string, ChainDefinition>;
  profiles?: Record<string, ProfileDefinition>;
  plugins?: PluginConfiguration[];
  config?: {
    defaultProfile?: string | string[];
  };
  globalVariables?: Record<string, unknown>;
}

export interface ApiDefinition {
  baseUrl: string;
  headers?: Record<string, unknown>;
  params?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  endpoints: Record<string, EndpointDefinition>;
  plugins?: PluginConfiguration[];
}

export interface EndpointDefinition {
  method: HttpMethod;
  path: string;
  headers?: Record<string, unknown>;
  params?: Record<string, unknown>;
  body?: unknown;
  variables?: Record<string, unknown>;
}

export interface ChainDefinition {
  description?: string;
  vars?: Record<string, unknown>;
  steps: ChainStep[];
  // Legacy alias for backward compatibility
  variables?: Record<string, unknown>;
}

export interface ChainStep {
  id: string;
  description?: string;
  call: string;
  with?: StepOverrides;
  condition?: string;
  onSuccess?: ChainStepAction[];
  onFailure?: ChainStepAction[];
  // Legacy alias for backward compatibility
  variables?: Record<string, unknown>;
}

export interface StepOverrides {
  headers?: Record<string, unknown>;
  params?: Record<string, unknown>;
  pathParams?: Record<string, unknown>;
  body?: unknown;
}

export interface ChainStepAction {
  type: 'set' | 'log' | 'fail' | 'exit';
  value?: unknown;
}

export interface ProfileDefinition {
  [key: string]: unknown;
}

export interface PluginConfiguration {
  name: string;
  path?: string;
  npmPackage?: string;
  config?: Record<string, unknown>;
}

export interface ApiPluginConfiguration {
  name: string;
  config?: Record<string, unknown>;
}
