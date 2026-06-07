import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { getFailurePatterns } from '@/lib/api/analytics';
import { Badge, Card, Table, type BadgeVariant, type TableColumn } from '@/components/ui';
import type { FailurePatternItem, FailureSeverity } from '@/lib/api/types';

const DEFAULT_LIMIT = 50;
const SEVERITY_FILTERS: ReadonlyArray<{ label: string; value: FailureSeverity | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Critical', value: 'CRITICAL' },
  { label: 'High', value: 'HIGH' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'Low', value: 'LOW' },
];

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

function parseSeverity(raw: string | undefined): FailureSeverity | undefined {
  if (raw === 'CRITICAL' || raw === 'HIGH' || raw === 'MEDIUM' || raw === 'LOW') return raw;
  return undefined;
}

function parseLimit(raw: string | undefined): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(100, Math.max(1, n));
}

function buildHref(
  basePath: string,
  opts: { severity?: FailureSeverity | undefined; limit?: number },
): string {
  const params = new URLSearchParams();
  if (opts.severity) params.set('severity', opts.severity);
  if (opts.limit && opts.limit !== DEFAULT_LIMIT) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default async function FailurePatternsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ severity?: string; limit?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const severity = parseSeverity(sp.severity);
  const limit = parseLimit(sp.limit);
  const basePath = `/projects/${id}/patterns`;

  let response;
  try {
    response = await getFailurePatterns(id, { limit });
  } catch (err) {
    if (err instanceof ApiError && err.code === 'PROJECT_NOT_FOUND') {
      notFound();
    }
    throw err;
  }

  const allItems = response.items;
  const filteredItems = severity ? allItems.filter((p) => p.severity === severity) : allItems;

  const columns: TableColumn<FailurePatternItem>[] = [
    {
      key: 'pattern',
      header: 'Pattern',
      render: (p) => (
        <span
          title={p.pattern}
          className="block max-w-xl font-mono text-xs leading-relaxed text-gray-900 break-words"
        >
          {p.pattern}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (p) =>
        p.category ? (
          <Badge variant="neutral">{p.category}</Badge>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'severity',
      header: 'Severity',
      render: (p) => <Badge variant={severityVariant(p.severity)}>{p.severity}</Badge>,
    },
    {
      key: 'occurrenceCount',
      header: 'Occurrences',
      render: (p) => <span className="tabular-nums text-gray-800">{p.occurrenceCount}</span>,
    },
    {
      key: 'firstSeenAt',
      header: 'First seen',
      render: (p) => <span className="text-gray-700">{formatDate(p.firstSeenAt)}</span>,
    },
    {
      key: 'lastSeenAt',
      header: 'Last seen',
      render: (p) => <span className="text-gray-700">{formatDate(p.lastSeenAt)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Failure Patterns</h2>
        <p className="mt-1 text-sm text-gray-600">
          Canonical failure messages extracted from FAILED and ERROR test cases.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2">
        {SEVERITY_FILTERS.map((filter) => {
          const active = severity === filter.value;
          return (
            <Link
              key={filter.label}
              href={buildHref(basePath, { severity: filter.value })}
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

      {allItems.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <h3 className="text-base font-medium text-gray-900">
              No failure patterns detected yet
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Patterns are extracted from failing test cases during ingestion. Once a test run
              records a failure message, the canonical pattern shows up here with a heuristic
              severity assignment.
            </p>
          </div>
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <h3 className="text-base font-medium text-gray-900">
              No patterns match this severity filter
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Try clearing the filter to see all {allItems.length} pattern
              {allItems.length === 1 ? '' : 's'}.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <p className="text-sm text-gray-700">
            {severity
              ? `${filteredItems.length} ${severity} pattern${filteredItems.length === 1 ? '' : 's'} (of ${allItems.length} shown)`
              : `${filteredItems.length} pattern${filteredItems.length === 1 ? '' : 's'} shown`}
          </p>
          <Table columns={columns} data={filteredItems} />
        </>
      )}
    </div>
  );
}
