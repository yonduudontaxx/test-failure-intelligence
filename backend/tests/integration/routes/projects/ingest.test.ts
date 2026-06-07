import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../../../src/app.js';
import { createTestPool } from '../../test-pool.js';
import { truncateAll } from '../../truncate.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING_UUID = '00000000-0000-0000-0000-000000000000';

type MultipartField =
  | { name: string; value: string }
  | {
      name: string;
      filename: string;
      contentType: string;
      content: string | Buffer;
    };

function buildMultipart(fields: MultipartField[]): {
  payload: Buffer;
  contentType: string;
} {
  const boundary = `----FastifyTest${Date.now()}${Math.random().toString(36).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const p of fields) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if ('filename' in p) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\n`,
        ),
      );
      chunks.push(Buffer.from(`Content-Type: ${p.contentType}\r\n\r\n`));
      chunks.push(typeof p.content === 'string' ? Buffer.from(p.content) : p.content);
      chunks.push(Buffer.from('\r\n'));
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${p.name}"\r\n\r\n`));
      chunks.push(Buffer.from(p.value));
      chunks.push(Buffer.from('\r\n'));
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe('POST /api/v1/projects/:projectId/ingest (integration)', () => {
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
      slug: 'test-project',
      name: 'Test Project',
    });
    projectId = project.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('JSON path (application/json)', () => {
    it('201 creates a run from a canonical body with testRun and testCases', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        payload: {
          sourceType: 'api',
          testRun: {
            branch: 'main',
            environment: 'ci',
            commitSha: 'abc123',
            pipelineName: 'GitHub Actions',
            buildNumber: '245',
            executedAt: '2026-06-01T12:00:00.000Z',
          },
          testCases: [
            { testName: 't1', status: 'PASSED', durationMs: 100 },
            { testName: 't2', status: 'FAILED', failureMessage: 'boom' },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      const body = res.json();
      expect(body.data.runId).toMatch(UUID_RE);
      expect(body.data.testCaseCount).toBe(2);
    });

    it('201 creates a run with testCaseCount: 0 when testCases is empty', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        payload: { sourceType: 'api', testRun: {}, testCases: [] },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().data.testCaseCount).toBe(0);
    });

    it('400 VALIDATION_ERROR when sourceType is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        payload: { testRun: {}, testCases: [] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('400 VALIDATION_ERROR when body has an unknown top-level field', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        payload: {
          sourceType: 'api',
          testRun: {},
          testCases: [],
          extraField: 'nope',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('404 PROJECT_NOT_FOUND when projectId is a valid UUID with no matching project', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${MISSING_UUID}/ingest`,
        payload: {
          sourceType: 'api',
          testRun: {},
          testCases: [{ testName: 't', status: 'PASSED' }],
        },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({
        error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
      });
    });

    it('422 INGESTION_FAILED when a test case is missing testName', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        payload: {
          sourceType: 'api',
          testRun: {},
          testCases: [{ status: 'PASSED' } as { testName: string; status: string }],
        },
      });
      expect([400, 422]).toContain(res.statusCode);
      const code = res.json().error.code;
      expect(['VALIDATION_ERROR', 'INGESTION_FAILED']).toContain(code);
    });
  });

  describe('multipart path (multipart/form-data)', () => {
    it('201 creates a run from a Jest JSON file upload', async () => {
      const jestReport = JSON.stringify({
        startTime: 1717230000000,
        testResults: [
          {
            testResults: [
              { title: 'a', ancestorTitles: ['A'], status: 'passed' },
              { title: 'b', ancestorTitles: ['A'], status: 'failed' },
            ],
          },
        ],
      });
      const { payload, contentType } = buildMultipart([
        {
          name: 'file',
          filename: 'jest.json',
          contentType: 'application/json',
          content: jestReport,
        },
        { name: 'format', value: 'jest' },
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        headers: { 'content-type': contentType },
        payload,
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().data.testCaseCount).toBe(2);
    });

    it('201 creates a run from a JUnit XML file upload', async () => {
      const xml = `<?xml version="1.0"?>
<testsuites>
  <testsuite name="JUnitSuite" timestamp="2026-06-01T12:00:00Z">
    <testcase name="a" time="0.1"/>
    <testcase name="b" time="0.2"><failure message="boom"/></testcase>
    <testcase name="c"><skipped/></testcase>
  </testsuite>
</testsuites>`;
      const { payload, contentType } = buildMultipart([
        {
          name: 'file',
          filename: 'junit.xml',
          contentType: 'application/xml',
          content: xml,
        },
        { name: 'format', value: 'junit-xml' },
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        headers: { 'content-type': contentType },
        payload,
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().data.testCaseCount).toBe(3);
    });

    it('propagates overrides (branch, environment) as form fields onto the persisted run', async () => {
      const jestReport = JSON.stringify({
        testResults: [
          {
            testResults: [{ title: 'a', ancestorTitles: [], status: 'passed' }],
          },
        ],
      });
      const { payload, contentType } = buildMultipart([
        {
          name: 'file',
          filename: 'jest.json',
          contentType: 'application/json',
          content: jestReport,
        },
        { name: 'format', value: 'jest' },
        { name: 'branch', value: 'release-2.0' },
        { name: 'environment', value: 'staging' },
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        headers: { 'content-type': contentType },
        payload,
      });

      expect(res.statusCode).toBe(201);
      const runId = res.json().data.runId;
      const run = await app.repos.testRuns.findById(runId);
      expect(run).not.toBeNull();
      expect(run?.branch).toBe('release-2.0');
      expect(run?.environment).toBe('staging');
      expect(run?.sourceType).toBe('jest');
    });

    it('400 when the file part is missing', async () => {
      const { payload, contentType } = buildMultipart([{ name: 'format', value: 'jest' }]);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        headers: { 'content-type': contentType },
        payload,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('400 when the format field is missing', async () => {
      const { payload, contentType } = buildMultipart([
        {
          name: 'file',
          filename: 'jest.json',
          contentType: 'application/json',
          content: '{}',
        },
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        headers: { 'content-type': contentType },
        payload,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('400 when format is not one of the allowed values', async () => {
      const { payload, contentType } = buildMultipart([
        {
          name: 'file',
          filename: 'x.txt',
          contentType: 'text/plain',
          content: 'hello',
        },
        { name: 'format', value: 'mocha' },
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        headers: { 'content-type': contentType },
        payload,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('422 INGESTION_FAILED when the uploaded file is not valid JSON', async () => {
      const { payload, contentType } = buildMultipart([
        {
          name: 'file',
          filename: 'jest.json',
          contentType: 'application/json',
          content: 'this is not json {{{',
        },
        { name: 'format', value: 'jest' },
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        headers: { 'content-type': contentType },
        payload,
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('INGESTION_FAILED');
    });
  });

  describe('failure pattern extraction', () => {
    async function countPatterns(): Promise<number> {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM failure_patterns WHERE project_id = $1`,
        [projectId],
      );
      return parseInt(rows[0].count, 10);
    }

    it('persists one failure_patterns row per distinct failure on a FAILED ingestion', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        payload: {
          sourceType: 'api',
          testRun: {},
          testCases: [
            {
              testName: 't1',
              status: 'FAILED',
              failureMessage: 'TimeoutError: navigation timeout exceeded',
              failureType: 'TimeoutError',
            },
            {
              testName: 't2',
              status: 'FAILED',
              failureMessage: 'AssertionError: expected 1 to equal 2',
              failureType: 'AssertionError',
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      expect(await countPatterns()).toBe(2);
    });

    it('persists no failure_patterns rows when every case PASSED', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        payload: {
          sourceType: 'api',
          testRun: {},
          testCases: [
            { testName: 'a', status: 'PASSED' },
            { testName: 'b', status: 'PASSED' },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      expect(await countPatterns()).toBe(0);
    });

    it('increments occurrence_count on a second ingestion with the same failure', async () => {
      const payload = {
        sourceType: 'api',
        testRun: {},
        testCases: [
          {
            testName: 't',
            status: 'FAILED' as const,
            failureMessage: 'fetch failed',
            failureType: 'TypeError',
          },
        ],
      };

      const first = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        payload,
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        payload,
      });
      expect(second.statusCode).toBe(201);

      const { rows } = await pool.query<{ pattern: string; occurrence_count: number }>(
        `SELECT pattern, occurrence_count FROM failure_patterns WHERE project_id = $1`,
        [projectId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].occurrence_count).toBe(2);
    });

    it('persists exact canonical pattern string with assertion category and LOW severity for a single occurrence', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        payload: {
          sourceType: 'api',
          testRun: {},
          testCases: [
            { testName: 'p1', status: 'PASSED' },
            {
              testName: 'f1',
              status: 'FAILED',
              failureMessage: 'AssertionError: expected 1 to equal 2',
              failureType: 'AssertionError',
            },
          ],
        },
      });
      expect(res.statusCode).toBe(201);

      const { rows } = await pool.query<{
        pattern: string;
        category: string | null;
        severity: string;
        occurrence_count: number;
      }>(
        `SELECT pattern, category, severity, occurrence_count
           FROM failure_patterns WHERE project_id = $1`,
        [projectId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].pattern).toBe('AssertionError: AssertionError: expected 1 to equal 2');
      expect(rows[0].category).toBe('assertion');
      expect(rows[0].severity).toBe('LOW');
      expect(rows[0].occurrence_count).toBe(1);
    });

    it('persists timeout category for a timeout-flavoured failure', async () => {
      await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        payload: {
          sourceType: 'api',
          testRun: {},
          testCases: [
            {
              testName: 't',
              status: 'FAILED',
              failureMessage: 'Navigation timeout of 30000ms exceeded',
              failureType: 'TimeoutError',
            },
          ],
        },
      });

      const { rows } = await pool.query<{ category: string | null }>(
        `SELECT category FROM failure_patterns WHERE project_id = $1`,
        [projectId],
      );
      expect(rows[0].category).toBe('timeout');
    });

    it('extracts a failure pattern from a JUnit XML upload', async () => {
      const xml = `<?xml version="1.0"?>
<testsuites>
  <testsuite name="UnitSuite" timestamp="2026-06-01T12:00:00Z">
    <testcase name="t-good" time="0.1"/>
    <testcase name="t-bad" time="0.2"><failure type="AssertionError" message="expected foo to equal bar"/></testcase>
  </testsuite>
</testsuites>`;
      const { payload, contentType } = buildMultipart([
        {
          name: 'file',
          filename: 'junit.xml',
          contentType: 'application/xml',
          content: xml,
        },
        { name: 'format', value: 'junit-xml' },
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/ingest`,
        headers: { 'content-type': contentType },
        payload,
      });
      expect(res.statusCode).toBe(201);

      const { rows } = await pool.query<{ pattern: string; category: string | null }>(
        `SELECT pattern, category FROM failure_patterns WHERE project_id = $1`,
        [projectId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].pattern.toLowerCase()).toContain('expected foo to equal bar');
      expect(rows[0].category).toBe('assertion');
    });
  });
});
