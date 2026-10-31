import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { buildApp } from '../../src/app.js';

const ALLOWED = 'http://localhost:3000';
const DISALLOWED = 'https://evil.example';

function makeStubPool(): Pool {
  return {
    connect: jest.fn(),
    on: jest.fn(),
    end: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as Pool;
}

describe('CORS allowlist', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ pool: makeStubPool(), logger: false, corsOrigins: [ALLOWED] });
  });

  afterEach(async () => {
    await app.close();
  });

  it('echoes an allowed origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: ALLOWED },
    });
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED);
  });

  it('omits access-control-allow-origin for a disallowed origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: DISALLOWED },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects a preflight from a disallowed origin without allow headers', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/projects',
      headers: { origin: DISALLOWED, 'access-control-request-method': 'GET' },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
