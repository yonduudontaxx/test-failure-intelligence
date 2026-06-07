import type { ProjectHealthStatus } from '../enums/project-health-status.js';
import { HEALTH_THRESHOLDS } from './health-thresholds.js';

export interface HealthInput {
  totalRuns: number;
  recentFailureRate: number;
  brokenTestCount: number;
  flakyTestCount: number;
}

export function evaluateHealth(input: HealthInput): ProjectHealthStatus {
  if (input.totalRuns === 0) return 'HEALTHY';

  if (
    input.recentFailureRate > HEALTH_THRESHOLDS.recentFailureRate.critical ||
    input.brokenTestCount >= HEALTH_THRESHOLDS.brokenTestCount.critical ||
    input.flakyTestCount > HEALTH_THRESHOLDS.flakyTestCount.critical
  ) {
    return 'CRITICAL';
  }

  if (
    input.recentFailureRate > HEALTH_THRESHOLDS.recentFailureRate.warning ||
    input.brokenTestCount >= HEALTH_THRESHOLDS.brokenTestCount.warning ||
    input.flakyTestCount > HEALTH_THRESHOLDS.flakyTestCount.warning
  ) {
    return 'WARNING';
  }

  return 'HEALTHY';
}
