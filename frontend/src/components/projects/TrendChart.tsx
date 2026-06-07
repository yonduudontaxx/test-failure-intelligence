'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FailureTrendItem } from '@/lib/api/types';

interface ChartPoint {
  date: string;
  totalRuns: number;
  failedRuns: number;
  passRatePercent: number;
}

function toChartData(items: FailureTrendItem[]): ChartPoint[] {
  return items.map((item) => ({
    date: item.date,
    totalRuns: item.totalRuns,
    failedRuns: item.failedRuns,
    passRatePercent: Math.round(item.passRate * 1000) / 10,
  }));
}

interface TooltipPayload {
  payload: ChartPoint;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3 text-xs shadow-md">
      <p className="font-semibold text-gray-900">{label}</p>
      <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
        <dt className="text-gray-500">Total runs</dt>
        <dd className="tabular-nums text-gray-900">{point.totalRuns}</dd>
        <dt className="text-gray-500">Failed</dt>
        <dd className="tabular-nums text-red-700">{point.failedRuns}</dd>
        <dt className="text-gray-500">Pass rate</dt>
        <dd className="tabular-nums text-emerald-700">{point.passRatePercent}%</dd>
      </dl>
    </div>
  );
}

export function TrendChart({ items }: { items: FailureTrendItem[] }) {
  const data = toChartData(items);

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="date" stroke="#6b7280" fontSize={11} tickMargin={6} minTickGap={20} />
          <YAxis
            yAxisId="runs"
            stroke="#6b7280"
            fontSize={11}
            allowDecimals={false}
            tickMargin={4}
          />
          <YAxis
            yAxisId="rate"
            orientation="right"
            stroke="#6b7280"
            fontSize={11}
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tickMargin={4}
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            yAxisId="runs"
            dataKey="totalRuns"
            name="Total runs"
            fill="#bfdbfe"
            radius={[2, 2, 0, 0]}
          />
          <Line
            yAxisId="rate"
            type="monotone"
            dataKey="passRatePercent"
            name="Pass rate"
            stroke="#059669"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
