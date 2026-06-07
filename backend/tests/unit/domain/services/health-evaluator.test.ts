import { describe, it, expect } from '@jest/globals';
import { evaluateHealth } from '../../../../src/domain/services/health-evaluator.js';
import type { HealthInput } from '../../../../src/domain/services/health-evaluator.js';

function makeInput(overrides: Partial<HealthInput> = {}): HealthInput {
  return {
    totalRuns: 100,
    recentFailureRate: 0,
    brokenTestCount: 0,
    flakyTestCount: 0,
    ...overrides,
  };
}

describe('evaluateHealth', () => {
  describe('HEALTHY', () => {
    it('returns HEALTHY when all metrics are at their best (zero failures, zero broken, zero flaky)', () => {
      expect(evaluateHealth(makeInput())).toBe('HEALTHY');
    });

    it('returns HEALTHY when totalRuns is 0 even if other inputs look bad', () => {
      const input = makeInput({
        totalRuns: 0,
        recentFailureRate: 0.5,
        brokenTestCount: 10,
        flakyTestCount: 100,
      });
      expect(evaluateHealth(input)).toBe('HEALTHY');
    });

    it('returns HEALTHY at the exact HEALTHY ceiling (failureRate = 0.05, brokenTestCount = 0, flakyTestCount = 5)', () => {
      const input = makeInput({
        recentFailureRate: 0.05,
        brokenTestCount: 0,
        flakyTestCount: 5,
      });
      expect(evaluateHealth(input)).toBe('HEALTHY');
    });
  });

  describe('WARNING', () => {
    it('returns WARNING when recentFailureRate crosses the 5% boundary', () => {
      const input = makeInput({ recentFailureRate: 0.06 });
      expect(evaluateHealth(input)).toBe('WARNING');
    });

    it('returns WARNING for brokenTestCount = 1', () => {
      const input = makeInput({ brokenTestCount: 1 });
      expect(evaluateHealth(input)).toBe('WARNING');
    });

    it('returns WARNING for brokenTestCount = 2', () => {
      const input = makeInput({ brokenTestCount: 2 });
      expect(evaluateHealth(input)).toBe('WARNING');
    });

    it('returns WARNING for flakyTestCount = 6 (just above the 5 boundary)', () => {
      const input = makeInput({ flakyTestCount: 6 });
      expect(evaluateHealth(input)).toBe('WARNING');
    });

    it('returns WARNING at the upper recentFailureRate boundary (= 0.20, not yet CRITICAL)', () => {
      const input = makeInput({ recentFailureRate: 0.2 });
      expect(evaluateHealth(input)).toBe('WARNING');
    });

    it('returns WARNING at flakyTestCount = 15 (upper boundary, not yet CRITICAL)', () => {
      const input = makeInput({ flakyTestCount: 15 });
      expect(evaluateHealth(input)).toBe('WARNING');
    });
  });

  describe('CRITICAL', () => {
    it('returns CRITICAL when recentFailureRate exceeds 0.20', () => {
      const input = makeInput({ recentFailureRate: 0.21 });
      expect(evaluateHealth(input)).toBe('CRITICAL');
    });

    it('returns CRITICAL for brokenTestCount = 3', () => {
      const input = makeInput({ brokenTestCount: 3 });
      expect(evaluateHealth(input)).toBe('CRITICAL');
    });

    it('returns CRITICAL for brokenTestCount >> 3 (4, 10)', () => {
      expect(evaluateHealth(makeInput({ brokenTestCount: 4 }))).toBe('CRITICAL');
      expect(evaluateHealth(makeInput({ brokenTestCount: 10 }))).toBe('CRITICAL');
    });

    it('returns CRITICAL for flakyTestCount > 15', () => {
      expect(evaluateHealth(makeInput({ flakyTestCount: 16 }))).toBe('CRITICAL');
    });

    it('returns CRITICAL at recentFailureRate = 1.0 (every recent run failed)', () => {
      expect(evaluateHealth(makeInput({ recentFailureRate: 1.0 }))).toBe('CRITICAL');
    });
  });

  describe('precedence', () => {
    it('returns CRITICAL when both CRITICAL and WARNING conditions are met (CRITICAL wins)', () => {
      const input = makeInput({
        recentFailureRate: 0.5,
        brokenTestCount: 5,
        flakyTestCount: 20,
      });
      expect(evaluateHealth(input)).toBe('CRITICAL');
    });

    it('returns CRITICAL even when only ONE CRITICAL condition is met (no need for all)', () => {
      const input = makeInput({
        recentFailureRate: 0.01,
        brokenTestCount: 3,
        flakyTestCount: 0,
      });
      expect(evaluateHealth(input)).toBe('CRITICAL');
    });

    it('returns WARNING when only ONE WARNING condition is met (no need for all)', () => {
      const input = makeInput({
        recentFailureRate: 0,
        brokenTestCount: 1,
        flakyTestCount: 0,
      });
      expect(evaluateHealth(input)).toBe('WARNING');
    });
  });
});
