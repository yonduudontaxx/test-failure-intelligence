export class ForeignKeyError extends Error {
  readonly name = 'ForeignKeyError';

  constructor(
    readonly constraint: string,
    readonly detail?: string,
  ) {
    super(`Foreign key constraint violated: ${constraint}${detail ? ` (${detail})` : ''}`);
  }
}
