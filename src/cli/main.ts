#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { handleRequestCommand } from './commands/request.js';

yargs(hideBin(process.argv))
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
  .help()
  .alias('help', 'h')
  .version('1.0.0')
  .alias('version', 'v')
  .demandCommand(1, 'You need at least one command before moving on')
  .strict()
  .parse(); 