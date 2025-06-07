#!/usr/bin/env ts-node

import { TestMigrationHelper } from '../tests/helpers/migrationHelper.js';
import { testEnv } from '../tests/helpers/testSetup.js';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');
  const pattern = args.find(arg => !arg.startsWith('--')) || 'tests/integration/**/*.test.ts';

  console.log('🔄 HttpCraft Test Migration Tool');
  console.log('================================');
  console.log(`Pattern: ${pattern}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'APPLY CHANGES'}`);
  console.log('');

  // Setup test environment (needed for getTestBaseUrl)
  if (testEnv.shouldUseMockServer()) {
    console.log('📡 Starting mock server for migration...');
    await testEnv.setup();
    console.log(`✅ Mock server started at: ${testEnv.getTestBaseUrl()}`);
    console.log('');
  }

  try {
    const { migratedFiles, changes } = await TestMigrationHelper.migrateTestFiles(pattern, dryRun);

    if (changes.length === 0) {
      console.log('✨ No files need migration!');
      return;
    }

    console.log(`📋 Found ${changes.length} files that need migration:`);
    console.log('');

    changes.forEach(({ file, changeCount }) => {
      console.log(`  📄 ${file}`);
      console.log(`     └─ ${changeCount} lines to change`);
    });

    console.log('');

    if (dryRun) {
      console.log('💡 Changes that would be made:');
      console.log('   • Replace https://httpbin.org with mock server URL');
      console.log('   • Update header expectations to lowercase');
      console.log('   • Replace hostname checks with localhost');
      console.log('   • Add testEnv imports where needed');
      console.log('');
      console.log('🚀 Run with --apply to execute changes');
    } else {
      console.log(`✅ Successfully migrated ${migratedFiles.length} files!`);
      console.log('');
      console.log('🎯 Next steps:');
      console.log('   1. Review the changes with git diff');
      console.log('   2. Run the tests to verify they pass');
      console.log('   3. Commit the changes');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    if (testEnv.shouldUseMockServer()) {
      await testEnv.teardown();
    }
  }
}

// Parse command line arguments
function showHelp() {
  console.log(`
HttpCraft Test Migration Tool

USAGE:
  npm run migrate-tests [pattern] [options]

OPTIONS:
  --apply     Apply changes (default is dry-run)
  --help      Show this help message

EXAMPLES:
  npm run migrate-tests                                    # Dry run on all integration tests
  npm run migrate-tests --apply                           # Apply changes to all integration tests
  npm run migrate-tests "tests/integration/phase*.test.ts" # Dry run on specific pattern
  npm run migrate-tests "tests/integration/end-to-end.test.ts" --apply # Apply to specific file

ENVIRONMENT VARIABLES:
  HTTPCRAFT_TEST_SERVER=local    Use mock server (default)
  HTTPCRAFT_TEST_SERVER=remote   Use real httpbin.org (no migration needed)
`);
}

if (process.argv.includes('--help')) {
  showHelp();
  process.exit(0);
}

main().catch(console.error); 