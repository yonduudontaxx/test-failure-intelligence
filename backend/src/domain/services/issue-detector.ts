import type { FailureSeverity } from '../enums/failure-severity.js';
import type { HealthInput } from './health-evaluator.js';
import { HEALTH_THRESHOLDS } from './health-thresholds.js';

export interface FailurePatternSummary {
  severity: FailureSeverity;
  occurrenceCount: number;
}

export interface WarningItem {
  code: string;
  message: string;
}

export interface CriticalIssueItem {
  code: string;
  message: string;
}

export type IssueDetectorInput = HealthInput & {
  patterns: FailurePatternSummary[];
};

function passRatePercent(recentFailureRate: number): number {
  return Math.round((1 - recentFailureRate) * 1000) / 10;
}

export function detectIssues(input: IssueDetectorInput): {
  warnings: WarningItem[];
  criticalIssues: CriticalIssueItem[];
} {
  const warnings: WarningItem[] = [];
  const criticalIssues: CriticalIssueItem[] = [];

  if (input.totalRuns === 0) return { warnings, criticalIssues };

  if (input.brokenTestCount >= HEALTH_THRESHOLDS.brokenTestCount.warning) {
    warnings.push({
      code: 'BROKEN_TESTS_PRESENT',
      message: `${input.brokenTestCount} test(s) are persistently failing (BROKEN)`,
    });
  }
  if (input.brokenTestCount >= HEALTH_THRESHOLDS.brokenTestCount.critical) {
    criticalIssues.push({
      code: 'BROKEN_TESTS_THRESHOLD',
      message: `${input.brokenTestCount} BROKEN tests at or above the critical threshold of ${HEALTH_THRESHOLDS.brokenTestCount.critical}`,
    });
  }

  if (input.recentFailureRate > HEALTH_THRESHOLDS.recentFailureRate.warning) {
    warnings.push({
      code: 'PASS_RATE_LOW',
      message: `Pass rate is ${passRatePercent(input.recentFailureRate)}% — below the healthy threshold`,
    });
  }
  if (input.recentFailureRate > HEALTH_THRESHOLDS.recentFailureRate.critical) {
    criticalIssues.push({
      code: 'PASS_RATE_CRITICAL',
      message: `Pass rate is ${passRatePercent(input.recentFailureRate)}% — below the critical threshold`,
    });
  }

  if (input.flakyTestCount > HEALTH_THRESHOLDS.flakyTestCount.warning) {
    warnings.push({
      code: 'FLAKY_TESTS_MODERATE',
      message: `${input.flakyTestCount} flaky test(s) detected`,
    });
  }
  if (input.flakyTestCount > HEALTH_THRESHOLDS.flakyTestCount.critical) {
    criticalIssues.push({
      code: 'FLAKY_TESTS_HIGH',
      message: `${input.flakyTestCount} flaky tests above the critical threshold of ${HEALTH_THRESHOLDS.flakyTestCount.critical}`,
    });
  }

  for (const p of input.patterns) {
    if (p.severity === 'HIGH') {
      warnings.push({
        code: 'HIGH_SEVERITY_PATTERN',
        message: `Failure pattern with HIGH severity (${p.occurrenceCount} occurrences)`,
      });
    } else if (p.severity === 'CRITICAL') {
      criticalIssues.push({
        code: 'CRITICAL_SEVERITY_PATTERN',
        message: `Failure pattern with CRITICAL severity (${p.occurrenceCount} occurrences)`,
      });
    }
  }

  return { warnings, criticalIssues };
}
