import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';

describe('YAML Parsing', () => {
  it('should parse a simple YAML string', () => {
    const yamlString = `
      name: "HttpCraft"
      version: 1.0
      active: true
    `;
    
    const parsed = yaml.load(yamlString) as any;
    
    expect(parsed.name).toBe('HttpCraft');
    expect(parsed.version).toBe(1.0);
    expect(parsed.active).toBe(true);
  });

  it('should parse a YAML file structure similar to our config', () => {
    const yamlString = `
      apis:
        testapi:
          baseUrl: "https://api.example.com"
          endpoints:
            getUser:
              method: GET
              path: "/users/1"
    `;
    
    const parsed = yaml.load(yamlString) as any;
    
    expect(parsed.apis.testapi.baseUrl).toBe('https://api.example.com');
    expect(parsed.apis.testapi.endpoints.getUser.method).toBe('GET');
    expect(parsed.apis.testapi.endpoints.getUser.path).toBe('/users/1');
  });
}); 