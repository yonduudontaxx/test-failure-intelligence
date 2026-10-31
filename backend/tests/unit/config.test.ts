import { describe, it, expect } from '@jest/globals';
import { parseCorsOrigins } from '../../src/config.js';

const DEFAULT = ['http://localhost:3000'];

describe('parseCorsOrigins', () => {
  it('defaults when unset', () => {
    expect(parseCorsOrigins(undefined)).toEqual(DEFAULT);
  });

  it('defaults when empty', () => {
    expect(parseCorsOrigins('')).toEqual(DEFAULT);
  });

  it('defaults when only whitespace and commas', () => {
    expect(parseCorsOrigins(' , ,, ')).toEqual(DEFAULT);
  });

  it('trims entries and splits on commas', () => {
    expect(parseCorsOrigins(' https://a.example , https://b.example:8443 ')).toEqual([
      'https://a.example',
      'https://b.example:8443',
    ]);
  });

  it('rejects the wildcard', () => {
    expect(() => parseCorsOrigins('*')).toThrow(/not allowed/);
    expect(() => parseCorsOrigins('https://a.example, *')).toThrow(/not allowed/);
  });

  it('normalizes trailing slashes and paths to the origin', () => {
    expect(parseCorsOrigins('https://a.example/, https://b.example/app')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('throws on an invalid URL', () => {
    expect(() => parseCorsOrigins('not-a-url')).toThrow(/invalid origin/);
  });
});
