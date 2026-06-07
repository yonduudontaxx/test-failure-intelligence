import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { getRuns } from '@/lib/api/runs';
import { Badge, Card, Table, type BadgeVariant, type TableColumn } from '@/components/ui';
import type { TestRun, TestRunStatus } from '@/lib/api/types';

const PAGE_SIZE = 20;

const STATUS_FILTERS: ReadonlyArray<{ label: string; value: TestRunStatus | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Success', value: 'SUCCESS' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Partial', value: 'PARTIAL' },
];

function statusVariant(status: TestRunStatus): BadgeVariant {
  switch (status) {
    case 'SUCCESS':
      return 'success';
    case 'FAILED':
      return 'critical';
    case 'PARTIAL':
      return 'warning';
  }
}

function parseStatus(raw: string | undefined): TestRunStatus | undefined {
  if (raw === 'SUCCESS' || raw === 'FAILED' || raw === 'PARTIAL') return raw;
  return undefined;
}

function parsePage(raw: string | undefined): number {
  if (!raw) return 1;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function buildHref(
  basePath: string,
  opts: { page?: number; status?: TestRunStatus | undefined },
): string {
  const params = new URLSearchParams();
  if (opts.page && opts.page !== 1) params.set('page', String(opts.page));
  if (opts.status) params.set('status', opts.status);
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
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

export default async function RunHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const status = parseStatus(sp.status);
  const basePath = `/projects/${id}/runs`;

  let runs;
  try {
    runs = await getRuns(id, { page, limit: PAGE_SIZE, status });
  } catch (err) {
    if (err instanceof ApiError && err.code === 'PROJECT_NOT_FOUND') {
      notFound();
    }
    throw err;
  }

  const totalPages = Math.max(1, Math.ceil(runs.total / PAGE_SIZE));

  const columns: TableColumn<TestRun>[] = [
    {
      key: 'status',
      header: 'Status',
      render: (run) => (
        <Link
          href={`${basePath}/${run.id}`}
          className="inline-block hover:opacity-80"
          aria-label={`Open run ${run.id}`}
        >
          <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
        </Link>
      ),
    },
    {
      key: 'branch',
      header: 'Branch',
      render: (run) =>
        run.branch ? (
          <span className="font-mono text-xs text-gray-800">{run.branch}</span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'environment',
      header: 'Environment',
      render: (run) =>
        run.environment ? (
          <span className="text-gray-800">{run.environment}</span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'executedAt',
      header: 'Executed',
      render: (run) => (
        <Link href={`${basePath}/${run.id}`} className="text-blue-700 hover:underline">
          {formatDateTime(run.executedAt)}
        </Link>
      ),
    },
    {
      key: 'totalTests',
      header: 'Total',
      render: (run) => <span className="tabular-nums">{run.totalTests}</span>,
    },
    {
      key: 'passedTests',
      header: 'Passed',
      render: (run) => <span className="tabular-nums text-emerald-700">{run.passedTests}</span>,
    },
    {
      key: 'failedTests',
      header: 'Failed',
      render: (run) => <span className="tabular-nums text-red-700">{run.failedTests}</span>,
    },
    {
      key: 'duration',
      header: 'Duration',
      render: (run) => (
        <span className="tabular-nums text-gray-700">{formatDuration(run.durationMs)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Run History</h2>
        <p className="text-sm text-gray-600">
          {runs.total} run{runs.total === 1 ? '' : 's'} total
        </p>
      </div>

      <nav className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => {
          const active = status === filter.value;
          const href = buildHref(basePath, { status: filter.value });
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

      {runs.items.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <h3 className="text-base font-medium text-gray-900">No runs match this filter</h3>
            <p className="mt-1 text-sm text-gray-600">
              {status
                ? 'Try clearing the status filter or ingesting more runs.'
                : 'Ingest a test run via the API to see history here.'}
            </p>
          </div>
        </Card>
      ) : (
        <>
          <Table columns={columns} data={runs.items} />
          {runs.total > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-4 px-1 text-sm">
              <p className="text-gray-600">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={buildHref(basePath, { page: page - 1, status })}
                    className="rounded border border-gray-300 bg-white px-3 py-1 font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Previous
                  </Link>
                ) : (
                  <span className="rounded border border-gray-200 bg-gray-50 px-3 py-1 font-medium text-gray-400">
                    Previous
                  </span>
                )}
                {page < totalPages ? (
                  <Link
                    href={buildHref(basePath, { page: page + 1, status })}
                    className="rounded border border-gray-300 bg-white px-3 py-1 font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Next
                  </Link>
                ) : (
                  <span className="rounded border border-gray-200 bg-gray-50 px-3 py-1 font-medium text-gray-400">
                    Next
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
