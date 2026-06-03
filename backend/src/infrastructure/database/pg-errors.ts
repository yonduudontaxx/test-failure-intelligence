import { UniqueConstraintError, ForeignKeyError } from '../../domain/errors/index.js';

interface PgErrorShape {
  code?: string;
  constraint?: string;
  detail?: string;
}

function isPgError(err: unknown): err is PgErrorShape {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  );
}

export function isUniqueViolation(err: unknown): err is PgErrorShape {
  return isPgError(err) && err.code === '23505';
}

export function isForeignKeyViolation(err: unknown): err is PgErrorShape {
  return isPgError(err) && err.code === '23503';
}

export function toDomainError(err: unknown): UniqueConstraintError | ForeignKeyError | null {
  if (isUniqueViolation(err)) {
    return new UniqueConstraintError(err.constraint ?? 'unknown', err.detail);
  }
  if (isForeignKeyViolation(err)) {
    return new ForeignKeyError(err.constraint ?? 'unknown', err.detail);
  }
  return null;
}
