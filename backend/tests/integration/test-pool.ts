import { Pool } from 'pg';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://tfi:tfi_dev_password@localhost:5432/tfi_test';

export function createTestPool(): Pool {
  return new Pool({
    connectionString: TEST_DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 2000,
  });
}
