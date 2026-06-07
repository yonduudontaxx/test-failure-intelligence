import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../../../src/app.js';
import { createTestPool } from '../../test-pool.js';
import { truncateAll } from '../../truncate.js';
import type { NewTestRun } from '../../../../src/domain/entities/test-run.js';

const MISSING_UUID = '00000000-0000-0000-0000-000000000000';

describe('test-run query endpoints (integration)', () => {
  let pool: Pool;
  let app: FastifyInstance;
  let projectId: string;

  beforeAll(async () => {
    pool = createTestPool();
    app = await buildApp({ pool, logger: false });
  });

  beforeEach(async () => {
    await truncateAll(pool);
    const project = await app.repos.projects.create({
      slug: 'svc',
      name: 'Service',
    });
    projectId = project.id;
  });

  afterAll(async () => {
    await app.close();
  });

  function makeRun(overrides: Partial<NewTestRun> = {}): NewTestRun {
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

  describe('GET /api/v1/projects/:projectId/runs', () => {
    it('200 returns empty list when project has no runs', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/runs`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toEqual({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });
    });

    it('200 returns runs with correct items, total, page, limit', async () => {
      await app.repos.testRuns.create(makeRun({ branch: 'main' }));
      await app.repos.testRuns.create(makeRun({ branch: 'feat-a' }));
      await app.repos.testRuns.create(makeRun({ branch: 'feat-b', status: 'FAILED' }));

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/runs`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.items).toHaveLength(3);
      expect(body.data.total).toBe(3);
      expect(body.data.page).toBe(1);
      expect(body.data.limit).toBe(20);
    });

    it('200 honours the branch filter', async () => {
      await app.repos.testRuns.create(makeRun({ branch: 'main' }));
      await app.repos.testRuns.create(makeRun({ branch: 'main' }));
      await app.repos.testRuns.create(makeRun({ branch: 'feat-a' }));

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/runs?branch=main`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.items).toHaveLength(2);
      expect(body.data.total).toBe(2);
    });

    it('404 PROJECT_NOT_FOUND for unknown projectId', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${MISSING_UUID}/runs`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('PROJECT_NOT_FOUND');
    });

    it('400 VALIDATION_ERROR for limit out of bounds', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/runs?limit=500`,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/projects/:projectId/runs/:runId', () => {
    it('200 returns RunResponse on hit', async () => {
      const created = await app.repos.testRuns.create(makeRun({ branch: 'main' }));

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/runs/${created.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toMatchObject({
        id: created.id,
        projectId,
        branch: 'main',
        status: 'SUCCESS',
      });
      expect(body.data.ingestedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('404 RUN_NOT_FOUND for an unknown runId', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/runs/${MISSING_UUID}`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('RUN_NOT_FOUND');
    });

    it('404 RUN_NOT_FOUND when runId belongs to a different project', async () => {
      const otherProject = await app.repos.projects.create({
        slug: 'other',
        name: 'Other',
      });
      const otherRun = await app.repos.testRuns.create({
        ...makeRun(),
        projectId: otherProject.id,
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/runs/${otherRun.id}`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('RUN_NOT_FOUND');
    });
  });

  describe('GET /api/v1/projects/:projectId/runs/:runId/cases', () => {
    it('200 returns CaseResponse items for the run', async () => {
      const run = await app.repos.testRuns.create(makeRun());
      await app.repos.testCases.createMany([
        {
          projectId,
          testRunId: run.id,
          testName: 'a',
          fullName: 'Suite > a',
          status: 'PASSED',
          retryCount: 0,
          metadata: {},
        },
        {
          projectId,
          testRunId: run.id,
          testName: 'b',
          fullName: 'Suite > b',
          status: 'FAILED',
          failureMessage: 'boom',
          retryCount: 0,
          metadata: {},
        },
      ]);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/runs/${run.id}/cases`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.items).toHaveLength(2);
      expect(body.data.items[0]).toMatchObject({
        testName: 'a',
        fullName: 'Suite > a',
        status: 'PASSED',
      });
    });

    it('200 returns empty items when the run has no cases', async () => {
      const run = await app.repos.testRuns.create(makeRun());

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/runs/${run.id}/cases`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.items).toEqual([]);
    });

    it('404 RUN_NOT_FOUND for an unknown runId', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/runs/${MISSING_UUID}/cases`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('RUN_NOT_FOUND');
    });

    it('200 with status filter returns only matching cases', async () => {
      const run = await app.repos.testRuns.create(makeRun());
      await app.repos.testCases.createMany([
        {
          projectId,
          testRunId: run.id,
          testName: 'pass',
          fullName: 'pass',
          status: 'PASSED',
          retryCount: 0,
          metadata: {},
        },
        {
          projectId,
          testRunId: run.id,
          testName: 'fail',
          fullName: 'fail',
          status: 'FAILED',
          retryCount: 0,
          metadata: {},
        },
        {
          projectId,
          testRunId: run.id,
          testName: 'skip',
          fullName: 'skip',
          status: 'SKIPPED',
          retryCount: 0,
          metadata: {},
        },
      ]);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/runs/${run.id}/cases?status=FAILED`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].testName).toBe('fail');
    });
  });
});
