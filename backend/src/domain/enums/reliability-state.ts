export const RELIABILITY_STATES = ['STABLE', 'FLAKY', 'BROKEN'] as const;

export type ReliabilityState = (typeof RELIABILITY_STATES)[number];

export function isReliabilityState(value: unknown): value is ReliabilityState {
  return typeof value === 'string' && (RELIABILITY_STATES as readonly string[]).includes(value);
}
