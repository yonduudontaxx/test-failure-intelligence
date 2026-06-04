import { jest, describe, it, expect } from '@jest/globals';
import type { Pool, PoolClient } from '../../../../src/infrastructure/database/types.js';
import { withTransaction } from '../../../../src/infrastructure/database/with-transaction.js';

type QueryFn = PoolClient['query'];

interface ClientStub {
  client: PoolClient;
  query: jest.Mock;
  release: jest.Mock;
}

function makeClient(queryImpl?: (sql: unknown) => Promise<unknown>): ClientStub {
  const defaultImpl = async (): Promise<{ rows: unknown[]; rowCount: number | null }> => ({
    rows: [],
    rowCount: null,
  });
  const query = jest.fn(queryImpl ?? defaultImpl) as unknown as jest.Mock;
  const release = jest.fn();
  const client = { query: query as unknown as QueryFn, release } as unknown as PoolClient;
  return { client, query, release };
}

function makePool(client: PoolClient): Pool {
  return {
    connect: jest.fn<() => Promise<PoolClient>>().mockResolvedValue(client),
  } as unknown as Pool;
}

describe('withTransaction', () => {
  describe('happy path', () => {
    it('runs BEGIN, awaits fn, runs COMMIT, releases, and returns the result', async () => {
      const stub = makeClient();
      const pool = makePool(stub.client);
      const fn = jest
        .fn<(client: PoolClient) => Promise<string>>()
        .mockResolvedValue('result-value');

      const result = await withTransaction(pool, fn);

      expect(result).toBe('result-value');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(stub.client);
      const calls = stub.query.mock.calls.map((c) => c[0]);
      expect(calls).toEqual(['BEGIN', 'COMMIT']);
      expect(stub.release).toHaveBeenCalledTimes(1);
    });

    it('preserves the generic return type of fn', async () => {
      const stub = makeClient();
      const pool = makePool(stub.client);
      const payload = { id: 'abc', count: 42 };

      const result = await withTransaction(pool, async () => payload);

      expect(result).toBe(payload);
    });
  });

  describe('when fn throws', () => {
    it('runs ROLLBACK, releases, and rethrows the same error instance', async () => {
      const stub = makeClient();
      const pool = makePool(stub.client);
      const original = new Error('fn failed');
      const fn = jest.fn<(client: PoolClient) => Promise<never>>().mockRejectedValue(original);

      await expect(withTransaction(pool, fn)).rejects.toBe(original);

      const calls = stub.query.mock.calls.map((c) => c[0]);
      expect(calls).toEqual(['BEGIN', 'ROLLBACK']);
      expect(stub.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('when BEGIN itself throws', () => {
    it('does not attempt ROLLBACK, releases, and rethrows the BEGIN error', async () => {
      const beginError = new Error('begin failed');
      const stub = makeClient(async (sql) => {
        if (sql === 'BEGIN') throw beginError;
        return { rows: [], rowCount: null };
      });
      const pool = makePool(stub.client);
      const fn = jest.fn<(client: PoolClient) => Promise<void>>();

      await expect(withTransaction(pool, fn)).rejects.toBe(beginError);

      const calls = stub.query.mock.calls.map((c) => c[0]);
      expect(calls).toEqual(['BEGIN']);
      expect(fn).not.toHaveBeenCalled();
      expect(stub.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('when COMMIT throws after fn succeeds', () => {
    it('attempts ROLLBACK, releases, and rethrows the COMMIT error', async () => {
      const commitError = new Error('commit failed');
      const stub = makeClient(async (sql) => {
        if (sql === 'COMMIT') throw commitError;
        return { rows: [], rowCount: null };
      });
      const pool = makePool(stub.client);
      const fn = jest.fn<(client: PoolClient) => Promise<string>>().mockResolvedValue('ok');

      await expect(withTransaction(pool, fn)).rejects.toBe(commitError);

      const calls = stub.query.mock.calls.map((c) => c[0]);
      expect(calls).toEqual(['BEGIN', 'COMMIT', 'ROLLBACK']);
      expect(stub.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('when ROLLBACK itself throws during error handling', () => {
    it('rethrows the original fn error (not the rollback error) and still releases', async () => {
      const fnError = new Error('original fn error');
      const rollbackError = new Error('rollback failed');
      const stub = makeClient(async (sql) => {
        if (sql === 'ROLLBACK') throw rollbackError;
        return { rows: [], rowCount: null };
      });
      const pool = makePool(stub.client);
      const fn = jest.fn<(client: PoolClient) => Promise<never>>().mockRejectedValue(fnError);

      await expect(withTransaction(pool, fn)).rejects.toBe(fnError);

      expect(stub.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('optional-client composition', () => {
    it('passes the acquired client through to nested repository calls', async () => {
      const stub = makeClient();
      const pool = makePool(stub.client);
      const repo = {
        create: jest
          .fn<(input: { name: string }, client?: PoolClient) => Promise<{ id: string }>>()
          .mockResolvedValue({ id: 'row-1' }),
      };

      const result = await withTransaction(pool, async (tx) => repo.create({ name: 'x' }, tx));

      expect(result).toEqual({ id: 'row-1' });
      expect(repo.create).toHaveBeenCalledWith({ name: 'x' }, stub.client);
    });
  });
});
