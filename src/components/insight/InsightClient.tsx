'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_BRAND } from '@/lib/config';
import { AIText } from '@/components/monitor/aiText';
import { MiniKpis, MiniBars, CreatorList } from './MiniViz';

interface Report {
  summary: string; advice: string; content: string; platform: string; kol: string; igRate: string;
  dateStart?: string; dateEnd?: string; generatedAt?: string;
}
interface Grp { group: string; postCount: number; totalEngagement: number; avgEngagement: number }
interface Stats {
  byPlatform?: { groups: Grp[] };
  byMedia?: { groups: Grp[] };
  creators?: { creators: { username: string; posts: number; totalEngagement: number }[] };
  igTier?: { tiers: { tier: string; avgEngagementRate: number }[] };
}

const SECTIONS: { key: keyof Report; num: string; title: string }[] = [
  { key: 'summary', num: '01', title: '核心執行摘要' },
  { key: 'advice', num: '02', title: '行動建議與策略' },
  { key: 'content', num: '03', title: '內容表現洞察' },
  { key: 'platform', num: '04', title: '平台效能對比' },
  { key: 'kol', num: '05', title: '創作者表現亮點' },
  { key: 'igRate', num: '06', title: 'IG 互動率分層' },
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
    const items = (stats.creators?.creators ?? []).slice(0, 5);
    return items.length ? { title: 'Top 創作者', node: <CreatorList items={items} /> } : null;
  }
  if (key === 'igRate') {
    const items = (stats.igTier?.tiers ?? []).map((t) => ({ label: t.tier, value: t.avgEngagementRate }));
    return items.length ? { title: '各層平均互動率', node: <MiniBars items={items} pct /> } : null;
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
      {loading && <div className="text-on-surface-variant/50 text-sm">載入中…</div>}
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
        </div>
      )}
    </div>
  );
}
