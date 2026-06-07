import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { getFailureTrends } from '@/lib/api/analytics';
import { Card } from '@/components/ui';
import { TrendChart } from '@/components/projects/TrendChart';

const DAY_OPTIONS = [7, 14, 30, 60, 90] as const;
const DEFAULT_DAYS = 30;
type BucketSize = 'day' | 'week';
const DEFAULT_BUCKET: BucketSize = 'day';

function parseDays(raw: string | undefined): number {
  if (!raw) return DEFAULT_DAYS;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_DAYS;
  return Math.min(90, Math.max(1, n));
}

function parseBucket(raw: string | undefined): BucketSize {
  return raw === 'week' ? 'week' : 'day';
}

function buildHref(basePath: string, opts: { days?: number; bucketSize?: BucketSize }): string {
  const params = new URLSearchParams();
  if (opts.days && opts.days !== DEFAULT_DAYS) params.set('days', String(opts.days));
  if (opts.bucketSize && opts.bucketSize !== DEFAULT_BUCKET) {
    params.set('bucketSize', opts.bucketSize);
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export default async function TrendsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string; bucketSize?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const days = parseDays(sp.days);
  const bucketSize = parseBucket(sp.bucketSize);
  const basePath = `/projects/${id}/trends`;

  let response;
  try {
    response = await getFailureTrends(id, { days, bucketSize });
  } catch (err) {
    if (err instanceof ApiError && err.code === 'PROJECT_NOT_FOUND') {
      notFound();
    }
    throw err;
  }

  const items = response.items;
  const totalRunsInWindow = items.reduce((sum, b) => sum + b.totalRuns, 0);
  const totalFailedInWindow = items.reduce((sum, b) => sum + b.failedRuns, 0);
  const avgPassRate =
    totalRunsInWindow === 0 ? 1 : (totalRunsInWindow - totalFailedInWindow) / totalRunsInWindow;
  const avgPassRatePct = (avgPassRate * 100).toFixed(1);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Failure Trends</h2>
        <p className="mt-1 text-sm text-gray-600">
          Pass rate and run volume over the last {days} day{days === 1 ? '' : 's'} (
          {bucketSize === 'day' ? 'daily' : 'weekly'} buckets)
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <nav className="flex flex-wrap gap-2">
          {DAY_OPTIONS.map((option) => {
            const active = days === option;
            return (
              <Link
                key={option}
                href={buildHref(basePath, { days: option, bucketSize })}
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

        <div className="flex overflow-hidden rounded-md border border-gray-300 bg-white">
          {(['day', 'week'] as const).map((size) => {
            const active = bucketSize === size;
            return (
              <Link
                key={size}
                href={buildHref(basePath, { days, bucketSize: size })}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'bg-blue-600 px-3 py-1 text-sm font-medium text-white'
                    : 'px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50'
                }
              >
                {size === 'day' ? 'Day' : 'Week'}
              </Link>
            );
          })}
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <h3 className="text-base font-medium text-gray-900">
              No runs in the last {days} day{days === 1 ? '' : 's'}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Ingest a few test runs to start tracking trends.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Buckets</p>
              <p className="mt-1 text-2xl font-semibold">{items.length}</p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Total runs
              </p>
              <p className="mt-1 text-2xl font-semibold">{totalRunsInWindow}</p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Failed runs
              </p>
              <p className="mt-1 text-2xl font-semibold text-red-700">{totalFailedInWindow}</p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Avg pass rate
              </p>
              <p className="mt-1 text-2xl font-semibold text-emerald-700">{avgPassRatePct}%</p>
            </Card>
          </div>

          <Card>
            <TrendChart items={items} />
          </Card>
        </>
      )}
    </div>
  );
}
