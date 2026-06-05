import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../../../src/app.js';
import { createTestPool } from '../../test-pool.js';
import { truncateAll } from '../../truncate.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('GET /api/v1/projects (integration)', () => {
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

  describe('200 success', () => {
    it('returns an empty list payload when no projects exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/projects',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      const body = response.json();
      expect(body).toEqual({
        data: { items: [], total: 0, page: 1, limit: 50 },
      });
    });

    it('returns all projects with correct total when items exist', async () => {
      for (let i = 0; i < 3; i += 1) {
        await app.repos.projects.create({
          slug: `svc-${i}`,
          name: `Service ${i}`,
        });
      }

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/projects',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.items).toHaveLength(3);
      expect(body.data.total).toBe(3);
    });

    it('orders items by createdAt DESC (most recent first)', async () => {
      const first = await app.repos.projects.create({
        slug: 'svc-first',
        name: 'First',
      });
      await sleep(10);
      const second = await app.repos.projects.create({
        slug: 'svc-second',
        name: 'Second',
      });
      await sleep(10);
      const third = await app.repos.projects.create({
        slug: 'svc-third',
        name: 'Third',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/projects',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      const ids = body.data.items.map((p: { id: string }) => p.id);
      expect(ids).toEqual([third.id, second.id, first.id]);
    });

    it('paginates with page=2 and limit=2 across 5 items', async () => {
      for (let i = 0; i < 5; i += 1) {
        await app.repos.projects.create({
          slug: `svc-${i}`,
          name: `Service ${i}`,
        });
        await sleep(10);
      }

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/projects?page=2&limit=2',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.items).toHaveLength(2);
      expect(body.data.total).toBe(5);
      expect(body.data.page).toBe(2);
      expect(body.data.limit).toBe(2);
    });

    it('applies default pagination (page=1, limit=50) when no query is provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/projects',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.page).toBe(1);
      expect(body.data.limit).toBe(50);
    });
  });

  describe('400 VALIDATION_ERROR', () => {
    it('rejects page=0 (below minimum)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/projects?page=0',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects limit=0 (below minimum)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/projects?limit=0',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unknown query parameter (additionalProperties: false)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/projects?foo=bar',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });
  });
});
