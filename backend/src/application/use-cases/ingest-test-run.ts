import type { TestRunStatus } from '../../domain/enums/test-run-status.js';
import type { TestRunRepository } from '../../domain/ports/test-run.repository.js';
import type { TestCaseRepository } from '../../domain/ports/test-case.repository.js';
import type { FailurePatternRepository } from '../../domain/ports/failure-pattern.repository.js';
import type { Pool } from '../../infrastructure/database/types.js';
import { withTransaction } from '../../infrastructure/database/with-transaction.js';
import type { IngestResponse } from '../../http/schemas/ingest.js';
import type { IngestionAdapter, IngestTestRunInput } from '../ingestion/types.js';
import { extractFailurePatterns } from './extract-failure-patterns.js';

function deriveStatus(failedTests: number, skippedTests: number): TestRunStatus {
  if (failedTests > 0) return 'FAILED';
  if (skippedTests > 0) return 'PARTIAL';
  return 'SUCCESS';
}

export async function ingestTestRun(
  pool: Pool,
  runRepo: TestRunRepository,
  caseRepo: TestCaseRepository,
  patternRepo: FailurePatternRepository,
  adapter: IngestionAdapter,
  input: IngestTestRunInput,
): Promise<IngestResponse> {
  const parsed = adapter.parse(input.raw);
  const { cases, ...runFields } = parsed;

  const totalTests = cases.length;
  const passedTests = cases.filter((c) => c.status === 'PASSED').length;
  const failedTests = cases.filter((c) => c.status === 'FAILED' || c.status === 'ERROR').length;
  const skippedTests = cases.filter((c) => c.status === 'SKIPPED').length;
  const status = deriveStatus(failedTests, skippedTests);

  const created = await withTransaction(pool, async (tx) => {
    const run = await runRepo.create(
      {
        ...runFields,
        ...input.overrides,
        projectId: input.projectId,
        sourceType: input.sourceType,
        status,
        totalTests,
        passedTests,
        failedTests,
        skippedTests,
      },
      tx,
    );

    const caseInputs = cases.map((c) => ({
      ...c,
      projectId: input.projectId,
      testRunId: run.id,
    }));
    await caseRepo.createMany(caseInputs, tx);

    await extractFailurePatterns(patternRepo, cases, input.projectId, tx);

    return run;
  });

  return {
    runId: created.id,
    testCaseCount: cases.length,
  };
}
