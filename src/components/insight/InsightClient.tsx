'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_BRAND } from '@/lib/config';
import { AIText } from '@/components/monitor/aiText';
import { MiniKpis, MiniBars, CreatorList } from './MiniViz';
import { Heatmap } from './Heatmap';

interface Report {
  summary: string; advice: string; content: string; platform: string; kol: string;
  sentiment: string; topics: string;
  dateStart?: string; dateEnd?: string; generatedAt?: string;
}
interface Grp { group: string; postCount: number; totalEngagement: number; avgEngagement: number }
interface Creator { username: string; posts: number; totalEngagement: number; avgEngagement: number; avgFollowers: number }
interface Topic { name: string; description: string; postCount: number; totalEngagement: number; avgEngagement: number; posCount: number; negCount: number; neuCount: number }
interface Stats {
  byPlatform?: { groups: Grp[] };
  byMedia?: { groups: Grp[] };
  creators?: { top: Creator[]; darkHorses: Creator[] };
  heatmap?: { matrix: number[][]; max: number; best: { weekday: number; hour: number; avg: number } | null };
  sentiment?: { summary: { posPct: number; neuPct: number; negPct: number; pos: number; neu: number; neg: number }; spikes: { date: string; level: string }[] };
  topics?: Topic[];
}

const SECTIONS: { key: keyof Report; num: string; title: string }[] = [
  { key: 'summary', num: '01', title: '核心執行摘要' },
  { key: 'advice', num: '02', title: '行動建議與策略' },
  { key: 'content', num: '03', title: '內容表現洞察' },
  { key: 'platform', num: '04', title: '平台效能對比' },
  { key: 'kol', num: '05', title: '創作者表現亮點' },
  { key: 'sentiment', num: '06', title: '情感輿情' },
  { key: 'topics', num: '07', title: '話題分析' },
];
const PNAME: Record<string, string> = { ig: 'Instagram', threads: 'Threads', fb: 'Facebook' };

function leftFor(key: keyof Report, stats: Stats | null): { title: string; node: ReactNode } | null {
  if (!stats) return null;
  const plat = stats.byPlatform?.groups ?? [];
  if (key === 'summary') {
    const totalPosts = plat.reduce((s, g) => s + g.postCount, 0);
    const totalEng = plat.reduce((s, g) => s + g.totalEngagement, 0);
    const avg = totalPosts ? Math.round(totalEng / totalPosts) : 0;
    const best = [...plat].sort((a, b) => b.avgEngagement - a.avgEngagement)[0];
    return { title: '數據快覽', node: <MiniKpis items={[
      { label: '總帖子數', value: totalPosts.toLocaleString() },
      { label: '總互動量', value: totalEng.toLocaleString() },
      { label: '均互動', value: avg.toLocaleString() },
      { label: '最高均值平台', value: best ? (PNAME[best.group] ?? best.group) : '—' },
    ]} /> };
  }
  if (key === 'content') {
    const items = [...(stats.byMedia?.groups ?? [])].sort((a, b) => b.avgEngagement - a.avgEngagement).slice(0, 5)
      .map((g) => ({ label: g.group, value: g.avgEngagement }));
    return items.length ? { title: '內容格式互動均值', node: <MiniBars items={items} /> } : null;
  }
  if (key === 'platform') {
    const items = plat.map((g) => ({ label: PNAME[g.group] ?? g.group, value: g.totalEngagement }));
    return items.length ? { title: '平台互動量', node: <MiniBars items={items} /> } : null;
  }
  if (key === 'kol') {
    const items = (stats.creators?.top ?? []).slice(0, 5);
    return items.length ? { title: 'Top 創作者', node: <CreatorList items={items} /> } : null;
  }
  if (key === 'sentiment') {
    const s = stats.sentiment?.summary;
    if (!s) return null;
    const items = [
      { label: '正面', value: s.posPct },
      { label: '中性', value: s.neuPct },
      { label: '負面', value: s.negPct },
    ];
    const spikes = stats.sentiment?.spikes ?? [];
    return {
      title: '情感占比',
      node: (
        <div className="space-y-3">
          <MiniBars items={items} pct />
          {spikes.length > 0 && (
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-mute mb-1.5">負面突增</p>
              <div className="space-y-1">
                {spikes.slice(0, 5).map((sp) => (
                  <div key={sp.date} className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                    <span className={`w-1.5 h-1.5 rounded-full ${sp.level === 'red' ? 'bg-sentiment-neg' : sp.level === 'orange' ? 'bg-[#f5a623]' : 'bg-[#facc15]'}`} />
                    {sp.date}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ),
    };
  }
  if (key === 'topics') {
    const topics = stats.topics ?? [];
    if (!topics.length) return null;
    const items = topics.slice(0, 8).map((t) => ({ label: t.name, value: t.avgEngagement }));
    const totalPosts = topics.reduce((s, t) => s + t.postCount, 0);
    return {
      title: '話題互動排名',
      node: (
        <div className="space-y-3">
          <MiniBars items={items} />
          <div className="pt-1.5 border-t border-outline-variant/40">
            <p className="text-[10px] text-on-surface-variant/50 tabular-nums">
              共 {topics.length} 個話題 · {totalPosts} 條帖子
            </p>
          </div>
        </div>
      ),
    };
  }
  return null;
}

export function InsightClient() {
  const [report, setReport] = useState<Report | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/report?brand=${encodeURIComponent(DEFAULT_BRAND)}`)
      .then((r) => r.json())
      .then((d) => setReport(d && !d.error ? d : null))
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, []);

  // 報告期間決定後，抓對應的聚合數據給各模塊左側圖表
  useEffect(() => {
    if (!report?.dateStart || !report?.dateEnd) { setStats(null); return; }
    const qs = new URLSearchParams({ brand: DEFAULT_BRAND, start: report.dateStart, end: report.dateEnd });
    fetch(`/api/data/report-stats?${qs}`)
      .then((r) => r.json())
      .then((d) => setStats(d && !d.error ? d : null))
      .catch(() => setStats(null));
  }, [report?.dateStart, report?.dateEnd]);

  const regenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: { brand: DEFAULT_BRAND } }),
      });
      const d = await res.json();
      if (d.error) setError(d.error); else setReport(d);
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-xs text-on-surface-variant/60">
          {report?.generatedAt
            ? `報告期間 ${report.dateStart} ~ ${report.dateEnd} · 生成於 ${new Date(report.generatedAt).toLocaleString()}`
            : '尚未生成報告'}
        </p>
        <button
          onClick={regenerate}
          disabled={generating}
          className="inline-flex items-center h-9 px-4 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:bg-ai-hover transition-colors disabled:opacity-50"
        >
          {generating ? '生成中…（約 20–40 秒）' : report ? '重新生成報告' : '生成報告'}
        </button>
      </div>

      {error && <div className="bg-sentiment-neg/10 text-sentiment-neg text-sm rounded-xl px-4 py-3">生成失敗：{error}</div>}
      {loading && (
        <div className="space-y-5">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <section key={i} className="bg-surface rounded-2xl border border-outline-variant card-shadow overflow-hidden">
              <div className="px-7 py-4 flex items-center gap-3 border-b border-outline-variant/60">
                <span className="inline-block h-3 w-6 rounded bg-surface-container animate-pulse" />
                <span className="inline-block h-4 w-32 rounded bg-surface-container animate-pulse" />
              </div>
              <div className="px-7 py-6 space-y-2">
                <span className="block h-3 w-full rounded bg-surface-container animate-pulse" />
                <span className="block h-3 w-11/12 rounded bg-surface-container animate-pulse" />
                <span className="block h-3 w-4/5 rounded bg-surface-container animate-pulse" />
              </div>
            </section>
          ))}
        </div>
      )}
      {!loading && !report && !generating && (
        <div className="text-center py-20 text-on-surface-variant/50"><p className="text-sm">尚未有報告，點右上角「生成報告」開始。</p></div>
      )}

      {report && (
        <div className="space-y-5">
          {SECTIONS.map((s) => {
            const left = leftFor(s.key, stats);
            const body = <div className="text-sm leading-relaxed text-on-surface"><AIText text={(report[s.key] as string) || '—'} /></div>;
            return (
              <section key={s.key} className="bg-surface rounded-2xl border border-outline-variant card-shadow overflow-hidden">
                <div className="px-7 py-4 flex items-center gap-3 border-b border-outline-variant/60">
                  <span className="font-mono text-xs font-semibold text-on-surface-variant/40 tracking-widest">{s.num}</span>
                  <h2 className="text-base font-semibold text-on-surface">{s.title}</h2>
                </div>
                {left ? (
                  <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr]">
                    <div className="px-7 py-6 lg:border-r border-b lg:border-b-0 border-outline-variant/60">
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-mute mb-3">{left.title}</p>
                      {left.node}
                    </div>
                    <div className="px-7 py-6">{body}</div>
                  </div>
                ) : (
                  <div className="px-7 py-6">{body}</div>
                )}
              </section>
            );
          })}

          {/* 08 發文時段熱度（純數據模塊，全寬）*/}
          {stats?.heatmap && stats.heatmap.max > 0 && (
            <section className="bg-surface rounded-2xl border border-outline-variant card-shadow overflow-hidden">
              <div className="px-7 py-4 flex items-center gap-3 border-b border-outline-variant/60">
                <span className="font-mono text-xs font-semibold text-on-surface-variant/40 tracking-widest">08</span>
                <h2 className="text-base font-semibold text-on-surface">發文時段熱度</h2>
                <span className="text-[11px] text-on-surface-variant/50 ml-1">三平台合計，每格 = 該時段平均互動量</span>
              </div>
              <div className="px-7 py-6">
                <Heatmap matrix={stats.heatmap.matrix} max={stats.heatmap.max} best={stats.heatmap.best} />
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
