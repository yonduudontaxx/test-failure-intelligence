import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import errorHandlerPlugin from '../../../../src/http/plugins/error-handler.js';
import { ForeignKeyError, UniqueConstraintError } from '../../../../src/domain/errors/index.js';
import { IngestionFailedError } from '../../../../src/application/ingestion/errors.js';

describe('error-handler plugin', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(sensible);
    await app.register(errorHandlerPlugin);

    app.post(
      '/api/v1/validation',
      {
        schema: {
          body: {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string' } },
            additionalProperties: false,
          },
        },
      },
      async () => ({ ok: true }),
    );

    app.get('/api/v1/duplicate-slug', async () => {
      throw new UniqueConstraintError(
        'projects_slug_key',
        'Key (slug)=(my-service) already exists.',
      );
    });

    app.get<{ Params: { id: string } }>('/api/v1/projects/:id', async (req) => {
      throw app.httpErrors.notFound(`Project with id "${req.params.id}" not found.`);
    });

    app.get('/api/v1/boom', async () => {
      throw new Error('database exploded; secret token: abc123');
    });

    app.get('/api/v1/projects/abc/ingest', async () => {
      throw new IngestionFailedError('Playwright report has no "suites" array.');
    });

    app.get('/api/v1/projects/missing/ingest', async () => {
      throw new ForeignKeyError(
        'test_runs_project_id_fkey',
        'Key (project_id)=(00000000-0000-0000-0000-000000000000) is not present in table "projects".',
      );
    });

    app.get('/api/v1/projects/p1/runs/r-missing', async () => {
      throw app.httpErrors.notFound('Run not found');
    });

    app.get('/api/v1/ingest-other-fk', async () => {
      throw new ForeignKeyError(
        'test_case_results_test_run_id_fkey',
        'Key (test_run_id)=(some-uuid) is not present in table "test_runs".',
      );
    });

    app.get('/health', async () => {
      throw new Error('health route internal failure');
    });

    app.get('/some-other-route', async () => {
      throw new Error('non-api route failure');
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('within /api/v1', () => {
    it('maps Ajv validation errors to 400 VALIDATION_ERROR', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/validation',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(typeof body.error.message).toBe('string');
      expect(body.error.message.length).toBeGreaterThan(0);
    });

    it('maps UniqueConstraintError(projects_slug_key) to 409 DUPLICATE_PROJECT_SLUG', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/duplicate-slug',
      });

      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.error.code).toBe('DUPLICATE_PROJECT_SLUG');
      expect(typeof body.error.message).toBe('string');
      expect(body.error.message.length).toBeGreaterThan(0);
    });

    it('maps 404 on /api/v1/projects/* to 404 PROJECT_NOT_FOUND', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/projects/abc-123',
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.error.code).toBe('PROJECT_NOT_FOUND');
      expect(body.error.message).toContain('abc-123');
    });

    it('maps 404 on /api/v1/projects/*/runs/* to 404 RUN_NOT_FOUND (more specific than the projects branch)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/projects/p1/runs/r-missing',
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.error.code).toBe('RUN_NOT_FOUND');
      expect(body.error.message).toBe('Run not found');
    });

    it('maps IngestionFailedError to 422 INGESTION_FAILED with the adapter message', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/projects/abc/ingest',
      });

      expect(res.statusCode).toBe(422);
      const body = res.json();
      expect(body.error.code).toBe('INGESTION_FAILED');
      expect(body.error.message).toBe('Playwright report has no "suites" array.');
    });

    it('maps ForeignKeyError(test_runs_project_id_fkey) to 404 PROJECT_NOT_FOUND with a fixed message', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/projects/missing/ingest',
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body).toEqual({
        error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
      });
      // The constraint name and SQL detail must not leak through this branch.
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('test_runs_project_id_fkey');
      expect(serialized).not.toContain('Key (project_id)');
    });

    it('falls through to 500 INTERNAL_ERROR for ForeignKeyError on other constraints without leaking the constraint name', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ingest-other-fk',
      });

      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('Internal server error');
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('test_case_results_test_run_id_fkey');
      expect(serialized).not.toContain('Key (test_run_id)');
      expect(serialized).not.toContain('test_runs');
    });

    it('maps generic errors to 500 INTERNAL_ERROR without leaking internal details', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/boom' });

      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('Internal server error');
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('database');
      expect(serialized).not.toContain('secret');
      expect(serialized).not.toContain('abc123');
    });
  });

  describe('outside /api/v1 (pass-through)', () => {
    it('does not wrap errors from /health in the envelope', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });

      expect(res.statusCode).toBe(500);
      const body = res.json();
      // Fastify default error shape — body.error is a status string, not an object
      expect(typeof body.error).toBe('string');
    });

    it('does not wrap errors from other non-/api/v1 routes in the envelope', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/some-other-route',
      });

      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(typeof body.error).toBe('string');
    });
  });
});
