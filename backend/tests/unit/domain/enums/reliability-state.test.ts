import { describe, it, expect } from '@jest/globals';
import {
  RELIABILITY_STATES,
  isReliabilityState,
} from '../../../../src/domain/enums/reliability-state.js';

describe('RELIABILITY_STATES', () => {
  it('contains the spec-defined values in order', () => {
    expect(RELIABILITY_STATES).toEqual(['STABLE', 'FLAKY', 'BROKEN']);
  });
});

describe('isReliabilityState', () => {
  it.each([...RELIABILITY_STATES])('accepts %s', (state) => {
    expect(isReliabilityState(state)).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isReliabilityState('UNKNOWN')).toBe(false);
    expect(isReliabilityState('')).toBe(false);
    expect(isReliabilityState('stable')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isReliabilityState(null)).toBe(false);
    expect(isReliabilityState(undefined)).toBe(false);
    expect(isReliabilityState(0)).toBe(false);
    expect(isReliabilityState({})).toBe(false);
    expect(isReliabilityState([])).toBe(false);
  });
});
