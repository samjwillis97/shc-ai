import { describe, it, expect } from 'vitest';
import { HttpClient } from '../../src/core/httpClient.js';

describe('HttpClient', () => {
  const httpClient = new HttpClient();

  it('should make a successful GET request', async () => {
    // Using a reliable public API for testing
    const response = await httpClient.makeRequest('https://jsonplaceholder.typicode.com/todos/1');
    
    expect(response.status).toBe(200);
    expect(response.method).toBe('GET');
    expect(response.body).toContain('userId');
    expect(response.url).toContain('jsonplaceholder.typicode.com');
  });

  it('should handle 404 errors without throwing', async () => {
    const response = await httpClient.makeRequest('https://jsonplaceholder.typicode.com/nonexistent');
    
    expect(response.status).toBe(404);
    expect(response.method).toBe('GET');
  });

  it('should throw on network errors', async () => {
    await expect(
      httpClient.makeRequest('https://nonexistent-domain-12345.com')
    ).rejects.toMatchObject({
      isNetworkError: true,
      message: expect.stringContaining('Network error')
    });
  });
}); 