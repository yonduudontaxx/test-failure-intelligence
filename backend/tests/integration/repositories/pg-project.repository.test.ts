import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import type { Pool } from 'pg';
import { PgProjectRepository } from '../../../src/infrastructure/repositories/pg-project.repository.js';
import { UniqueConstraintError } from '../../../src/domain/errors/index.js';
import { createTestPool } from '../test-pool.js';
import { truncateAll } from '../truncate.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('PgProjectRepository (integration)', () => {
  let pool: Pool;
  let repo: PgProjectRepository;

  beforeAll(() => {
    pool = createTestPool();
    repo = new PgProjectRepository(pool);
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('create', () => {
    it('persists a project with all fields and returns the populated entity', async () => {
      const before = new Date();
      const project = await repo.create({
        slug: 'svc-a',
        name: 'Service A',
        description: 'A service we own',
      });
      const after = new Date();

      expect(project.id).toMatch(UUID_RE);
      expect(project.slug).toBe('svc-a');
      expect(project.name).toBe('Service A');
      expect(project.description).toBe('A service we own');
      expect(project.createdAt).toBeInstanceOf(Date);
      expect(project.updatedAt).toBeInstanceOf(Date);
      expect(project.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(project.createdAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
      expect(project.updatedAt.getTime()).toBe(project.createdAt.getTime());
    });

    it('normalises a missing description to undefined (not null)', async () => {
      const project = await repo.create({ slug: 'svc-b', name: 'Service B' });
      expect(project.description).toBeUndefined();
    });

    it('rejects a duplicate slug with UniqueConstraintError', async () => {
      await repo.create({ slug: 'svc-c', name: 'First' });
      await expect(repo.create({ slug: 'svc-c', name: 'Second' })).rejects.toBeInstanceOf(
        UniqueConstraintError,
      );
      try {
        await repo.create({ slug: 'svc-c', name: 'Third' });
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(UniqueConstraintError);
        if (err instanceof UniqueConstraintError) {
          expect(err.constraint).toBe('projects_slug_key');
        }
      }
    });
  });

  describe('findById', () => {
    it('returns the project for a known id', async () => {
      const created = await repo.create({ slug: 'svc-d', name: 'Service D' });
      const found = await repo.findById(created.id);
      expect(found).toEqual(created);
    });

    it('returns null for an unknown id', async () => {
      const found = await repo.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('returns the project for a known slug', async () => {
      const created = await repo.create({ slug: 'svc-e', name: 'Service E' });
      const found = await repo.findBySlug('svc-e');
      expect(found).toEqual(created);
    });

    it('returns null for an unknown slug', async () => {
      const found = await repo.findBySlug('does-not-exist');
      expect(found).toBeNull();
    });
  });

  describe('list', () => {
    it('returns { items: [], total: 0 } for an empty table', async () => {
      const result = await repo.list({ limit: 10, offset: 0 });
      expect(result).toEqual({ items: [], total: 0 });
    });

    it('returns the correct total count across all rows', async () => {
      for (let i = 0; i < 5; i += 1) {
        await repo.create({ slug: `svc-${i}`, name: `Service ${i}` });
      }
      const result = await repo.list({ limit: 10, offset: 0 });
      expect(result.items.length).toBe(5);
      expect(result.total).toBe(5);
    });

    it('returns items ordered by createdAt DESC (newest first)', async () => {
      const first = await repo.create({ slug: 'svc-first', name: 'First' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const second = await repo.create({ slug: 'svc-second', name: 'Second' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const third = await repo.create({ slug: 'svc-third', name: 'Third' });

      const result = await repo.list({ limit: 10, offset: 0 });
      expect(result.items.map((p) => p.id)).toEqual([third.id, second.id, first.id]);
    });

    describe('pagination over 25 rows', () => {
      let allIds: string[];

      beforeEach(async () => {
        allIds = [];
        for (let i = 0; i < 25; i += 1) {
          const project = await repo.create({
            slug: `svc-page-${i.toString().padStart(2, '0')}`,
            name: `Service ${i}`,
          });
          allIds.push(project.id);
          await new Promise((resolve) => setTimeout(resolve, 2));
        }
        allIds.reverse();
      });

      it('page 1 (limit 10, offset 0) returns the 10 newest, with total 25', async () => {
        const result = await repo.list({ limit: 10, offset: 0 });
        expect(result.total).toBe(25);
        expect(result.items.length).toBe(10);
        expect(result.items.map((p) => p.id)).toEqual(allIds.slice(0, 10));
      });

      it('page 2 (limit 10, offset 10) returns rows 11-20 of the ordered set, with total 25', async () => {
        const result = await repo.list({ limit: 10, offset: 10 });
        expect(result.total).toBe(25);
        expect(result.items.length).toBe(10);
        expect(result.items.map((p) => p.id)).toEqual(allIds.slice(10, 20));
      });

      it('last page (limit 10, offset 20) returns the partial 5-row tail, with total 25', async () => {
        const result = await repo.list({ limit: 10, offset: 20 });
        expect(result.total).toBe(25);
        expect(result.items.length).toBe(5);
        expect(result.items.map((p) => p.id)).toEqual(allIds.slice(20, 25));
      });
    });
  });
});
