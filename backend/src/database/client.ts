import { Pool, type PoolClient } from 'pg';
import { config } from '../config.js';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err: Error, _client: PoolClient) => {
  console.error('Unexpected error on idle database client:', err);
});

export async function testConnection(): Promise<boolean> {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    return true;
  } catch (err) {
    console.error('Database connection test failed:', err);
    return false;
  } finally {
    client?.release();
  }
}
