import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../../../src/app.js';
import { createTestPool } from '../../test-pool.js';
import { truncateAll } from '../../truncate.js';
import type { FailureSeverity } from '../../../../src/domain/enums/failure-severity.js';

const MISSING_UUID = '00000000-0000-0000-0000-000000000000';

describe('GET /api/v1/projects/:projectId/failure-patterns (integration)', () => {
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

  it('200 returns patterns ordered by occurrenceCount DESC', async () => {
    await seedPattern({ pattern: 'low', occurrenceCount: 3 });
    await seedPattern({ pattern: 'high', occurrenceCount: 25, severity: 'HIGH' });
    await seedPattern({ pattern: 'mid', occurrenceCount: 10, severity: 'MEDIUM' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/failure-patterns`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items.map((p: { pattern: string }) => p.pattern)).toEqual([
      'high',
      'mid',
      'low',
    ]);
    expect(body.data.items[0]).toMatchObject({
      pattern: 'high',
      severity: 'HIGH',
      occurrenceCount: 25,
    });
    expect(typeof body.data.items[0].firstSeenAt).toBe('string');
    expect(typeof body.data.items[0].lastSeenAt).toBe('string');
  });

  it('200 returns empty items when no patterns exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/failure-patterns`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ items: [] });
  });

  it('200 respects the limit query parameter', async () => {
    for (let i = 0; i < 5; i += 1) {
      await seedPattern({ pattern: `p${i}`, occurrenceCount: i + 1 });
    }

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/failure-patterns?limit=2`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items.map((p: { pattern: string }) => p.pattern)).toEqual(['p4', 'p3']);
  });

  it('404 PROJECT_NOT_FOUND for unknown projectId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${MISSING_UUID}/failure-patterns`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('400 VALIDATION_ERROR for invalid limit', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/failure-patterns?limit=0`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
