import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { getRun, getRunCases } from '@/lib/api/runs';
import { Badge, Card, Table, type BadgeVariant, type TableColumn } from '@/components/ui';
import type { TestCase, TestCaseStatus, TestRunStatus } from '@/lib/api/types';

const CASE_FILTERS: ReadonlyArray<{ label: string; value: TestCaseStatus | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Passed', value: 'PASSED' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Error', value: 'ERROR' },
  { label: 'Skipped', value: 'SKIPPED' },
];

const FAILURE_MESSAGE_MAX = 80;

function runStatusVariant(status: TestRunStatus): BadgeVariant {
  switch (status) {
    case 'SUCCESS':
      return 'success';
    case 'FAILED':
      return 'critical';
    case 'PARTIAL':
      return 'warning';
  }
}

function caseStatusVariant(status: TestCaseStatus): BadgeVariant {
  switch (status) {
    case 'PASSED':
      return 'success';
    case 'FAILED':
    case 'ERROR':
      return 'critical';
    case 'SKIPPED':
      return 'neutral';
  }
}

function parseCaseStatus(raw: string | undefined): TestCaseStatus | undefined {
  if (raw === 'PASSED' || raw === 'FAILED' || raw === 'SKIPPED' || raw === 'ERROR') return raw;
  return undefined;
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function formatDuration(ms: number | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncate(text: string | undefined, max: number): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function buildCasesHref(basePath: string, status: TestCaseStatus | undefined): string {
  return status ? `${basePath}?status=${status}` : basePath;
}

export default async function RunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; runId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id, runId } = await params;
  const sp = await searchParams;
  const caseStatus = parseCaseStatus(sp.status);
  const basePath = `/projects/${id}/runs/${runId}`;
  const runsListHref = `/projects/${id}/runs`;

  let run, cases;
  try {
    [run, cases] = await Promise.all([
      getRun(id, runId),
      getRunCases(id, runId, caseStatus ? { status: caseStatus } : undefined),
    ]);
  } catch (err) {
    if (
      err instanceof ApiError &&
      (err.code === 'RUN_NOT_FOUND' || err.code === 'PROJECT_NOT_FOUND')
    ) {
      notFound();
    }
    throw err;
  }

  const metadataRows: Array<{ label: string; value: React.ReactNode }> = [
    { label: 'Status', value: <Badge variant={runStatusVariant(run.status)}>{run.status}</Badge> },
    { label: 'Source', value: <code className="font-mono text-xs">{run.sourceType}</code> },
  ];
  if (run.branch) {
    metadataRows.push({
      label: 'Branch',
      value: <code className="font-mono text-xs">{run.branch}</code>,
    });
  }
  if (run.environment) {
    metadataRows.push({ label: 'Environment', value: run.environment });
  }
  if (run.commitSha) {
    metadataRows.push({
      label: 'Commit',
      value: <code className="font-mono text-xs">{run.commitSha}</code>,
    });
  }
  if (run.pipelineName) {
    metadataRows.push({ label: 'Pipeline', value: run.pipelineName });
  }
  if (run.buildNumber) {
    metadataRows.push({ label: 'Build', value: run.buildNumber });
  }
  if (run.externalId) {
    metadataRows.push({
      label: 'External ID',
      value: <code className="font-mono text-xs">{run.externalId}</code>,
    });
  }
  if (run.executedAt) {
    metadataRows.push({ label: 'Executed', value: formatDateTime(run.executedAt) });
  }
  metadataRows.push({ label: 'Ingested', value: formatDateTime(run.ingestedAt) });
  if (run.durationMs != null) {
    metadataRows.push({ label: 'Duration', value: formatDuration(run.durationMs) });
  }

  const columns: TableColumn<TestCase>[] = [
    {
      key: 'status',
      header: 'Status',
      render: (c) => <Badge variant={caseStatusVariant(c.status)}>{c.status}</Badge>,
    },
    {
      key: 'name',
      header: 'Test',
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-sm text-gray-900">{c.fullName}</p>
          {c.suiteName && c.suiteName !== c.fullName ? (
            <p className="truncate text-xs text-gray-500">{c.suiteName}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      render: (c) => (
        <span className="tabular-nums text-gray-700">{formatDuration(c.durationMs)}</span>
      ),
    },
    {
      key: 'failureMessage',
      header: 'Failure',
      render: (c) => {
        if ((c.status !== 'FAILED' && c.status !== 'ERROR') || !c.failureMessage) {
          return <span className="text-gray-400">—</span>;
        }
        return (
          <span title={c.failureMessage} className="font-mono text-xs text-gray-700">
            {truncate(c.failureMessage, FAILURE_MESSAGE_MAX)}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href={runsListHref} className="text-sm text-blue-700 hover:underline">
          ← Run history
        </Link>
      </div>

      <Card title="Run Metadata">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {metadataRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-2 sm:block">
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {row.label}
              </dt>
              <dd className="mt-0 text-gray-900 sm:mt-0.5">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total</p>
          <p className="mt-1 text-2xl font-semibold">{run.totalTests}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Passed</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">{run.passedTests}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Failed</p>
          <p className="mt-1 text-2xl font-semibold text-red-700">{run.failedTests}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Skipped</p>
          <p className="mt-1 text-2xl font-semibold text-gray-700">{run.skippedTests}</p>
        </Card>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-900">Test Cases</h3>
        <nav className="flex flex-wrap gap-2">
          {CASE_FILTERS.map((filter) => {
            const active = caseStatus === filter.value;
            const href = buildCasesHref(basePath, filter.value);
            return (
              <Link
                key={filter.label}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'rounded-full bg-blue-600 px-3 py-1 text-sm font-medium text-white'
                    : 'rounded-full border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50'
                }
              >
                {filter.label}
              </Link>
            );
          })}
        </nav>

        {cases.items.length === 0 ? (
          <Card>
            <div className="py-6 text-center text-sm text-gray-600">
              {caseStatus ? 'No cases match this filter.' : 'This run has no test cases recorded.'}
            </div>
          </Card>
        ) : (
          <Table columns={columns} data={cases.items} />
        )}
      </div>
    </div>
  );
}
