import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../../../src/app.js';
import { createTestPool } from '../../test-pool.js';
import { truncateAll } from '../../truncate.js';
import type { NewTestCaseResult } from '../../../../src/domain/entities/test-case-result.js';
import type { TestCaseStatus } from '../../../../src/domain/enums/test-case-status.js';

const MISSING_UUID = '00000000-0000-0000-0000-000000000000';

describe('GET /api/v1/projects/:projectId/flaky-tests (integration)', () => {
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

  /** Create a run + a single case in that run for fullName=X with the given status. */
  async function seedExecution(
    fullName: string,
    status: TestCaseStatus,
    executedAt: Date = new Date(),
  ): Promise<void> {
    const run = await app.repos.testRuns.create({
      projectId,
      sourceType: 'api',
      status: status === 'FAILED' || status === 'ERROR' ? 'FAILED' : 'SUCCESS',
      totalTests: 1,
      passedTests: status === 'PASSED' ? 1 : 0,
      failedTests: status === 'FAILED' || status === 'ERROR' ? 1 : 0,
      skippedTests: status === 'SKIPPED' ? 1 : 0,
      metadata: {},
      executedAt,
    });
    const newCase: NewTestCaseResult = {
      projectId,
      testRunId: run.id,
      testName: fullName,
      fullName,
      status,
      retryCount: 0,
      metadata: {},
    };
    await app.repos.testCases.createMany([newCase]);
  }

  it('200 surfaces flaky and broken tests, excludes stable', async () => {
    // stable: 3 PASSED
    await seedExecution('stable', 'PASSED');
    await seedExecution('stable', 'PASSED');
    await seedExecution('stable', 'PASSED');
    // flaky: PASSED + FAILED + PASSED
    await seedExecution('flaky', 'PASSED');
    await seedExecution('flaky', 'FAILED');
    await seedExecution('flaky', 'PASSED');
    // broken: 2 FAILED
    await seedExecution('broken', 'FAILED');
    await seedExecution('broken', 'FAILED');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/flaky-tests`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.total).toBe(2);
    expect(body.data.items.map((i: { fullName: string }) => i.fullName).sort()).toEqual([
      'broken',
      'flaky',
    ]);
  });

  it('200 returns empty when all tests are stable', async () => {
    await seedExecution('a', 'PASSED');
    await seedExecution('b', 'PASSED');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/flaky-tests`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ items: [], total: 0 });
  });

  it('404 PROJECT_NOT_FOUND for unknown projectId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${MISSING_UUID}/flaky-tests`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('400 VALIDATION_ERROR for invalid days param', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/flaky-tests?days=999`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('200 days filter excludes executions outside the window', async () => {
    const now = new Date();
    const longAgo = new Date(now.getTime() - 86_400_000 * 60); // 60 days ago

    // recent: only PASSED → STABLE → excluded
    await seedExecution('recent-stable', 'PASSED', now);
    // old: PASSED + FAILED → outside default 30-day window → excluded
    await seedExecution('old-flaky', 'PASSED', longAgo);
    await seedExecution('old-flaky', 'FAILED', longAgo);
    // recent + flaky → included
    await seedExecution('recent-flaky', 'PASSED', now);
    await seedExecution('recent-flaky', 'FAILED', now);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/flaky-tests?days=30`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.total).toBe(1);
    expect(body.data.items[0].fullName).toBe('recent-flaky');
  });
});
