'use client';
import { useEffect, useState } from 'react';
import { DEFAULT_BRAND } from '@/lib/config';
import { AIText } from '@/components/monitor/aiText';

interface Report {
  summary: string; advice: string; content: string; platform: string; kol: string; igRate: string;
  dateStart?: string; dateEnd?: string; generatedAt?: string;
}

const SECTIONS: { key: keyof Report; num: string; title: string }[] = [
  { key: 'summary', num: '01', title: '核心執行摘要' },
  { key: 'advice', num: '02', title: '行動建議與策略' },
  { key: 'content', num: '03', title: '內容表現洞察' },
  { key: 'platform', num: '04', title: '平台效能對比' },
  { key: 'kol', num: '05', title: '創作者表現亮點' },
  { key: 'igRate', num: '06', title: 'IG 互動率分層' },
];

export function InsightClient() {
  const [report, setReport] = useState<Report | null>(null);
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

  const regenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        <div>
          <p className="text-xs text-on-surface-variant/60">
            {report?.generatedAt
              ? `報告期間 ${report.dateStart} ~ ${report.dateEnd} · 生成於 ${new Date(report.generatedAt).toLocaleString()}`
              : '尚未生成報告'}
          </p>
        </div>
        <button
          onClick={regenerate}
          disabled={generating}
          className="flex items-center gap-2 bg-ai-highlight text-on-primary px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-ai-hover transition-colors disabled:opacity-50"
        >
          {generating ? '生成中…（約 20–40 秒）' : report ? '重新生成報告' : '生成報告'}
        </button>
      </div>

      {error && (
        <div className="bg-sentiment-neg/10 text-sentiment-neg text-sm rounded-xl px-4 py-3">
          生成失敗：{error}
        </div>
      )}

      {loading && <div className="text-on-surface-variant/50 text-sm">載入中…</div>}

      {!loading && !report && !generating && (
        <div className="text-center py-20 text-on-surface-variant/50">
          <p className="text-sm">尚未有報告，點右上角「生成報告」開始。</p>
        </div>
      )}

      {report && (
        <div className="space-y-6">
          {SECTIONS.map((s) => (
            <section key={s.key} className="bg-surface rounded-3xl border border-outline-variant/20 card-shadow overflow-hidden">
              <div className="px-7 py-5 flex items-center gap-3 border-b border-outline-variant/10">
                <span className="text-xs font-black text-ai-highlight tracking-widest opacity-70">{s.num}</span>
                <h2 className="text-base font-bold text-on-surface">{s.title}</h2>
              </div>
              <div className="px-7 py-6 text-sm leading-relaxed text-on-surface">
                <AIText text={(report[s.key] as string) || '—'} />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
