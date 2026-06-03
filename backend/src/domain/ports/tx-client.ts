/**
 * Opaque handle for a database transaction participant. Domain-local alias —
 * intentionally `unknown` so the domain stays free of pg. Narrowed to the
 * actual driver client type in Task 6 (infrastructure/database/types.ts).
 */
export type TxClient = unknown;
