import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../../../src/app.js';
import { createTestPool } from '../../test-pool.js';
import { truncateAll } from '../../truncate.js';
import type { TestCaseStatus } from '../../../../src/domain/enums/test-case-status.js';

const MISSING_UUID = '00000000-0000-0000-0000-000000000000';

describe('GET /api/v1/projects/:projectId/overview (integration)', () => {
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
    await app.repos.testCases.createMany([
      {
        projectId,
        testRunId: run.id,
        testName: fullName,
        fullName,
        status,
        retryCount: 0,
        metadata: {},
      },
    ]);
  }

  it('200 returns full overview shape with ingested data', async () => {
    await seedExecution('a', 'PASSED');
    await seedExecution('b', 'PASSED');
    await seedExecution('c', 'FAILED');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/overview`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.totalRuns).toBe(3);
    expect(body.data.totalTestCases).toBe(3);
    expect(body.data.passedTestCases).toBe(2);
    expect(body.data.failedTestCases).toBe(1);
    expect(body.data.skippedTestCases).toBe(0);
    expect(body.data.recentPassRate).toBeCloseTo(2 / 3, 5);
    expect(['HEALTHY', 'WARNING', 'CRITICAL']).toContain(body.data.healthStatus);
    expect(Array.isArray(body.data.topFlakyTests)).toBe(true);
    expect(body.data.topFailurePatterns).toEqual([]);
  });

  it('200 returns zero counts and HEALTHY for an empty project', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/overview`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.totalRuns).toBe(0);
    expect(body.data.totalTestCases).toBe(0);
    expect(body.data.passedTestCases).toBe(0);
    expect(body.data.failedTestCases).toBe(0);
    expect(body.data.skippedTestCases).toBe(0);
    expect(body.data.recentPassRate).toBe(1);
    expect(body.data.healthStatus).toBe('HEALTHY');
    expect(body.data.topFlakyTests).toEqual([]);
    expect(body.data.topFailurePatterns).toEqual([]);
  });

  it('404 PROJECT_NOT_FOUND for unknown projectId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${MISSING_UUID}/overview`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('PROJECT_NOT_FOUND');
  });
});
