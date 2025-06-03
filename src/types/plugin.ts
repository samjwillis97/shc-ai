/**
 * Plugin system types for HttpCraft
 */

export interface HttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | object;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

export interface PluginContext {
  request: HttpRequest;
  response?: HttpResponse;
  config: PluginConfig;
  registerPreRequestHook: (hook: PreRequestHook) => void;
  registerPostResponseHook: (hook: PostResponseHook) => void;
  registerVariableSource: (name: string, source: VariableSource) => void;
}

export interface PluginConfig {
  [key: string]: any;
}

export type PreRequestHook = (request: HttpRequest) => Promise<void>;
export type PostResponseHook = (request: HttpRequest, response: HttpResponse) => Promise<void>;
export type VariableSource = () => Promise<string> | string;

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
} 