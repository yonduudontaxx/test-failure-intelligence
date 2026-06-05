import { describe, it, expect } from '@jest/globals';
import { normalizeFullName } from '../../../../src/application/ingestion/normalize.js';

describe('normalizeFullName', () => {
  it('joins suiteName and testName with " > " when suiteName is provided', () => {
    expect(normalizeFullName('MySuite', 'my test')).toBe('MySuite > my test');
  });

  it('returns testName alone when suiteName is undefined', () => {
    expect(normalizeFullName(undefined, 'my test')).toBe('my test');
  });

  it('treats empty-string suiteName as absent', () => {
    expect(normalizeFullName('', 'my test')).toBe('my test');
  });

  it('preserves unicode characters in the test name', () => {
    expect(normalizeFullName('Suite', 'тест 测试 🎯')).toBe('Suite > тест 测试 🎯');
  });

  it('preserves the suiteName verbatim including embedded separators', () => {
    expect(normalizeFullName('Auth.Service > nested', 'login')).toBe(
      'Auth.Service > nested > login',
    );
  });

  it('returns a string', () => {
    expect(typeof normalizeFullName('s', 't')).toBe('string');
    expect(typeof normalizeFullName(undefined, 't')).toBe('string');
  });
});
