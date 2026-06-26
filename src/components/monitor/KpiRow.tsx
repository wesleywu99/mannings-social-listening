import type { PlatformKpis } from '@/lib/domain/types';
import { Delta } from './Delta';

export function KpiRow({ kpi, prev }: { kpi: PlatformKpis; prev?: PlatformKpis }) {
  const cards = [
    { label: 'Posts', cur: kpi.postCount, prev: prev?.postCount, value: kpi.postCount.toLocaleString() },
    { label: 'Engagement', cur: kpi.totalEngagement, prev: prev?.totalEngagement, value: kpi.totalEngagement.toLocaleString() },
    { label: 'Avg / post', cur: kpi.avgEngagement, prev: prev?.avgEngagement, value: kpi.avgEngagement.toLocaleString() },
    {
      label: 'Outlier rate',
      cur: kpi.anomalyRate * 100,
      prev: prev ? prev.anomalyRate * 100 : undefined,
      value: `${(kpi.anomalyRate * 100).toFixed(1)}%`,
    },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-surface p-4 sm:p-5 rounded-2xl border border-outline-variant card-shadow">
          <span className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest">{c.label}</span>
          <div className="flex items-baseline gap-2 mt-1.5">
            <span className="text-2xl sm:text-3xl font-semibold tabular-nums text-on-surface leading-none">{c.value}</span>
            <Delta current={c.cur} previous={c.prev} />
          </div>
        </div>
      ))}
    </div>
  );
}
