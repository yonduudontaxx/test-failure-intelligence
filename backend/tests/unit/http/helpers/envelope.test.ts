import { describe, it, expect } from '@jest/globals';
import { failure, success } from '../../../../src/http/helpers/envelope.js';

describe('success', () => {
  it('wraps an object payload in a { data } envelope', () => {
    const payload = { id: 'abc-123', name: 'My Project' };

    const result = success(payload);

    expect(result).toEqual({ data: payload });
  });

  it('wraps an array payload in a { data } envelope', () => {
    const payload = [{ id: '1' }, { id: '2' }];

    const result = success(payload);

    expect(result).toEqual({ data: payload });
  });

  it('wraps null', () => {
    const result = success(null);

    expect(result).toEqual({ data: null });
  });

  it('wraps an empty object', () => {
    const result = success({});

    expect(result).toEqual({ data: {} });
  });

  it('wraps an empty array', () => {
    const result = success([]);

    expect(result).toEqual({ data: [] });
  });

  it('preserves the payload reference (does not clone)', () => {
    const payload = { name: 'preserved' };

    const result = success(payload);

    expect(result.data).toBe(payload);
  });

  it('returns an envelope with exactly one key', () => {
    const result = success({ x: 1 });

    expect(Object.keys(result)).toEqual(['data']);
  });

  it('preserves the input type through the generic parameter', () => {
    interface Project {
      id: string;
      name: string;
    }
    const project: Project = { id: '1', name: 'A' };

    const result = success<Project>(project);

    expect(result.data.id).toBe('1');
    expect(result.data.name).toBe('A');
  });
});

describe('failure', () => {
  it('wraps a code and message in an { error } envelope', () => {
    const result = failure('VALIDATION_ERROR', 'Request validation failed');

    expect(result).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
      },
    });
  });

  it('preserves code and message strings verbatim', () => {
    const result = failure(
      'DUPLICATE_PROJECT_SLUG',
      'A project with slug "my-service" already exists.',
    );

    expect(result.error.code).toBe('DUPLICATE_PROJECT_SLUG');
    expect(result.error.message).toBe('A project with slug "my-service" already exists.');
  });

  it('returns an envelope with exactly one top-level key', () => {
    const result = failure('CODE', 'msg');

    expect(Object.keys(result)).toEqual(['error']);
  });

  it('returns an error object with exactly two keys (code, message)', () => {
    const result = failure('CODE', 'msg');

    expect(Object.keys(result.error).sort()).toEqual(['code', 'message']);
  });

  it('does not mutate inputs', () => {
    const code = 'NOT_FOUND';
    const message = 'Project not found.';

    failure(code, message);

    expect(code).toBe('NOT_FOUND');
    expect(message).toBe('Project not found.');
  });
});
