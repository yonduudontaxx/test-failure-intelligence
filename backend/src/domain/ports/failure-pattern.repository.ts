import type { FailurePattern } from '../entities/failure-pattern.js';
import type { FailureSeverity } from '../enums/failure-severity.js';
import type { TxClient } from './tx-client.js';

export interface UpsertFailurePatternInput {
  projectId: string;
  pattern: string;
  category: string;
  severity: FailureSeverity;
}

export interface FailurePatternRepository {
  /**
   * Returns up to `opts.limit` failure patterns for `projectId`, ordered by
   * `occurrenceCount DESC, lastSeenAt DESC`. When `opts.limit` is omitted the
   * implementation applies a default cap.
   */
  listByProject(projectId: string, opts?: { limit?: number }): Promise<FailurePattern[]>;

  /**
   * Atomic upsert keyed on `(projectId, pattern)`:
   *   - Inserts a new row with `occurrenceCount = 1` and both timestamps = NOW().
   *   - On conflict, increments `occurrenceCount` by 1, advances `lastSeenAt`
   *     via `GREATEST` (so a delayed write with an older timestamp cannot
   *     regress it), and overwrites `severity` with the caller's value.
   * Returns the post-upsert row. Optionally participates in the caller's
   * transaction via `client`.
   */
  upsertByPattern(input: UpsertFailurePatternInput, client?: TxClient): Promise<FailurePattern>;
}
