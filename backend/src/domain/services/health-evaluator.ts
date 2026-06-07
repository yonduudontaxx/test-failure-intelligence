import type { ProjectHealthStatus } from '../enums/project-health-status.js';

export interface HealthInput {
  totalRuns: number;
  recentFailureRate: number;
  brokenTestCount: number;
  flakyTestCount: number;
}

export function evaluateHealth(input: HealthInput): ProjectHealthStatus {
  if (input.totalRuns === 0) return 'HEALTHY';

  if (input.recentFailureRate > 0.2 || input.brokenTestCount >= 3 || input.flakyTestCount > 15) {
    return 'CRITICAL';
  }

  if (input.recentFailureRate > 0.05 || input.brokenTestCount >= 1 || input.flakyTestCount > 5) {
    return 'WARNING';
  }

  return 'HEALTHY';
}
