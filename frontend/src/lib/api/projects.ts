import { apiGet, apiPost } from './fetch';
import type { ListProjectsResponse, Project } from './types';

export function getProjects(params?: {
  page?: number;
  limit?: number;
}): Promise<ListProjectsResponse> {
  return apiGet<ListProjectsResponse>('/api/v1/projects', params);
}

export function getProject(projectId: string): Promise<Project> {
  return apiGet<Project>(`/api/v1/projects/${projectId}`);
}

export function createProject(body: {
  name: string;
  slug: string;
  description?: string;
}): Promise<Project> {
  return apiPost<Project>('/api/v1/projects', body);
}
