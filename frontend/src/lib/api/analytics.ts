import { apiGet } from './fetch';
import type {
  FailurePatternsResponse,
  FailureTrendsResponse,
  FlakyTestsResponse,
  HealthResponse,
  OverviewResponse,
} from './types';

export function getFlakyTests(
  projectId: string,
  params?: { days?: number; limit?: number },
): Promise<FlakyTestsResponse> {
  return apiGet<FlakyTestsResponse>(`/api/v1/projects/${projectId}/flaky-tests`, params);
}

export function getFailureTrends(
  projectId: string,
  params?: { days?: number; bucketSize?: string },
): Promise<FailureTrendsResponse> {
  return apiGet<FailureTrendsResponse>(`/api/v1/projects/${projectId}/failure-trends`, params);
}

export function getHealth(projectId: string, params?: { days?: number }): Promise<HealthResponse> {
  return apiGet<HealthResponse>(`/api/v1/projects/${projectId}/health`, params);
}

export function getOverview(projectId: string): Promise<OverviewResponse> {
  return apiGet<OverviewResponse>(`/api/v1/projects/${projectId}/overview`);
}

export function getFailurePatterns(
  projectId: string,
  params?: { limit?: number },
): Promise<FailurePatternsResponse> {
  return apiGet<FailurePatternsResponse>(`/api/v1/projects/${projectId}/failure-patterns`, params);
}
