import type { PlatformKpis, Platform } from '@/lib/domain/types';

const META: Record<Platform, { label: string; bar: string }> = {
  ig: { label: 'Instagram', bar: 'bg-instagram' },
  threads: { label: 'Threads', bar: 'bg-threads' },
  fb: { label: 'Facebook', bar: 'bg-facebook' },
};
const ORDER: Platform[] = ['ig', 'threads', 'fb'];

export function OverviewSummary({ kpis }: { kpis: PlatformKpis[] }) {
  const totalPosts = kpis.reduce((s, k) => s + k.postCount, 0);
  const totalEng = kpis.reduce((s, k) => s + k.totalEngagement, 0);
  const avg = totalPosts ? Math.round(totalEng / totalPosts) : 0;
  const ordered = ORDER.map((p) => kpis.find((k) => k.platform === p)).filter(Boolean) as PlatformKpis[];

  const totals = [
    { label: '總貼文數', value: totalPosts.toLocaleString() },
    { label: '總互動量', value: totalEng.toLocaleString() },
    { label: '整體均篇互動', value: avg.toLocaleString() },
    { label: '平台數', value: String(ordered.length) },
  ];

  return (
    <section className="bg-surface border border-outline-variant rounded-2xl card-shadow p-6">
      <h2 className="text-[11px] font-bold text-on-surface-variant/60 uppercase tracking-[0.18em] mb-5">
        全部渠道總覽
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-6">
        {totals.map((t) => (
          <div key={t.label}>
            <div className="text-3xl font-bold tabular-nums text-on-surface">{t.value}</div>
            <p className="text-[11px] text-on-surface-variant/60 mt-1">{t.label}</p>
          </div>
        ))}
      </div>

      {/* 各平台互動佔比 */}
      <div className="space-y-3">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-container">
          {ordered.map((k) => {
            const share = totalEng ? k.totalEngagement / totalEng : 0;
            return (
              <div
                key={k.platform}
                className={META[k.platform].bar}
                style={{ width: `${share * 100}%` }}
                title={`${META[k.platform].label} ${(share * 100).toFixed(1)}%`}
              />
            );
          })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {ordered.map((k) => {
            const eShare = totalEng ? (k.totalEngagement / totalEng) * 100 : 0;
            const pShare = totalPosts ? (k.postCount / totalPosts) * 100 : 0;
            return (
              <div key={k.platform} className="flex items-center justify-between border border-outline-variant rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${META[k.platform].bar}`} />
                  <span className="text-xs font-semibold text-on-surface truncate">{META[k.platform].label}</span>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-bold tabular-nums text-on-surface">互動 {eShare.toFixed(1)}%</div>
                  <div className="text-[10px] text-on-surface-variant/60 tabular-nums">
                    {k.postCount} 帖（{pShare.toFixed(0)}%）· {k.totalEngagement.toLocaleString()} 互動
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
