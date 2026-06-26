'use client';
import { useState } from 'react';
import type { PlatformKpis, Platform } from '@/lib/domain/types';
import { type TrendPoint, detectBreakouts, type BreakoutFlag } from '@/lib/domain/aggregate';
import type { Scope } from '@/lib/ai/types';
import { Delta } from './Delta';
import { DayDetailModal } from './DayDetailModal';

const META: Record<Platform, { label: string; dot: string }> = {
  ig: { label: 'Instagram', dot: 'bg-instagram' },
  threads: { label: 'Threads', dot: 'bg-threads' },
  fb: { label: 'Facebook', dot: 'bg-facebook' },
};
const ORDER: Platform[] = ['ig', 'threads', 'fb'];

/** 雙軸趨勢圖：互動量折線 + 貼文數淡色長條；破圈日加標記、可點 */
function TrendChart({
  days, eng, posts, flags, onSelect,
}: {
  days: string[]; eng: number[]; posts: number[];
  flags: BreakoutFlag[]; onSelect: (i: number) => void;
}) {
  const W = 720, H = 210, padL = 10, padR = 10, padT = 14, padB = 24;
  const n = days.length;
  const maxE = Math.max(1, ...eng), maxP = Math.max(1, ...posts);
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const band = n ? plotW / n : plotW, bw = band * 0.5;
  const cx = (i: number) => padL + band * (i + 0.5);
  const yE = (v: number) => padT + plotH - (v / maxE) * plotH;
  const yP = (v: number) => padT + plotH - (v / maxP) * plotH;
  const step = Math.max(1, Math.ceil(n / 7));
  const line = eng.map((v, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${yE(v).toFixed(1)}`).join(' ');
  const isBreak = (f: BreakoutFlag) => f.eff || f.peak;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: H }} role="img" aria-label="Engagement and posts over time">
      {[0, 1, 2, 3].map((g) => { const y = padT + (plotH / 3) * g; return <line key={g} x1={padL} y1={y} x2={W - padR} y2={y} stroke="#f0f0f0" strokeWidth={1} />; })}
      {posts.map((p, i) => { const y = yP(p); return <rect key={i} x={(cx(i) - bw / 2).toFixed(1)} y={y.toFixed(1)} width={bw.toFixed(1)} height={(padT + plotH - y).toFixed(1)} rx={2} fill={isBreak(flags[i]) ? '#9a9a9a' : '#e6e6e6'} />; })}
      {n > 0 && <path d={line} fill="none" stroke="#171717" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
      {flags.map((f, i) => isBreak(f) ? (
        <g key={i} pointerEvents="none">
          <circle cx={cx(i).toFixed(1)} cy={yE(eng[i]).toFixed(1)} r={4} fill="#171717" />
          {f.eff && <circle cx={cx(i).toFixed(1)} cy={yE(eng[i]).toFixed(1)} r={7.5} fill="none" stroke="#ef4444" strokeWidth={1.5} />}
        </g>
      ) : null)}
      {days.map((d, i) => i % step === 0 || i === n - 1 ? (
        <text key={i} x={cx(i).toFixed(1)} y={H - 7} fontSize={10} fill="#a1a1a1" fontFamily="var(--font-mono)" textAnchor="middle" pointerEvents="none">{d.slice(5)}</text>
      ) : null)}
      {/* 透明點擊熱區 */}
      {days.map((_, i) => (
        <rect key={`hit-${i}`} x={(cx(i) - band / 2).toFixed(1)} y={padT} width={band.toFixed(1)} height={plotH} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => onSelect(i)}>
          <title>{days[i]}</title>
        </rect>
      ))}
    </svg>
  );
}

export function OverviewSummary({
  kpis, prevKpis, trends, scope,
}: {
  kpis: PlatformKpis[];
  prevKpis?: PlatformKpis[];
  trends: Record<Platform, TrendPoint[]>;
  scope: Scope;
}) {
  const [sel, setSel] = useState<number | null>(null);

  const totalPosts = kpis.reduce((s, k) => s + k.postCount, 0);
  const totalEng = kpis.reduce((s, k) => s + k.totalEngagement, 0);
  const avg = totalPosts ? Math.round(totalEng / totalPosts) : 0;
  const ordered = ORDER.map((p) => kpis.find((k) => k.platform === p)).filter(Boolean) as PlatformKpis[];
  const leader = ordered.length ? ordered.reduce((a, b) => (b.totalEngagement > a.totalEngagement ? b : a)).platform : null;

  const prev = prevKpis ?? [];
  const prevTotalPosts = prev.reduce((s, k) => s + k.postCount, 0);
  const prevTotalEng = prev.reduce((s, k) => s + k.totalEngagement, 0);
  const prevAvg = prevTotalPosts ? Math.round(prevTotalEng / prevTotalPosts) : 0;
  const prevOf = (p: Platform) => prev.find((k) => k.platform === p);

  const ref = trends[ORDER[0]] ?? [];
  const days = ref.map((p) => p.date);
  const engSeries = ref.map((_, i) => ORDER.reduce((s, p) => s + (trends[p]?.[i]?.engagement ?? 0), 0));
  const postSeries = ref.map((_, i) => ORDER.reduce((s, p) => s + (trends[p]?.[i]?.posts ?? 0), 0));
  const flags = detectBreakouts(engSeries, postSeries);
  const breakCount = flags.filter((f) => f.eff || f.peak).length;

  // 桶粒度：相鄰兩桶間隔 >1.5 天視為「週桶」→ 鑽取時抓整週而非單日
  const weekly = days.length >= 2 && (Date.parse(`${days[1]}T00:00:00`) - Date.parse(`${days[0]}T00:00:00`)) > 86400000 * 1.5;
  const addDays = (s: string, n: number) => {
    const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const tiles = [
    { label: 'Total posts', value: totalPosts.toLocaleString(), cur: totalPosts, prev: prevTotalPosts },
    { label: 'Total engagement', value: totalEng.toLocaleString(), cur: totalEng, prev: prevTotalEng },
    { label: 'Avg / post', value: avg.toLocaleString(), cur: avg, prev: prevAvg },
  ];

  return (
    <section className="space-y-4">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-normal text-on-surface-variant/60">Cross-channel</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {tiles.map((t) => (
          <div key={t.label} className="bg-surface p-4 sm:p-5 rounded-2xl border border-outline-variant card-shadow">
            <span className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest">{t.label}</span>
            <div className="text-2xl sm:text-3xl font-semibold tabular-nums text-on-surface mt-1.5">{t.value}</div>
            <div className="mt-1.5">{prevKpis && <Delta current={t.cur} previous={t.prev} />}</div>
          </div>
        ))}
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant card-shadow p-4 sm:p-5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-on-surface">Engagement &amp; posts over time</span>
          <span className="flex items-center gap-4 text-[11px] text-on-surface-variant/70">
            <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 border-t-2 border-on-surface" />Engagement</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#e2e2e2]" />Posts</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full ring-1 ring-sentiment-neg" />Breakout</span>
          </span>
        </div>
        <TrendChart days={days} eng={engSeries} posts={postSeries} flags={flags} onSelect={setSel} />
        <div className="text-xs text-on-surface-variant/60 mt-1">
          {breakCount > 0 ? <>偵測到 <b className="text-on-surface">{breakCount}</b> 個破圈日 · 點任一日看明細與 AI 解讀</> : '點任一日看明細與 AI 解讀'}
        </div>
      </div>

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
                  <td className={`px-4 py-3.5 text-sm tabular-nums ${isLeader ? 'font-semibold text-on-surface' : 'text-on-surface-variant'}`}>{k.totalEngagement.toLocaleString()}</td>
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

      {sel != null && days[sel] && (
        <DayDetailModal
          rangeStart={days[sel]}
          rangeEnd={weekly ? addDays(days[sel], 6) : days[sel]}
          weekly={weekly}
          scope={scope}
          breakout={flags[sel] ?? null}
          periodAvgEpp={avg}
          onClose={() => setSel(null)}
        />
      )}
    </section>
  );
}
