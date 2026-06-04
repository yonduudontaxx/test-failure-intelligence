import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import type { Pool } from 'pg';
import { PgProjectRepository } from '../../../src/infrastructure/repositories/pg-project.repository.js';
import { PgTestRunRepository } from '../../../src/infrastructure/repositories/pg-test-run.repository.js';
import { ForeignKeyError } from '../../../src/domain/errors/index.js';
import { withTransaction } from '../../../src/infrastructure/database/with-transaction.js';
import type { NewTestRun } from '../../../src/domain/entities/test-run.js';
import { createTestPool } from '../test-pool.js';
import { truncateAll } from '../truncate.js';

describe('PgTestRunRepository (integration)', () => {
  let pool: Pool;
  let projectRepo: PgProjectRepository;
  let repo: PgTestRunRepository;
  let projectId: string;

  beforeAll(() => {
    pool = createTestPool();
    projectRepo = new PgProjectRepository(pool);
    repo = new PgTestRunRepository(pool);
  });

  beforeEach(async () => {
    await truncateAll(pool);
    const project = await projectRepo.create({ slug: 'svc-fixture', name: 'Fixture' });
    projectId = project.id;
  });

  afterAll(async () => {
    await pool.end();
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

  describe('create', () => {
    it('persists with minimal required fields and populates id + ingestedAt', async () => {
      const before = new Date();
      const run = await repo.create(makeNewRun());
      const after = new Date();

      expect(run.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(run.projectId).toBe(projectId);
      expect(run.sourceType).toBe('api');
      expect(run.status).toBe('SUCCESS');
      expect(run.totalTests).toBe(0);
      expect(run.metadata).toEqual({});
      expect(run.ingestedAt).toBeInstanceOf(Date);
      expect(run.ingestedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(run.ingestedAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);

      expect(run.externalId).toBeUndefined();
      expect(run.pipelineName).toBeUndefined();
      expect(run.buildNumber).toBeUndefined();
      expect(run.branch).toBeUndefined();
      expect(run.commitSha).toBeUndefined();
      expect(run.environment).toBeUndefined();
      expect(run.durationMs).toBeUndefined();
      expect(run.executedAt).toBeUndefined();
    });

    it('round-trips all 16 input fields when populated', async () => {
      const executedAt = new Date('2026-05-15T10:00:00Z');
      const run = await repo.create(
        makeNewRun({
          externalId: 'gh-run-12345',
          sourceType: 'junit_xml',
          pipelineName: 'GitHub Actions',
          buildNumber: '42',
          branch: 'main',
          commitSha: 'abc123def456',
          environment: 'ci',
          status: 'FAILED',
          totalTests: 100,
          passedTests: 95,
          failedTests: 4,
          skippedTests: 1,
          durationMs: 45000,
          metadata: { runner: 'ubuntu-latest', node: '22.x' },
          executedAt,
        }),
      );

      expect(run.externalId).toBe('gh-run-12345');
      expect(run.sourceType).toBe('junit_xml');
      expect(run.pipelineName).toBe('GitHub Actions');
      expect(run.buildNumber).toBe('42');
      expect(run.branch).toBe('main');
      expect(run.commitSha).toBe('abc123def456');
      expect(run.environment).toBe('ci');
      expect(run.status).toBe('FAILED');
      expect(run.totalTests).toBe(100);
      expect(run.passedTests).toBe(95);
      expect(run.failedTests).toBe(4);
      expect(run.skippedTests).toBe(1);
      expect(run.durationMs).toBe(45000);
      expect(run.metadata).toEqual({ runner: 'ubuntu-latest', node: '22.x' });
      expect(run.executedAt).toEqual(executedAt);
    });

    it('rejects an unknown projectId with ForeignKeyError', async () => {
      try {
        await repo.create({
          ...makeNewRun(),
          projectId: '00000000-0000-0000-0000-000000000000',
        });
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ForeignKeyError);
        if (err instanceof ForeignKeyError) {
          expect(err.constraint).toBe('test_runs_project_id_fkey');
        }
      }
    });

    it('round-trips nested JSONB metadata', async () => {
      const metadata = {
        ci: { runner: 'ubuntu-latest', node: '22.x' },
        flags: ['--coverage', '--verbose'],
        retry: 1,
      };
      const run = await repo.create(makeNewRun({ metadata }));
      expect(run.metadata).toEqual(metadata);

      const reloaded = await repo.findById(run.id);
      expect(reloaded?.metadata).toEqual(metadata);
    });

    it('does NOT persist the run when withTransaction rolls back', async () => {
      const rollbackErr = new Error('intentional rollback');
      let createdId: string | undefined;

      await expect(
        withTransaction(pool, async (tx) => {
          const run = await repo.create(makeNewRun(), tx);
          createdId = run.id;
          throw rollbackErr;
        }),
      ).rejects.toBe(rollbackErr);

      expect(createdId).toBeDefined();
      const reloaded = await repo.findById(createdId!);
      expect(reloaded).toBeNull();
    });

    it('persists the run when withTransaction commits', async () => {
      let createdId: string | undefined;
      await withTransaction(pool, async (tx) => {
        const run = await repo.create(makeNewRun(), tx);
        createdId = run.id;
      });

      const reloaded = await repo.findById(createdId!);
      expect(reloaded).not.toBeNull();
      expect(reloaded?.id).toBe(createdId);
    });
  });

  describe('findById', () => {
    it('returns the run for a known id', async () => {
      const created = await repo.create(makeNewRun({ branch: 'feature-x' }));
      const found = await repo.findById(created.id);
      expect(found).toEqual(created);
    });

    it('returns null for an unknown id', async () => {
      const found = await repo.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('listByProject', () => {
    it('returns { items: [], total: 0 } when the project has no runs', async () => {
      const result = await repo.listByProject(projectId, { limit: 10, offset: 0 });
      expect(result).toEqual({ items: [], total: 0 });
    });

    it('returns all runs for the project with no filter', async () => {
      await repo.create(makeNewRun({ branch: 'main' }));
      await repo.create(makeNewRun({ branch: 'feat-a' }));
      await repo.create(makeNewRun({ branch: 'feat-b' }));

      const result = await repo.listByProject(projectId, { limit: 10, offset: 0 });
      expect(result.items.length).toBe(3);
      expect(result.total).toBe(3);
    });

    it('excludes runs from other projects', async () => {
      const otherProject = await projectRepo.create({ slug: 'other', name: 'Other' });
      await repo.create(makeNewRun());
      await repo.create(makeNewRun());
      await repo.create(makeNewRun({ projectId: otherProject.id }));

      const result = await repo.listByProject(projectId, { limit: 10, offset: 0 });
      expect(result.items.length).toBe(2);
      expect(result.total).toBe(2);
      expect(result.items.every((r) => r.projectId === projectId)).toBe(true);
    });

    it('filters by branch only', async () => {
      await repo.create(makeNewRun({ branch: 'main' }));
      await repo.create(makeNewRun({ branch: 'main' }));
      await repo.create(makeNewRun({ branch: 'feat-x' }));

      const result = await repo.listByProject(projectId, {
        limit: 10,
        offset: 0,
        branch: 'main',
      });
      expect(result.total).toBe(2);
      expect(result.items.every((r) => r.branch === 'main')).toBe(true);
    });

    it('filters by environment only', async () => {
      await repo.create(makeNewRun({ environment: 'prod' }));
      await repo.create(makeNewRun({ environment: 'staging' }));
      await repo.create(makeNewRun({ environment: 'staging' }));

      const result = await repo.listByProject(projectId, {
        limit: 10,
        offset: 0,
        environment: 'staging',
      });
      expect(result.total).toBe(2);
      expect(result.items.every((r) => r.environment === 'staging')).toBe(true);
    });

    it('filters by branch AND environment together', async () => {
      await repo.create(makeNewRun({ branch: 'main', environment: 'prod' }));
      await repo.create(makeNewRun({ branch: 'main', environment: 'staging' }));
      await repo.create(makeNewRun({ branch: 'feat-x', environment: 'prod' }));

      const result = await repo.listByProject(projectId, {
        limit: 10,
        offset: 0,
        branch: 'main',
        environment: 'prod',
      });
      expect(result.total).toBe(1);
      expect(result.items[0].branch).toBe('main');
      expect(result.items[0].environment).toBe('prod');
    });

    it('paginates correctly over 12 rows with executed_at DESC ordering', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 12; i += 1) {
        const run = await repo.create(
          makeNewRun({ executedAt: new Date(Date.UTC(2026, 0, 1 + i)) }),
        );
        ids.push(run.id);
      }
      ids.reverse();

      const page1 = await repo.listByProject(projectId, { limit: 5, offset: 0 });
      expect(page1.total).toBe(12);
      expect(page1.items.map((r) => r.id)).toEqual(ids.slice(0, 5));

      const page2 = await repo.listByProject(projectId, { limit: 5, offset: 5 });
      expect(page2.total).toBe(12);
      expect(page2.items.map((r) => r.id)).toEqual(ids.slice(5, 10));

      const page3 = await repo.listByProject(projectId, { limit: 5, offset: 10 });
      expect(page3.total).toBe(12);
      expect(page3.items.length).toBe(2);
      expect(page3.items.map((r) => r.id)).toEqual(ids.slice(10, 12));
    });
  });

  describe('findMostRecentByProject', () => {
    it('returns the run with the most recent executedAt', async () => {
      await repo.create(makeNewRun({ executedAt: new Date('2026-05-01T10:00:00Z') }));
      const middle = await repo.create(
        makeNewRun({ executedAt: new Date('2026-05-15T10:00:00Z') }),
      );
      const latest = await repo.create(
        makeNewRun({ executedAt: new Date('2026-05-20T10:00:00Z') }),
      );
      void middle;

      const result = await repo.findMostRecentByProject(projectId);
      expect(result?.id).toBe(latest.id);
    });

    it('prefers a run with executedAt over a run with NULL executedAt (NULLS LAST)', async () => {
      await repo.create(makeNewRun()); // no executedAt
      const withExec = await repo.create(
        makeNewRun({ executedAt: new Date('2026-05-01T10:00:00Z') }),
      );
      await repo.create(makeNewRun()); // another no-executedAt

      const result = await repo.findMostRecentByProject(projectId);
      expect(result?.id).toBe(withExec.id);
    });

    it('returns the most-recently-ingested run when all have NULL executedAt (ingested_at DESC tie-breaker)', async () => {
      await repo.create(makeNewRun());
      await new Promise((r) => setTimeout(r, 10));
      await repo.create(makeNewRun());
      await new Promise((r) => setTimeout(r, 10));
      const newest = await repo.create(makeNewRun());

      const result = await repo.findMostRecentByProject(projectId);
      expect(result?.id).toBe(newest.id);
    });

    it('returns null when the project has no runs', async () => {
      const result = await repo.findMostRecentByProject(projectId);
      expect(result).toBeNull();
    });
  });
});
