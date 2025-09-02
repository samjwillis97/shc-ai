#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { handleRequestCommand } from './commands/request.js';
import { handleApiCommand } from './commands/api.js';
import { handleChainCommand } from './commands/chain.js';
import {
  handleCompletionCommand,
  handleGetApiNamesCommand,
  handleGetEndpointNamesCommand,
  handleGetChainNamesCommand,
  handleGetProfileNamesCommand,
} from './commands/completion.js';
import {
  handleCacheListCommand,
  handleCacheGetCommand,
  handleCacheDeleteCommand,
  handleCacheClearCommand,
  handleCacheStatsCommand,
} from './commands/cache.js';
import {
  handleListApisCommand,
  handleListEndpointsCommand,
  handleListProfilesCommand,
  handleListVariablesCommand,
} from './commands/list.js';
import {
  handleDescribeApiCommand,
  handleDescribeProfileCommand,
  handleDescribeEndpointCommand,
} from './commands/describe.js';

async function main(): Promise<void> {
  try {
    const argv = await yargs(hideBin(process.argv))
      .scriptName('httpcraft')
      .usage('$0 <cmd> [args]')
      .command(
        'request <url>',
        'Make an HTTP GET request to the specified URL',
        (yargs) => {
          yargs.positional('url', {
            describe: 'The URL to make a request to',
            type: 'string',
            demandOption: true,
          });
        },
        async (argv) => {
          await handleRequestCommand({ url: argv.url as string });
        }
      )
      .command(
        'chain <chainName>',
        'Execute a chain of HTTP requests',
        (yargs) => {
          yargs.positional('chainName', {
            describe: 'The name of the chain to execute',
            type: 'string',
            demandOption: true,
          });
        },
        async (argv) => {
          // Parse --var options into key-value pairs
          const variables: Record<string, string> = {};
          if (argv.var && Array.isArray(argv.var)) {
            for (const varStr of argv.var) {
              if (typeof varStr === 'string') {
                const [key, ...valueParts] = varStr.split('=');
                if (key && valueParts.length > 0) {
                  variables[key] = valueParts.join('=');
                } else {
                  console.error(`Error: Invalid variable format '${varStr}'. Use --var key=value`);
                  process.exit(1);
                }
              }
            }
          }

          // Parse --profile options into array of profile names
          const profiles: string[] = [];
          if (argv.profile && Array.isArray(argv.profile)) {
            for (const profileName of argv.profile) {
              if (typeof profileName === 'string') {
                profiles.push(profileName);
              }
            }
          }

          await handleChainCommand({
            chainName: argv.chainName as string,
            config: argv.config as string | undefined,
            variables,
            profiles,
            noDefaultProfile: argv['no-default-profile'] as boolean,
            verbose: argv.verbose as boolean,
            dryRun: argv['dry-run'] as boolean,
            exitOnHttpError: argv['exit-on-http-error'] as string | undefined,
            chainOutput: argv['chain-output'] as string | undefined,
          });
        }
      )
      .command(
        'completion <shell>',
        'Generate shell completion script',
        (yargs) => {
          yargs.positional('shell', {
            describe: 'Shell to generate completion for',
            type: 'string',
            choices: ['zsh'],
            demandOption: true,
          });
        },
        async (argv) => {
          await handleCompletionCommand({ shell: argv.shell as string });
        }
      )
      .command(
        'cache',
        'Manage HttpCraft cache',
        (yargs) => {
          return yargs
            .command(
              'list [namespace]',
              'List cache contents',
              (yargs) => {
                yargs.positional('namespace', {
                  describe: 'Cache namespace to list (omit to list all namespaces)',
                  type: 'string',
                });
              },
              async (argv) => {
                await handleCacheListCommand({
                  namespace: argv.namespace as string | undefined,
                  config: argv.config as string | undefined,
                });
              }
            )
            .command(
              'get <key> [namespace]',
              'Get cache value',
              (yargs) => {
                yargs
                  .positional('key', {
                    describe: 'Cache key to retrieve',
                    type: 'string',
                    demandOption: true,
                  })
                  .positional('namespace', {
                    describe: 'Cache namespace (default: default)',
                    type: 'string',
                  });
              },
              async (argv) => {
                await handleCacheGetCommand({
                  key: argv.key as string,
                  namespace: argv.namespace as string | undefined,
                  config: argv.config as string | undefined,
                });
              }
            )
            .command(
              'delete <key> [namespace]',
              'Delete cache key',
              (yargs) => {
                yargs
                  .positional('key', {
                    describe: 'Cache key to delete',
                    type: 'string',
                    demandOption: true,
                  })
                  .positional('namespace', {
                    describe: 'Cache namespace (default: default)',
                    type: 'string',
                  });
              },
              async (argv) => {
                await handleCacheDeleteCommand({
                  key: argv.key as string,
                  namespace: argv.namespace as string | undefined,
                  config: argv.config as string | undefined,
                });
              }
            )
            .command(
              'clear [namespace]',
              'Clear cache',
              (yargs) => {
                yargs.positional('namespace', {
                  describe: 'Cache namespace to clear (omit to clear all)',
                  type: 'string',
                });
              },
              async (argv) => {
                await handleCacheClearCommand({
                  namespace: argv.namespace as string | undefined,
                  config: argv.config as string | undefined,
                });
              }
            )
            .command(
              'stats',
              'Show cache statistics',
              () => {},
              async (argv) => {
                await handleCacheStatsCommand({
                  config: argv.config as string | undefined,
                });
              }
            )
            .demandCommand(1, 'You must specify a cache command');
        },
        async () => {
          // This handler ensures cache commands are properly handled and don't fall through
          return;
        }
      )
      .command(
        'list',
        'List available APIs, endpoints, or profiles',
        (yargs) => {
          return yargs
            .command(
              'apis',
              'List all APIs',
              (yargs) => {
                yargs.option('json', {
                  describe: 'Output as JSON',
                  type: 'boolean',
                  default: false,
                });
              },
              async (argv) => {
                await handleListApisCommand({
                  config: argv.config as string | undefined,
                  json: argv.json as boolean,
                });
              }
            )
            .command(
              'endpoints [api-name]',
              'List endpoints (optionally for a specific API)',
              (yargs) => {
                yargs
                  .positional('api-name', {
                    describe: 'API name to list endpoints for',
                    type: 'string',
                  })
                  .option('json', {
                    describe: 'Output as JSON',
                    type: 'boolean',
                    default: false,
                  });
              },
              async (argv) => {
                await handleListEndpointsCommand({
                  apiName: argv['api-name'] as string | undefined,
                  config: argv.config as string | undefined,
                  json: argv.json as boolean,
                });
              }
            )
            .command(
              'profiles',
              'List all profiles',
              (yargs) => {
                yargs.option('json', {
                  describe: 'Output as JSON',
                  type: 'boolean',
                  default: false,
                });
              },
              async (argv) => {
                await handleListProfilesCommand({
                  config: argv.config as string | undefined,
                  json: argv.json as boolean,
                });
              }
            )
            .command(
              'variables',
              'List all available variables',
              (yargs) => {
                yargs
                  .option('json', {
                    describe: 'Output as JSON',
                    type: 'boolean',
                    default: false,
                  })
                  .option('profile', {
                    describe: 'Profile to show variables for',
                    type: 'array',
                    string: true,
                  })
                  .option('api', {
                    describe: 'API to show variables for',
                    type: 'string',
                  })
                  .option('endpoint', {
                    describe: 'Endpoint to show variables for (requires --api)',
                    type: 'string',
                  });
              },
              async (argv) => {
                await handleListVariablesCommand({
                  config: argv.config as string | undefined,
                  json: argv.json as boolean,
                  profiles: argv.profile as string[] | undefined,
                  api: argv.api as string | undefined,
                  endpoint: argv.endpoint as string | undefined,
                });
              }
            )
            .demandCommand(
              1,
              'You must specify what to list (apis, endpoints, profiles, or variables)'
            );
        },
        async () => {
          // This handler ensures list commands are properly handled and don't fall through
          return;
        }
      )
      .command(
        'describe',
        'Show detailed information about APIs, endpoints, or profiles',
        (yargs) => {
          return yargs
            .command(
              'api <api-name>',
              'Describe an API',
              (yargs) => {
                yargs
                  .positional('api-name', {
                    describe: 'API name to describe',
                    type: 'string',
                    demandOption: true,
                  })
                  .option('json', {
                    describe: 'Output as JSON',
                    type: 'boolean',
                    default: false,
                  });
              },
              async (argv) => {
                await handleDescribeApiCommand({
                  apiName: argv['api-name'] as string,
                  config: argv.config as string | undefined,
                  json: argv.json as boolean,
                });
              }
            )
            .command(
              'profile <profile-name>',
              'Describe a profile',
              (yargs) => {
                yargs
                  .positional('profile-name', {
                    describe: 'Profile name to describe',
                    type: 'string',
                    demandOption: true,
                  })
                  .option('json', {
                    describe: 'Output as JSON',
                    type: 'boolean',
                    default: false,
                  });
              },
              async (argv) => {
                await handleDescribeProfileCommand({
                  profileName: argv['profile-name'] as string,
                  config: argv.config as string | undefined,
                  json: argv.json as boolean,
                });
              }
            )
            .command(
              'endpoint <api-name> <endpoint-name>',
              'Describe an endpoint with profile resolution',
              (yargs) => {
                yargs
                  .positional('api-name', {
                    describe: 'API name',
                    type: 'string',
                    demandOption: true,
                  })
                  .positional('endpoint-name', {
                    describe: 'Endpoint name',
                    type: 'string',
                    demandOption: true,
                  })
                  .option('json', {
                    describe: 'Output as JSON',
                    type: 'boolean',
                    default: false,
                  });
              },
              async (argv) => {
                // Parse --var options into key-value pairs
                const variables: Record<string, string> = {};
                if (argv.var && Array.isArray(argv.var)) {
                  for (const varStr of argv.var) {
                    if (typeof varStr === 'string') {
                      const [key, ...valueParts] = varStr.split('=');
                      if (key && valueParts.length > 0) {
                        variables[key] = valueParts.join('=');
                      } else {
                        console.error(
                          `Error: Invalid variable format '${varStr}'. Use --var key=value`
                        );
                        process.exit(1);
                      }
                    }
                  }
                }

                // Parse --profile options into array of profile names
                const profiles: string[] = [];
                if (argv.profile && Array.isArray(argv.profile)) {
                  for (const profileName of argv.profile) {
                    if (typeof profileName === 'string') {
                      profiles.push(profileName);
                    }
                  }
                }

                await handleDescribeEndpointCommand({
                  apiName: argv['api-name'] as string,
                  endpointName: argv['endpoint-name'] as string,
                  config: argv.config as string | undefined,
                  json: argv.json as boolean,
                  profiles,
                  variables,
                });
              }
            )
            .demandCommand(1, 'You must specify what to describe (api, profile, or endpoint)');
        },
        async () => {
          // This handler ensures describe commands are properly handled and don't fall through
          return;
        }
      )
      .option('config', {
        describe: 'Path to configuration file',
        type: 'string',
        alias: 'c',
      })
      .option('var', {
        describe: 'Set or override a variable (can be used multiple times)',
        type: 'array',
        string: true,
      })
      .option('profile', {
        describe: 'Select profile(s) to use (can be used multiple times)',
        type: 'array',
        string: true,
        alias: 'p',
      })
      .option('no-default-profile', {
        describe:
          'Ignore default profiles from configuration and use only profiles specified via --profile',
        type: 'boolean',
        default: false,
      })
      .option('verbose', {
        describe: 'Output detailed request and response information to stderr',
        type: 'boolean',
        default: false,
      })
      .option('dry-run', {
        describe: 'Display the request that would be sent without actually sending it',
        type: 'boolean',
        default: false,
      })
      .option('exit-on-http-error', {
        describe:
          'Exit with non-zero code for specified HTTP error status codes (e.g., "4xx", "5xx", "401,403")',
        type: 'string',
      })
      .option('chain-output', {
        describe:
          'Output format for chains ("default" for last step body, "full" for structured JSON of all steps)',
        type: 'string',
        choices: ['default', 'full'],
        default: 'default',
      })
      .option('json', {
        describe: 'Output response as machine-readable JSON including headers, data, and timings',
        type: 'boolean',
        default: false,
      })
      // Hidden options for completion
      .option('get-api-names', {
        describe: 'Get list of API names (hidden, for completion)',
        type: 'boolean',
        hidden: true,
      })
      .option('get-endpoint-names', {
        describe: 'Get list of endpoint names for API (hidden, for completion)',
        type: 'string',
        hidden: true,
      })
      .option('get-chain-names', {
        describe: 'Get list of chain names (hidden, for completion)',
        type: 'boolean',
        hidden: true,
      })
      .option('get-profile-names', {
        describe: 'Get list of profile names (hidden, for completion)',
        type: 'boolean',
        hidden: true,
      })
      .help()
      .alias('help', 'h')
      .version('1.0.0')
      .alias('version', 'v')
      .strict(false) // Allow unknown commands for API pattern
      .parse();

    // Handle hidden completion commands first
    if (argv['get-api-names']) {
      await handleGetApiNamesCommand({ config: argv.config as string | undefined });
      return;
    }

    if (argv['get-endpoint-names']) {
      await handleGetEndpointNamesCommand({
        apiName: argv['get-endpoint-names'] as string,
        config: argv.config as string | undefined,
      });
      return;
    }

    if (argv['get-chain-names']) {
      await handleGetChainNamesCommand({ config: argv.config as string | undefined });
      return;
    }

    if (argv['get-profile-names']) {
      await handleGetProfileNamesCommand({ config: argv.config as string | undefined });
      return;
    }

    // Parse --var options into key-value pairs
    const variables: Record<string, string> = {};
    if (argv.var && Array.isArray(argv.var)) {
      for (const varStr of argv.var) {
        if (typeof varStr === 'string') {
          const [key, ...valueParts] = varStr.split('=');
          if (key && valueParts.length > 0) {
            variables[key] = valueParts.join('='); // Handle values that contain '='
          } else {
            console.error(`Error: Invalid variable format '${varStr}'. Use --var key=value`);
            process.exit(1);
          }
        }
      }
    }

    // Parse --profile options into array of profile names
    const profiles: string[] = [];
    if (argv.profile && Array.isArray(argv.profile)) {
      for (const profileName of argv.profile) {
        if (typeof profileName === 'string') {
          profiles.push(profileName);
        }
      }
    }

    // Handle API command pattern: httpcraft <api_name> <endpoint_name>
    // But first check if this is a known command that was already handled
    const knownCommands = ['request', 'chain', 'completion', 'cache', 'list', 'describe'];
    const isKnownCommand = argv._.length > 0 && knownCommands.includes(argv._[0] as string);

    if (
      !isKnownCommand &&
      argv._.length === 2 &&
      typeof argv._[0] === 'string' &&
      typeof argv._[1] === 'string'
    ) {
      const apiName = argv._[0];
      const endpointName = argv._[1];

      await handleApiCommand({
        apiName,
        endpointName,
        config: argv.config as string | undefined,
        variables,
        profiles,
        noDefaultProfile: argv['no-default-profile'] as boolean,
        verbose: argv.verbose as boolean,
        dryRun: argv['dry-run'] as boolean,
        exitOnHttpError: argv['exit-on-http-error'] as string | undefined,
        json: argv.json as boolean,
      });
    } else if (argv._.length === 0) {
      // No command provided, show help
      console.log(
        'Usage: httpcraft <api_name> <endpoint_name> [--config <path>] [--var key=value] [--profile <name>]'
      );
      console.log(
        '       httpcraft chain <chain_name> [--config <path>] [--var key=value] [--profile <name>]'
      );
      console.log('       httpcraft request <url>');
      console.log('       httpcraft completion <shell>');
      console.log('       httpcraft cache <command>');
      console.log('');
      console.log('Use --help for more information.');
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
