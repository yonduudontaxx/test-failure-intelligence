import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/api/analytics', () => ({
  getOverview: vi.fn(),
  getHealth: vi.fn(),
  getFlakyTests: vi.fn(),
  getFailureTrends: vi.fn().mockResolvedValue({ items: [] }),
  getFailurePatterns: vi.fn(),
}));

vi.mock('@/components/projects/TrendChart', () => ({
  TrendChart: () => null,
}));

import TrendsPage from './page';

describe('TrendsPage', () => {
  it('renders the empty-window state when no trend data exists', async () => {
    const jsx = await TrendsPage({
      params: Promise.resolve({ id: 'p1' }),
      searchParams: Promise.resolve({}),
    });
    render(jsx);
    expect(screen.getByText(/no runs in the last 30 days/i)).toBeInTheDocument();
  });
});
