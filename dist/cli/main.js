#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
yargs(hideBin(process.argv))
    .scriptName('httpcraft')
    .usage('$0 <cmd> [args]')
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
//# sourceMappingURL=main.js.map