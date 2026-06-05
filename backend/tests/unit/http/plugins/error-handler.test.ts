import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import errorHandlerPlugin from '../../../../src/http/plugins/error-handler.js';
import { UniqueConstraintError } from '../../../../src/domain/errors/index.js';

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
