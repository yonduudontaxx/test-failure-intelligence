import { apiGet } from './fetch';
import type { ListRunsResponse, RunCasesResponse, TestRun } from './types';

export function getRuns(
  projectId: string,
  params?: {
    page?: number;
    limit?: number;
    branch?: string;
    environment?: string;
    status?: string;
  },
): Promise<ListRunsResponse> {
  return apiGet<ListRunsResponse>(`/api/v1/projects/${projectId}/runs`, params);
}

export function getRun(projectId: string, runId: string): Promise<TestRun> {
  return apiGet<TestRun>(`/api/v1/projects/${projectId}/runs/${runId}`);
}

export function getRunCases(
  projectId: string,
  runId: string,
  params?: { status?: string },
): Promise<RunCasesResponse> {
  return apiGet<RunCasesResponse>(`/api/v1/projects/${projectId}/runs/${runId}/cases`, params);
}
