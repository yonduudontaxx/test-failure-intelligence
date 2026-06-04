import { describe, it, expect } from '@jest/globals';
import {
  TEST_CASE_STATUSES,
  isTestCaseStatus,
} from '../../../../src/domain/enums/test-case-status.js';

describe('TEST_CASE_STATUSES', () => {
  it('contains the spec-defined values in order', () => {
    expect(TEST_CASE_STATUSES).toEqual(['PASSED', 'FAILED', 'SKIPPED', 'ERROR']);
  });
});

describe('isTestCaseStatus', () => {
  it.each([...TEST_CASE_STATUSES])('accepts %s', (status) => {
    expect(isTestCaseStatus(status)).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isTestCaseStatus('OK')).toBe(false);
    expect(isTestCaseStatus('')).toBe(false);
    expect(isTestCaseStatus('passed')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isTestCaseStatus(null)).toBe(false);
    expect(isTestCaseStatus(undefined)).toBe(false);
    expect(isTestCaseStatus(0)).toBe(false);
    expect(isTestCaseStatus({})).toBe(false);
    expect(isTestCaseStatus([])).toBe(false);
  });
});
