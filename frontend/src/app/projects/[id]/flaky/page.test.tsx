import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/api/analytics', () => ({
  getOverview: vi.fn(),
  getHealth: vi.fn(),
  getFlakyTests: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getFailureTrends: vi.fn(),
  getFailurePatterns: vi.fn(),
}));

import FlakyTestsPage from './page';

describe('FlakyTestsPage', () => {
  it('renders the empty state when no flaky tests exist', async () => {
    const jsx = await FlakyTestsPage({
      params: Promise.resolve({ id: 'p1' }),
      searchParams: Promise.resolve({}),
    });
    render(jsx);
    expect(screen.getByText(/no flaky or broken tests in the last 30 days/i)).toBeInTheDocument();
  });
});
