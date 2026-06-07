export const HEALTH_THRESHOLDS = {
  recentFailureRate: { warning: 0.05, critical: 0.2 },
  brokenTestCount: { warning: 1, critical: 3 },
  flakyTestCount: { warning: 5, critical: 15 },
} as const;
