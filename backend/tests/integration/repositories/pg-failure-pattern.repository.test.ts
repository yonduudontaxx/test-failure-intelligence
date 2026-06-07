import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import type { Pool } from 'pg';
import { PgProjectRepository } from '../../../src/infrastructure/repositories/pg-project.repository.js';
import { PgFailurePatternRepository } from '../../../src/infrastructure/repositories/pg-failure-pattern.repository.js';
import type { FailureSeverity } from '../../../src/domain/enums/failure-severity.js';
import { withTransaction } from '../../../src/infrastructure/database/with-transaction.js';
import { createTestPool } from '../test-pool.js';
import { truncateAll } from '../truncate.js';

describe('PgFailurePatternRepository (integration)', () => {
  let pool: Pool;
  let projectRepo: PgProjectRepository;
  let repo: PgFailurePatternRepository;
  let projectId: string;

  beforeAll(() => {
    pool = createTestPool();
    projectRepo = new PgProjectRepository(pool);
    repo = new PgFailurePatternRepository(pool);
  });

  beforeEach(async () => {
    await truncateAll(pool);
    const project = await projectRepo.create({
      slug: 'svc-fixture',
      name: 'Fixture',
    });
    projectId = project.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  interface SeedOverrides {
    projectId?: string;
    pattern?: string;
    category?: string | null;
    severity?: FailureSeverity;
    firstSeenAt?: Date;
    lastSeenAt?: Date;
    occurrenceCount?: number;
  }

  async function seedPattern(overrides: SeedOverrides = {}): Promise<void> {
    await pool.query(
      `INSERT INTO failure_patterns
        (project_id, pattern, category, severity, first_seen_at, last_seen_at, occurrence_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        overrides.projectId ?? projectId,
        overrides.pattern ?? 'TimeoutError',
        overrides.category ?? null,
        overrides.severity ?? 'LOW',
        overrides.firstSeenAt ?? new Date('2026-05-01T00:00:00Z'),
        overrides.lastSeenAt ?? new Date('2026-06-01T00:00:00Z'),
        overrides.occurrenceCount ?? 1,
      ],
    );
  }

  describe('listByProject', () => {
    it('returns [] when no patterns exist', async () => {
      expect(await repo.listByProject(projectId)).toEqual([]);
    });

    it('returns patterns ordered by occurrenceCount DESC', async () => {
      await seedPattern({ pattern: 'A', occurrenceCount: 5 });
      await seedPattern({ pattern: 'B', occurrenceCount: 10 });
      await seedPattern({ pattern: 'C', occurrenceCount: 7 });

      const result = await repo.listByProject(projectId);
      expect(result.map((p) => p.pattern)).toEqual(['B', 'C', 'A']);
    });

    it('breaks occurrenceCount ties on lastSeenAt DESC', async () => {
      await seedPattern({
        pattern: 'older',
        occurrenceCount: 5,
        lastSeenAt: new Date('2026-05-15T00:00:00Z'),
      });
      await seedPattern({
        pattern: 'newer',
        occurrenceCount: 5,
        lastSeenAt: new Date('2026-06-01T00:00:00Z'),
      });

      const result = await repo.listByProject(projectId);
      expect(result.map((p) => p.pattern)).toEqual(['newer', 'older']);
    });

    it('respects opts.limit', async () => {
      for (let i = 0; i < 5; i += 1) {
        await seedPattern({ pattern: `p${i}`, occurrenceCount: i + 1 });
      }
      const result = await repo.listByProject(projectId, { limit: 3 });
      expect(result).toHaveLength(3);
      // Should return the 3 highest occurrenceCount (5, 4, 3)
      expect(result.map((p) => p.pattern)).toEqual(['p4', 'p3', 'p2']);
    });

    it('applies the default cap (50) when opts is omitted', async () => {
      await seedPattern({ pattern: 'one' });
      const result = await repo.listByProject(projectId);
      expect(result).toHaveLength(1);
    });

    it('isolates patterns to the requested project', async () => {
      const otherProject = await projectRepo.create({
        slug: 'other-svc',
        name: 'Other',
      });
      await seedPattern({ pattern: 'mine' });
      await seedPattern({
        pattern: 'theirs',
        projectId: otherProject.id,
      });

      const mine = await repo.listByProject(projectId);
      const theirs = await repo.listByProject(otherProject.id);
      expect(mine.map((p) => p.pattern)).toEqual(['mine']);
      expect(theirs.map((p) => p.pattern)).toEqual(['theirs']);
    });

    it('maps all FailurePattern entity fields correctly', async () => {
      await seedPattern({
        pattern: 'TimeoutError: navigation',
        category: 'timeout',
        severity: 'HIGH',
        firstSeenAt: new Date('2026-05-10T08:00:00Z'),
        lastSeenAt: new Date('2026-06-01T12:00:00Z'),
        occurrenceCount: 23,
      });

      const [pattern] = await repo.listByProject(projectId);
      expect(pattern).toMatchObject({
        projectId,
        pattern: 'TimeoutError: navigation',
        category: 'timeout',
        severity: 'HIGH',
        occurrenceCount: 23,
      });
      expect(pattern.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(pattern.firstSeenAt).toBeInstanceOf(Date);
      expect(pattern.lastSeenAt).toBeInstanceOf(Date);
    });

    it('maps null category column to undefined on the entity', async () => {
      await seedPattern({ category: null });
      const [pattern] = await repo.listByProject(projectId);
      expect(pattern.category).toBeUndefined();
    });
  });

  describe('upsertByPattern', () => {
    it('inserts a new pattern with occurrenceCount=1 and matching timestamps', async () => {
      const before = new Date();
      const result = await repo.upsertByPattern({
        projectId,
        pattern: 'TimeoutError: navigation timeout',
        category: 'timeout',
        severity: 'LOW',
      });
      const after = new Date();

      expect(result).toMatchObject({
        projectId,
        pattern: 'TimeoutError: navigation timeout',
        category: 'timeout',
        severity: 'LOW',
        occurrenceCount: 1,
      });
      expect(result.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(result.firstSeenAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.firstSeenAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(result.lastSeenAt.getTime()).toBeGreaterThanOrEqual(result.firstSeenAt.getTime());
    });

    it('increments occurrenceCount on conflict (second upsert → 2)', async () => {
      const first = await repo.upsertByPattern({
        projectId,
        pattern: 'AssertionError: expected',
        category: 'assertion',
        severity: 'LOW',
      });
      const second = await repo.upsertByPattern({
        projectId,
        pattern: 'AssertionError: expected',
        category: 'assertion',
        severity: 'LOW',
      });

      expect(second.id).toBe(first.id);
      expect(second.occurrenceCount).toBe(2);
      expect(second.firstSeenAt.getTime()).toBe(first.firstSeenAt.getTime());
    });

    it('reaches occurrenceCount=5 after five upserts', async () => {
      for (let i = 0; i < 5; i += 1) {
        await repo.upsertByPattern({
          projectId,
          pattern: 'fetch failed',
          category: 'network',
          severity: 'LOW',
        });
      }
      const [row] = await repo.listByProject(projectId);
      expect(row.occurrenceCount).toBe(5);
    });

    it('overwrites severity on conflict with the latest value', async () => {
      await repo.upsertByPattern({
        projectId,
        pattern: 'deadlock detected',
        category: 'database',
        severity: 'LOW',
      });
      const upgraded = await repo.upsertByPattern({
        projectId,
        pattern: 'deadlock detected',
        category: 'database',
        severity: 'CRITICAL',
      });
      expect(upgraded.severity).toBe('CRITICAL');
    });

    it('advances last_seen_at on conflict (NOW() > original)', async () => {
      const first = await repo.upsertByPattern({
        projectId,
        pattern: 'p',
        category: 'unknown',
        severity: 'LOW',
      });
      // small delay so NOW() advances
      await new Promise((r) => setTimeout(r, 25));
      const second = await repo.upsertByPattern({
        projectId,
        pattern: 'p',
        category: 'unknown',
        severity: 'LOW',
      });
      expect(second.lastSeenAt.getTime()).toBeGreaterThan(first.lastSeenAt.getTime());
    });

    it('keeps cross-project rows separate even when the pattern text matches', async () => {
      const other = await projectRepo.create({ slug: 'other-svc-2', name: 'Other 2' });
      const a = await repo.upsertByPattern({
        projectId,
        pattern: 'shared',
        category: 'unknown',
        severity: 'LOW',
      });
      const b = await repo.upsertByPattern({
        projectId: other.id,
        pattern: 'shared',
        category: 'unknown',
        severity: 'LOW',
      });
      expect(a.id).not.toBe(b.id);
      expect(a.occurrenceCount).toBe(1);
      expect(b.occurrenceCount).toBe(1);
    });

    it('rolls back via withTransaction — no row persists when the tx throws', async () => {
      await expect(
        withTransaction(pool, async (tx) => {
          await repo.upsertByPattern(
            {
              projectId,
              pattern: 'rolled-back',
              category: 'unknown',
              severity: 'LOW',
            },
            tx,
          );
          throw new Error('force rollback');
        }),
      ).rejects.toThrow('force rollback');

      const found = await repo.listByProject(projectId);
      expect(found.find((p) => p.pattern === 'rolled-back')).toBeUndefined();
    });

    it('persists via withTransaction when the tx commits', async () => {
      await withTransaction(pool, async (tx) => {
        await repo.upsertByPattern(
          {
            projectId,
            pattern: 'committed',
            category: 'unknown',
            severity: 'LOW',
          },
          tx,
        );
      });
      const found = await repo.listByProject(projectId);
      expect(found.find((p) => p.pattern === 'committed')).toBeDefined();
    });
  });
});
