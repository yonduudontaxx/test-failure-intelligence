import { describe, it, expect } from '@jest/globals';
import {
  PROJECT_HEALTH_STATUSES,
  isProjectHealthStatus,
} from '../../../../src/domain/enums/project-health-status.js';

describe('PROJECT_HEALTH_STATUSES', () => {
  it('contains the spec-defined values in order', () => {
    expect(PROJECT_HEALTH_STATUSES).toEqual(['HEALTHY', 'WARNING', 'CRITICAL']);
  });
});

describe('isProjectHealthStatus', () => {
  it.each([...PROJECT_HEALTH_STATUSES])('accepts %s', (status) => {
    expect(isProjectHealthStatus(status)).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isProjectHealthStatus('UNHEALTHY')).toBe(false);
    expect(isProjectHealthStatus('')).toBe(false);
    expect(isProjectHealthStatus('healthy')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isProjectHealthStatus(null)).toBe(false);
    expect(isProjectHealthStatus(undefined)).toBe(false);
    expect(isProjectHealthStatus(0)).toBe(false);
    expect(isProjectHealthStatus({})).toBe(false);
    expect(isProjectHealthStatus([])).toBe(false);
  });
});
