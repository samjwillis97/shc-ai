import { describe, it, expect } from 'vitest';
import type { HttpCraftConfig, ChainDefinition, ChainStep, StepOverrides } from '../../src/types/config.js';

describe('Chain Configuration Types', () => {
  describe('ChainDefinition', () => {
    it('should support minimal chain definition', () => {
      const chain: ChainDefinition = {
        steps: [
          {
            id: 'step1',
            call: 'api.endpoint'
          }
        ]
      };

      expect(chain.steps).toHaveLength(1);
      expect(chain.steps[0].id).toBe('step1');
      expect(chain.steps[0].call).toBe('api.endpoint');
    });

    it('should support chain with description and vars', () => {
      const chain: ChainDefinition = {
        description: 'Test chain',
        vars: {
          userId: 123,
          active: true,
          name: 'test'
        },
        steps: [
          {
            id: 'step1',
            call: 'api.endpoint'
          }
        ]
      };

      expect(chain.description).toBe('Test chain');
      expect(chain.vars).toEqual({
        userId: 123,
        active: true,
        name: 'test'
      });
    });
  });

  describe('ChainStep', () => {
    it('should support minimal step definition', () => {
      const step: ChainStep = {
        id: 'createUser',
        call: 'userApi.createUser'
      };

      expect(step.id).toBe('createUser');
      expect(step.call).toBe('userApi.createUser');
      expect(step.description).toBeUndefined();
      expect(step.with).toBeUndefined();
    });

    it('should support step with description', () => {
      const step: ChainStep = {
        id: 'createUser',
        description: 'Create a new user account',
        call: 'userApi.createUser'
      };

      expect(step.description).toBe('Create a new user account');
    });

    it('should support step with overrides', () => {
      const step: ChainStep = {
        id: 'createUser',
        call: 'userApi.createUser',
        with: {
          headers: {
            'Authorization': 'Bearer {{token}}'
          },
          params: {
            'force': 'true'
          },
          pathParams: {
            'orgId': '{{organizationId}}'
          },
          body: {
            name: '{{username}}',
            email: '{{userEmail}}'
          }
        }
      };

      expect(step.with?.headers).toEqual({
        'Authorization': 'Bearer {{token}}'
      });
      expect(step.with?.params).toEqual({
        'force': 'true'
      });
      expect(step.with?.pathParams).toEqual({
        'orgId': '{{organizationId}}'
      });
      expect(step.with?.body).toEqual({
        name: '{{username}}',
        email: '{{userEmail}}'
      });
    });
  });

  describe('StepOverrides', () => {
    it('should support all override types', () => {
      const overrides: StepOverrides = {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer {{steps.login.response.body.token}}'
        },
        params: {
          'include': 'profile',
          'limit': '10'
        },
        pathParams: {
          'userId': '{{steps.createUser.response.body.id}}',
          'orgId': '{{organizationId}}'
        },
        body: 'string body'
      };

      expect(overrides.headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer {{steps.login.response.body.token}}'
      });
      expect(overrides.params).toEqual({
        'include': 'profile',
        'limit': '10'
      });
      expect(overrides.pathParams).toEqual({
        'userId': '{{steps.createUser.response.body.id}}',
        'orgId': '{{organizationId}}'
      });
      expect(overrides.body).toBe('string body');
    });

    it('should support object body', () => {
      const overrides: StepOverrides = {
        body: {
          name: '{{username}}',
          id: '{{steps.previous.response.body.id}}',
          metadata: {
            source: 'chain'
          }
        }
      };

      expect(overrides.body).toEqual({
        name: '{{username}}',
        id: '{{steps.previous.response.body.id}}',
        metadata: {
          source: 'chain'
        }
      });
    });
  });

  describe('HttpCraftConfig with chains', () => {
    it('should support config with chains section', () => {
      const config: HttpCraftConfig = {
        apis: {
          testApi: {
            baseUrl: 'https://api.test.com',
            endpoints: {
              getUser: {
                method: 'GET',
                path: '/users/{{userId}}'
              }
            }
          }
        },
        chains: {
          testChain: {
            description: 'Test chain workflow',
            vars: {
              defaultUserId: 1
            },
            steps: [
              {
                id: 'getUser',
                call: 'testApi.getUser',
                with: {
                  pathParams: {
                    userId: '{{defaultUserId}}'
                  }
                }
              }
            ]
          }
        }
      };

      expect(config.chains).toBeDefined();
      expect(config.chains!.testChain).toBeDefined();
      expect(config.chains!.testChain.description).toBe('Test chain workflow');
      expect(config.chains!.testChain.steps).toHaveLength(1);
    });

    it('should support config without chains section', () => {
      const config: HttpCraftConfig = {
        apis: {
          testApi: {
            baseUrl: 'https://api.test.com',
            endpoints: {
              getUser: {
                method: 'GET',
                path: '/users/{{userId}}'
              }
            }
          }
        }
      };

      expect(config.chains).toBeUndefined();
    });
  });
}); 