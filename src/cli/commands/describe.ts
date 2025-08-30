import { configLoader } from '../../core/configLoader.js';
import { VariableResolver } from '../../core/variableResolver.js';
import { urlBuilder } from '../../core/urlBuilder.js';
import type { HttpCraftConfig } from '../../types/config.js';

export interface DescribeCommandArgs {
  config?: string;
  json?: boolean;
}

export interface DescribeApiArgs extends DescribeCommandArgs {
  apiName: string;
}

export interface DescribeProfileArgs extends DescribeCommandArgs {
  profileName: string;
}

export interface DescribeEndpointArgs extends DescribeCommandArgs {
  apiName: string;
  endpointName: string;
  profiles?: string[];
  variables?: Record<string, string>;
}

// Utility function to format key-value pairs
function formatKeyValuePairs(data: Record<string, unknown>, indent: string = ''): string {
  if (Object.keys(data).length === 0) {
    return `${indent}(none)`;
  }

  return Object.entries(data)
    .map(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        return `${indent}${key}:\n${formatKeyValuePairs(value as Record<string, unknown>, indent + '  ')}`;
      }
      return `${indent}${key}: ${value}`;
    })
    .join('\n');
}

export async function handleDescribeApiCommand(args: DescribeApiArgs): Promise<void> {
  try {
    // Load configuration
    let config: HttpCraftConfig;

    if (args.config) {
      config = await configLoader.loadConfig(args.config);
    } else {
      const defaultConfig = await configLoader.loadDefaultConfig();
      if (!defaultConfig) {
        console.error(
          'Error: No configuration file found. Use --config to specify a config file or create .httpcraft.yaml'
        );
        process.exit(1);
      }
      config = defaultConfig.config;
    }

    const apis = config.apis || {};
    const apiDef = apis[args.apiName];

    if (!apiDef) {
      console.error(`Error: API '${args.apiName}' not found in configuration.`);
      process.exit(1);
    }

    const apiInfo = {
      name: args.apiName,
      description: apiDef.description || '',
      baseUrl: apiDef.baseUrl,
      headers: apiDef.headers || {},
      params: apiDef.params || {},
      variables: apiDef.variables || {},
      plugins: apiDef.plugins || [],
      endpoints: Object.entries(apiDef.endpoints).map(([name, def]) => ({
        name,
        method: def.method,
        path: def.path,
        description: def.description || '',
      })),
    };

    if (args.json) {
      console.log(JSON.stringify(apiInfo, null, 2));
    } else {
      console.log(`API: ${args.apiName}`);
      if (apiInfo.description) {
        console.log(`Description: ${apiInfo.description}`);
      }
      console.log(`Base URL: ${apiInfo.baseUrl}`);

      console.log('\nHeaders:');
      console.log(formatKeyValuePairs(apiInfo.headers, '  '));

      console.log('\nQuery Parameters:');
      console.log(formatKeyValuePairs(apiInfo.params, '  '));

      console.log('\nVariables:');
      console.log(formatKeyValuePairs(apiInfo.variables, '  '));

      if (apiInfo.plugins.length > 0) {
        console.log('\nPlugins:');
        apiInfo.plugins.forEach((plugin) => {
          console.log(`  ${plugin.name}`);
          if (plugin.config && Object.keys(plugin.config).length > 0) {
            console.log(formatKeyValuePairs(plugin.config, '    '));
          }
        });
      }

      console.log('\nEndpoints:');
      if (apiInfo.endpoints.length === 0) {
        console.log('  (none)');
      } else {
        apiInfo.endpoints.forEach((endpoint) => {
          console.log(`  ${endpoint.name} (${endpoint.method} ${endpoint.path})`);
          if (endpoint.description) {
            console.log(`    Description: ${endpoint.description}`);
          }
        });
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('An unexpected error occurred');
    }
    process.exit(1);
  }
}

export async function handleDescribeProfileCommand(args: DescribeProfileArgs): Promise<void> {
  try {
    // Load configuration
    let config: HttpCraftConfig;

    if (args.config) {
      config = await configLoader.loadConfig(args.config);
    } else {
      const defaultConfig = await configLoader.loadDefaultConfig();
      if (!defaultConfig) {
        console.error(
          'Error: No configuration file found. Use --config to specify a config file or create .httpcraft.yaml'
        );
        process.exit(1);
      }
      config = defaultConfig.config;
    }

    const profiles = config.profiles || {};
    const profileDef = profiles[args.profileName];

    if (!profileDef) {
      console.error(`Error: Profile '${args.profileName}' not found in configuration.`);
      process.exit(1);
    }

    const defaultProfiles = config.config?.defaultProfile;
    const defaultProfileNames = Array.isArray(defaultProfiles)
      ? defaultProfiles
      : defaultProfiles
        ? [defaultProfiles]
        : [];

    const isDefault = defaultProfileNames.includes(args.profileName);

    // Extract variables (everything except description)
    const { description, ...variables } = profileDef;

    const profileInfo = {
      name: args.profileName,
      description: description || '',
      isDefault,
      variables,
    };

    if (args.json) {
      console.log(JSON.stringify(profileInfo, null, 2));
    } else {
      console.log(`Profile: ${args.profileName}`);
      if (profileInfo.description) {
        console.log(`Description: ${profileInfo.description}`);
      }
      if (profileInfo.isDefault) {
        console.log('Default: ✓ (loaded by default)');
      }

      console.log('\nVariables:');
      console.log(formatKeyValuePairs(profileInfo.variables, '  '));
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('An unexpected error occurred');
    }
    process.exit(1);
  }
}

export async function handleDescribeEndpointCommand(args: DescribeEndpointArgs): Promise<void> {
  try {
    // Load configuration
    let config: HttpCraftConfig;

    if (args.config) {
      config = await configLoader.loadConfig(args.config);
    } else {
      const defaultConfig = await configLoader.loadDefaultConfig();
      if (!defaultConfig) {
        console.error(
          'Error: No configuration file found. Use --config to specify a config file or create .httpcraft.yaml'
        );
        process.exit(1);
      }
      config = defaultConfig.config;
    }

    const apis = config.apis || {};
    const apiDef = apis[args.apiName];

    if (!apiDef) {
      console.error(`Error: API '${args.apiName}' not found in configuration.`);
      process.exit(1);
    }

    const endpointDef = apiDef.endpoints[args.endpointName];
    if (!endpointDef) {
      console.error(`Error: Endpoint '${args.endpointName}' not found in API '${args.apiName}'.`);
      process.exit(1);
    }

    // Handle profile resolution similar to api.ts
    let profileNames: string[] = [];

    // Start with default profiles (if any)
    if (config.config?.defaultProfile) {
      profileNames = Array.isArray(config.config.defaultProfile)
        ? [...config.config.defaultProfile]
        : [config.config.defaultProfile];
    }

    // Add CLI-specified profiles
    if (args.profiles && args.profiles.length > 0) {
      profileNames = [...profileNames, ...args.profiles];
    }

    // Validate profiles exist
    const profiles = config.profiles || {};
    const missingProfiles = profileNames.filter((name) => !profiles[name]);
    if (missingProfiles.length > 0) {
      console.error(`Error: Profile(s) not found: ${missingProfiles.join(', ')}`);
      process.exit(1);
    }

    // Initialize variable resolver and merge profiles
    const resolver = new VariableResolver();
    const mergedProfileVars = resolver.mergeProfiles(profileNames, profiles);

    // Create variable context for resolution
    const variableContext = resolver.createContext(
      args.variables || {},
      mergedProfileVars,
      apiDef.variables,
      endpointDef.variables,
      {},
      config.globalVariables
    );

    // Build final URL and resolve variables
    const finalUrl = urlBuilder.buildUrl(apiDef, endpointDef);
    const mergedHeaders = { ...apiDef.headers, ...endpointDef.headers };
    const mergedParams = { ...apiDef.params, ...endpointDef.params };

    // Resolve variables in headers and params (for preview)
    let resolvedHeaders: Record<string, unknown> = {};
    let resolvedParams: Record<string, unknown> = {};
    let resolvedBody: unknown = endpointDef.body;
    let resolvedUrl = finalUrl;

    try {
      resolvedHeaders = (await resolver.resolveValue(mergedHeaders, variableContext)) as Record<
        string,
        unknown
      >;
      resolvedParams = (await resolver.resolveValue(mergedParams, variableContext)) as Record<
        string,
        unknown
      >;
      resolvedUrl = (await resolver.resolveValue(finalUrl, variableContext)) as string;
      if (endpointDef.body !== undefined) {
        resolvedBody = await resolver.resolveValue(endpointDef.body, variableContext);
      }
    } catch (error) {
      // Don't fail on variable resolution errors, just show unresolved
    }

    const endpointInfo = {
      api: args.apiName,
      name: args.endpointName,
      description: endpointDef.description || '',
      method: endpointDef.method,
      path: endpointDef.path,
      fullUrl: resolvedUrl,
      activeProfiles: profileNames,
      configuration: {
        headers: resolvedHeaders,
        params: resolvedParams,
        body: resolvedBody,
        variables: endpointDef.variables || {},
      },
      inherited: {
        apiHeaders: apiDef.headers || {},
        apiParams: apiDef.params || {},
        apiVariables: apiDef.variables || {},
      },
    };

    if (args.json) {
      console.log(JSON.stringify(endpointInfo, null, 2));
    } else {
      console.log(`Endpoint: ${args.apiName}.${args.endpointName}`);
      if (endpointInfo.description) {
        console.log(`Description: ${endpointInfo.description}`);
      }
      console.log(`Method: ${endpointInfo.method}`);
      console.log(`Path: ${endpointInfo.path}`);
      console.log(`Full URL: ${endpointInfo.fullUrl}`);

      if (endpointInfo.activeProfiles.length > 0) {
        console.log(`\nActive Profiles: ${endpointInfo.activeProfiles.join(' → ')}`);
      }

      console.log('\nFinal Configuration:');
      console.log('  Headers:');
      console.log(formatKeyValuePairs(endpointInfo.configuration.headers, '    '));

      console.log('  Query Parameters:');
      console.log(formatKeyValuePairs(endpointInfo.configuration.params, '    '));

      if (endpointInfo.configuration.body !== undefined) {
        console.log('  Body:');
        const bodyStr =
          typeof endpointInfo.configuration.body === 'string'
            ? endpointInfo.configuration.body
            : JSON.stringify(endpointInfo.configuration.body, null, 2);
        console.log(`    ${bodyStr}`);
      }

      console.log('\nInherited from API:');
      console.log('  Headers:');
      console.log(formatKeyValuePairs(endpointInfo.inherited.apiHeaders, '    '));

      console.log('  Query Parameters:');
      console.log(formatKeyValuePairs(endpointInfo.inherited.apiParams, '    '));

      console.log('  Variables:');
      console.log(formatKeyValuePairs(endpointInfo.inherited.apiVariables, '    '));

      if (Object.keys(endpointInfo.configuration.variables).length > 0) {
        console.log('\nEndpoint Variables:');
        console.log(formatKeyValuePairs(endpointInfo.configuration.variables, '  '));
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('An unexpected error occurred');
    }
    process.exit(1);
  }
}
