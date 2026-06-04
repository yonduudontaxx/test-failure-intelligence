import type { Pool } from 'pg';

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(
    `TRUNCATE TABLE failure_patterns, test_case_results, test_runs, projects RESTART IDENTITY CASCADE`,
  );
}
