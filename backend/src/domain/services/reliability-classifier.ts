import type { ReliabilityState } from '../enums/reliability-state.js';
import type { TestCaseStatus } from '../enums/test-case-status.js';

export function classifyReliability(results: TestCaseStatus[]): ReliabilityState {
  const filtered = results.filter((s) => s !== 'SKIPPED');
  if (filtered.length === 0) return 'STABLE';

  const hasPassed = filtered.some((s) => s === 'PASSED');
  const hasFailed = filtered.some((s) => s === 'FAILED' || s === 'ERROR');

  if (hasPassed && !hasFailed) return 'STABLE';
  if (!hasPassed && hasFailed) return 'BROKEN';
  return 'FLAKY';
}
