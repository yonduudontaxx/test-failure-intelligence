import type { FailurePattern } from '../entities/failure-pattern.js';

export interface FailurePatternRepository {
  /**
   * Returns up to `opts.limit` failure patterns for `projectId`, ordered by
   * `occurrenceCount DESC, lastSeenAt DESC`. When `opts.limit` is omitted the
   * implementation applies a default cap.
   *
   * Read-only MVP — write methods (create / merge / update severity) are
   * deferred to Phase 2.
   */
  listByProject(projectId: string, opts?: { limit?: number }): Promise<FailurePattern[]>;
}
