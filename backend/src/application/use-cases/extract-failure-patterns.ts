import type { FailurePatternRepository } from '../../domain/ports/failure-pattern.repository.js';
import type { TxClient } from '../../domain/ports/tx-client.js';
import { assignSeverity } from '../../domain/services/severity-assigner.js';
import { extractPattern } from '../../domain/services/pattern-extractor.js';
import type { ParsedTestCase } from '../ingestion/types.js';

function hasSignal(c: ParsedTestCase): boolean {
  return Boolean(c.failureMessage?.trim() || c.failureType?.trim());
}

interface BatchEntry {
  pattern: string;
  category: string;
  occurrenceCount: number;
}

export async function extractFailurePatterns(
  patternRepo: FailurePatternRepository,
  cases: ParsedTestCase[],
  projectId: string,
  client?: TxClient,
): Promise<void> {
  const batch = new Map<string, BatchEntry>();

  for (const c of cases) {
    if (c.status !== 'FAILED' && c.status !== 'ERROR') continue;
    if (!hasSignal(c)) continue;

    const { pattern, category } = extractPattern(c.failureMessage, c.failureType, c.testName);
    const existing = batch.get(pattern);
    if (existing) {
      existing.occurrenceCount += 1;
    } else {
      batch.set(pattern, { pattern, category, occurrenceCount: 1 });
    }
  }

  const now = new Date();
  for (const entry of batch.values()) {
    const severity = assignSeverity({
      occurrenceCount: entry.occurrenceCount,
      category: entry.category,
      lastSeenAt: now,
      now,
    });
    await patternRepo.upsertByPattern(
      {
        projectId,
        pattern: entry.pattern,
        category: entry.category,
        severity,
      },
      client,
    );
  }
}
