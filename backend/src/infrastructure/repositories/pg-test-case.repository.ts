import type { Pool, QueryResultRow } from '../database/types.js';
import type { TestCaseResult, NewTestCaseResult } from '../../domain/entities/test-case-result.js';
import type { TestCaseStatus } from '../../domain/enums/test-case-status.js';
import type { TestCaseRepository } from '../../domain/ports/test-case.repository.js';
import type { TxClient } from '../../domain/ports/tx-client.js';
import { toDomainError } from '../database/pg-errors.js';

interface TestCaseRow extends QueryResultRow {
  id: string;
  project_id: string;
  test_run_id: string;
  suite_name: string | null;
  test_name: string;
  full_name: string;
  status: TestCaseStatus;
  duration_ms: number | null;
  failure_message: string | null;
  failure_type: string | null;
  retry_count: number;
  metadata: Record<string, unknown> | null;
}

function mapRow(row: TestCaseRow): TestCaseResult {
  return {
    id: row.id,
    projectId: row.project_id,
    testRunId: row.test_run_id,
    suiteName: row.suite_name ?? undefined,
    testName: row.test_name,
    fullName: row.full_name,
    status: row.status,
    durationMs: row.duration_ms ?? undefined,
    failureMessage: row.failure_message ?? undefined,
    failureType: row.failure_type ?? undefined,
    retryCount: row.retry_count,
    metadata: row.metadata ?? {},
  };
}

const RETURN_COLUMNS = `
  id, project_id, test_run_id, suite_name, test_name, full_name,
  status, duration_ms, failure_message, failure_type, retry_count, metadata
`;

const COLUMNS_PER_ROW = 11;

export function buildBulkInsertSql(inputs: NewTestCaseResult[]): {
  sql: string;
  params: unknown[];
} {
  const params: unknown[] = [];
  const tuples: string[] = [];
  inputs.forEach((input, i) => {
    const base = i * COLUMNS_PER_ROW;
    tuples.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`,
    );
    params.push(
      input.projectId,
      input.testRunId,
      input.suiteName ?? null,
      input.testName,
      input.fullName,
      input.status,
      input.durationMs ?? null,
      input.failureMessage ?? null,
      input.failureType ?? null,
      input.retryCount,
      input.metadata,
    );
  });
  const sql = `
    INSERT INTO test_case_results (
      project_id, test_run_id, suite_name, test_name, full_name,
      status, duration_ms, failure_message, failure_type, retry_count, metadata
    ) VALUES ${tuples.join(', ')}
  `;
  return { sql, params };
}

export class PgTestCaseRepository implements TestCaseRepository {
  constructor(private readonly pool: Pool) {}

  async createMany(inputs: NewTestCaseResult[], client?: TxClient): Promise<void> {
    if (inputs.length === 0) return;
    const runner = client ?? this.pool;
    const { sql, params } = buildBulkInsertSql(inputs);
    try {
      await runner.query(sql, params);
    } catch (err) {
      const domainErr = toDomainError(err);
      if (domainErr) throw domainErr;
      throw err;
    }
  }

  async findByTestRun(testRunId: string): Promise<TestCaseResult[]> {
    const result = await this.pool.query<TestCaseRow>(
      `SELECT ${RETURN_COLUMNS}
         FROM test_case_results
        WHERE test_run_id = $1
        ORDER BY full_name ASC, id ASC`,
      [testRunId],
    );
    return result.rows.map(mapRow);
  }

  async findRecentByFullName(
    projectId: string,
    fullName: string,
    limit: number,
  ): Promise<TestCaseResult[]> {
    const result = await this.pool.query<TestCaseRow>(
      `SELECT ${this.aliasColumns('tcr')}
         FROM test_case_results tcr
         JOIN test_runs tr ON tr.id = tcr.test_run_id
        WHERE tcr.project_id = $1 AND tcr.full_name = $2
        ORDER BY tr.executed_at DESC NULLS LAST, tr.ingested_at DESC
        LIMIT $3`,
      [projectId, fullName, limit],
    );
    return result.rows.map(mapRow);
  }

  private aliasColumns(prefix: string): string {
    return RETURN_COLUMNS.trim()
      .split(/,\s*/)
      .map((c) => `${prefix}.${c}`)
      .join(', ');
  }
}
