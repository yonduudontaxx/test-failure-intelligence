import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../../../src/app.js';
import { createTestPool } from '../../test-pool.js';
import { truncateAll } from '../../truncate.js';

const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MISSING_UUID = '00000000-0000-0000-0000-000000000000';

describe('GET /api/v1/projects/:projectId (integration)', () => {
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

  describe('200 hit', () => {
    it('returns the project envelope including description when present', async () => {
      const created = await app.repos.projects.create({
        slug: 'svc-a',
        name: 'Service A',
        description: 'A service we own',
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${created.id}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      const body = response.json();
      expect(body).toEqual({
        data: {
          id: created.id,
          slug: 'svc-a',
          name: 'Service A',
          description: 'A service we own',
          createdAt: expect.stringMatching(ISO_8601_RE),
          updatedAt: expect.stringMatching(ISO_8601_RE),
        },
      });
    });

    it('omits description from the response when the project has no description', async () => {
      const created = await app.repos.projects.create({
        slug: 'no-description',
        name: 'No Description',
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${created.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.description).toBeUndefined();
      expect('description' in body.data).toBe(false);
    });
  });

  describe('404 PROJECT_NOT_FOUND', () => {
    it('returns 404 with the PROJECT_NOT_FOUND envelope for an unknown UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${MISSING_UUID}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      const body = response.json();
      expect(body).toEqual({
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: expect.any(String),
        },
      });
      expect(body.error.message.length).toBeGreaterThan(0);
    });
  });
});
