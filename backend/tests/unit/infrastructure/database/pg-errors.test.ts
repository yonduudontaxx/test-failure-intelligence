import { describe, it, expect } from '@jest/globals';
import {
  isUniqueViolation,
  isForeignKeyViolation,
  toDomainError,
} from '../../../../src/infrastructure/database/pg-errors.js';
import { UniqueConstraintError, ForeignKeyError } from '../../../../src/domain/errors/index.js';

describe('isUniqueViolation', () => {
  it('returns true for an error with code 23505', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('returns false for an error with code 23503', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
  });

  it.each([null, undefined, 'oops', 42, {}, { code: 23505 }, new Error('boom')])(
    'returns false for non-pg-shaped input: %p',
    (input) => {
      expect(isUniqueViolation(input)).toBe(false);
    },
  );
});

describe('isForeignKeyViolation', () => {
  it('returns true for an error with code 23503', () => {
    expect(isForeignKeyViolation({ code: '23503' })).toBe(true);
  });

  it('returns false for an error with code 23505', () => {
    expect(isForeignKeyViolation({ code: '23505' })).toBe(false);
  });

  it.each([null, undefined, 'oops', 42, {}, { code: 23503 }, new Error('boom')])(
    'returns false for non-pg-shaped input: %p',
    (input) => {
      expect(isForeignKeyViolation(input)).toBe(false);
    },
  );
});

describe('toDomainError', () => {
  it('maps a unique violation to UniqueConstraintError with constraint and detail', () => {
    const result = toDomainError({
      code: '23505',
      constraint: 'projects_slug_key',
      detail: 'Key (slug)=(foo) already exists.',
    });
    expect(result).toBeInstanceOf(UniqueConstraintError);
    expect(result).not.toBeNull();
    if (result instanceof UniqueConstraintError) {
      expect(result.constraint).toBe('projects_slug_key');
      expect(result.detail).toBe('Key (slug)=(foo) already exists.');
      expect(result.message).toContain('projects_slug_key');
    }
  });

  it('maps a foreign key violation to ForeignKeyError with constraint', () => {
    const result = toDomainError({
      code: '23503',
      constraint: 'test_runs_project_id_fkey',
    });
    expect(result).toBeInstanceOf(ForeignKeyError);
    if (result instanceof ForeignKeyError) {
      expect(result.constraint).toBe('test_runs_project_id_fkey');
      expect(result.message).toContain('test_runs_project_id_fkey');
    }
  });

  it("falls back to 'unknown' when constraint name is missing", () => {
    const result = toDomainError({ code: '23505' });
    expect(result).toBeInstanceOf(UniqueConstraintError);
    if (result instanceof UniqueConstraintError) {
      expect(result.constraint).toBe('unknown');
    }
  });

  it('returns null for a generic Error', () => {
    expect(toDomainError(new Error('random'))).toBeNull();
  });

  it.each([null, undefined, 'oops', 42, {}, { code: 23505 }, { code: '99999' }])(
    'returns null for unmapped input: %p',
    (input) => {
      expect(toDomainError(input)).toBeNull();
    },
  );
});
