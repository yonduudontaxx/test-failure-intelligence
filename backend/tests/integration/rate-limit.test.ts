import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { buildApp } from '../../src/app.js';

const LIMIT = 2;

function makeStubPool(): Pool {
  const client = {
    query: jest.fn<() => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows: [{}] }),
    release: jest.fn(),
  } as unknown as PoolClient;
  return {
    connect: jest.fn(async () => client),
    query: jest.fn<() => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows: [] }),
    on: jest.fn(),
    end: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as Pool;
}

describe('rate limiting', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ pool: makeStubPool(), logger: false, rateLimitMax: LIMIT });
  });

  afterEach(async () => {
    await app.close();
  });

  async function exhaust(url: string, remoteAddress: string): Promise<number[]> {
    const statuses: number[] = [];
    for (let i = 0; i <= LIMIT; i++) {
      statuses.push((await app.inject({ method: 'GET', url, remoteAddress })).statusCode);
    }
    return statuses;
  }

  it('returns 429 on /health once a client exceeds the limit', async () => {
    const statuses = await exhaust('/health', '203.0.113.10');
    expect(statuses).toEqual([200, 200, 429]);
  });

  it('returns 429 with the API error envelope on /api/v1 routes', async () => {
    for (let i = 0; i < LIMIT; i++) {
      await app.inject({ method: 'GET', url: '/api/v1/projects/not-a-uuid', remoteAddress: '203.0.113.20' });
    }
    const limited = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/not-a-uuid',
      remoteAddress: '203.0.113.20',
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    const body = limited.json<{ error: { code: string; message: string } }>();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.message).toMatch(/^Rate limit exceeded/);
  });

  it('tracks the limit per client address', async () => {
    await exhaust('/health', '203.0.113.30');
    const other = await app.inject({ method: 'GET', url: '/health', remoteAddress: '203.0.113.31' });
    expect(other.statusCode).toBe(200);
  });
});
