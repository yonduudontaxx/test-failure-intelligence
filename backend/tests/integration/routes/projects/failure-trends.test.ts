import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../../../src/app.js';
import { createTestPool } from '../../test-pool.js';
import { truncateAll } from '../../truncate.js';
import type { NewTestRun, TestRun } from '../../../../src/domain/entities/test-run.js';

const MISSING_UUID = '00000000-0000-0000-0000-000000000000';

describe('GET /api/v1/projects/:projectId/failure-trends (integration)', () => {
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

  function daysAgo(n: number): Date {
    return new Date(Date.now() - n * 86_400_000);
  }

  async function createRun(overrides: Partial<NewTestRun> = {}): Promise<TestRun> {
    return app.repos.testRuns.create({
      projectId,
      sourceType: 'api',
      status: 'SUCCESS',
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      metadata: {},
      ...overrides,
    });
  }

  it('200 returns buckets in date ASC order', async () => {
    await createRun({ executedAt: daysAgo(3) });
    await createRun({ executedAt: daysAgo(3), status: 'FAILED' });
    await createRun({ executedAt: daysAgo(1) });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/failure-trends?days=30&bucketSize=day`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items[0].date < body.data.items[1].date).toBe(true);
    expect(body.data.items[0].totalRuns).toBe(2);
    expect(body.data.items[0].failedRuns).toBe(1);
    expect(body.data.items[0].passRate).toBeCloseTo(0.5, 5);
    expect(body.data.items[1].totalRuns).toBe(1);
    expect(body.data.items[1].failedRuns).toBe(0);
  });

  it('200 returns empty items when no runs exist in window', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/failure-trends`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ items: [] });
  });

  it('404 PROJECT_NOT_FOUND for unknown projectId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${MISSING_UUID}/failure-trends`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('400 VALIDATION_ERROR for invalid days', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/failure-trends?days=999`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('400 VALIDATION_ERROR for invalid bucketSize', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/failure-trends?bucketSize=hour`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('200 weekly bucketing groups runs from the same ISO week into one bucket', async () => {
    // Find the most recent Monday at least 7 days ago (so the whole week is inside the 30-day window).
    const now = new Date();
    const dow = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysSinceMonday = (dow + 6) % 7;
    const referenceMonday = new Date(now);
    referenceMonday.setUTCDate(now.getUTCDate() - daysSinceMonday - 7);
    referenceMonday.setUTCHours(10, 0, 0, 0);

    const wednesday = new Date(referenceMonday);
    wednesday.setUTCDate(referenceMonday.getUTCDate() + 2);
    const friday = new Date(referenceMonday);
    friday.setUTCDate(referenceMonday.getUTCDate() + 4);

    await createRun({ executedAt: referenceMonday });
    await createRun({ executedAt: wednesday });
    await createRun({ executedAt: friday, status: 'FAILED' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/failure-trends?days=30&bucketSize=week`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].totalRuns).toBe(3);
    expect(body.data.items[0].failedRuns).toBe(1);
  });
});
