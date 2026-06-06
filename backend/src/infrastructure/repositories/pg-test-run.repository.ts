import type { Pool, QueryResultRow } from '../database/types.js';
import type { TestRun, NewTestRun } from '../../domain/entities/test-run.js';
import type { SourceType } from '../../domain/enums/source-type.js';
import type { TestRunStatus } from '../../domain/enums/test-run-status.js';
import type {
  DailyFailureBucket,
  TestRunRepository,
} from '../../domain/ports/test-run.repository.js';
import type { TxClient } from '../../domain/ports/tx-client.js';
import { toDomainError } from '../database/pg-errors.js';

interface TestRunRow extends QueryResultRow {
  id: string;
  project_id: string;
  external_id: string | null;
  source_type: SourceType;
  pipeline_name: string | null;
  build_number: string | null;
  branch: string | null;
  commit_sha: string | null;
  environment: string | null;
  status: TestRunStatus;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  skipped_tests: number;
  duration_ms: number | null;
  metadata: Record<string, unknown> | null;
  executed_at: Date | null;
  ingested_at: Date;
}

function mapRow(row: TestRunRow): TestRun {
  return {
    id: row.id,
    projectId: row.project_id,
    externalId: row.external_id ?? undefined,
    sourceType: row.source_type,
    pipelineName: row.pipeline_name ?? undefined,
    buildNumber: row.build_number ?? undefined,
    branch: row.branch ?? undefined,
    commitSha: row.commit_sha ?? undefined,
    environment: row.environment ?? undefined,
    status: row.status,
    totalTests: row.total_tests,
    passedTests: row.passed_tests,
    failedTests: row.failed_tests,
    skippedTests: row.skipped_tests,
    durationMs: row.duration_ms ?? undefined,
    metadata: row.metadata ?? {},
    ingestedAt: row.ingested_at,
    executedAt: row.executed_at ?? undefined,
  };
}

const RETURN_COLUMNS = `
  id, project_id, external_id, source_type, pipeline_name, build_number,
  branch, commit_sha, environment, status,
  total_tests, passed_tests, failed_tests, skipped_tests,
  duration_ms, metadata, executed_at, ingested_at
`;

const CREATE_SQL = `
  INSERT INTO test_runs (
    project_id, external_id, source_type, pipeline_name, build_number,
    branch, commit_sha, environment, status,
    total_tests, passed_tests, failed_tests, skipped_tests,
    duration_ms, metadata, executed_at
  ) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9,
    $10, $11, $12, $13,
    $14, $15, $16
  )
  RETURNING ${RETURN_COLUMNS}
`;

export class PgTestRunRepository implements TestRunRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: NewTestRun, client?: TxClient): Promise<TestRun> {
    const runner = client ?? this.pool;
    const params = [
      input.projectId,
      input.externalId ?? null,
      input.sourceType,
      input.pipelineName ?? null,
      input.buildNumber ?? null,
      input.branch ?? null,
      input.commitSha ?? null,
      input.environment ?? null,
      input.status,
      input.totalTests,
      input.passedTests,
      input.failedTests,
      input.skippedTests,
      input.durationMs ?? null,
      input.metadata,
      input.executedAt ?? null,
    ];
    try {
      const result = await runner.query(CREATE_SQL, params);
      return mapRow(result.rows[0] as TestRunRow);
    } catch (err) {
      const domainErr = toDomainError(err);
      if (domainErr) throw domainErr;
      throw err;
    }
  }

  async findById(id: string): Promise<TestRun | null> {
    const result = await this.pool.query<TestRunRow>(
      `SELECT ${RETURN_COLUMNS} FROM test_runs WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async listByProject(
    projectId: string,
    opts: {
      limit: number;
      offset: number;
      branch?: string;
      environment?: string;
      status?: TestRunStatus;
    },
  ): Promise<{ items: TestRun[]; total: number }> {
    const where: string[] = ['project_id = $1'];
    const filterParams: unknown[] = [projectId];
    let p = 2;
    if (opts.branch !== undefined) {
      where.push(`branch = $${p}`);
      filterParams.push(opts.branch);
      p += 1;
    }
    if (opts.environment !== undefined) {
      where.push(`environment = $${p}`);
      filterParams.push(opts.environment);
      p += 1;
    }
    if (opts.status !== undefined) {
      where.push(`status = $${p}`);
      filterParams.push(opts.status);
      p += 1;
    }
    const whereSql = where.join(' AND ');

    const itemsSql = `
      SELECT ${RETURN_COLUMNS}
        FROM test_runs
       WHERE ${whereSql}
       ORDER BY executed_at DESC NULLS LAST, id ASC
       LIMIT $${p} OFFSET $${p + 1}
    `;
    const itemsParams = [...filterParams, opts.limit, opts.offset];

    const totalSql = `SELECT COUNT(*)::text AS count FROM test_runs WHERE ${whereSql}`;

    const [itemsResult, totalResult] = await Promise.all([
      this.pool.query<TestRunRow>(itemsSql, itemsParams),
      this.pool.query<{ count: string }>(totalSql, filterParams),
    ]);

    return {
      items: itemsResult.rows.map(mapRow),
      total: parseInt(totalResult.rows[0].count, 10),
    };
  }

  async findMostRecentByProject(projectId: string): Promise<TestRun | null> {
    const result = await this.pool.query<TestRunRow>(
      `SELECT ${RETURN_COLUMNS}
         FROM test_runs
        WHERE project_id = $1
        ORDER BY executed_at DESC NULLS LAST, ingested_at DESC
        LIMIT 1`,
      [projectId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async countByProject(projectId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM test_runs WHERE project_id = $1`,
      [projectId],
    );
    return parseInt(result.rows[0].count, 10);
  }

  async findFailureTrend(
    projectId: string,
    opts: { days: number; bucketSize: 'day' | 'week' },
  ): Promise<DailyFailureBucket[]> {
    const cutoff = new Date(Date.now() - opts.days * 86_400_000);
    const result = await this.pool.query<FailureTrendRow>(
      `
      SELECT
        TO_CHAR(
          DATE_TRUNC($3, COALESCE(executed_at, ingested_at) AT TIME ZONE 'UTC'),
          'YYYY-MM-DD'
        ) AS bucket_date,
        COUNT(*)::text AS total_runs,
        COUNT(*) FILTER (WHERE status = 'FAILED')::text AS failed_runs
      FROM test_runs
      WHERE project_id = $1
        AND COALESCE(executed_at, ingested_at) >= $2
      GROUP BY bucket_date
      ORDER BY bucket_date ASC
      `,
      [projectId, cutoff, opts.bucketSize],
    );
    return result.rows.map(mapTrendRow);
  }
}

interface FailureTrendRow extends QueryResultRow {
  bucket_date: string;
  total_runs: string;
  failed_runs: string;
}

function mapTrendRow(row: FailureTrendRow): DailyFailureBucket {
  const totalRuns = parseInt(row.total_runs, 10);
  const failedRuns = parseInt(row.failed_runs, 10);
  return {
    date: row.bucket_date,
    totalRuns,
    failedRuns,
    passRate: totalRuns === 0 ? 1 : (totalRuns - failedRuns) / totalRuns,
  };
}
