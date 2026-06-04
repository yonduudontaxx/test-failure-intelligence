import { Pool } from 'pg';

export function createPool(config: { databaseUrl: string }): Pool {
  return new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}
