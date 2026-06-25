import type { PlatformKpis } from '@/lib/domain/types';

export function KpiRow({ kpi }: { kpi: PlatformKpis }) {
  const cards = [
    { label: '貼文數', value: kpi.postCount.toLocaleString() },
    { label: '總互動量', value: kpi.totalEngagement.toLocaleString() },
    { label: '均篇互動', value: kpi.avgEngagement.toLocaleString() },
    { label: '爆款貼文率', value: `${(kpi.anomalyRate * 100).toFixed(1)}%` },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {cards.map((c) => (
        <div key={c.label} className="bg-surface p-6 rounded-2xl border border-outline-variant/20 card-shadow">
          <span className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest">{c.label}</span>
          <div className="text-3xl font-black text-on-surface mt-1">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
