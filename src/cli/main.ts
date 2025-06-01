#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { handleRequestCommand } from './commands/request.js';
import { handleApiCommand } from './commands/api.js';

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
    .help()
    .alias('help', 'h')
    .version('1.0.0')
    .alias('version', 'v')
    .strict(false) // Allow unknown commands for API pattern
    .parse();

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
    });
  } else if (argv._.length === 0) {
    // No command provided, show help
    console.log('Usage: httpcraft <api_name> <endpoint_name> [--config <path>] [--var key=value] [--profile <name>]');
    console.log('       httpcraft request <url>');
    console.log('       httpcraft test');
    console.log('');
    console.log('Use --help for more information.');
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
}); 