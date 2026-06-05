import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../../../src/app.js';
import { createTestPool } from '../../test-pool.js';
import { truncateAll } from '../../truncate.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('POST /api/v1/projects (integration)', () => {
  let pool: Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    pool = createTestPool();
    app = await buildApp({ pool, logger: false });
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('201 happy path', () => {
    it('creates a project with name, slug, and description and returns the success envelope', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        payload: {
          name: 'Service A',
          slug: 'svc-a',
          description: 'A service we own',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      const body = response.json();
      expect(body).toEqual({
        data: {
          id: expect.stringMatching(UUID_RE),
          slug: 'svc-a',
          name: 'Service A',
          description: 'A service we own',
          createdAt: expect.stringMatching(ISO_8601_RE),
          updatedAt: expect.stringMatching(ISO_8601_RE),
        },
      });
    });

    it('omits description from the response when not provided in the request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        payload: { name: 'No Description', slug: 'no-description' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.description).toBeUndefined();
      expect('description' in body.data).toBe(false);
    });
  });

  describe('400 VALIDATION_ERROR', () => {
    it('rejects a body missing the required name field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        payload: { slug: 'no-name' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a body missing the required slug field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        payload: { name: 'No Slug' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a slug containing uppercase characters', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        payload: { name: 'Bad Slug', slug: 'My-Slug' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a slug containing spaces', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        payload: { name: 'Bad Slug', slug: 'my slug' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a slug containing underscores or other special chars', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        payload: { name: 'Bad Slug', slug: 'my_slug' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an unknown field in the body (additionalProperties: false)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        payload: {
          name: 'Service',
          slug: 'service',
          foo: 'bar',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('409 DUPLICATE_PROJECT_SLUG', () => {
    it('rejects creating a second project with the same slug', async () => {
      const payload = { name: 'First', slug: 'duplicate-slug' };

      const first = await app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        payload,
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        payload: { ...payload, name: 'Second' },
      });

      expect(second.statusCode).toBe(409);
      const body = second.json();
      expect(body.error.code).toBe('DUPLICATE_PROJECT_SLUG');
    });
  });
});
