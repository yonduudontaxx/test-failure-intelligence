import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/api/runs', () => ({
  getRuns: vi.fn(),
  getRun: vi.fn().mockResolvedValue({
    id: 'r1',
    projectId: 'p1',
    sourceType: 'api',
    status: 'SUCCESS',
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    skippedTests: 0,
    metadata: {},
    ingestedAt: '2026-06-07T12:00:00.000Z',
  }),
  getRunCases: vi.fn().mockResolvedValue({ items: [] }),
}));

import RunDetailPage from './page';

describe('RunDetailPage', () => {
  it('renders the metadata card and Test Cases section', async () => {
    const jsx = await RunDetailPage({
      params: Promise.resolve({ id: 'p1', runId: 'r1' }),
      searchParams: Promise.resolve({}),
    });
    render(jsx);
    expect(screen.getByText(/run metadata/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /test cases/i })).toBeInTheDocument();
  });
});
