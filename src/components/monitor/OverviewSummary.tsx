import type { PlatformKpis, Platform } from '@/lib/domain/types';
import type { TrendPoint } from '@/lib/domain/aggregate';
import { Delta } from './Delta';

const META: Record<Platform, { label: string; dot: string }> = {
  ig: { label: 'Instagram', dot: 'bg-instagram' },
  threads: { label: 'Threads', dot: 'bg-threads' },
  fb: { label: 'Facebook', dot: 'bg-facebook' },
};
const ORDER: Platform[] = ['ig', 'threads', 'fb'];

/** 雙軸趨勢圖：互動量折線（左軸）+ 貼文數淡色長條（右軸），X 軸日期 */
function TrendChart({ days, eng, posts }: { days: string[]; eng: number[]; posts: number[] }) {
  const W = 720, H = 200, padL = 10, padR = 10, padT = 12, padB = 24;
  const n = days.length;
  const maxE = Math.max(1, ...eng);
  const maxP = Math.max(1, ...posts);
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const band = n ? plotW / n : plotW;
  const bw = band * 0.46;
  const cx = (i: number) => padL + band * (i + 0.5);
  const yE = (v: number) => padT + plotH - (v / maxE) * plotH;
  const yP = (v: number) => padT + plotH - (v / maxP) * plotH;
  const step = Math.max(1, Math.ceil(n / 7));
  const linePath = eng.map((v, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${yE(v).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: H }} role="img" aria-label="Engagement and posts over time">
      {[0, 1, 2, 3].map((g) => {
        const y = padT + (plotH / 3) * g;
        return <line key={g} x1={padL} y1={y} x2={W - padR} y2={y} stroke="#f0f0f0" strokeWidth={1} />;
      })}
      {posts.map((p, i) => {
        const y = yP(p);
        return <rect key={i} x={(cx(i) - bw / 2).toFixed(1)} y={y.toFixed(1)} width={bw.toFixed(1)} height={(padT + plotH - y).toFixed(1)} rx={2} fill="#e2e2e2" />;
      })}
      {n > 0 && (
        <path d={linePath} fill="none" stroke="#171717" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      )}
      {n > 0 && <circle cx={cx(n - 1).toFixed(1)} cy={yE(eng[n - 1]).toFixed(1)} r={3.5} fill="#171717" />}
      {days.map((d, i) =>
        i % step === 0 || i === n - 1 ? (
          <text key={i} x={cx(i).toFixed(1)} y={H - 7} fontSize={10} fill="#a1a1a1" fontFamily="var(--font-mono)" textAnchor="middle">
            {d.slice(5)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export function OverviewSummary({
  kpis,
  prevKpis,
  trends,
}: {
  kpis: PlatformKpis[];
  prevKpis?: PlatformKpis[];
  trends: Record<Platform, TrendPoint[]>;
}) {
  const totalPosts = kpis.reduce((s, k) => s + k.postCount, 0);
  const totalEng = kpis.reduce((s, k) => s + k.totalEngagement, 0);
  const avg = totalPosts ? Math.round(totalEng / totalPosts) : 0;
  const ordered = ORDER.map((p) => kpis.find((k) => k.platform === p)).filter(Boolean) as PlatformKpis[];
  const leader = ordered.length
    ? ordered.reduce((a, b) => (b.totalEngagement > a.totalEngagement ? b : a)).platform
    : null;

  const prev = prevKpis ?? [];
  const prevTotalPosts = prev.reduce((s, k) => s + k.postCount, 0);
  const prevTotalEng = prev.reduce((s, k) => s + k.totalEngagement, 0);
  const prevAvg = prevTotalPosts ? Math.round(prevTotalEng / prevTotalPosts) : 0;
  const prevOf = (p: Platform) => prev.find((k) => k.platform === p);

  // 跨平台逐桶聚合（computeTrends 對三平台輸出等長對齊序列）
  const ref = trends[ORDER[0]] ?? [];
  const days = ref.map((p) => p.date);
  const engSeries = ref.map((_, i) => ORDER.reduce((s, p) => s + (trends[p]?.[i]?.engagement ?? 0), 0));
  const postSeries = ref.map((_, i) => ORDER.reduce((s, p) => s + (trends[p]?.[i]?.posts ?? 0), 0));

  const tiles = [
    { label: 'Total posts', value: totalPosts.toLocaleString(), cur: totalPosts, prev: prevTotalPosts },
    { label: 'Total engagement', value: totalEng.toLocaleString(), cur: totalEng, prev: prevTotalEng },
    { label: 'Avg / post', value: avg.toLocaleString(), cur: avg, prev: prevAvg },
  ];

  return (
    <section className="space-y-4">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-normal text-on-surface-variant/60">
        Cross-channel
      </h2>

      {/* 總量 + 期間對比 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {tiles.map((t) => (
          <div key={t.label} className="bg-surface p-4 sm:p-5 rounded-2xl border border-outline-variant card-shadow">
            <span className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest">{t.label}</span>
            <div className="text-2xl sm:text-3xl font-semibold tabular-nums text-on-surface mt-1.5">{t.value}</div>
            <div className="mt-1.5">{prevKpis && <Delta current={t.cur} previous={t.prev} />}</div>
          </div>
        ))}
      </div>

      {/* 全寬雙軸趨勢圖 */}
      <div className="bg-surface rounded-2xl border border-outline-variant card-shadow p-4 sm:p-5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-on-surface">Engagement &amp; posts over time</span>
          <span className="flex items-center gap-4 text-[11px] text-on-surface-variant/70">
            <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 border-t-2 border-on-surface" />Engagement</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#e2e2e2]" />Posts</span>
          </span>
        </div>
        <TrendChart days={days} eng={engSeries} posts={postSeries} />
      </div>

      {/* 平台對比表 */}
      <div className="bg-surface rounded-2xl border border-outline-variant card-shadow overflow-x-auto">
        <table className="w-full text-right">
          <thead>
            <tr className="font-mono text-[10px] font-medium uppercase tracking-normal text-on-surface-variant/50">
              <th className="text-left font-medium px-5 py-3 border-b border-outline-variant">Platform</th>
              <th className="font-medium px-4 py-3 border-b border-outline-variant">Posts</th>
              <th className="font-medium px-4 py-3 border-b border-outline-variant">Engagement</th>
              <th className="font-medium px-4 py-3 border-b border-outline-variant">Avg</th>
              <th className="font-medium px-4 py-3 border-b border-outline-variant">Share</th>
              <th className="font-medium px-5 py-3 border-b border-outline-variant">Δ vs last</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((k) => {
              const isLeader = k.platform === leader;
              const share = totalEng ? (k.totalEngagement / totalEng) * 100 : 0;
              return (
                <tr key={k.platform} className="border-b last:border-b-0 border-outline-variant/40">
                  <td className="text-left px-5 py-3.5">
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${META[k.platform].dot}`} />
                      <span className="text-sm font-medium text-on-surface">{META[k.platform].label}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs tabular-nums text-on-surface-variant">{k.postCount.toLocaleString()}</td>
                  <td className={`px-4 py-3.5 text-sm tabular-nums ${isLeader ? 'font-semibold text-on-surface' : 'text-on-surface-variant'}`}>
                    {k.totalEngagement.toLocaleString()}
                  </td>
                  <td className="px-4 py-3.5 text-xs tabular-nums text-on-surface-variant">{k.avgEngagement.toLocaleString()}</td>
                  <td className="px-4 py-3.5 text-xs tabular-nums text-on-surface-variant">{share.toFixed(0)}%</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex justify-end w-full">
                      {prevKpis ? <Delta current={k.totalEngagement} previous={prevOf(k.platform)?.totalEngagement} /> : <span className="text-on-surface-variant/40">—</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
