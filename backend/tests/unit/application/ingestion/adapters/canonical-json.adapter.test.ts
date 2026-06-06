import { describe, it, expect } from '@jest/globals';
import { canonicalJsonAdapter } from '../../../../../src/application/ingestion/adapters/canonical-json.adapter.js';
import { IngestionFailedError } from '../../../../../src/application/ingestion/errors.js';
import type { TestCaseStatus } from '../../../../../src/domain/enums/test-case-status.js';

describe('canonicalJsonAdapter', () => {
  describe('happy path', () => {
    it('parses a complete body with testRun metadata and testCases', () => {
      const body = {
        sourceType: 'api',
        testRun: {
          branch: 'main',
          environment: 'ci',
          commitSha: 'abc123',
          pipelineName: 'GitHub Actions',
          buildNumber: '245',
          executedAt: '2026-06-01T12:00:00.000Z',
          metadata: { jobId: 'job-42' },
        },
        testCases: [
          {
            suiteName: 'AuthService',
            testName: 'should authenticate',
            status: 'PASSED',
            durationMs: 120,
            retryCount: 0,
          },
        ],
      };

      const result = canonicalJsonAdapter.parse({ kind: 'json', body });

      expect(result).toEqual({
        branch: 'main',
        environment: 'ci',
        commitSha: 'abc123',
        pipelineName: 'GitHub Actions',
        buildNumber: '245',
        executedAt: new Date('2026-06-01T12:00:00.000Z'),
        metadata: { jobId: 'job-42' },
        cases: [
          {
            suiteName: 'AuthService',
            testName: 'should authenticate',
            fullName: 'AuthService > should authenticate',
            status: 'PASSED',
            durationMs: 120,
            retryCount: 0,
            metadata: {},
          },
        ],
      });
    });
  });

  describe('fullName normalization', () => {
    it('builds fullName as "suite > test" when suiteName is provided', () => {
      const body = {
        sourceType: 'api',
        testRun: {},
        testCases: [{ suiteName: 'Auth', testName: 'login', status: 'PASSED' }],
      };
      const result = canonicalJsonAdapter.parse({ kind: 'json', body });
      expect(result.cases[0].fullName).toBe('Auth > login');
    });

    it('uses testName as fullName when suiteName is absent', () => {
      const body = {
        sourceType: 'api',
        testRun: {},
        testCases: [{ testName: 'standalone test', status: 'PASSED' }],
      };
      const result = canonicalJsonAdapter.parse({ kind: 'json', body });
      expect(result.cases[0].fullName).toBe('standalone test');
      expect(result.cases[0].suiteName).toBeUndefined();
    });
  });

  describe('empty testCases', () => {
    it('returns cases: [] when testCases is empty', () => {
      const body = { sourceType: 'api', testRun: {}, testCases: [] };
      const result = canonicalJsonAdapter.parse({ kind: 'json', body });
      expect(result.cases).toEqual([]);
    });
  });

  describe('optional testRun fields', () => {
    it('leaves optional run fields undefined when absent', () => {
      const body = { sourceType: 'api', testRun: {}, testCases: [] };
      const result = canonicalJsonAdapter.parse({ kind: 'json', body });
      expect(result.branch).toBeUndefined();
      expect(result.environment).toBeUndefined();
      expect(result.commitSha).toBeUndefined();
      expect(result.pipelineName).toBeUndefined();
      expect(result.buildNumber).toBeUndefined();
      expect(result.executedAt).toBeUndefined();
      expect(result.metadata).toEqual({});
    });
  });

  describe('wrong AdapterInput kind', () => {
    it('throws IngestionFailedError when input.kind is xml', () => {
      expect(() => canonicalJsonAdapter.parse({ kind: 'xml', text: '<xml/>' })).toThrow(
        IngestionFailedError,
      );
    });
  });

  describe('status round-trip', () => {
    it.each<TestCaseStatus>(['PASSED', 'FAILED', 'SKIPPED', 'ERROR'])(
      'preserves status %s through parse',
      (status) => {
        const body = {
          sourceType: 'api',
          testRun: {},
          testCases: [{ testName: 'test', status }],
        };
        const result = canonicalJsonAdapter.parse({ kind: 'json', body });
        expect(result.cases[0].status).toBe(status);
      },
    );
  });

  describe('defensive validation', () => {
    it('throws IngestionFailedError when testCases is missing', () => {
      const body = { sourceType: 'api', testRun: {} };
      expect(() => canonicalJsonAdapter.parse({ kind: 'json', body })).toThrow(
        IngestionFailedError,
      );
    });

    it('throws IngestionFailedError when a case has an unrecognised status', () => {
      const body = {
        sourceType: 'api',
        testRun: {},
        testCases: [{ testName: 'test', status: 'MAYBE' }],
      };
      expect(() => canonicalJsonAdapter.parse({ kind: 'json', body })).toThrow(
        IngestionFailedError,
      );
    });

    it('throws IngestionFailedError when executedAt is not a valid date', () => {
      const body = {
        sourceType: 'api',
        testRun: { executedAt: 'not a date' },
        testCases: [],
      };
      expect(() => canonicalJsonAdapter.parse({ kind: 'json', body })).toThrow(
        IngestionFailedError,
      );
    });

    it('throws IngestionFailedError when body is not an object', () => {
      expect(() => canonicalJsonAdapter.parse({ kind: 'json', body: 'not an object' })).toThrow(
        IngestionFailedError,
      );
    });

    it('throws IngestionFailedError when a case is missing testName', () => {
      const body = {
        sourceType: 'api',
        testRun: {},
        testCases: [{ status: 'PASSED' }],
      };
      expect(() => canonicalJsonAdapter.parse({ kind: 'json', body })).toThrow(
        IngestionFailedError,
      );
    });
  });

  describe('field defaults', () => {
    it('defaults retryCount to 0 when absent', () => {
      const body = {
        sourceType: 'api',
        testRun: {},
        testCases: [{ testName: 'test', status: 'PASSED' }],
      };
      const result = canonicalJsonAdapter.parse({ kind: 'json', body });
      expect(result.cases[0].retryCount).toBe(0);
    });

    it('defaults case metadata to {} when absent', () => {
      const body = {
        sourceType: 'api',
        testRun: {},
        testCases: [{ testName: 'test', status: 'PASSED' }],
      };
      const result = canonicalJsonAdapter.parse({ kind: 'json', body });
      expect(result.cases[0].metadata).toEqual({});
    });

    it('defaults run metadata to {} when absent', () => {
      const body = { sourceType: 'api', testRun: {}, testCases: [] };
      const result = canonicalJsonAdapter.parse({ kind: 'json', body });
      expect(result.metadata).toEqual({});
    });
  });
});
