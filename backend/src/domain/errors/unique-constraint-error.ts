export class UniqueConstraintError extends Error {
  readonly name = 'UniqueConstraintError';

  constructor(
    readonly constraint: string,
    readonly detail?: string,
  ) {
    super(`Unique constraint violated: ${constraint}${detail ? ` (${detail})` : ''}`);
  }
}
