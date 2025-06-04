import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import type { HttpCraftConfig } from '../../src/types/config.js';

describe('Config Types', () => {
  it('should parse basic config structure with correct types', () => {
    const yamlString = `
      apis:
        jsonplaceholder:
          baseUrl: "https://jsonplaceholder.typicode.com"
          endpoints:
            getTodo:
              method: GET
              path: "/todos/1"
              description: "Fetches a single todo item."
            createPost:
              method: POST
              path: "/posts"
              headers:
                Content-Type: "application/json; charset=UTF-8"
              body:
                title: "Default Title"
                body: "Default body content."
                userId: 1
    `;
    
    const parsed = yaml.load(yamlString) as HttpCraftConfig;
    
    // Verify structure matches our types
    expect(parsed.apis).toBeDefined();
    expect(parsed.apis.jsonplaceholder).toBeDefined();
    expect(parsed.apis.jsonplaceholder.baseUrl).toBe('https://jsonplaceholder.typicode.com');
    expect(parsed.apis.jsonplaceholder.endpoints).toBeDefined();
    
    const getTodo = parsed.apis.jsonplaceholder.endpoints.getTodo;
    expect(getTodo.method).toBe('GET');
    expect(getTodo.path).toBe('/todos/1');
    expect(getTodo.description).toBe('Fetches a single todo item.');
    
    const createPost = parsed.apis.jsonplaceholder.endpoints.createPost;
    expect(createPost.method).toBe('POST');
    expect(createPost.path).toBe('/posts');
    expect(createPost.headers).toEqual({
      'Content-Type': 'application/json; charset=UTF-8'
    });
    expect(createPost.body).toEqual({
      title: 'Default Title',
      body: 'Default body content.',
      userId: 1
    });
  });
}); 