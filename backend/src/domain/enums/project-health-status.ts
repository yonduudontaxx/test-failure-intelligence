export const PROJECT_HEALTH_STATUSES = ['HEALTHY', 'WARNING', 'CRITICAL'] as const;

export type ProjectHealthStatus = (typeof PROJECT_HEALTH_STATUSES)[number];

export function isProjectHealthStatus(value: unknown): value is ProjectHealthStatus {
  return (
    typeof value === 'string' && (PROJECT_HEALTH_STATUSES as readonly string[]).includes(value)
  );
}
