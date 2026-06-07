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

  describe('topFailurePatterns and topCriticalIssues', () => {
    it('topFailurePatterns is populated after ingestion of FAILED cases', async () => {
      const ingest = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        payload: {
          sourceType: 'api',
          testRun: {},
          testCases: [
            {
              testName: 't1',
              status: 'FAILED',
              failureMessage: 'TimeoutError: navigation timeout',
              failureType: 'TimeoutError',
            },
            {
              testName: 't2',
              status: 'FAILED',
              failureMessage: 'AssertionError: expected x',
              failureType: 'AssertionError',
            },
          ],
        },
      });
      expect(ingest.statusCode).toBe(201);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/overview`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.topFailurePatterns.length).toBeGreaterThan(0);
      expect(body.data.topFailurePatterns[0]).toEqual(
        expect.objectContaining({
          pattern: expect.any(String),
          severity: expect.any(String),
          occurrenceCount: expect.any(Number),
        }),
      );
    });

    it('topFailurePatterns and topCriticalIssues are empty arrays for a healthy project', async () => {
      await seedExecution('healthy', 'PASSED');

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/overview`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.topFailurePatterns).toEqual([]);
      expect(body.data.topCriticalIssues).toEqual([]);
    });

    it('surfaces the exact pattern string and severity in topFailurePatterns after ingestion', async () => {
      await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        payload: {
          sourceType: 'api',
          testRun: {},
          testCases: [
            {
              testName: 't1',
              status: 'FAILED',
              failureMessage: 'Navigation timeout of 30000 ms exceeded',
              failureType: 'TimeoutError',
            },
          ],
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/overview`,
      });
      expect(res.statusCode).toBe(200);
      const item = res.json().data.topFailurePatterns[0];
      expect(item.pattern).toBe('TimeoutError: Navigation timeout of <N> ms exceeded');
      expect(item.severity).toBe('LOW');
      expect(item.occurrenceCount).toBe(1);
    });

    it('populates topCriticalIssues after ingesting three distinct BROKEN tests', async () => {
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
                failureMessage: `boom ${name}`,
                failureType: 'Error',
              },
            ],
          },
        });
      }

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/overview`,
      });
      expect(res.statusCode).toBe(200);
      const codes = res.json().data.topCriticalIssues.map((c: { code: string }) => c.code);
      expect(codes).toContain('BROKEN_TESTS_THRESHOLD');
    });
  });
});
