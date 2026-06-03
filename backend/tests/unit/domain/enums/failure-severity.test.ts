import { describe, it, expect } from '@jest/globals';
import {
  FAILURE_SEVERITIES,
  isFailureSeverity,
} from '../../../../src/domain/enums/failure-severity.js';

describe('FAILURE_SEVERITIES', () => {
  it('contains the spec-defined values in order', () => {
    expect(FAILURE_SEVERITIES).toEqual(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
  });
});

describe('isFailureSeverity', () => {
  it.each([...FAILURE_SEVERITIES])('accepts %s', (severity) => {
    expect(isFailureSeverity(severity)).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isFailureSeverity('SEVERE')).toBe(false);
    expect(isFailureSeverity('')).toBe(false);
    expect(isFailureSeverity('low')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isFailureSeverity(null)).toBe(false);
    expect(isFailureSeverity(undefined)).toBe(false);
    expect(isFailureSeverity(0)).toBe(false);
    expect(isFailureSeverity({})).toBe(false);
    expect(isFailureSeverity([])).toBe(false);
  });
});
