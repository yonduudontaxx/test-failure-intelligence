import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import type { Pool } from 'pg';
import { PgProjectRepository } from '../../../src/infrastructure/repositories/pg-project.repository.js';
import { PgTestRunRepository } from '../../../src/infrastructure/repositories/pg-test-run.repository.js';
import { PgTestCaseRepository } from '../../../src/infrastructure/repositories/pg-test-case.repository.js';
import { ForeignKeyError } from '../../../src/domain/errors/index.js';
import { withTransaction } from '../../../src/infrastructure/database/with-transaction.js';
import type { NewTestRun } from '../../../src/domain/entities/test-run.js';
import type { NewTestCaseResult } from '../../../src/domain/entities/test-case-result.js';
import { createTestPool } from '../test-pool.js';
import { truncateAll } from '../truncate.js';

describe('PgTestCaseRepository (integration)', () => {
  let pool: Pool;
  let projectRepo: PgProjectRepository;
  let runRepo: PgTestRunRepository;
  let repo: PgTestCaseRepository;
  let projectId: string;
  let testRunId: string;

  beforeAll(() => {
    pool = createTestPool();
    projectRepo = new PgProjectRepository(pool);
    runRepo = new PgTestRunRepository(pool);
    repo = new PgTestCaseRepository(pool);
  });

  function makeNewRun(overrides: Partial<NewTestRun> = {}): NewTestRun {
    return {
      projectId,
      sourceType: 'api',
      status: 'SUCCESS',
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      metadata: {},
      ...overrides,
    };
  }

  function makeCase(overrides: Partial<NewTestCaseResult> = {}): NewTestCaseResult {
    return {
      projectId,
      testRunId,
      testName: 'should pass',
      fullName: 'Suite > should pass',
      status: 'PASSED',
      retryCount: 0,
      metadata: {},
      ...overrides,
    };
  }

  beforeEach(async () => {
    await truncateAll(pool);
    const project = await projectRepo.create({ slug: 'svc-fixture', name: 'Fixture' });
    projectId = project.id;
    const run = await runRepo.create(makeNewRun());
    testRunId = run.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('createMany', () => {
    it('persists N=3 cases for the fixture run', async () => {
      await repo.createMany([
        makeCase({ fullName: 'Suite > test-a', testName: 'test-a' }),
        makeCase({ fullName: 'Suite > test-b', testName: 'test-b' }),
        makeCase({ fullName: 'Suite > test-c', testName: 'test-c' }),
      ]);

      const cases = await repo.findByTestRun(testRunId);
      expect(cases.length).toBe(3);
      expect(cases.map((c) => c.fullName)).toEqual([
        'Suite > test-a',
        'Suite > test-b',
        'Suite > test-c',
      ]);
    });

    it('persists N=1 (edge case for the placeholder builder)', async () => {
      await repo.createMany([makeCase({ fullName: 'only-one' })]);
      const cases = await repo.findByTestRun(testRunId);
      expect(cases.length).toBe(1);
      expect(cases[0].fullName).toBe('only-one');
    });

    it('is a no-op for empty input', async () => {
      await repo.createMany([]);
      const cases = await repo.findByTestRun(testRunId);
      expect(cases).toEqual([]);
    });

    it('rejects unknown projectId with ForeignKeyError; nothing persists (all-or-nothing)', async () => {
      try {
        await repo.createMany([
          makeCase(),
          makeCase({ projectId: '00000000-0000-0000-0000-000000000000' }),
        ]);
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ForeignKeyError);
        if (err instanceof ForeignKeyError) {
          expect(err.constraint).toBe('test_case_results_project_id_fkey');
        }
      }
      const cases = await repo.findByTestRun(testRunId);
      expect(cases).toEqual([]);
    });

    it('rejects unknown testRunId with ForeignKeyError', async () => {
      try {
        await repo.createMany([makeCase({ testRunId: '00000000-0000-0000-0000-000000000000' })]);
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ForeignKeyError);
        if (err instanceof ForeignKeyError) {
          expect(err.constraint).toBe('test_case_results_test_run_id_fkey');
        }
      }
    });

    it('round-trips nested JSONB metadata', async () => {
      const metadata = {
        retry: { attempts: 2, delays: [100, 500] },
        tags: ['flaky', 'network'],
      };
      await repo.createMany([makeCase({ metadata })]);
      const cases = await repo.findByTestRun(testRunId);
      expect(cases[0].metadata).toEqual(metadata);
    });

    it('persists cases when withTransaction commits', async () => {
      await withTransaction(pool, async (tx) => {
        await repo.createMany([makeCase(), makeCase({ fullName: 'second' })], tx);
      });

      const cases = await repo.findByTestRun(testRunId);
      expect(cases.length).toBe(2);
    });

    it('does NOT persist cases when withTransaction rolls back', async () => {
      const rollbackErr = new Error('intentional rollback');
      await expect(
        withTransaction(pool, async (tx) => {
          await repo.createMany([makeCase(), makeCase({ fullName: 'second' })], tx);
          throw rollbackErr;
        }),
      ).rejects.toBe(rollbackErr);

      const cases = await repo.findByTestRun(testRunId);
      expect(cases).toEqual([]);
    });

    it('rolls back TestRun AND its cases together when withTransaction throws (cross-table atomicity)', async () => {
      const rollbackErr = new Error('intentional rollback');
      let createdRunId: string | undefined;

      await expect(
        withTransaction(pool, async (tx) => {
          const newRun = await runRepo.create(
            makeNewRun({ pipelineName: 'should-not-persist' }),
            tx,
          );
          createdRunId = newRun.id;
          await repo.createMany(
            [
              { ...makeCase(), testRunId: newRun.id },
              { ...makeCase(), testRunId: newRun.id, fullName: 'second' },
            ],
            tx,
          );
          throw rollbackErr;
        }),
      ).rejects.toBe(rollbackErr);

      expect(createdRunId).toBeDefined();
      const reloadedRun = await runRepo.findById(createdRunId!);
      expect(reloadedRun).toBeNull();
      const cases = await repo.findByTestRun(createdRunId!);
      expect(cases).toEqual([]);
    });
  });

  describe('findByTestRun', () => {
    it('returns [] when the run has no cases', async () => {
      const cases = await repo.findByTestRun(testRunId);
      expect(cases).toEqual([]);
    });

    it('returns all cases for the run ordered by full_name ASC', async () => {
      await repo.createMany([
        makeCase({ fullName: 'Z-last' }),
        makeCase({ fullName: 'A-first' }),
        makeCase({ fullName: 'M-middle' }),
        makeCase({ fullName: 'B-second' }),
        makeCase({ fullName: 'Y-fourth' }),
      ]);
      const cases = await repo.findByTestRun(testRunId);
      expect(cases.map((c) => c.fullName)).toEqual([
        'A-first',
        'B-second',
        'M-middle',
        'Y-fourth',
        'Z-last',
      ]);
    });

    it('excludes cases from other runs', async () => {
      const otherRun = await runRepo.create(makeNewRun());
      await repo.createMany([makeCase({ fullName: 'this-run' })]);
      await repo.createMany([{ ...makeCase(), testRunId: otherRun.id, fullName: 'other-run' }]);

      const cases = await repo.findByTestRun(testRunId);
      expect(cases.length).toBe(1);
      expect(cases[0].fullName).toBe('this-run');
    });
  });

  describe('findRecentByFullName', () => {
    it('returns [] when no cases match', async () => {
      const cases = await repo.findRecentByFullName(projectId, 'no-such-test', 10);
      expect(cases).toEqual([]);
    });

    it('returns cases ordered by parent run executed_at DESC', async () => {
      const fullName = 'Suite > shared';
      const run1 = await runRepo.create(
        makeNewRun({ executedAt: new Date('2026-05-01T00:00:00Z') }),
      );
      const run2 = await runRepo.create(
        makeNewRun({ executedAt: new Date('2026-05-10T00:00:00Z') }),
      );
      const run3 = await runRepo.create(
        makeNewRun({ executedAt: new Date('2026-05-20T00:00:00Z') }),
      );
      await repo.createMany([{ ...makeCase(), testRunId: run1.id, fullName }]);
      await repo.createMany([{ ...makeCase(), testRunId: run2.id, fullName }]);
      await repo.createMany([{ ...makeCase(), testRunId: run3.id, fullName }]);

      const cases = await repo.findRecentByFullName(projectId, fullName, 10);
      expect(cases.length).toBe(3);
      expect(cases.map((c) => c.testRunId)).toEqual([run3.id, run2.id, run1.id]);
    });

    it('respects the limit', async () => {
      const fullName = 'Suite > capped';
      for (let i = 0; i < 5; i += 1) {
        const run = await runRepo.create(
          makeNewRun({ executedAt: new Date(Date.UTC(2026, 0, 1 + i)) }),
        );
        await repo.createMany([{ ...makeCase(), testRunId: run.id, fullName }]);
      }
      const cases = await repo.findRecentByFullName(projectId, fullName, 2);
      expect(cases.length).toBe(2);
    });

    it('sorts cases from NULL-executedAt runs after non-NULL (NULLS LAST)', async () => {
      const fullName = 'Suite > null-mix';
      const runWithExec = await runRepo.create(
        makeNewRun({ executedAt: new Date('2026-05-01T00:00:00Z') }),
      );
      const runWithoutExec = await runRepo.create(makeNewRun());
      await repo.createMany([{ ...makeCase(), testRunId: runWithoutExec.id, fullName }]);
      await repo.createMany([{ ...makeCase(), testRunId: runWithExec.id, fullName }]);

      const cases = await repo.findRecentByFullName(projectId, fullName, 10);
      expect(cases.length).toBe(2);
      expect(cases[0].testRunId).toBe(runWithExec.id);
      expect(cases[1].testRunId).toBe(runWithoutExec.id);
    });

    it('breaks ties on parent ingested_at DESC when executed_at values are NULL', async () => {
      const fullName = 'Suite > tie-break';
      const run1 = await runRepo.create(makeNewRun());
      await new Promise((r) => setTimeout(r, 10));
      const run2 = await runRepo.create(makeNewRun());
      await new Promise((r) => setTimeout(r, 10));
      const run3 = await runRepo.create(makeNewRun());
      await repo.createMany([{ ...makeCase(), testRunId: run1.id, fullName }]);
      await repo.createMany([{ ...makeCase(), testRunId: run2.id, fullName }]);
      await repo.createMany([{ ...makeCase(), testRunId: run3.id, fullName }]);

      const cases = await repo.findRecentByFullName(projectId, fullName, 10);
      expect(cases.map((c) => c.testRunId)).toEqual([run3.id, run2.id, run1.id]);
    });

    it('respects the project boundary', async () => {
      const fullName = 'Suite > shared-name';
      const otherProject = await projectRepo.create({ slug: 'other', name: 'Other' });
      const otherRun = await runRepo.create({ ...makeNewRun(), projectId: otherProject.id });

      await repo.createMany([makeCase({ fullName })]);
      await repo.createMany([
        { ...makeCase(), projectId: otherProject.id, testRunId: otherRun.id, fullName },
      ]);

      const cases = await repo.findRecentByFullName(projectId, fullName, 10);
      expect(cases.length).toBe(1);
      expect(cases[0].projectId).toBe(projectId);
    });
  });
});
