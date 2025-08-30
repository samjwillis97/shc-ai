import { configLoader } from '../../core/configLoader.js';
import type { HttpCraftConfig } from '../../types/config.js';

export interface ListCommandArgs {
  config?: string;
  json?: boolean;
}

export interface ListEndpointsArgs extends ListCommandArgs {
  apiName?: string;
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
