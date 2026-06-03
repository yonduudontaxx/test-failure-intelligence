import { describe, it, expect } from '@jest/globals';
import { SOURCE_TYPES, isSourceType } from '../../../../src/domain/enums/source-type.js';

describe('SOURCE_TYPES', () => {
  it('contains the spec-defined values in order', () => {
    expect(SOURCE_TYPES).toEqual(['api', 'junit_xml', 'playwright', 'jest', 'json']);
  });
});

describe('isSourceType', () => {
  it.each([...SOURCE_TYPES])('accepts %s', (source) => {
    expect(isSourceType(source)).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isSourceType('xml')).toBe(false);
    expect(isSourceType('')).toBe(false);
    expect(isSourceType('API')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isSourceType(null)).toBe(false);
    expect(isSourceType(undefined)).toBe(false);
    expect(isSourceType(0)).toBe(false);
    expect(isSourceType({})).toBe(false);
    expect(isSourceType([])).toBe(false);
  });
});
