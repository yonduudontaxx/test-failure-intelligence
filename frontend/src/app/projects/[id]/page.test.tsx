import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/api/analytics', () => ({
  getOverview: vi.fn().mockResolvedValue({
    totalRuns: 0,
    totalTestCases: 0,
    passedTestCases: 0,
    failedTestCases: 0,
    skippedTestCases: 0,
    recentPassRate: 1,
    healthStatus: 'HEALTHY',
    topFlakyTests: [],
    topFailurePatterns: [],
    topCriticalIssues: [],
  }),
  getHealth: vi.fn(),
  getFlakyTests: vi.fn(),
  getFailureTrends: vi.fn(),
  getFailurePatterns: vi.fn(),
}));

import ProjectDashboardPage from './page';

describe('ProjectDashboardPage', () => {
  it('renders the empty-runs state when the project has no runs', async () => {
    const jsx = await ProjectDashboardPage({
      params: Promise.resolve({ id: 'p1' }),
    });
    render(jsx);
    expect(screen.getByText(/no runs ingested yet/i)).toBeInTheDocument();
  });
});
