import { beforeAll, afterAll } from 'vitest';
import { testEnv } from './helpers/testSetup.js';

beforeAll(async () => {
  // Global test setup
  // This runs once before all tests across all test files
  console.log('🧪 Starting HttpCraft test suite...');

  // Only setup mock server if we're using local testing
  if (testEnv.shouldUseMockServer()) {
    await testEnv.setup();
  }
}, 30000); // Increase timeout for server startup

afterAll(async () => {
  // Global test cleanup
  // This runs once after all tests across all test files
  console.log('✅ HttpCraft test suite completed');

  if (testEnv.shouldUseMockServer()) {
    await testEnv.teardown();
  }
}, 30000); // Increase timeout for server shutdown 