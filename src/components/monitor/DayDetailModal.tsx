'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Platform, Post } from '@/lib/domain/types';
import type { Scope } from '@/lib/ai/types';
import { Modal } from '@/components/Modal';
import { AIText } from './aiText';
import { computeSentimentSummary } from '@/lib/domain/aggregate';

const META: Record<Platform, { label: string; dot: string }> = {
  ig: { label: 'Instagram', dot: 'bg-instagram' },
  threads: { label: 'Threads', dot: 'bg-threads' },
  fb: { label: 'Facebook', dot: 'bg-facebook' },
};
const ORDER: Platform[] = ['ig', 'threads', 'fb'];
const WK = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

interface DayInsight { topic: string; cause: string; actions: string; }

export function DayDetailModal({
  rangeStart,
  rangeEnd,
  weekly,
  scope,
  breakout,
  periodAvgEpp,
  onClose,
}: {
  rangeStart: string;
  rangeEnd: string;
  weekly: boolean;
  scope: Scope;
  breakout: { eff: boolean; peak: boolean } | null;
  periodAvgEpp: number;
  onClose: () => void;
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [ai, setAi] = useState<DayInsight | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ brand: scope.brand, start: `${rangeStart}T00:00:00`, end: `${rangeEnd}T23:59:59`, limit: '500' });
    fetch(`/api/data/posts?${qs}`)
      .then((r) => r.json())
      .then((d) => setPosts(Array.isArray(d) ? d : []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [rangeStart, rangeEnd, scope.brand]);

  const stats = useMemo(() => {
    const totalEng = posts.reduce((s, p) => s + (p.engagementTotal ?? 0), 0);
    const count = posts.length;
    const epp = count ? Math.round(totalEng / count) : 0;
    const split = ORDER.map((pf) => {
      const grp = posts.filter((p) => p.platform === pf);
      const eng = grp.reduce((s, p) => s + (p.engagementTotal ?? 0), 0);
      return { platform: pf, eng, share: totalEng ? (eng / totalEng) * 100 : 0 };
    }).filter((x) => x.eng > 0);
    const top = [...posts].sort((a, b) => (b.engagementTotal ?? 0) - (a.engagementTotal ?? 0)).slice(0, 4);
    const mix = new Map<string, number>();
    for (const p of posts) mix.set(p.mediaType ?? '—', (mix.get(p.mediaType ?? '—') ?? 0) + 1);
    const mixTop = [...mix.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, v]) => ({ type: k, pct: count ? Math.round((v / count) * 100) : 0 }));
    return { totalEng, count, epp, split, top, mix: mixTop };
  }, [posts]);

  const sentiment = useMemo(() => computeSentimentSummary(posts), [posts]);
  const hasSentiment = sentiment.total > 0;

  const xAvg = periodAvgEpp ? stats.epp / periodAvgEpp : 0;
  const weekday = (() => { const d = new Date(`${rangeStart}T00:00:00`); return Number.isNaN(d.getTime()) ? '' : WK[d.getDay()]; })();
  const title = weekly ? `${rangeStart} ~ ${rangeEnd}` : `${rangeStart} · ${weekday}`;
  const badge = breakout?.eff ? '效率破圈' : breakout?.peak ? '聲量高峰' : null;
  const empty = !loading && stats.count === 0;

  const runAI = async () => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/insight/day', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: rangeStart, end: rangeEnd, scope }),
      });
      const d = await res.json();
      setAi(d.error ? { topic: '生成失敗：' + d.error, cause: '', actions: '' } : d);
    } catch (e) {
      setAi({ topic: '發生錯誤：' + String(e), cause: '', actions: '' });
    } finally {
      setAiLoading(false);
    }
  };

  const Sk = ({ w = 'w-full' }: { w?: string }) => <span className={`inline-block h-3 rounded bg-surface-container animate-pulse ${w}`} />;

  return (
    <Modal onClose={onClose} maxWidth="640px">
      {(close) => (
        <>
          <div className="px-6 pt-6">
            {badge ? (
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-sentiment-neg bg-sentiment-neg/8 border border-sentiment-neg/25 rounded-md px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sentiment-neg" /> Breakout · {badge}
              </span>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-wide text-on-surface-variant/50">{weekly ? 'Weekly detail' : 'Daily detail'}</span>
            )}
            <h3 className="text-xl font-semibold tracking-tight mt-2.5">{title}</h3>
            <p className="text-[13px] text-on-surface-variant mt-1 min-h-[20px]">
              {loading ? <Sk w="w-56" />
                : empty ? '此區間無貼文資料'
                : <>共 <b className="text-on-surface tabular-nums">{stats.count}</b> 帖 · <b className="text-on-surface tabular-nums">{stats.totalEng.toLocaleString()}</b> 互動 · 每帖 <b className="text-on-surface tabular-nums">{stats.epp.toLocaleString()}</b>{xAvg ? <>（<b className="text-on-surface">×{xAvg.toFixed(1)}</b> 期間平均）</> : null}</>}
            </p>
          </div>

          <div className="px-6 py-5 flex flex-col gap-4">
            {empty ? (
              <div className="border border-dashed border-outline-variant rounded-xl py-12 text-center text-[13px] text-mute">此區間沒有貼文。</div>
            ) : (
              <>
                {/* 統計卡 */}
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { l: 'Engagement', v: stats.totalEng.toLocaleString() },
                    { l: 'Posts', v: String(stats.count) },
                    { l: 'Eng / post', v: stats.epp.toLocaleString(), x: xAvg ? `×${xAvg.toFixed(1)} avg` : '' },
                  ].map((c) => (
                    <div key={c.l} className="border border-outline-variant rounded-xl px-3.5 py-3">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-faint">{c.l}</div>
                      {loading ? <div className="mt-2"><Sk w="w-12" /></div> : <div className="text-xl font-semibold tabular-nums mt-1">{c.v}</div>}
                      {!loading && c.x && <div className="text-[11px] font-semibold text-sentiment-pos mt-0.5">{c.x}</div>}
                    </div>
                  ))}
                </div>

                {/* 平台占比：Vercel 風列表（無色條） */}
                {!loading && stats.split.length > 0 && (
                  <div>
                    <div className="font-mono text-[10px] font-semibold uppercase tracking-wide text-mute mb-2">Engagement by platform</div>
                    <div className="border border-outline-variant rounded-xl overflow-hidden">
                      {stats.split.map((s) => (
                        <div key={s.platform} className="flex items-center justify-between px-3.5 py-2.5 border-b last:border-b-0 border-outline-variant/60">
                          <span className="flex items-center gap-2 text-[13px] text-on-surface"><span className={`w-1.5 h-1.5 rounded-full ${META[s.platform].dot}`} /> {META[s.platform].label}</span>
                          <span className="flex items-baseline gap-2.5"><span className="text-[13px] font-semibold tabular-nums">{s.eng.toLocaleString()}</span><span className="text-[11px] text-mute tabular-nums w-9 text-right">{s.share.toFixed(0)}%</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 當日情感 */}
                {!loading && hasSentiment && (
                  <div>
                    <div className="font-mono text-[10px] font-semibold uppercase tracking-wide text-mute mb-2">Sentiment · 當日情感</div>
                    <div className="border border-outline-variant rounded-xl px-3.5 py-3">
                      <div className="flex h-1.5 rounded-full overflow-hidden bg-surface-container mb-2">
                        {sentiment.posPct > 0 && <div style={{ width: `${sentiment.posPct * 100}%` }} className="bg-sentiment-pos" />}
                        {sentiment.neuPct > 0 && <div style={{ width: `${sentiment.neuPct * 100}%` }} className="bg-sentiment-neu" />}
                        {sentiment.negPct > 0 && <div style={{ width: `${sentiment.negPct * 100}%` }} className="bg-sentiment-neg" />}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] tabular-nums text-on-surface-variant">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sentiment-pos" />正 {sentiment.pos}</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sentiment-neu" />中 {sentiment.neu}</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sentiment-neg" />負 {sentiment.neg}</span>
                      </div>
                      {sentiment.negPct > 0.5 && (
                        <div className="mt-2 text-[11px] text-sentiment-neg font-medium">● 負面占比過半（{Math.round(sentiment.negPct * 100)}%）</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Top 驅動貼文（右欄標明 Engagement，內容截一行） */}
                {!loading && stats.top.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between font-mono text-[10px] font-semibold uppercase tracking-wide text-mute mb-2">
                      <span>Top driving posts</span><span>Engagement</span>
                    </div>
                    <div className="border border-outline-variant rounded-xl divide-y divide-outline-variant/50">
                      {stats.top.map((p, i) => (
                        <div key={p.postUrl ?? i} className="flex items-center gap-3 px-3.5 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-[12.5px] text-on-surface-variant truncate">{p.content || '—'}</div>
                            <div className="text-[11px] text-mute mt-0.5 truncate">@{p.username} · {META[p.platform].label}{p.mediaType ? ` · ${p.mediaType}` : ''}</div>
                          </div>
                          <div className="text-[13px] font-semibold tabular-nums shrink-0 text-on-surface">{(p.engagementTotal ?? 0).toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 內容組成 */}
                {!loading && stats.mix.length > 0 && (
                  <div>
                    <div className="font-mono text-[10px] font-semibold uppercase tracking-wide text-mute mb-2">Content mix</div>
                    <div className="flex gap-2 flex-wrap">
                      {stats.mix.map((m) => <span key={m.type} className="text-[11px] text-on-surface-variant border border-outline-variant rounded-lg px-2.5 py-1">{m.type} <b className="text-on-surface">{m.pct}%</b></span>)}
                    </div>
                  </div>
                )}

                {/* AI 深度解讀 */}
                <div>
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-wide text-mute mb-2">
                    <span className="text-[#3b5bdb] bg-[#eef1ff] border border-[#dbe1ff] rounded px-1.5 py-0.5 mr-1.5">AI</span>深度解讀
                  </div>
                  {ai ? (
                    <div className="border border-outline-variant rounded-xl p-4 bg-[#fcfcfd] flex flex-col gap-3.5">
                      <div><div className="text-[12px] font-bold mb-1">主要討論主題</div><div className="text-[13px] leading-relaxed text-on-surface-variant"><AIText text={ai.topic} /></div></div>
                      {ai.cause && <div><div className="text-[12px] font-bold mb-1">為何爆發</div><div className="text-[13px] leading-relaxed text-on-surface-variant"><AIText text={ai.cause} /></div></div>}
                      {ai.actions && <div><div className="text-[12px] font-bold mb-1">可複製的行動點</div><div className="text-[13px] leading-relaxed text-on-surface-variant"><AIText text={ai.actions} /></div></div>}
                    </div>
                  ) : (
                    <div className="border border-dashed border-outline-variant rounded-xl p-4 text-[13px] text-mute">點右下角「AI 解讀」生成主題、爆發成因與可複製行動點。</div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="sticky bottom-0 flex justify-end gap-2.5 px-6 py-3.5 border-t border-outline-variant/60 bg-surface">
            <button onClick={runAI} disabled={aiLoading || loading || empty}
              className="rounded-[10px] text-[13px] font-semibold px-4 py-2 bg-primary text-on-primary hover:bg-ai-hover transition-colors disabled:opacity-50">
              {aiLoading ? '分析中…' : ai ? '重新解讀' : 'AI 解讀'}
            </button>
            <button onClick={close} className="rounded-[10px] text-[13px] font-semibold px-4 py-2 bg-surface text-on-surface border border-outline-variant hover:bg-surface-container transition-colors">關閉</button>
          </div>
        </>
      )}
    </Modal>
  );
}
