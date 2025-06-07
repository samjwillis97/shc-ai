/**
 * Plugin system types for HttpCraft
 */

export interface HttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

// T14.1: Define SecretResolver interface for custom secret resolution
export type SecretResolver = (secretName: string) => Promise<string | undefined>;

export interface PluginContext {
  request: HttpRequest;
  response?: HttpResponse;
  config: PluginConfig;
  registerPreRequestHook: (hook: PreRequestHook) => void;
  registerPostResponseHook: (hook: PostResponseHook) => void;
  registerVariableSource: (name: string, source: VariableSource) => void;
  registerParameterizedVariableSource: (name: string, source: ParameterizedVariableSource) => void;
  // T14.1: Add secret resolver registration method
  registerSecretResolver: (resolver: SecretResolver) => void;
}

export interface PluginConfig {
  [key: string]: unknown;
}

export type PreRequestHook = (request: HttpRequest) => Promise<void>;
export type PostResponseHook = (request: HttpRequest, response: HttpResponse) => Promise<void>;
export type VariableSource = () => Promise<string> | string;
export type ParameterizedVariableSource = (...args: unknown[]) => Promise<string> | string;

export interface Plugin {
  setup(context: PluginContext): void | Promise<void>;
}

export interface PluginInstance {
  name: string;
  plugin: Plugin;
  config: PluginConfig;
  preRequestHooks: PreRequestHook[];
  postResponseHooks: PostResponseHook[];
  variableSources: Record<string, VariableSource>;
  parameterizedVariableSources: Record<string, ParameterizedVariableSource>;
  // T14.2: Add secret resolvers storage
  secretResolvers: SecretResolver[];
}
