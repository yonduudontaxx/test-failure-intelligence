import { type FastifyInstance } from 'fastify';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

jest.unstable_mockModule('../../src/database/client.js', () => ({
  testConnection: jest.fn(),
  pool: { on: jest.fn() },
}));

const { buildApp } = await import('../../src/app.js');
const { testConnection } = await import('../../src/database/client.js');

const mockTestConnection = jest.mocked(testConnection);
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('when the database is reachable', () => {
    beforeEach(() => {
      mockTestConnection.mockResolvedValue(true);
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
    beforeEach(() => {
      mockTestConnection.mockResolvedValue(false);
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
