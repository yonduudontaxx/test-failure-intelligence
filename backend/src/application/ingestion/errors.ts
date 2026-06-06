export class IngestionFailedError extends Error {
  readonly name = 'IngestionFailedError';

  constructor(message: string) {
    super(message);
  }
}
