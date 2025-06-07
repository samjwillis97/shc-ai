import { testEnv } from './helpers/testSetup.js';

beforeAll(async () => {
  // Only setup mock server if we're using local testing
  if (testEnv.shouldUseMockServer()) {
    await testEnv.setup();
  }
}, 30000); // Increase timeout for server startup

afterAll(async () => {
  if (testEnv.shouldUseMockServer()) {
    await testEnv.teardown();
  }
}, 30000); // Increase timeout for server shutdown 