import { jest, describe, it, expect } from '@jest/globals';
import type { Pool } from 'pg';
import { PgTestCaseRepository } from '../../../../src/infrastructure/repositories/pg-test-case.repository.js';
import type { NewTestCaseResult } from '../../../../src/domain/entities/test-case-result.js';

function makeCase(overrides: Partial<NewTestCaseResult> = {}): NewTestCaseResult {
  return {
    projectId: '00000000-0000-0000-0000-000000000001',
    testRunId: '00000000-0000-0000-0000-000000000002',
    testName: 'should pass',
    fullName: 'Suite > should pass',
    status: 'PASSED',
    retryCount: 0,
    metadata: {},
    ...overrides,
  };
}

describe('PgTestCaseRepository (unit)', () => {
  describe('createMany', () => {
    it('issues exactly one query() call for N=10 inputs, with N×11 parameters', async () => {
      const queryFn = jest
        .fn<(sql: string, params: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>>()
        .mockResolvedValue({ rows: [], rowCount: 10 });
      const pool = { query: queryFn } as unknown as Pool;
      const repo = new PgTestCaseRepository(pool);

      const inputs = Array.from({ length: 10 }, (_, i) =>
        makeCase({ fullName: `Suite > test-${i}` }),
      );
      await repo.createMany(inputs);

      expect(queryFn).toHaveBeenCalledTimes(1);
      const [sql, params] = queryFn.mock.calls[0];
      expect(params.length).toBe(10 * 11);
      expect(sql).toMatch(/INSERT INTO test_case_results/);
      const valuesTupleMatches = sql.match(/\(\$\d+(?:,\s*\$\d+){10}\)/g) ?? [];
      expect(valuesTupleMatches.length).toBe(10);
    });

    it('returns without issuing any query for empty input', async () => {
      const queryFn = jest.fn();
      const pool = { query: queryFn } as unknown as Pool;
      const repo = new PgTestCaseRepository(pool);

      await repo.createMany([]);
      expect(queryFn).not.toHaveBeenCalled();
    });
  });
});
