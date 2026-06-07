import { describe, it, expect } from '@jest/globals';
import { classifyReliability } from '../../../../src/domain/services/reliability-classifier.js';
import type { TestCaseStatus } from '../../../../src/domain/enums/test-case-status.js';

describe('classifyReliability', () => {
  describe('STABLE classifications', () => {
    it('returns STABLE when all results are PASSED', () => {
      const results: TestCaseStatus[] = ['PASSED', 'PASSED', 'PASSED'];
      expect(classifyReliability(results)).toBe('STABLE');
    });

    it('returns STABLE for a single PASSED result', () => {
      expect(classifyReliability(['PASSED'])).toBe('STABLE');
    });

    it('returns STABLE for an empty array (no signal)', () => {
      expect(classifyReliability([])).toBe('STABLE');
    });

    it('returns STABLE when all results are SKIPPED (filtered to empty)', () => {
      const results: TestCaseStatus[] = ['SKIPPED', 'SKIPPED', 'SKIPPED'];
      expect(classifyReliability(results)).toBe('STABLE');
    });

    it('returns STABLE for SKIPPED mixed with PASSED (SKIPPED ignored)', () => {
      const results: TestCaseStatus[] = ['SKIPPED', 'PASSED', 'SKIPPED', 'PASSED'];
      expect(classifyReliability(results)).toBe('STABLE');
    });
  });

  describe('BROKEN classifications', () => {
    it('returns BROKEN when all results are FAILED', () => {
      const results: TestCaseStatus[] = ['FAILED', 'FAILED', 'FAILED'];
      expect(classifyReliability(results)).toBe('BROKEN');
    });

    it('returns BROKEN when all results are ERROR', () => {
      const results: TestCaseStatus[] = ['ERROR', 'ERROR', 'ERROR'];
      expect(classifyReliability(results)).toBe('BROKEN');
    });

    it('returns BROKEN for a mix of FAILED and ERROR (both treated as failures)', () => {
      const results: TestCaseStatus[] = ['FAILED', 'ERROR', 'FAILED', 'ERROR'];
      expect(classifyReliability(results)).toBe('BROKEN');
    });

    it('returns BROKEN for a single FAILED result', () => {
      expect(classifyReliability(['FAILED'])).toBe('BROKEN');
    });

    it('returns BROKEN for SKIPPED mixed with FAILED (only failures remain after filter)', () => {
      const results: TestCaseStatus[] = ['SKIPPED', 'FAILED', 'SKIPPED'];
      expect(classifyReliability(results)).toBe('BROKEN');
    });
  });

  describe('FLAKY classifications', () => {
    it('returns FLAKY for a mix of PASSED and FAILED', () => {
      const results: TestCaseStatus[] = ['PASSED', 'FAILED', 'PASSED'];
      expect(classifyReliability(results)).toBe('FLAKY');
    });

    it('returns FLAKY for a mix of PASSED and ERROR', () => {
      const results: TestCaseStatus[] = ['PASSED', 'ERROR', 'PASSED'];
      expect(classifyReliability(results)).toBe('FLAKY');
    });

    it('returns FLAKY for a 1-PASSED + 1-FAILED minimum mix', () => {
      expect(classifyReliability(['PASSED', 'FAILED'])).toBe('FLAKY');
    });

    it('returns FLAKY for PASSED + FAILED + ERROR mix', () => {
      const results: TestCaseStatus[] = ['PASSED', 'FAILED', 'ERROR', 'PASSED'];
      expect(classifyReliability(results)).toBe('FLAKY');
    });

    it('returns FLAKY when SKIPPED is mixed in but the non-skipped slice is still a mix', () => {
      const results: TestCaseStatus[] = ['SKIPPED', 'PASSED', 'FAILED', 'SKIPPED'];
      expect(classifyReliability(results)).toBe('FLAKY');
    });
  });
});
