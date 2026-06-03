import { describe, it, expect } from '@jest/globals';
import {
  TEST_RUN_STATUSES,
  isTestRunStatus,
} from '../../../../src/domain/enums/test-run-status.js';

describe('TEST_RUN_STATUSES', () => {
  it('contains the spec-defined values in order', () => {
    expect(TEST_RUN_STATUSES).toEqual(['SUCCESS', 'FAILED', 'PARTIAL']);
  });
});

describe('isTestRunStatus', () => {
  it.each([...TEST_RUN_STATUSES])('accepts %s', (status) => {
    expect(isTestRunStatus(status)).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isTestRunStatus('OK')).toBe(false);
    expect(isTestRunStatus('')).toBe(false);
    expect(isTestRunStatus('success')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isTestRunStatus(null)).toBe(false);
    expect(isTestRunStatus(undefined)).toBe(false);
    expect(isTestRunStatus(0)).toBe(false);
    expect(isTestRunStatus({})).toBe(false);
    expect(isTestRunStatus([])).toBe(false);
  });
});
