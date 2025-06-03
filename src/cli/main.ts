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
  handleGetChainNamesCommand 
} from './commands/completion.js';

async function main() {
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
    .command('test', 'Test command', {}, () => {
      console.log('Test command executed!');
    })
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
      describe: 'Exit with non-zero code for specified HTTP error status codes (e.g., "4xx", "5xx", "401,403")',
      type: 'string',
    })
    .option('chain-output', {
      describe: 'Output format for chains ("default" for last step body, "full" for structured JSON of all steps)',
      type: 'string',
      choices: ['default', 'full'],
      default: 'default',
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
      config: argv.config as string | undefined 
    });
    return;
  }

  if (argv['get-chain-names']) {
    await handleGetChainNamesCommand({ config: argv.config as string | undefined });
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
  if (argv._.length === 2 && typeof argv._[0] === 'string' && typeof argv._[1] === 'string') {
    const apiName = argv._[0];
    const endpointName = argv._[1];
    
    await handleApiCommand({
      apiName,
      endpointName,
      config: argv.config as string | undefined,
      variables,
      profiles,
      verbose: argv.verbose as boolean,
      dryRun: argv['dry-run'] as boolean,
      exitOnHttpError: argv['exit-on-http-error'] as string | undefined,
    });
  } else if (argv._.length === 0) {
    // No command provided, show help
    console.log('Usage: httpcraft <api_name> <endpoint_name> [--config <path>] [--var key=value] [--profile <name>]');
    console.log('       httpcraft chain <chain_name> [--config <path>] [--var key=value] [--profile <name>]');
    console.log('       httpcraft request <url>');
    console.log('       httpcraft completion <shell>');
    console.log('       httpcraft test');
    console.log('');
    console.log('Use --help for more information.');
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
}); 