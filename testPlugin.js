export default {
  async setup(context) {
    // Store config for inspection via pre-request hook
    context.registerPreRequestHook(async (request) => {
      request.headers['X-Plugin-Config'] = JSON.stringify(context.config);
    });
  }
}; 