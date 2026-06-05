import { describe, it, expect } from '@jest/globals';
import { jestAdapter } from '../../../../../src/application/ingestion/adapters/jest.adapter.js';
import { IngestionFailedError } from '../../../../../src/application/ingestion/errors.js';

describe('jestAdapter', () => {
  describe('happy path', () => {
    it('parses a basic Jest report', () => {
      const body = {
        startTime: 1717230000000,
        testResults: [
          {
            testFilePath: '/path/auth.test.ts',
            testResults: [
              {
                title: 'should authenticate',
                ancestorTitles: ['AuthService', 'login'],
                status: 'passed',
                duration: 120,
              },
            ],
          },
        ],
      };

      const result = jestAdapter.parse({ kind: 'json', body });

      expect(result.executedAt).toEqual(new Date(1717230000000));
      expect(result.metadata).toEqual({});
      expect(result.cases).toHaveLength(1);
      expect(result.cases[0]).toEqual({
        suiteName: 'AuthService > login',
        testName: 'should authenticate',
        fullName: 'AuthService > login > should authenticate',
        status: 'PASSED',
        durationMs: 120,
        retryCount: 0,
        metadata: {},
      });
    });
  });

  describe('ancestorTitles join', () => {
    it('joins ancestorTitles with " > " for suiteName', () => {
      const body = {
        testResults: [
          {
            testResults: [{ title: 't', ancestorTitles: ['A', 'B', 'C'], status: 'passed' }],
          },
        ],
      };
      const result = jestAdapter.parse({ kind: 'json', body });
      expect(result.cases[0].suiteName).toBe('A > B > C');
      expect(result.cases[0].fullName).toBe('A > B > C > t');
    });

    it('omits suiteName and uses testName alone when ancestorTitles is empty', () => {
      const body = {
        testResults: [
          {
            testResults: [{ title: 'standalone', ancestorTitles: [], status: 'passed' }],
          },
        ],
      };
      const result = jestAdapter.parse({ kind: 'json', body });
      expect(result.cases[0].suiteName).toBeUndefined();
      expect(result.cases[0].fullName).toBe('standalone');
    });

    it('flattens assertionResults across multiple testResult files', () => {
      const body = {
        testResults: [
          {
            testFilePath: '/a.test.ts',
            testResults: [{ title: 'a1', ancestorTitles: ['A'], status: 'passed' }],
          },
          {
            testFilePath: '/b.test.ts',
            testResults: [{ title: 'b1', ancestorTitles: ['B'], status: 'failed' }],
          },
        ],
      };
      const result = jestAdapter.parse({ kind: 'json', body });
      expect(result.cases).toHaveLength(2);
      expect(result.cases.map((c) => c.fullName)).toEqual(['A > a1', 'B > b1']);
    });
  });

  describe('status mapping', () => {
    it.each([
      ['passed', 'PASSED'],
      ['failed', 'FAILED'],
      ['pending', 'SKIPPED'],
      ['todo', 'SKIPPED'],
    ])('maps Jest status %s to %s', (jestStatus, mappedStatus) => {
      const body = {
        testResults: [
          {
            testResults: [{ title: 't', ancestorTitles: [], status: jestStatus }],
          },
        ],
      };
      const result = jestAdapter.parse({ kind: 'json', body });
      expect(result.cases[0].status).toBe(mappedStatus);
    });
  });

  describe('failureMessage extraction', () => {
    it('extracts failureMessages[0] when present on failed result', () => {
      const body = {
        testResults: [
          {
            testResults: [
              {
                title: 't',
                ancestorTitles: [],
                status: 'failed',
                failureMessages: ['Expected X but got Y', 'Second error'],
              },
            ],
          },
        ],
      };
      const result = jestAdapter.parse({ kind: 'json', body });
      expect(result.cases[0].failureMessage).toBe('Expected X but got Y');
    });

    it('leaves failureMessage undefined when failureMessages is absent', () => {
      const body = {
        testResults: [
          {
            testResults: [{ title: 't', ancestorTitles: [], status: 'failed' }],
          },
        ],
      };
      const result = jestAdapter.parse({ kind: 'json', body });
      expect(result.cases[0].failureMessage).toBeUndefined();
    });

    it('leaves failureMessage undefined when failureMessages is empty array', () => {
      const body = {
        testResults: [
          {
            testResults: [
              {
                title: 't',
                ancestorTitles: [],
                status: 'failed',
                failureMessages: [],
              },
            ],
          },
        ],
      };
      const result = jestAdapter.parse({ kind: 'json', body });
      expect(result.cases[0].failureMessage).toBeUndefined();
    });

    it('does not attach failureMessage for passed results', () => {
      const body = {
        testResults: [
          {
            testResults: [
              {
                title: 't',
                ancestorTitles: [],
                status: 'passed',
                failureMessages: ['stale message'],
              },
            ],
          },
        ],
      };
      const result = jestAdapter.parse({ kind: 'json', body });
      expect(result.cases[0].failureMessage).toBeUndefined();
    });
  });

  describe('executedAt', () => {
    it('parses startTime as a unix epoch ms number', () => {
      const body = { startTime: 1717230000000, testResults: [] };
      const result = jestAdapter.parse({ kind: 'json', body });
      expect(result.executedAt).toEqual(new Date(1717230000000));
    });

    it('omits executedAt when startTime is absent', () => {
      const body = { testResults: [] };
      const result = jestAdapter.parse({ kind: 'json', body });
      expect(result.executedAt).toBeUndefined();
    });
  });

  describe('empty inputs', () => {
    it('returns cases: [] when testResults is empty', () => {
      const body = { testResults: [] };
      const result = jestAdapter.parse({ kind: 'json', body });
      expect(result.cases).toEqual([]);
    });
  });

  describe('error cases', () => {
    it('throws IngestionFailedError when input.kind is xml', () => {
      expect(() => jestAdapter.parse({ kind: 'xml', text: '<xml/>' })).toThrow(
        IngestionFailedError,
      );
    });

    it('throws IngestionFailedError when testResults array is missing', () => {
      const body = { startTime: 0 };
      expect(() => jestAdapter.parse({ kind: 'json', body })).toThrow(IngestionFailedError);
    });

    it('throws IngestionFailedError when body is not an object', () => {
      expect(() => jestAdapter.parse({ kind: 'json', body: 'not an object' })).toThrow(
        IngestionFailedError,
      );
    });

    it('throws IngestionFailedError on unrecognised Jest status', () => {
      const body = {
        testResults: [
          {
            testResults: [{ title: 't', ancestorTitles: [], status: 'unknown' }],
          },
        ],
      };
      expect(() => jestAdapter.parse({ kind: 'json', body })).toThrow(IngestionFailedError);
    });

    it('throws IngestionFailedError when an assertion is missing a title', () => {
      const body = {
        testResults: [
          {
            testResults: [{ ancestorTitles: [], status: 'passed' }],
          },
        ],
      };
      expect(() => jestAdapter.parse({ kind: 'json', body })).toThrow(IngestionFailedError);
    });
  });
});
