/**
 * T18.7: Unit tests for optional parameter syntax ({{variable?}})
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VariableResolver, VariableResolutionError } from '../../src/core/variableResolver.js';
import type { VariableContext } from '../../src/core/variableResolver.js';

describe('VariableResolver - Optional Parameter Syntax', () => {
  let resolver: VariableResolver;
  let context: VariableContext;

  beforeEach(() => {
    resolver = new VariableResolver();
    context = {
      cliVariables: {
        definedVar: 'definedValue',
        pageSize: '25',
      },
      profiles: {},
      env: {
        DEFINED_ENV: 'envValue',
      },
    };
  });

  describe('extractVariableMatches with optional syntax', () => {
    it('should detect optional variables with ? suffix', () => {
      const template = '{{optionalVar?}}';
      const matches = (resolver as any).extractVariableMatches(template);

      expect(matches).toHaveLength(1);
      expect(matches[0]).toEqual({
        fullMatch: '{{optionalVar?}}',
        content: 'optionalVar',
        isOptional: true,
      });
    });

    it('should detect regular variables without ? suffix', () => {
      const template = '{{regularVar}}';
      const matches = (resolver as any).extractVariableMatches(template);

      expect(matches).toHaveLength(1);
      expect(matches[0]).toEqual({
        fullMatch: '{{regularVar}}',
        content: 'regularVar',
        isOptional: false,
      });
    });

    it('should handle mixed optional and regular variables', () => {
      const template = '{{regularVar}} and {{optionalVar?}}';
      const matches = (resolver as any).extractVariableMatches(template);

      expect(matches).toHaveLength(2);
      expect(matches[0]).toEqual({
        fullMatch: '{{regularVar}}',
        content: 'regularVar',
        isOptional: false,
      });
      expect(matches[1]).toEqual({
        fullMatch: '{{optionalVar?}}',
        content: 'optionalVar',
        isOptional: true,
      });
    });

    it('should handle optional scoped variables', () => {
      const template = '{{env.OPTIONAL_VAR?}}';
      const matches = (resolver as any).extractVariableMatches(template);

      expect(matches).toHaveLength(1);
      expect(matches[0]).toEqual({
        fullMatch: '{{env.OPTIONAL_VAR?}}',
        content: 'env.OPTIONAL_VAR',
        isOptional: true,
      });
    });

    it('should handle whitespace around optional syntax', () => {
      const template = '{{ optionalVar? }}';
      const matches = (resolver as any).extractVariableMatches(template);

      expect(matches).toHaveLength(1);
      expect(matches[0]).toEqual({
        fullMatch: '{{ optionalVar? }}',
        content: 'optionalVar',
        isOptional: true,
      });
    });
  });

  describe('resolveWithOptionalInfo', () => {
    it('should resolve defined variables normally', async () => {
      const template = 'value={{definedVar?}}';
      const result = await resolver.resolveWithOptionalInfo(template, context);

      expect(result.resolved).toBe('value=definedValue');
      expect(result.optionalParameters.get('{{definedVar?}}')).toBe(true);
    });

    it('should mark undefined optional variables as should not include', async () => {
      const template = 'value={{undefinedVar?}}';
      const result = await resolver.resolveWithOptionalInfo(template, context);

      expect(result.resolved).toBe('value=');
      expect(result.optionalParameters.get('{{undefinedVar?}}')).toBe(false);
    });

    it('should throw error for undefined regular variables', async () => {
      const template = 'value={{undefinedVar}}';

      await expect(resolver.resolveWithOptionalInfo(template, context)).rejects.toThrow(
        VariableResolutionError
      );
    });

    it('should handle mixed optional and regular variables', async () => {
      const template = 'defined={{definedVar}} optional={{undefinedVar?}}';
      const result = await resolver.resolveWithOptionalInfo(template, context);

      expect(result.resolved).toBe('defined=definedValue optional=');
      expect(result.optionalParameters.get('{{definedVar}}')).toBe(true);
      expect(result.optionalParameters.get('{{undefinedVar?}}')).toBe(false);
    });

    it('should handle optional scoped variables that exist', async () => {
      const template = 'env={{env.DEFINED_ENV?}}';
      const result = await resolver.resolveWithOptionalInfo(template, context);

      expect(result.resolved).toBe('env=envValue');
      expect(result.optionalParameters.get('{{env.DEFINED_ENV?}}')).toBe(true);
    });

    it('should handle optional scoped variables that do not exist', async () => {
      const template = 'env={{env.UNDEFINED_ENV?}}';
      const result = await resolver.resolveWithOptionalInfo(template, context);

      expect(result.resolved).toBe('env=');
      expect(result.optionalParameters.get('{{env.UNDEFINED_ENV?}}')).toBe(false);
    });
  });

  describe('resolveValueWithOptionalHandling', () => {
    it('should include parameters with defined optional variables', async () => {
      const value = {
        pageSize: '{{pageSize?}}',
        status: 'active',
      };

      const result = await resolver.resolveValueWithOptionalHandling(value, context);

      expect(result.resolved).toEqual({
        pageSize: '25',
        status: 'active',
      });
      expect(result.excludedKeys).toEqual([]);
    });

    it('should exclude parameters with undefined optional variables', async () => {
      const value = {
        pageKey: '{{undefinedPageKey?}}',
        status: 'active',
      };

      const result = await resolver.resolveValueWithOptionalHandling(value, context);

      expect(result.resolved).toEqual({
        status: 'active',
      });
      expect(result.excludedKeys).toEqual(['pageKey']);
    });

    it('should handle mixed optional and regular parameters', async () => {
      const value = {
        definedParam: '{{definedVar}}',
        optionalParam: '{{undefinedVar?}}',
        staticParam: 'static',
      };

      const result = await resolver.resolveValueWithOptionalHandling(value, context);

      expect(result.resolved).toEqual({
        definedParam: 'definedValue',
        staticParam: 'static',
      });
      expect(result.excludedKeys).toEqual(['optionalParam']);
    });

    it('should handle nested objects with optional variables', async () => {
      const value = {
        outer: {
          inner: '{{undefinedVar?}}',
        },
        normal: 'value',
      };

      const result = await resolver.resolveValueWithOptionalHandling(value, context);

      expect(result.resolved).toEqual({
        outer: {},
        normal: 'value',
      });
      expect(result.excludedKeys).toEqual(['inner']);
    });

    it('should handle arrays with optional variables', async () => {
      const value = ['{{definedVar}}', '{{undefinedVar?}}', 'static'];

      const result = await resolver.resolveValueWithOptionalHandling(value, context);

      expect(result.resolved).toEqual(['definedValue', '', 'static']);
      expect(result.excludedKeys).toEqual([]);
    });
  });

  describe('backward compatibility', () => {
    it('should maintain existing behavior for regular variables', async () => {
      const template = 'value={{definedVar}}';
      const result = await resolver.resolve(template, context);

      expect(result).toBe('value=definedValue');
    });

    it('should throw errors for undefined regular variables', async () => {
      const template = 'value={{undefinedVar}}';

      await expect(resolver.resolve(template, context)).rejects.toThrow(VariableResolutionError);
    });
  });

  describe('edge cases', () => {
    it('should handle empty optional variable name', async () => {
      const template = '{{?}}';

      await expect(resolver.resolveWithOptionalInfo(template, context)).rejects.toThrow(
        VariableResolutionError
      );
    });

    it('should handle whitespace-only optional variable name', async () => {
      const template = '{{  ?}}';

      await expect(resolver.resolveWithOptionalInfo(template, context)).rejects.toThrow(
        VariableResolutionError
      );
    });

    it('should handle multiple question marks', async () => {
      const template = '{{var??}}';
      const matches = (resolver as any).extractVariableMatches(template);

      expect(matches[0]).toEqual({
        fullMatch: '{{var??}}',
        content: 'var?',
        isOptional: true,
      });
    });
  });
});
