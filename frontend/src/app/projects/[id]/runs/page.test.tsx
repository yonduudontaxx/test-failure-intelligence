import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/api/runs', () => ({
  getRuns: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
  getRun: vi.fn(),
  getRunCases: vi.fn(),
}));

import RunHistoryPage from './page';

describe('RunHistoryPage', () => {
  it('renders without crashing on an empty run list', async () => {
    const jsx = await RunHistoryPage({
      params: Promise.resolve({ id: 'p1' }),
      searchParams: Promise.resolve({}),
    });
    render(jsx);
    expect(screen.getByRole('heading', { name: /run history/i })).toBeInTheDocument();
  });
});
