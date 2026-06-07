import { describe, it, expect } from '@jest/globals';
import { assignSeverity } from '../../../../src/domain/services/severity-assigner.js';

const NOW = new Date('2026-06-07T12:00:00.000Z');

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86_400_000);
}

describe('assignSeverity', () => {
  describe('stale precedence (lastSeenAt > 30 days ago)', () => {
    it('returns LOW when stale, even with 1000 occurrences', () => {
      expect(
        assignSeverity({
          occurrenceCount: 1000,
          category: 'timeout',
          lastSeenAt: daysAgo(31),
          now: NOW,
        }),
      ).toBe('LOW');
    });

    it('returns LOW when stale, even with a CRITICAL category', () => {
      expect(
        assignSeverity({
          occurrenceCount: 100,
          category: 'database',
          lastSeenAt: daysAgo(60),
          now: NOW,
        }),
      ).toBe('LOW');
    });

    it('applies threshold rules at the stale boundary (exactly 30 days)', () => {
      expect(
        assignSeverity({
          occurrenceCount: 50,
          category: 'assertion',
          lastSeenAt: daysAgo(30),
          now: NOW,
        }),
      ).toBe('CRITICAL');
    });

    it('applies threshold rules when not stale (29 days ago)', () => {
      expect(
        assignSeverity({
          occurrenceCount: 60,
          category: 'unknown',
          lastSeenAt: daysAgo(29),
          now: NOW,
        }),
      ).toBe('CRITICAL');
    });
  });

  describe('CRITICAL — occurrenceCount >= 50', () => {
    it('returns CRITICAL at exactly 50, any category', () => {
      expect(
        assignSeverity({
          occurrenceCount: 50,
          category: 'unknown',
          lastSeenAt: daysAgo(1),
          now: NOW,
        }),
      ).toBe('CRITICAL');
    });

    it('returns CRITICAL at 51 with assertion category', () => {
      expect(
        assignSeverity({
          occurrenceCount: 51,
          category: 'assertion',
          lastSeenAt: daysAgo(1),
          now: NOW,
        }),
      ).toBe('CRITICAL');
    });
  });

  describe('CRITICAL — occurrenceCount >= 25 with elevated category', () => {
    it('returns CRITICAL at 25 with timeout category', () => {
      expect(
        assignSeverity({
          occurrenceCount: 25,
          category: 'timeout',
          lastSeenAt: daysAgo(1),
          now: NOW,
        }),
      ).toBe('CRITICAL');
    });

    it('returns CRITICAL at 25 with network category', () => {
      expect(
        assignSeverity({
          occurrenceCount: 25,
          category: 'network',
          lastSeenAt: daysAgo(1),
          now: NOW,
        }),
      ).toBe('CRITICAL');
    });

    it('returns CRITICAL at 25 with database category', () => {
      expect(
        assignSeverity({
          occurrenceCount: 25,
          category: 'database',
          lastSeenAt: daysAgo(1),
          now: NOW,
        }),
      ).toBe('CRITICAL');
    });

    it('returns HIGH at 25 with assertion category (not in the CRITICAL set)', () => {
      expect(
        assignSeverity({
          occurrenceCount: 25,
          category: 'assertion',
          lastSeenAt: daysAgo(1),
          now: NOW,
        }),
      ).toBe('HIGH');
    });

    it('returns HIGH at 25 with unknown category', () => {
      expect(
        assignSeverity({
          occurrenceCount: 25,
          category: 'unknown',
          lastSeenAt: daysAgo(1),
          now: NOW,
        }),
      ).toBe('HIGH');
    });

    it('returns HIGH at 24 with timeout (falls to HIGH via the >=20 rule)', () => {
      expect(
        assignSeverity({
          occurrenceCount: 24,
          category: 'timeout',
          lastSeenAt: daysAgo(1),
          now: NOW,
        }),
      ).toBe('HIGH');
    });

    it('returns MEDIUM at 19 with timeout (below both the elevated and HIGH thresholds)', () => {
      expect(
        assignSeverity({
          occurrenceCount: 19,
          category: 'timeout',
          lastSeenAt: daysAgo(1),
          now: NOW,
        }),
      ).toBe('MEDIUM');
    });
  });

  describe('HIGH — occurrenceCount >= 20', () => {
    it('returns HIGH at exactly 20', () => {
      expect(
        assignSeverity({
          occurrenceCount: 20,
          category: 'unknown',
          lastSeenAt: daysAgo(1),
          now: NOW,
        }),
      ).toBe('HIGH');
    });

    it('returns MEDIUM at 19', () => {
      expect(
        assignSeverity({
          occurrenceCount: 19,
          category: 'unknown',
          lastSeenAt: daysAgo(1),
          now: NOW,
        }),
      ).toBe('MEDIUM');
    });
  });

  describe('MEDIUM — occurrenceCount >= 5', () => {
    it('returns MEDIUM at exactly 5', () => {
      expect(
        assignSeverity({
          occurrenceCount: 5,
          category: 'unknown',
          lastSeenAt: daysAgo(1),
          now: NOW,
        }),
      ).toBe('MEDIUM');
    });

    it('returns LOW at 4', () => {
      expect(
        assignSeverity({
          occurrenceCount: 4,
          category: 'unknown',
          lastSeenAt: daysAgo(1),
          now: NOW,
        }),
      ).toBe('LOW');
    });
  });

  describe('LOW — occurrenceCount < 5', () => {
    it('returns LOW at 1', () => {
      expect(
        assignSeverity({
          occurrenceCount: 1,
          category: 'unknown',
          lastSeenAt: daysAgo(1),
          now: NOW,
        }),
      ).toBe('LOW');
    });

    it('returns LOW at 0', () => {
      expect(
        assignSeverity({
          occurrenceCount: 0,
          category: 'timeout',
          lastSeenAt: daysAgo(1),
          now: NOW,
        }),
      ).toBe('LOW');
    });
  });

  describe('now defaulting', () => {
    it('uses new Date() when now is omitted (recent lastSeenAt → not stale)', () => {
      const recent = new Date(Date.now() - 86_400_000); // 1 day ago
      expect(
        assignSeverity({
          occurrenceCount: 50,
          category: 'unknown',
          lastSeenAt: recent,
        }),
      ).toBe('CRITICAL');
    });

    it('uses new Date() when now is omitted (ancient lastSeenAt → stale)', () => {
      const ancient = new Date(Date.now() - 60 * 86_400_000);
      expect(
        assignSeverity({
          occurrenceCount: 1000,
          category: 'timeout',
          lastSeenAt: ancient,
        }),
      ).toBe('LOW');
    });
  });
});
