import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { getFlakyTests } from '@/lib/api/analytics';
import { Badge, Card, Table, type BadgeVariant, type TableColumn } from '@/components/ui';
import type { FlakyTestItem, ReliabilityState } from '@/lib/api/types';

const DAY_OPTIONS = [7, 14, 30, 60, 90] as const;
const DEFAULT_DAYS = 30;
const FETCH_LIMIT = 100;

const RELIABILITY_PRIORITY: Record<ReliabilityState, number> = {
  BROKEN: 0,
  FLAKY: 1,
  STABLE: 2,
};

function reliabilityVariant(state: ReliabilityState): BadgeVariant {
  switch (state) {
    case 'BROKEN':
      return 'critical';
    case 'FLAKY':
      return 'warning';
    case 'STABLE':
      return 'success';
  }
}

function parseDays(raw: string | undefined): number {
  if (!raw) return DEFAULT_DAYS;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_DAYS;
  return Math.min(90, Math.max(1, n));
}

function buildHref(basePath: string, days: number): string {
  return days === DEFAULT_DAYS ? basePath : `${basePath}?days=${days}`;
}

function formatLastSeen(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function sortItems(items: FlakyTestItem[]): FlakyTestItem[] {
  return [...items].sort((a, b) => {
    const priorityDelta =
      RELIABILITY_PRIORITY[a.reliabilityState] - RELIABILITY_PRIORITY[b.reliabilityState];
    if (priorityDelta !== 0) return priorityDelta;
    return b.failCount - a.failCount;
  });
}

export default async function FlakyTestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const days = parseDays(sp.days);
  const basePath = `/projects/${id}/flaky`;

  let response;
  try {
    response = await getFlakyTests(id, { days, limit: FETCH_LIMIT });
  } catch (err) {
    if (err instanceof ApiError && err.code === 'PROJECT_NOT_FOUND') {
      notFound();
    }
    throw err;
  }

  const sorted = sortItems(response.items);
  const brokenCount = sorted.filter((i) => i.reliabilityState === 'BROKEN').length;
  const flakyCount = sorted.filter((i) => i.reliabilityState === 'FLAKY').length;

  const columns: TableColumn<FlakyTestItem>[] = [
    {
      key: 'fullName',
      header: 'Test',
      render: (test) => <span className="font-mono text-sm text-gray-900">{test.fullName}</span>,
    },
    {
      key: 'reliabilityState',
      header: 'State',
      render: (test) => (
        <Badge variant={reliabilityVariant(test.reliabilityState)}>{test.reliabilityState}</Badge>
      ),
    },
    {
      key: 'passCount',
      header: 'Pass',
      render: (test) => <span className="tabular-nums text-emerald-700">{test.passCount}</span>,
    },
    {
      key: 'failCount',
      header: 'Fail',
      render: (test) => <span className="tabular-nums text-red-700">{test.failCount}</span>,
    },
    {
      key: 'runCount',
      header: 'Runs',
      render: (test) => <span className="tabular-nums text-gray-700">{test.runCount}</span>,
    },
    {
      key: 'lastSeenAt',
      header: 'Last seen',
      render: (test) => <span className="text-gray-700">{formatLastSeen(test.lastSeenAt)}</span>,
    },
  ];

  const limitHit = response.items.length >= FETCH_LIMIT && response.total > response.items.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Flaky Tests</h2>
        <p className="mt-1 text-sm text-gray-600">
          Last {days} day{days === 1 ? '' : 's'}
        </p>
      </div>

      <nav className="flex flex-wrap gap-2">
        {DAY_OPTIONS.map((option) => {
          const active = days === option;
          return (
            <Link
              key={option}
              href={buildHref(basePath, option)}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'rounded-full bg-blue-600 px-3 py-1 text-sm font-medium text-white'
                  : 'rounded-full border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50'
              }
            >
              {option}d
            </Link>
          );
        })}
      </nav>

      {sorted.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <h3 className="text-base font-medium text-gray-900">
              No flaky or broken tests in the last {days} day{days === 1 ? '' : 's'}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              All tests in this window were either stable or skipped.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <p className="text-sm text-gray-700">
            {sorted.length} test{sorted.length === 1 ? '' : 's'} with reliability issues
            <span className="text-gray-500">
              {' '}
              ({flakyCount} FLAKY, {brokenCount} BROKEN)
            </span>
            {limitHit ? (
              <span className="text-gray-500">
                {' '}
                · Showing {sorted.length} of {response.total}
              </span>
            ) : null}
          </p>
          <Table columns={columns} data={sorted} />
        </>
      )}
    </div>
  );
}
