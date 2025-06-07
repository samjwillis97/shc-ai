import { describe, it, expect, beforeAll } from 'vitest';
import Ajv, { type JSONSchemaType } from 'ajv';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

describe('HttpCraft Configuration Schema Validation', () => {
  let ajv: Ajv;
  let schema: any;

  beforeAll(async () => {
    // Load the schema
    const schemaPath = path.join(process.cwd(), 'schemas', 'httpcraft-config.schema.json');
    const schemaContent = await fs.readFile(schemaPath, 'utf-8');
    schema = JSON.parse(schemaContent);
    
    ajv = new Ajv({ allErrors: true });
  });

  describe('Valid Configurations', () => {
    it('should validate minimal valid configuration', () => {
      const config = {
        apis: {
          testApi: {
            baseUrl: 'https://api.example.com',
            endpoints: {
              getUser: {
                method: 'GET',
                path: '/users/1'
              }
            }
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      if (!valid) {
        console.log('Validation errors:', validate.errors);
      }
      
      expect(valid).toBe(true);
    });

    it('should validate comprehensive configuration', () => {
      const config = {
        config: {
          defaultProfile: 'dev'
        },
        profiles: {
          dev: {
            apiKey: 'dev-key',
            baseUrl: 'https://dev.api.com'
          },
          prod: {
            apiKey: 'prod-key',
            baseUrl: 'https://api.com'
          }
        },
        secrets: {
          provider: 'env'
        },
        plugins: [
          {
            name: 'testPlugin',
            path: './plugins/test.js',
            config: {
              setting: 'value'
            }
          }
        ],
        variables: ['./vars/global.yaml'],
        apis: {
          userApi: {
            description: 'User management API',
            baseUrl: 'https://api.example.com',
            headers: {
              'User-Agent': 'HttpCraft/1.0',
              'Authorization': 'Bearer {{apiKey}}'
            },
            params: {
              version: 'v1'
            },
            variables: {
              timeout: 5000
            },
            endpoints: {
              getUser: {
                description: 'Get user by ID',
                method: 'GET',
                path: '/users/{{userId}}',
                variables: {
                  userId: 1
                }
              },
              createUser: {
                method: 'POST',
                path: '/users',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: {
                  name: '{{userName}}',
                  email: '{{userEmail}}'
                }
              }
            }
          }
        },
        chains: {
          userWorkflow: {
            description: 'Create and fetch user',
            vars: {
              userName: 'Test User'
            },
            steps: [
              {
                id: 'createUser',
                description: 'Create a new user',
                call: 'userApi.createUser',
                with: {
                  body: {
                    name: '{{userName}}'
                  }
                }
              },
              {
                id: 'getUser',
                call: 'userApi.getUser',
                with: {
                  pathParams: {
                    userId: '{{steps.createUser.response.body.id}}'
                  }
                }
              }
            ]
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      if (!valid) {
        console.log('Validation errors:', validate.errors);
      }
      
      expect(valid).toBe(true);
    });

    it('should validate configuration with modular imports', () => {
      const config = {
        profiles: ['./profiles/'],
        apis: ['directory:./apis/', './additional-api.yaml'],
        chains: ['directory:./chains/']
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      if (!valid) {
        console.log('Validation errors:', validate.errors);
      }
      
      expect(valid).toBe(true);
    });

    it('should validate all HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
      
      methods.forEach(method => {
        const config = {
          apis: {
            testApi: {
              baseUrl: 'https://api.example.com',
              endpoints: {
                testEndpoint: {
                  method,
                  path: '/test'
                }
              }
            }
          }
        };

        const validate = ajv.compile(schema);
        const valid = validate(config);
        
        expect(valid).toBe(true);
      });
    });

    it('should validate different body types', () => {
      const bodyTypes = [
        'string body',
        { object: 'body', nested: { value: 123 } },
        ['array', 'body'],
        123,
        true,
        null
      ];

      bodyTypes.forEach(body => {
        const config = {
          apis: {
            testApi: {
              baseUrl: 'https://api.example.com',
              endpoints: {
                testEndpoint: {
                  method: 'POST',
                  path: '/test',
                  body
                }
              }
            }
          }
        };

        const validate = ajv.compile(schema);
        const valid = validate(config);
        
        if (!valid) {
          console.log('Body type validation error for:', body, validate.errors);
        }
        
        expect(valid).toBe(true);
      });
    });

    it('should validate API-level plugin configuration', () => {
      const config = {
        plugins: [
          {
            name: 'testPlugin',
            path: './plugins/test.js',
            config: {
              globalKey: 'globalValue'
            }
          }
        ],
        apis: {
          testApi: {
            baseUrl: 'https://api.example.com',
            plugins: [
              {
                name: 'testPlugin',
                config: {
                  apiKey: '{{testVar}}',
                  nested: {
                    value: 'nested-value'
                  }
                }
              }
            ],
            endpoints: {
              test: {
                method: 'GET',
                path: '/test'
              }
            }
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      if (!valid) {
        console.log('API-level plugin validation errors:', validate.errors);
      }
      
      expect(valid).toBe(true);
    });

    it('should validate API without plugins (plugins is optional)', () => {
      const config = {
        apis: {
          testApi: {
            baseUrl: 'https://api.example.com',
            endpoints: {
              test: {
                method: 'GET',
                path: '/test'
              }
            }
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      expect(valid).toBe(true);
    });

    it('should validate empty API-level plugins array', () => {
      const config = {
        apis: {
          testApi: {
            baseUrl: 'https://api.example.com',
            plugins: [],
            endpoints: {
              test: {
                method: 'GET',
                path: '/test'
              }
            }
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      expect(valid).toBe(true);
    });

    it('should accept plugin with npmPackage (T10.7)', () => {
      const config = {
        plugins: [
          {
            name: 'npmPlugin',
            npmPackage: 'httpcraft-auth-plugin',
            config: {
              apiKey: 'test-key'
            }
          }
        ],
        apis: {
          testApi: {
            baseUrl: 'https://api.example.com',
            endpoints: {
              test: {
                method: 'GET',
                path: '/test'
              }
            }
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      if (!valid) {
        console.log('npm package plugin validation errors:', validate.errors);
      }
      
      expect(valid).toBe(true);
    });

    it('should reject plugin with both path and npmPackage (T10.7)', () => {
      const config = {
        plugins: [
          {
            name: 'invalidPlugin',
            path: './plugins/test.js',
            npmPackage: 'httpcraft-auth-plugin'
          }
        ],
        apis: {
          testApi: {
            baseUrl: 'https://api.example.com',
            endpoints: {
              test: {
                method: 'GET',
                path: '/test'
              }
            }
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      expect(valid).toBe(false);
      expect(validate.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'oneOf'
          })
        ])
      );
    });

    it('should validate npm-plugin-example.yaml (T10.7)', async () => {
      const examplePath = path.join(process.cwd(), 'examples', 'features', 'plugins', 'npm_plugin.yaml');
      
      try {
        const exampleContent = await fs.readFile(examplePath, 'utf-8');
        const exampleConfig = yaml.load(exampleContent);

        const validate = ajv.compile(schema);
        const valid = validate(exampleConfig);
        
        if (!valid) {
          console.log('npm plugin example validation errors:', validate.errors);
        }
        
        expect(valid).toBe(true);
      } catch (error) {
        // If file doesn't exist, skip this test
        if ((error as any).code === 'ENOENT') {
          console.warn('npm plugin example file not found, skipping validation test');
        } else {
          throw error;
        }
      }
    });
  });

  describe('Invalid Configurations', () => {
    it('should reject configuration without apis', () => {
      const config = {
        config: {
          defaultProfile: 'dev'
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      expect(valid).toBe(false);
      expect(validate.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'required',
            params: { missingProperty: 'apis' }
          })
        ])
      );
    });

    it('should reject API without baseUrl', () => {
      const config = {
        apis: {
          invalidApi: {
            endpoints: {
              test: {
                method: 'GET',
                path: '/test'
              }
            }
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      expect(valid).toBe(false);
      expect(validate.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'required',
            params: { missingProperty: 'baseUrl' }
          })
        ])
      );
    });

    it('should reject API without endpoints', () => {
      const config = {
        apis: {
          invalidApi: {
            baseUrl: 'https://api.example.com'
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      expect(valid).toBe(false);
      expect(validate.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'required',
            params: { missingProperty: 'endpoints' }
          })
        ])
      );
    });

    it('should reject endpoint without method', () => {
      const config = {
        apis: {
          testApi: {
            baseUrl: 'https://api.example.com',
            endpoints: {
              invalidEndpoint: {
                path: '/test'
              }
            }
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      expect(valid).toBe(false);
      expect(validate.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'required',
            params: { missingProperty: 'method' }
          })
        ])
      );
    });

    it('should reject endpoint without path', () => {
      const config = {
        apis: {
          testApi: {
            baseUrl: 'https://api.example.com',
            endpoints: {
              invalidEndpoint: {
                method: 'GET'
              }
            }
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      expect(valid).toBe(false);
      expect(validate.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'required',
            params: { missingProperty: 'path' }
          })
        ])
      );
    });

    it('should reject invalid HTTP method', () => {
      const config = {
        apis: {
          testApi: {
            baseUrl: 'https://api.example.com',
            endpoints: {
              invalidEndpoint: {
                method: 'INVALID',
                path: '/test'
              }
            }
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      expect(valid).toBe(false);
      expect(validate.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'enum'
          })
        ])
      );
    });

    it('should reject invalid baseUrl format', () => {
      const config = {
        apis: {
          testApi: {
            baseUrl: 'invalid-url',
            endpoints: {
              test: {
                method: 'GET',
                path: '/test'
              }
            }
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      expect(valid).toBe(false);
      expect(validate.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'pattern'
          })
        ])
      );
    });

    it('should reject path not starting with /', () => {
      const config = {
        apis: {
          testApi: {
            baseUrl: 'https://api.example.com',
            endpoints: {
              invalidEndpoint: {
                method: 'GET',
                path: 'invalid-path'
              }
            }
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      expect(valid).toBe(false);
      expect(validate.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'pattern'
          })
        ])
      );
    });

    it('should reject chain step without id', () => {
      const config = {
        apis: {
          testApi: {
            baseUrl: 'https://api.example.com',
            endpoints: {
              test: {
                method: 'GET',
                path: '/test'
              }
            }
          }
        },
        chains: {
          testChain: {
            steps: [
              {
                call: 'testApi.test'
              }
            ]
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      expect(valid).toBe(false);
      expect(validate.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'required',
            params: { missingProperty: 'id' }
          })
        ])
      );
    });

    it('should reject chain step without call', () => {
      const config = {
        apis: {
          testApi: {
            baseUrl: 'https://api.example.com',
            endpoints: {
              test: {
                method: 'GET',
                path: '/test'
              }
            }
          }
        },
        chains: {
          testChain: {
            steps: [
              {
                id: 'step1'
              }
            ]
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      expect(valid).toBe(false);
      expect(validate.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'required',
            params: { missingProperty: 'call' }
          })
        ])
      );
    });

    it('should reject invalid step call format', () => {
      const config = {
        apis: {
          testApi: {
            baseUrl: 'https://api.example.com',
            endpoints: {
              test: {
                method: 'GET',
                path: '/test'
              }
            }
          }
        },
        chains: {
          testChain: {
            steps: [
              {
                id: 'step1',
                call: 'invalid-call-format'
              }
            ]
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      expect(valid).toBe(false);
      expect(validate.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'pattern'
          })
        ])
      );
    });

    it('should reject plugin without name', () => {
      const config = {
        plugins: [
          {
            path: './plugin.js'
          }
        ],
        apis: {
          testApi: {
            baseUrl: 'https://api.example.com',
            endpoints: {
              test: {
                method: 'GET',
                path: '/test'
              }
            }
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      expect(valid).toBe(false);
      expect(validate.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'required',
            params: { missingProperty: 'name' }
          })
        ])
      );
    });

    it('should reject plugin without path or npmPackage', () => {
      const config = {
        plugins: [
          {
            name: 'testPlugin'
          }
        ],
        apis: {
          testApi: {
            baseUrl: 'https://api.example.com',
            endpoints: {
              test: {
                method: 'GET',
                path: '/test'
              }
            }
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      expect(valid).toBe(false);
      expect(validate.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'oneOf'
          })
        ])
      );
    });

    it('should reject API-level plugin without name', () => {
      const config = {
        plugins: [
          {
            name: 'testPlugin',
            path: './plugins/test.js'
          }
        ],
        apis: {
          testApi: {
            baseUrl: 'https://api.example.com',
            plugins: [
              {
                config: {
                  apiKey: 'value'
                }
              }
            ],
            endpoints: {
              test: {
                method: 'GET',
                path: '/test'
              }
            }
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      expect(valid).toBe(false);
      expect(validate.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'required',
            params: { missingProperty: 'name' }
          })
        ])
      );
    });

    it('should reject API-level plugin with additional properties', () => {
      const config = {
        plugins: [
          {
            name: 'testPlugin',
            path: './plugins/test.js'
          }
        ],
        apis: {
          testApi: {
            baseUrl: 'https://api.example.com',
            plugins: [
              {
                name: 'testPlugin',
                path: './invalid/path.js', // API-level plugins shouldn't have path
                config: {
                  apiKey: 'value'
                }
              }
            ],
            endpoints: {
              test: {
                method: 'GET',
                path: '/test'
              }
            }
          }
        }
      };

      const validate = ajv.compile(schema);
      const valid = validate(config);
      
      expect(valid).toBe(false);
      expect(validate.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'additionalProperties'
          })
        ])
      );
    });
  });

  describe('Example File Validation', () => {
    it('should validate comprehensive example configuration', async () => {
      const examplePath = path.join(process.cwd(), 'examples', 'comprehensive_example.yaml');
      
      try {
        const exampleContent = await fs.readFile(examplePath, 'utf-8');
        const exampleConfig = yaml.load(exampleContent);

        const validate = ajv.compile(schema);
        const valid = validate(exampleConfig);
        
        if (!valid) {
          console.log('Comprehensive example validation errors:', validate.errors);
        }
        
        expect(valid).toBe(true);
      } catch (error) {
        // If file doesn't exist, skip this test
        if ((error as any).code === 'ENOENT') {
          console.warn('Comprehensive example file not found, skipping validation test');
        } else {
          throw error;
        }
      }
    });

    it('should validate basic example configuration', async () => {
      const examplePath = path.join(process.cwd(), 'examples', '01_basic_config.yaml');
      
      try {
        const exampleContent = await fs.readFile(examplePath, 'utf-8');
        const exampleConfig = yaml.load(exampleContent);

        const validate = ajv.compile(schema);
        const valid = validate(exampleConfig);
        
        if (!valid) {
          console.log('Basic example validation errors:', validate.errors);
        }
        
        expect(valid).toBe(true);
      } catch (error) {
        // If file doesn't exist, skip this test
        if ((error as any).code === 'ENOENT') {
          console.warn('Basic example file not found, skipping validation test');
        } else {
          throw error;
        }
      }
    });
  });
}); 