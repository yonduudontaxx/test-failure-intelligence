import { describe, it, expect } from '@jest/globals';
import { playwrightAdapter } from '../../../../../src/application/ingestion/adapters/playwright.adapter.js';
import { IngestionFailedError } from '../../../../../src/application/ingestion/errors.js';

describe('playwrightAdapter', () => {
  describe('happy path', () => {
    it('parses a single-suite, single-spec, single-test report', () => {
      const body = {
        stats: { startTime: '2026-06-01T12:00:00.000Z' },
        suites: [
          {
            title: 'AuthService',
            specs: [
              {
                title: 'should authenticate',
                tests: [{ results: [{ status: 'passed', duration: 120 }] }],
              },
            ],
          },
        ],
      };

      const result = playwrightAdapter.parse({ kind: 'json', body });

      expect(result.executedAt).toEqual(new Date('2026-06-01T12:00:00.000Z'));
      expect(result.metadata).toEqual({});
      expect(result.cases).toHaveLength(1);
      expect(result.cases[0]).toEqual({
        suiteName: 'AuthService',
        testName: 'should authenticate',
        fullName: 'AuthService > should authenticate',
        status: 'PASSED',
        durationMs: 120,
        retryCount: 0,
        metadata: {},
      });
    });
  });

  describe('suite hierarchy', () => {
    it('joins ancestor titles with " > " for two-level nesting', () => {
      const body = {
        suites: [
          {
            title: 'Outer',
            suites: [
              {
                title: 'Inner',
                specs: [
                  {
                    title: 'nested test',
                    tests: [{ results: [{ status: 'passed' }] }],
                  },
                ],
              },
            ],
          },
        ],
      };
      const result = playwrightAdapter.parse({ kind: 'json', body });
      expect(result.cases[0].suiteName).toBe('Outer > Inner');
      expect(result.cases[0].fullName).toBe('Outer > Inner > nested test');
    });

    it('handles three-level nesting', () => {
      const body = {
        suites: [
          {
            title: 'A',
            suites: [
              {
                title: 'B',
                suites: [
                  {
                    title: 'C',
                    specs: [
                      {
                        title: 'deep test',
                        tests: [{ results: [{ status: 'passed' }] }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      const result = playwrightAdapter.parse({ kind: 'json', body });
      expect(result.cases[0].fullName).toBe('A > B > C > deep test');
    });

    it('processes both specs and child suites within the same suite', () => {
      const body = {
        suites: [
          {
            title: 'Mixed',
            specs: [
              {
                title: 'direct test',
                tests: [{ results: [{ status: 'passed' }] }],
              },
            ],
            suites: [
              {
                title: 'Child',
                specs: [
                  {
                    title: 'nested test',
                    tests: [{ results: [{ status: 'passed' }] }],
                  },
                ],
              },
            ],
          },
        ],
      };
      const result = playwrightAdapter.parse({ kind: 'json', body });
      expect(result.cases).toHaveLength(2);
      expect(result.cases.map((c) => c.fullName)).toEqual([
        'Mixed > direct test',
        'Mixed > Child > nested test',
      ]);
    });
  });

  describe('status mapping', () => {
    it.each([
      ['passed', 'PASSED'],
      ['failed', 'FAILED'],
      ['skipped', 'SKIPPED'],
      ['timedOut', 'FAILED'],
      ['interrupted', 'FAILED'],
    ])('maps Playwright status %s to %s', (pwStatus, mappedStatus) => {
      const body = {
        suites: [
          {
            title: 'S',
            specs: [
              {
                title: 't',
                tests: [{ results: [{ status: pwStatus }] }],
              },
            ],
          },
        ],
      };
      const result = playwrightAdapter.parse({ kind: 'json', body });
      expect(result.cases[0].status).toBe(mappedStatus);
    });
  });

  describe('retries', () => {
    it('takes the last result and counts retries as results.length - 1', () => {
      const body = {
        suites: [
          {
            title: 'S',
            specs: [
              {
                title: 't',
                tests: [
                  {
                    results: [{ status: 'failed' }, { status: 'failed' }, { status: 'passed' }],
                  },
                ],
              },
            ],
          },
        ],
      };
      const result = playwrightAdapter.parse({ kind: 'json', body });
      expect(result.cases[0].status).toBe('PASSED');
      expect(result.cases[0].retryCount).toBe(2);
    });

    it('reports retryCount=0 for a single result', () => {
      const body = {
        suites: [
          {
            title: 'S',
            specs: [
              {
                title: 't',
                tests: [{ results: [{ status: 'passed' }] }],
              },
            ],
          },
        ],
      };
      const result = playwrightAdapter.parse({ kind: 'json', body });
      expect(result.cases[0].retryCount).toBe(0);
    });
  });

  describe('failure message extraction', () => {
    it('extracts the first error message from the final failed result via errors[]', () => {
      const body = {
        suites: [
          {
            title: 'S',
            specs: [
              {
                title: 't',
                tests: [
                  {
                    results: [
                      {
                        status: 'failed',
                        errors: [{ message: 'boom' }, { message: 'second' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      const result = playwrightAdapter.parse({ kind: 'json', body });
      expect(result.cases[0].failureMessage).toBe('boom');
    });

    it('falls back to result.error.message when errors[] is absent', () => {
      const body = {
        suites: [
          {
            title: 'S',
            specs: [
              {
                title: 't',
                tests: [
                  {
                    results: [{ status: 'failed', error: { message: 'legacy boom' } }],
                  },
                ],
              },
            ],
          },
        ],
      };
      const result = playwrightAdapter.parse({ kind: 'json', body });
      expect(result.cases[0].failureMessage).toBe('legacy boom');
    });

    it('does not attach a failureMessage for passed results', () => {
      const body = {
        suites: [
          {
            title: 'S',
            specs: [
              {
                title: 't',
                tests: [{ results: [{ status: 'passed' }] }],
              },
            ],
          },
        ],
      };
      const result = playwrightAdapter.parse({ kind: 'json', body });
      expect(result.cases[0].failureMessage).toBeUndefined();
    });
  });

  describe('empty inputs', () => {
    it('returns cases: [] when suites is empty', () => {
      const body = { suites: [] };
      const result = playwrightAdapter.parse({ kind: 'json', body });
      expect(result.cases).toEqual([]);
    });

    it('omits executedAt when stats.startTime is absent', () => {
      const body = { suites: [] };
      const result = playwrightAdapter.parse({ kind: 'json', body });
      expect(result.executedAt).toBeUndefined();
    });
  });

  describe('error cases', () => {
    it('throws IngestionFailedError when input.kind is xml', () => {
      expect(() => playwrightAdapter.parse({ kind: 'xml', text: '<xml/>' })).toThrow(
        IngestionFailedError,
      );
    });

    it('throws IngestionFailedError when suites array is missing', () => {
      const body = { stats: {} };
      expect(() => playwrightAdapter.parse({ kind: 'json', body })).toThrow(IngestionFailedError);
    });

    it('throws IngestionFailedError when body is not an object', () => {
      expect(() => playwrightAdapter.parse({ kind: 'json', body: 'not an object' })).toThrow(
        IngestionFailedError,
      );
    });

    it('throws IngestionFailedError on unrecognised Playwright status', () => {
      const body = {
        suites: [
          {
            title: 'S',
            specs: [
              {
                title: 't',
                tests: [{ results: [{ status: 'flaky' }] }],
              },
            ],
          },
        ],
      };
      expect(() => playwrightAdapter.parse({ kind: 'json', body })).toThrow(IngestionFailedError);
    });

    it('throws IngestionFailedError when a spec is missing title', () => {
      const body = {
        suites: [
          {
            title: 'S',
            specs: [{ tests: [{ results: [{ status: 'passed' }] }] }],
          },
        ],
      };
      expect(() => playwrightAdapter.parse({ kind: 'json', body })).toThrow(IngestionFailedError);
    });
  });
});
