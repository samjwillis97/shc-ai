import { configLoader } from '../../core/configLoader.js';
import { PluginManager } from '../../core/pluginManager.js';
import type { HttpCraftConfig } from '../../types/config.js';

export interface ListCommandArgs {
  config?: string;
  json?: boolean;
}

export interface ListEndpointsArgs extends ListCommandArgs {
  apiName?: string;
}

export interface ListVariablesArgs extends ListCommandArgs {
  profiles?: string[];
  api?: string;
  endpoint?: string;
}

// Utility function to create table-like output
function formatTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return 'No items found.';
  }

  // Calculate column widths
  const colWidths = headers.map((header, i) => {
    const maxRowWidth = Math.max(...rows.map((row) => (row[i] || '').length));
    return Math.max(header.length, maxRowWidth);
  });

  // Format header
  const headerRow = headers.map((header, i) => header.padEnd(colWidths[i])).join('  ');
  const separator = colWidths.map((width) => '─'.repeat(width)).join('──');

  // Format rows
  const formattedRows = rows.map((row) =>
    row.map((cell, i) => (cell || '').padEnd(colWidths[i])).join('  ')
  );

  return [headerRow, separator, ...formattedRows].join('\n');
}

export async function handleListApisCommand(args: ListCommandArgs): Promise<void> {
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
    const apiList = Object.entries(apis).map(([name, definition]) => ({
      name,
      description: definition.description || '',
      baseUrl: definition.baseUrl,
      endpoints: Object.keys(definition.endpoints).length,
    }));

    if (args.json) {
      console.log(JSON.stringify(apiList, null, 2));
    } else {
      if (apiList.length === 0) {
        console.log('No APIs found in configuration.');
        return;
      }

      console.log('APIs:');
      const headers = ['Name', 'Description', 'Base URL', 'Endpoints'];
      const rows = apiList.map((api) => [
        api.name,
        api.description,
        api.baseUrl,
        api.endpoints.toString(),
      ]);
      console.log(formatTable(headers, rows));
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

export async function handleListEndpointsCommand(args: ListEndpointsArgs): Promise<void> {
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

    // Filter by API if specified
    const filteredApis = args.apiName ? { [args.apiName]: apis[args.apiName] } : apis;

    if (args.apiName && !apis[args.apiName]) {
      console.error(`Error: API '${args.apiName}' not found in configuration.`);
      process.exit(1);
    }

    const endpointList: Array<{
      api: string;
      name: string;
      method: string;
      path: string;
      description: string;
    }> = [];

    Object.entries(filteredApis).forEach(([apiName, apiDef]) => {
      Object.entries(apiDef.endpoints).forEach(([endpointName, endpointDef]) => {
        endpointList.push({
          api: apiName,
          name: endpointName,
          method: endpointDef.method,
          path: endpointDef.path,
          description: endpointDef.description || '',
        });
      });
    });

    if (args.json) {
      console.log(JSON.stringify(endpointList, null, 2));
    } else {
      if (endpointList.length === 0) {
        const message = args.apiName
          ? `No endpoints found in API '${args.apiName}'.`
          : 'No endpoints found in configuration.';
        console.log(message);
        return;
      }

      const title = args.apiName ? `Endpoints (${args.apiName}):` : 'Endpoints:';
      console.log(title);

      const headers = args.apiName
        ? ['Name', 'Method', 'Path', 'Description']
        : ['API', 'Name', 'Method', 'Path', 'Description'];

      const rows = endpointList.map((endpoint) =>
        args.apiName
          ? [endpoint.name, endpoint.method, endpoint.path, endpoint.description]
          : [endpoint.api, endpoint.name, endpoint.method, endpoint.path, endpoint.description]
      );

      console.log(formatTable(headers, rows));
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

export async function handleListProfilesCommand(args: ListCommandArgs): Promise<void> {
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
    const defaultProfiles = config.config?.defaultProfile;
    const defaultProfileNames = Array.isArray(defaultProfiles)
      ? defaultProfiles
      : defaultProfiles
        ? [defaultProfiles]
        : [];

    const profileList = Object.entries(profiles).map(([name, definition]) => ({
      name,
      description: definition.description || '',
      isDefault: defaultProfileNames.includes(name),
      variables: Object.keys(definition).filter((key) => key !== 'description').length,
    }));

    if (args.json) {
      console.log(JSON.stringify(profileList, null, 2));
    } else {
      if (profileList.length === 0) {
        console.log('No profiles found in configuration.');
        return;
      }

      console.log('Profiles:');
      const headers = ['Name', 'Description', 'Default', 'Variables'];
      const rows = profileList.map((profile) => [
        profile.name,
        profile.description,
        profile.isDefault ? '✓' : '',
        profile.variables.toString(),
      ]);
      console.log(formatTable(headers, rows));

      if (defaultProfileNames.length > 0) {
        console.log(`\nDefault profiles: ${defaultProfileNames.join(', ')}`);
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

interface VariableSource {
  name: string;
  value: string;
  source: string;
  scope?: string;
  active?: boolean;
}

export async function handleListVariablesCommand(args: ListVariablesArgs): Promise<void> {
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

    // Collect all variables from different sources
    const variables: VariableSource[] = [];

    // Note: Environment variables are not listed here but are still available as {{env.NAME}}
    // This keeps the output clean and focused on configuration-defined variables

    // 1. Global variables (from config.globalVariables)
    if (config.globalVariables) {
      Object.entries(config.globalVariables).forEach(([key, value]) => {
        variables.push({
          name: key,
          value: value === '' ? '""' : typeof value === 'string' ? value : JSON.stringify(value),
          source: 'Global Variable',
          scope: 'global',
        });
      });
    }

    // 2. Profile variables
    const profiles = config.profiles || {};
    const activeProfileNames: string[] = [];

    // Determine active profiles
    if (args.profiles && args.profiles.length > 0) {
      activeProfileNames.push(...args.profiles);
    } else if (config.config?.defaultProfile) {
      const defaultProfiles = Array.isArray(config.config.defaultProfile)
        ? config.config.defaultProfile
        : [config.config.defaultProfile];
      activeProfileNames.push(...defaultProfiles);
    }

    // Add variables from profiles
    Object.entries(profiles).forEach(([profileName, profileDef]) => {
      const isActive = activeProfileNames.includes(profileName);
      Object.entries(profileDef).forEach(([key, value]) => {
        if (key !== 'description') {
          variables.push({
            name: key,
            value: typeof value === 'string' ? value : JSON.stringify(value),
            source: args.json
              ? `Profile: ${profileName}`
              : `Profile: ${profileName}${isActive ? ' (active)' : ''}`,
            scope: 'profile',
            active: isActive,
          });
        }
      });
    });

    // 3. API-specific variables (if API specified)
    if (args.api) {
      const apiDef = config.apis?.[args.api];
      if (!apiDef) {
        console.error(`Error: API '${args.api}' not found in configuration.`);
        process.exit(1);
      }

      if (apiDef.variables) {
        Object.entries(apiDef.variables).forEach(([key, value]) => {
          variables.push({
            name: key,
            value: typeof value === 'string' ? value : JSON.stringify(value),
            source: `API: ${args.api}`,
            scope: 'api',
          });
        });
      }

      // 4. Endpoint-specific variables (if endpoint specified)
      if (args.endpoint) {
        const endpointDef = apiDef.endpoints?.[args.endpoint];
        if (!endpointDef) {
          console.error(`Error: Endpoint '${args.endpoint}' not found in API '${args.api}'.`);
          process.exit(1);
        }

        if (endpointDef.variables) {
          Object.entries(endpointDef.variables).forEach(([key, value]) => {
            variables.push({
              name: key,
              value: typeof value === 'string' ? value : JSON.stringify(value),
              source: `Endpoint: ${args.api}.${args.endpoint}`,
              scope: 'endpoint',
            });
          });
        }
      }
    }

    // 5. Built-in dynamic variables
    const dynamicVariables = [
      { name: '$timestamp', description: 'Current Unix timestamp' },
      { name: '$isoTimestamp', description: 'Current ISO 8601 timestamp' },
      { name: '$randomInt', description: 'Random integer' },
      { name: '$guid', description: 'Random GUID/UUID' },
    ];

    dynamicVariables.forEach(({ name, description }) => {
      variables.push({
        name,
        value: `<dynamic: ${description}>`,
        source: 'Built-in Dynamic Variable',
        scope: 'dynamic',
      });
    });

    // 6. Plugin variables (if any plugins are loaded)
    if (config.plugins && config.plugins.length > 0) {
      try {
        const pluginManager = new PluginManager();
        await pluginManager.loadPlugins(config.plugins);

        // Add a note about plugin variables being runtime-dependent
        variables.push({
          name: 'plugins.*',
          value: '<runtime-dependent>',
          source: 'Plugin Variables (runtime)',
          scope: 'plugins',
        });
      } catch (error) {
        // Plugin loading failed, but don't error out - just note it
        variables.push({
          name: 'plugins.*',
          value: '<plugin loading failed>',
          source: 'Plugin Variables (error)',
          scope: 'plugins',
        });
      }
    }

    // Sort variables by source and name for consistent output
    variables.sort((a, b) => {
      if (a.scope !== b.scope) {
        const scopeOrder = ['endpoint', 'api', 'profile', 'global', 'dynamic', 'plugins'];
        return scopeOrder.indexOf(a.scope || '') - scopeOrder.indexOf(b.scope || '');
      }
      return a.name.localeCompare(b.name);
    });

    if (args.json) {
      console.log(JSON.stringify(variables, null, 2));
    } else {
      if (variables.length === 0) {
        console.log('No variables found.');
        return;
      }

      const scopeFilter = args.api
        ? ` (filtered for ${args.api}${args.endpoint ? `.${args.endpoint}` : ''})`
        : '';
      const profileInfo =
        activeProfileNames.length > 0 ? ` with profiles: ${activeProfileNames.join(', ')}` : '';

      console.log(`Variables${scopeFilter}${profileInfo}:`);
      const headers = ['Name', 'Value', 'Source'];
      const rows = variables.map((variable) => [
        variable.name,
        variable.value.length > 50 ? variable.value.substring(0, 47) + '...' : variable.value,
        variable.source,
      ]);
      console.log(formatTable(headers, rows));

      // Show usage examples
      console.log('\nUsage examples:');
      console.log('  {{variableName}}          - Direct variable reference');
      console.log('  {{env.VARIABLE_NAME}}     - Environment variable');
      if (args.api) {
        console.log(`  {{api.key}}               - API variable (${args.api})`);
        if (args.endpoint) {
          console.log(
            `  {{endpoint.key}}          - Endpoint variable (${args.api}.${args.endpoint})`
          );
        }
      }
      console.log('  {{secret.SECRET_NAME}}    - Secret variable (masked in output)');
      console.log('  {{$timestamp}}            - Dynamic variable');
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
