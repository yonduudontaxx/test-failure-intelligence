import type { Pool, PoolClient } from 'pg';
import type { FastifyBaseLogger } from 'fastify';

export async function testConnection(pool: Pool, logger?: FastifyBaseLogger): Promise<boolean> {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    return true;
  } catch (err) {
    logger?.error({ err }, 'Database connection test failed');
    return false;
  } finally {
    client?.release();
  }
}
