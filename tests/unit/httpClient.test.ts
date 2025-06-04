import { describe, it, expect } from 'vitest';
import { httpClient } from '../../src/core/httpClient.js';

describe('HttpClient', () => {
  it('should make a successful GET request', async () => {
    // Using a reliable public API for testing
    const response = await httpClient.executeRequest({
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/todos/1'
    });
    
    expect(response.status).toBe(200);
    expect(response.body).toContain('userId');
    expect(response.headers).toBeDefined();
    expect(response.statusText).toBeDefined();
  });

  it('should handle 404 errors without throwing', async () => {
    const response = await httpClient.executeRequest({
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/nonexistent'
    });
    
    expect(response.status).toBe(404);
  });

  it('should throw on network errors', async () => {
    await expect(
      httpClient.executeRequest({
        method: 'GET',
        url: 'https://nonexistent-domain-12345.com'
      })
    ).rejects.toThrow(/Network error/);
  });
}); 