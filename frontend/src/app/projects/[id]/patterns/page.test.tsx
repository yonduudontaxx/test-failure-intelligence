import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/api/analytics', () => ({
  getOverview: vi.fn(),
  getHealth: vi.fn(),
  getFlakyTests: vi.fn(),
  getFailureTrends: vi.fn(),
  getFailurePatterns: vi.fn().mockResolvedValue({ items: [] }),
}));

import FailurePatternsPage from './page';

describe('FailurePatternsPage', () => {
  it('renders the empty state when no patterns exist', async () => {
    const jsx = await FailurePatternsPage({
      params: Promise.resolve({ id: 'p1' }),
      searchParams: Promise.resolve({}),
    });
    render(jsx);
    expect(screen.getByText(/no failure patterns detected yet/i)).toBeInTheDocument();
  });
});
