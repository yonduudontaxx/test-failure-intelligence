import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../../../src/app.js';
import { createTestPool } from '../../test-pool.js';
import { truncateAll } from '../../truncate.js';
import type { TestCaseStatus } from '../../../../src/domain/enums/test-case-status.js';

const MISSING_UUID = '00000000-0000-0000-0000-000000000000';

describe('GET /api/v1/projects/:projectId/health (integration)', () => {
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

  it('200 HEALTHY when all runs pass and no flaky/broken tests', async () => {
    await seedExecution('a', 'PASSED');
    await seedExecution('b', 'PASSED');
    await seedExecution('c', 'PASSED');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/health`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe('HEALTHY');
    expect(body.data.totalRuns).toBe(3);
    expect(body.data.passRate).toBe(100);
    expect(body.data.failureRate).toBe(0);
    expect(body.data.brokenTestCount).toBe(0);
    expect(body.data.flakyTestCount).toBe(0);
    expect(body.data.windowDays).toBe(30);
  });

  it('200 returns WARNING or CRITICAL when there are failing runs and broken tests', async () => {
    // 4 broken tests → triggers CRITICAL (brokenTestCount >= 3)
    await seedExecution('broken-1', 'FAILED');
    await seedExecution('broken-2', 'FAILED');
    await seedExecution('broken-3', 'FAILED');
    await seedExecution('broken-4', 'FAILED');
    await seedExecution('passing', 'PASSED');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/health`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(['WARNING', 'CRITICAL']).toContain(body.data.status);
    expect(body.data.brokenTestCount).toBe(4);
    expect(body.data.totalRuns).toBe(5);
    expect(body.data.failureRate).toBeGreaterThan(0);
  });

  it('200 HEALTHY when there are no runs in the window', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/health`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe('HEALTHY');
    expect(body.data.totalRuns).toBe(0);
    expect(body.data.passRate).toBe(100);
    expect(body.data.failureRate).toBe(0);
  });

  it('404 PROJECT_NOT_FOUND for unknown projectId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${MISSING_UUID}/health`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('400 VALIDATION_ERROR for invalid days', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/health?days=999`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  describe('warnings and critical issues', () => {
    it('returns empty warnings and criticalIssues for a healthy project', async () => {
      await seedExecution('a', 'PASSED');
      await seedExecution('b', 'PASSED');

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/health`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.warnings).toEqual([]);
      expect(body.data.criticalIssues).toEqual([]);
    });

    it('emits BROKEN_TESTS_PRESENT warning when a test is BROKEN', async () => {
      // Same test failing three times across runs → BROKEN
      const broken = 'broken-test';
      await seedExecution(broken, 'FAILED');
      await seedExecution(broken, 'FAILED');
      await seedExecution(broken, 'FAILED');
      // and one passing test so totalRuns > 0 path is exercised
      await seedExecution('healthy', 'PASSED');

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/health`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const warningCodes = body.data.warnings.map((w: { code: string }) => w.code);
      expect(warningCodes).toContain('BROKEN_TESTS_PRESENT');
    });

    it('emits BROKEN_TESTS_THRESHOLD critical when three distinct tests are BROKEN via ingest', async () => {
      for (const name of ['b1', 'b2', 'b3']) {
        await app.inject({
          method: 'POST',
          url: `/api/v1/projects/${projectId}/ingest`,
          payload: {
            sourceType: 'api',
            testRun: {},
            testCases: [
              {
                testName: name,
                status: 'FAILED',
                failureMessage: `boom for ${name}`,
                failureType: 'Error',
              },
            ],
          },
        });
      }

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/health`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const criticalCodes = body.data.criticalIssues.map((c: { code: string }) => c.code);
      const warningCodes = body.data.warnings.map((w: { code: string }) => w.code);
      expect(criticalCodes).toContain('BROKEN_TESTS_THRESHOLD');
      expect(warningCodes).toContain('BROKEN_TESTS_PRESENT');
      expect(body.data.status).toBe('CRITICAL');
    });

    it('warnings array stays empty after ingesting only PASSED cases', async () => {
      await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        payload: {
          sourceType: 'api',
          testRun: {},
          testCases: [
            { testName: 'p1', status: 'PASSED' },
            { testName: 'p2', status: 'PASSED' },
          ],
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/health`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.warnings).toEqual([]);
      expect(body.data.criticalIssues).toEqual([]);
      expect(body.data.status).toBe('HEALTHY');
    });
  });
});
