import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { getOverview } from '@/lib/api/analytics';
import { Badge, Card, type BadgeVariant } from '@/components/ui';
import type {
  FailureSeverity,
  HealthIssueItem,
  ProjectHealthStatus,
  ReliabilityState,
} from '@/lib/api/types';

const TOP_LIMIT = 3;

const healthBannerClass: Record<ProjectHealthStatus, string> = {
  HEALTHY: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  WARNING: 'border-amber-200 bg-amber-50 text-amber-900',
  CRITICAL: 'border-red-200 bg-red-50 text-red-900',
};

function severityVariant(severity: FailureSeverity): BadgeVariant {
  switch (severity) {
    case 'CRITICAL':
      return 'critical';
    case 'HIGH':
      return 'warning';
    case 'MEDIUM':
      return 'info';
    case 'LOW':
      return 'neutral';
  }
}

function reliabilityVariant(state: ReliabilityState): BadgeVariant {
  switch (state) {
    case 'STABLE':
      return 'success';
    case 'FLAKY':
      return 'warning';
    case 'BROKEN':
      return 'critical';
  }
}

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let overview;
  try {
    overview = await getOverview(id);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'PROJECT_NOT_FOUND') {
      notFound();
    }
    throw err;
  }

  if (overview.totalRuns === 0) {
    return (
      <Card>
        <div className="py-10 text-center">
          <h2 className="text-lg font-medium text-gray-900">No runs ingested yet</h2>
          <p className="mt-1 text-sm text-gray-600">
            Submit a test run via the API to see analytics here.
          </p>
          <p className="mt-3 font-mono text-xs text-gray-500">POST /api/v1/projects/{id}/ingest</p>
        </div>
      </Card>
    );
  }

  const passRatePct = (overview.recentPassRate * 100).toFixed(1);
  const failureRatePct = ((1 - overview.recentPassRate) * 100).toFixed(1);

  return (
    <div className="space-y-6">
      <div className={`rounded-lg border p-4 ${healthBannerClass[overview.healthStatus]}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide">Project health</p>
            <p className="mt-1 text-2xl font-semibold">{overview.healthStatus}</p>
          </div>
          <div className="text-right text-sm">
            <p>{passRatePct}% pass rate</p>
            <p>{failureRatePct}% failure rate</p>
            <p>
              {overview.totalRuns} run{overview.totalRuns === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Total test cases
          </p>
          <p className="mt-1 text-2xl font-semibold">{overview.totalTestCases}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Passed</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">{overview.passedTestCases}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Failed</p>
          <p className="mt-1 text-2xl font-semibold text-red-700">{overview.failedTestCases}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Skipped</p>
          <p className="mt-1 text-2xl font-semibold text-gray-700">{overview.skippedTestCases}</p>
        </Card>
      </div>

      {overview.topCriticalIssues.length > 0 && (
        <Card title="Critical Issues">
          <ul className="space-y-2">
            {overview.topCriticalIssues.map((issue: HealthIssueItem, i) => (
              <li key={i} className="flex items-start gap-3">
                <Badge variant="critical">{issue.code}</Badge>
                <span className="text-sm text-gray-700">{issue.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Top Flaky Tests">
        {overview.topFlakyTests.length === 0 ? (
          <p className="text-sm text-gray-500">No flaky or broken tests detected.</p>
        ) : (
          <ul className="space-y-2">
            {overview.topFlakyTests.slice(0, TOP_LIMIT).map((test, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="truncate font-mono text-sm text-gray-800">{test.fullName}</span>
                <Badge variant={reliabilityVariant(test.reliabilityState)}>
                  {test.reliabilityState}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Top Failure Patterns">
        {overview.topFailurePatterns.length === 0 ? (
          <p className="text-sm text-gray-500">No failure patterns recorded.</p>
        ) : (
          <ul className="space-y-2">
            {overview.topFailurePatterns.slice(0, TOP_LIMIT).map((pattern, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="truncate font-mono text-sm text-gray-800">{pattern.pattern}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={severityVariant(pattern.severity)}>{pattern.severity}</Badge>
                  <span className="text-xs text-gray-500">{pattern.occurrenceCount}×</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
