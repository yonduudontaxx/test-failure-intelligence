import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { buildApp } from '../../src/app.js';

const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function makeStubPool(connectImpl: () => Promise<PoolClient>): Pool {
  return {
    connect: jest.fn(connectImpl),
    on: jest.fn(),
    end: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as Pool;
}

function makeReachableClient(): PoolClient {
  return {
    query: jest.fn<() => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows: [{}] }),
    release: jest.fn(),
  } as unknown as PoolClient;
}

describe('GET /health', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  describe('when the database is reachable', () => {
    beforeEach(async () => {
      const pool = makeStubPool(async () => makeReachableClient());
      app = await buildApp({ pool, logger: false });
    });

    it('returns HTTP 200', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
    });

    it('returns application/json content-type', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('returns status ok and database connected', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = response.json<{ status: string; database: string; timestamp: string }>();
      expect(body.status).toBe('ok');
      expect(body.database).toBe('connected');
    });

    it('returns a valid ISO 8601 timestamp', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = response.json<{ timestamp: string }>();
      expect(body.timestamp).toMatch(ISO_8601_RE);
    });
  });

  describe('when the database is unreachable', () => {
    beforeEach(async () => {
      const pool = makeStubPool(async () => {
        throw new Error('ECONNREFUSED');
      });
      app = await buildApp({ pool, logger: false });
    });

    it('returns HTTP 200', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
    });

    it('returns status ok and database disconnected', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = response.json<{ status: string; database: string; timestamp: string }>();
      expect(body.status).toBe('ok');
      expect(body.database).toBe('disconnected');
    });
  });
});
