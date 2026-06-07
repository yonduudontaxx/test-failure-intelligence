import type { Pool, QueryResultRow } from '../database/types.js';
import type { FailurePattern } from '../../domain/entities/failure-pattern.js';
import type { FailureSeverity } from '../../domain/enums/failure-severity.js';
import type {
  FailurePatternRepository,
  UpsertFailurePatternInput,
} from '../../domain/ports/failure-pattern.repository.js';
import type { TxClient } from '../../domain/ports/tx-client.js';

const DEFAULT_LIMIT = 50;

interface FailurePatternRow extends QueryResultRow {
  id: string;
  project_id: string;
  pattern: string;
  category: string | null;
  severity: FailureSeverity;
  first_seen_at: Date;
  last_seen_at: Date;
  occurrence_count: number;
}

function mapRow(row: FailurePatternRow): FailurePattern {
  return {
    id: row.id,
    projectId: row.project_id,
    pattern: row.pattern,
    category: row.category ?? undefined,
    severity: row.severity,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    occurrenceCount: row.occurrence_count,
  };
}

const RETURN_COLUMNS = `
  id, project_id, pattern, category, severity,
  first_seen_at, last_seen_at, occurrence_count
`;

export class PgFailurePatternRepository implements FailurePatternRepository {
  constructor(private readonly pool: Pool) {}

  async listByProject(projectId: string, opts?: { limit?: number }): Promise<FailurePattern[]> {
    const limit = opts?.limit ?? DEFAULT_LIMIT;
    const result = await this.pool.query<FailurePatternRow>(
      `SELECT ${RETURN_COLUMNS}
         FROM failure_patterns
        WHERE project_id = $1
        ORDER BY occurrence_count DESC, last_seen_at DESC
        LIMIT $2`,
      [projectId, limit],
    );
    return result.rows.map(mapRow);
  }

  async upsertByPattern(
    input: UpsertFailurePatternInput,
    client?: TxClient,
  ): Promise<FailurePattern> {
    const runner = client ?? this.pool;
    const result = await runner.query(
      `INSERT INTO failure_patterns
         (project_id, pattern, category, severity, occurrence_count, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, $4, 1, NOW(), NOW())
       ON CONFLICT (project_id, pattern) DO UPDATE
         SET occurrence_count = failure_patterns.occurrence_count + 1,
             severity         = EXCLUDED.severity,
             last_seen_at     = GREATEST(failure_patterns.last_seen_at, EXCLUDED.last_seen_at)
       RETURNING ${RETURN_COLUMNS}`,
      [input.projectId, input.pattern, input.category, input.severity],
    );
    return mapRow(result.rows[0] as FailurePatternRow);
  }
}
