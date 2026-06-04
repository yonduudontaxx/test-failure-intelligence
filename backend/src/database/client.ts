import type { Pool, PoolClient } from 'pg';

export async function testConnection(pool: Pool): Promise<boolean> {
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
