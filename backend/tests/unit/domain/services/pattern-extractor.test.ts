import { describe, it, expect } from '@jest/globals';
import { extractPattern } from '../../../../src/domain/services/pattern-extractor.js';

describe('extractPattern', () => {
  describe('happy path — scrubbing volatile substrings', () => {
    it('scrubs file:line refs from a node-style stack frame', () => {
      const { pattern } = extractPattern(
        'Cannot read property "id" of undefined at /Users/dev/app/src/auth.ts:123:45',
        'TypeError',
        'returns user',
      );
      expect(pattern).toBe('TypeError: Cannot read property "id" of undefined at <PATH>');
    });

    it('scrubs UUIDs from messages', () => {
      const { pattern } = extractPattern(
        'User 550e8400-e29b-41d4-a716-446655440000 not found',
        undefined,
        'finds user',
      );
      expect(pattern).toBe('User <UUID> not found');
    });

    it('scrubs ISO timestamps from messages', () => {
      const { pattern } = extractPattern(
        'Lock acquired at 2026-06-01T12:34:56.789Z expired',
        undefined,
        'releases lock',
      );
      expect(pattern).toBe('Lock acquired at <TS> expired');
    });

    it('scrubs hex memory addresses', () => {
      const { pattern } = extractPattern(
        'Segfault at 0xdeadbeef accessing 0x7fff5fbff8c0',
        'SegmentationFault',
        'allocates buffer',
      );
      expect(pattern).toBe('SegmentationFault: Segfault at <ADDR> accessing <ADDR>');
    });

    it('scrubs URL query strings while preserving the base URL', () => {
      const { pattern } = extractPattern(
        'GET https://api.example.com/users?id=42&token=abc returned 500',
        undefined,
        'fetches user',
      );
      expect(pattern).toBe('GET https://api.example.com/users?<QUERY> returned <N>');
    });

    it('scrubs free numerics ≥ 3 digits', () => {
      const { pattern } = extractPattern(
        'Expected 200 but got 404 from upstream after 12345 ms',
        undefined,
        'retries on 5xx',
      );
      expect(pattern).toBe('Expected <N> but got <N> from upstream after <N> ms');
    });
  });

  describe('fallbacks when failureMessage is absent', () => {
    it('builds pattern from failureType + testName when message is undefined', () => {
      const { pattern } = extractPattern(
        undefined,
        'TimeoutError',
        'AuthService > rejects expired token',
      );
      expect(pattern).toBe('TimeoutError in AuthService > rejects expired token');
    });

    it('builds pattern from failureType + testName when message is empty string', () => {
      const { pattern } = extractPattern('', 'AssertionError', 'returns ok');
      expect(pattern).toBe('AssertionError in returns ok');
    });

    it('builds pattern from failureType + testName when message is whitespace', () => {
      const { pattern } = extractPattern('   \n\t  ', 'NetworkError', 'pings api');
      expect(pattern).toBe('NetworkError in pings api');
    });

    it('falls back to "Unknown failure in <testName>" when both message and type are absent', () => {
      const { pattern } = extractPattern(undefined, undefined, 'does the thing');
      expect(pattern).toBe('Unknown failure in does the thing');
    });

    it('falls back to "Unknown failure in <testName>" when both message and type are empty', () => {
      const { pattern } = extractPattern('', '', 'does the other thing');
      expect(pattern).toBe('Unknown failure in does the other thing');
    });
  });

  describe('category detection', () => {
    it('detects timeout category from the word "timeout"', () => {
      const { category } = extractPattern(
        'Navigation timeout of 30000 ms exceeded',
        'TimeoutError',
        't',
      );
      expect(category).toBe('timeout');
    });

    it('detects timeout category from "timed out"', () => {
      const { category } = extractPattern('Operation timed out', undefined, 't');
      expect(category).toBe('timeout');
    });

    it('detects network category from ECONNREFUSED', () => {
      const { category } = extractPattern('connect ECONNREFUSED 127.0.0.1:5432', undefined, 't');
      expect(category).toBe('network');
    });

    it('detects network category from "connection refused"', () => {
      const { category } = extractPattern('Connection refused by upstream', undefined, 't');
      expect(category).toBe('network');
    });

    it('detects network category from fetch failure', () => {
      const { category } = extractPattern('fetch failed', 'TypeError', 't');
      expect(category).toBe('network');
    });

    it('detects database category from "deadlock"', () => {
      const { category } = extractPattern('deadlock detected on row 42', undefined, 't');
      expect(category).toBe('database');
    });

    it('detects database category from a SQL error', () => {
      const { category } = extractPattern('SQL syntax error near WHERE', 'QueryError', 't');
      expect(category).toBe('database');
    });

    it('detects database category from "postgres"', () => {
      const { category } = extractPattern('postgres connection lost', undefined, 't');
      expect(category).toBe('database');
    });

    it('detects assertion category from "AssertionError"', () => {
      const { category } = extractPattern('values are not equal', 'AssertionError', 't');
      expect(category).toBe('assertion');
    });

    it('detects assertion category from "expect("', () => {
      const { category } = extractPattern('expect(received).toBe(expected)', undefined, 't');
      expect(category).toBe('assertion');
    });

    it('detects assertion category from "to equal"', () => {
      const { category } = extractPattern('expected foo to equal bar', undefined, 't');
      expect(category).toBe('assertion');
    });

    it('returns unknown for content that matches no rule', () => {
      const { category } = extractPattern('something obscure happened', 'WeirdError', 't');
      expect(category).toBe('unknown');
    });

    it('returns unknown for the fallback "Unknown failure" pattern', () => {
      const { category } = extractPattern(undefined, undefined, 'some test');
      expect(category).toBe('unknown');
    });
  });

  describe('pattern stability', () => {
    it('produces the same pattern for two messages differing only in line number', () => {
      const a = extractPattern(
        'Cannot read property "x" at /app/src/foo.ts:10:5',
        'TypeError',
        't',
      );
      const b = extractPattern(
        'Cannot read property "x" at /app/src/foo.ts:42:5',
        'TypeError',
        't',
      );
      expect(a.pattern).toBe(b.pattern);
    });

    it('produces the same pattern for two messages differing only in UUID', () => {
      const a = extractPattern(
        'User 550e8400-e29b-41d4-a716-446655440000 not found',
        undefined,
        't',
      );
      const b = extractPattern(
        'User 6ba7b810-9dad-11d1-80b4-00c04fd430c8 not found',
        undefined,
        't',
      );
      expect(a.pattern).toBe(b.pattern);
    });

    it('produces the same pattern for two messages differing only in timestamp', () => {
      const a = extractPattern('Lock acquired at 2026-06-01T12:34:56.789Z expired', undefined, 't');
      const b = extractPattern('Lock acquired at 2026-06-07T09:00:00Z expired', undefined, 't');
      expect(a.pattern).toBe(b.pattern);
    });

    it('produces the same pattern for two messages differing only in hex address', () => {
      const a = extractPattern('crash at 0xdeadbeef', undefined, 't');
      const b = extractPattern('crash at 0xcafebabe', undefined, 't');
      expect(a.pattern).toBe(b.pattern);
    });

    it('produces the same pattern for two messages differing only in numeric values', () => {
      const a = extractPattern('expected 200 got 500', undefined, 't');
      const b = extractPattern('expected 201 got 503', undefined, 't');
      expect(a.pattern).toBe(b.pattern);
    });
  });

  describe('miscellaneous', () => {
    it('takes only the first line of a multi-line failure message', () => {
      const { pattern } = extractPattern(
        'TypeError: x is null\n  at /app/foo.ts:10:5\n  at /app/bar.ts:20:1',
        undefined,
        't',
      );
      expect(pattern).toBe('TypeError: x is null');
    });

    it('collapses runs of whitespace to a single space', () => {
      const { pattern } = extractPattern('foo     bar\t\tbaz', undefined, 't');
      expect(pattern).toBe('foo bar baz');
    });

    it('truncates patterns longer than 200 characters with an ellipsis', () => {
      const long = 'x'.repeat(300);
      const { pattern } = extractPattern(long, undefined, 't');
      expect(pattern.length).toBe(200);
      expect(pattern.endsWith('…')).toBe(true);
    });
  });
});
