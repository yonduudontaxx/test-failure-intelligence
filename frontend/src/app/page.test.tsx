import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/api/projects', () => ({
  getProjects: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 }),
  getProject: vi.fn(),
  createProject: vi.fn(),
}));

import ProjectsListPage from './page';

describe('ProjectsListPage', () => {
  it('renders without crashing on an empty project list', async () => {
    const jsx = await ProjectsListPage({ searchParams: Promise.resolve({}) });
    render(jsx);
    expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
  });
});
