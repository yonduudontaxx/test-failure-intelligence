import { describe, it, expect } from '@jest/globals';
import {
  detectIssues,
  type IssueDetectorInput,
} from '../../../../src/domain/services/issue-detector.js';

const HEALTHY: IssueDetectorInput = {
  totalRuns: 100,
  recentFailureRate: 0,
  brokenTestCount: 0,
  flakyTestCount: 0,
  patterns: [],
};

function input(overrides: Partial<IssueDetectorInput> = {}): IssueDetectorInput {
  return { ...HEALTHY, ...overrides };
}

describe('detectIssues', () => {
  it('returns empty arrays for a healthy input with no patterns', () => {
    expect(detectIssues(HEALTHY)).toEqual({ warnings: [], criticalIssues: [] });
  });

  it('returns empty arrays when totalRuns is 0 even with high inputs', () => {
    const result = detectIssues(
      input({
        totalRuns: 0,
        recentFailureRate: 0.9,
        brokenTestCount: 50,
        flakyTestCount: 50,
        patterns: [
          { severity: 'CRITICAL', occurrenceCount: 100 },
          { severity: 'HIGH', occurrenceCount: 50 },
        ],
      }),
    );
    expect(result).toEqual({ warnings: [], criticalIssues: [] });
  });

  describe('BROKEN_TESTS_PRESENT / BROKEN_TESTS_THRESHOLD', () => {
    it('emits BROKEN_TESTS_PRESENT only when brokenTestCount=1', () => {
      const result = detectIssues(input({ brokenTestCount: 1 }));
      expect(result.warnings.map((w) => w.code)).toEqual(['BROKEN_TESTS_PRESENT']);
      expect(result.criticalIssues).toEqual([]);
    });

    it('emits BROKEN_TESTS_PRESENT only when brokenTestCount=2', () => {
      const result = detectIssues(input({ brokenTestCount: 2 }));
      expect(result.warnings.map((w) => w.code)).toEqual(['BROKEN_TESTS_PRESENT']);
      expect(result.criticalIssues).toEqual([]);
    });

    it('emits BOTH BROKEN_TESTS_PRESENT and BROKEN_TESTS_THRESHOLD at brokenTestCount=3', () => {
      const result = detectIssues(input({ brokenTestCount: 3 }));
      expect(result.warnings.map((w) => w.code)).toEqual(['BROKEN_TESTS_PRESENT']);
      expect(result.criticalIssues.map((c) => c.code)).toEqual(['BROKEN_TESTS_THRESHOLD']);
    });

    it('does not emit when brokenTestCount=0', () => {
      const result = detectIssues(input({ brokenTestCount: 0 }));
      expect(result).toEqual({ warnings: [], criticalIssues: [] });
    });
  });

  describe('PASS_RATE_LOW / PASS_RATE_CRITICAL', () => {
    it('emits PASS_RATE_LOW only at recentFailureRate=0.06', () => {
      const result = detectIssues(input({ recentFailureRate: 0.06 }));
      expect(result.warnings.map((w) => w.code)).toEqual(['PASS_RATE_LOW']);
      expect(result.criticalIssues).toEqual([]);
    });

    it('emits BOTH PASS_RATE_LOW and PASS_RATE_CRITICAL at recentFailureRate=0.25', () => {
      const result = detectIssues(input({ recentFailureRate: 0.25 }));
      expect(result.warnings.map((w) => w.code)).toEqual(['PASS_RATE_LOW']);
      expect(result.criticalIssues.map((c) => c.code)).toEqual(['PASS_RATE_CRITICAL']);
    });

    it('does not emit at recentFailureRate=0.05 (boundary; > 0.05 required)', () => {
      const result = detectIssues(input({ recentFailureRate: 0.05 }));
      expect(result).toEqual({ warnings: [], criticalIssues: [] });
    });

    it('does not emit PASS_RATE_CRITICAL at recentFailureRate=0.20 (boundary; > 0.20 required)', () => {
      const result = detectIssues(input({ recentFailureRate: 0.2 }));
      expect(result.warnings.map((w) => w.code)).toEqual(['PASS_RATE_LOW']);
      expect(result.criticalIssues).toEqual([]);
    });
  });

  describe('FLAKY_TESTS_MODERATE / FLAKY_TESTS_HIGH', () => {
    it('emits FLAKY_TESTS_MODERATE only at flakyTestCount=6', () => {
      const result = detectIssues(input({ flakyTestCount: 6 }));
      expect(result.warnings.map((w) => w.code)).toEqual(['FLAKY_TESTS_MODERATE']);
      expect(result.criticalIssues).toEqual([]);
    });

    it('emits BOTH FLAKY_TESTS_MODERATE and FLAKY_TESTS_HIGH at flakyTestCount=16', () => {
      const result = detectIssues(input({ flakyTestCount: 16 }));
      expect(result.warnings.map((w) => w.code)).toEqual(['FLAKY_TESTS_MODERATE']);
      expect(result.criticalIssues.map((c) => c.code)).toEqual(['FLAKY_TESTS_HIGH']);
    });

    it('does not emit at flakyTestCount=5 (boundary; > 5 required)', () => {
      const result = detectIssues(input({ flakyTestCount: 5 }));
      expect(result).toEqual({ warnings: [], criticalIssues: [] });
    });

    it('does not emit FLAKY_TESTS_HIGH at flakyTestCount=15 (boundary; > 15 required)', () => {
      const result = detectIssues(input({ flakyTestCount: 15 }));
      expect(result.warnings.map((w) => w.code)).toEqual(['FLAKY_TESTS_MODERATE']);
      expect(result.criticalIssues).toEqual([]);
    });
  });

  describe('HIGH_SEVERITY_PATTERN / CRITICAL_SEVERITY_PATTERN', () => {
    it('emits HIGH_SEVERITY_PATTERN once per HIGH pattern', () => {
      const result = detectIssues(
        input({
          patterns: [
            { severity: 'HIGH', occurrenceCount: 20 },
            { severity: 'HIGH', occurrenceCount: 35 },
          ],
        }),
      );
      expect(result.warnings.map((w) => w.code)).toEqual([
        'HIGH_SEVERITY_PATTERN',
        'HIGH_SEVERITY_PATTERN',
      ]);
      expect(result.criticalIssues).toEqual([]);
    });

    it('emits CRITICAL_SEVERITY_PATTERN once per CRITICAL pattern; CRITICAL does NOT also fire the HIGH warning', () => {
      const result = detectIssues(
        input({ patterns: [{ severity: 'CRITICAL', occurrenceCount: 60 }] }),
      );
      expect(result.warnings).toEqual([]);
      expect(result.criticalIssues.map((c) => c.code)).toEqual(['CRITICAL_SEVERITY_PATTERN']);
    });

    it('ignores LOW and MEDIUM patterns', () => {
      const result = detectIssues(
        input({
          patterns: [
            { severity: 'LOW', occurrenceCount: 3 },
            { severity: 'MEDIUM', occurrenceCount: 8 },
          ],
        }),
      );
      expect(result).toEqual({ warnings: [], criticalIssues: [] });
    });

    it('emits the correct mix for a varied pattern list', () => {
      const result = detectIssues(
        input({
          patterns: [
            { severity: 'LOW', occurrenceCount: 1 },
            { severity: 'MEDIUM', occurrenceCount: 5 },
            { severity: 'HIGH', occurrenceCount: 22 },
            { severity: 'CRITICAL', occurrenceCount: 55 },
            { severity: 'HIGH', occurrenceCount: 25 },
          ],
        }),
      );
      expect(result.warnings.map((w) => w.code)).toEqual([
        'HIGH_SEVERITY_PATTERN',
        'HIGH_SEVERITY_PATTERN',
      ]);
      expect(result.criticalIssues.map((c) => c.code)).toEqual(['CRITICAL_SEVERITY_PATTERN']);
    });

    it('returns no pattern issues for an empty patterns array', () => {
      const result = detectIssues(input({ patterns: [] }));
      expect(result).toEqual({ warnings: [], criticalIssues: [] });
    });
  });

  describe('compound inputs', () => {
    it('aggregates every warning and critical code when all conditions fire', () => {
      const result = detectIssues({
        totalRuns: 100,
        recentFailureRate: 0.3,
        brokenTestCount: 5,
        flakyTestCount: 20,
        patterns: [
          { severity: 'HIGH', occurrenceCount: 22 },
          { severity: 'CRITICAL', occurrenceCount: 75 },
        ],
      });
      expect(result.warnings.map((w) => w.code).sort()).toEqual(
        [
          'BROKEN_TESTS_PRESENT',
          'FLAKY_TESTS_MODERATE',
          'HIGH_SEVERITY_PATTERN',
          'PASS_RATE_LOW',
        ].sort(),
      );
      expect(result.criticalIssues.map((c) => c.code).sort()).toEqual(
        [
          'BROKEN_TESTS_THRESHOLD',
          'CRITICAL_SEVERITY_PATTERN',
          'FLAKY_TESTS_HIGH',
          'PASS_RATE_CRITICAL',
        ].sort(),
      );
    });
  });

  describe('message content', () => {
    it('formats pass rate as a percentage rounded to one decimal', () => {
      const result = detectIssues(input({ recentFailureRate: 0.123 }));
      expect(result.warnings[0].message).toContain('87.7%');
    });

    it('includes the count in BROKEN_TESTS_PRESENT message', () => {
      const result = detectIssues(input({ brokenTestCount: 2 }));
      expect(result.warnings[0].message).toContain('2 test');
    });

    it('includes the occurrenceCount in HIGH_SEVERITY_PATTERN message', () => {
      const result = detectIssues(input({ patterns: [{ severity: 'HIGH', occurrenceCount: 42 }] }));
      expect(result.warnings[0].message).toContain('42 occurrences');
    });
  });
});
