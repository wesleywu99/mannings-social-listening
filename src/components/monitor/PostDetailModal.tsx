'use client';
import { useEffect, useState } from 'react';
import type { Post, Platform } from '@/lib/domain/types';
import type { Scope } from '@/lib/ai/types';
import { Modal } from '@/components/Modal';
import { metricColumns, fmtTime } from './columns';
import { AIText } from './aiText';
import type { useInsightCache } from './useInsightCache';

type InsightCache = ReturnType<typeof useInsightCache>;

export function PostDetailModal({
  post,
  platform,
  scope,
  onClose,
  insightCache,
}: {
  post: Post | null;
  platform: Platform;
  scope: Scope;
  onClose: () => void;
  insightCache: InsightCache;
}) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 開啟時：若有快取直接用，否則才調 AI
  useEffect(() => {
    if (!post) return;
    const key = `post:${post.id ?? post.postUrl}`;
    const cached = insightCache.get(key);
    if (cached) { setInsight(cached); setLoading(false); }
    else { setInsight(null); setLoading(false); }
  }, [post, insightCache]);

  if (!post) return null;
  const cols = metricColumns(platform);

  const runInsight = async (force = false) => {
    const key = `post:${post.id ?? post.postUrl}`;
    if (!force) {
      const cached = insightCache.get(key);
      if (cached) { setInsight(cached); return; }
    }
    setLoading(true);
    try {
      const res = await fetch('/api/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post, scope }),
      });
      const data = await res.json();
      const text = data.insight ?? data.error ?? '（無法產生解讀）';
      setInsight(text);
      insightCache.set(key, text);
    } catch (e) {
      setInsight('發生錯誤：' + String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="672px">
      {(close) => (
        <>
          {/* 頂部：帳號 + 時間 */}
          <div className="px-7 py-5 border-b border-outline-variant/60 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="font-semibold text-on-surface truncate">{post.username}</div>
              <div className="text-xs text-on-surface-variant/60 tabular-nums mt-0.5">{fmtTime(post.postTime)} · {platform.toUpperCase()}</div>
            </div>
            {post.postUrl && (
              <a href={post.postUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold text-link hover:underline mt-1">原貼文 ↗</a>
            )}
          </div>

          {/* 完整貼文內容 */}
          <div className="px-7 py-6">
            <p className="text-sm leading-relaxed text-on-surface whitespace-pre-wrap break-words">{post.content || '（無內容）'}</p>
          </div>

          {/* 互動數據卡片 */}
          <div className="px-7 py-5 border-t border-outline-variant/60 bg-surface-container/40">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {cols.map((c) => (
                <div key={c.label} className="bg-surface rounded-xl border border-outline-variant px-3 py-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant/50">{c.label}</div>
                  <div className={`text-lg font-semibold tabular-nums ${c.primary ? 'text-on-surface' : 'text-on-surface-variant'}`}>{(c.get(post) ?? 0).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>

          {/* AI 解讀結果 */}
          {(insight || loading) && (
            <div className="px-7 py-5 border-t border-outline-variant/60 max-h-[30vh] overflow-y-auto">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-wide text-mute mb-2">
                <span className="text-[#3b5bdb] bg-[#eef1ff] border border-[#dbe1ff] rounded px-1.5 py-0.5 mr-1.5">AI</span>解讀
              </div>
              {loading ? <div className="text-sm text-on-surface-variant/60">分析中…</div> : <div className="text-sm text-on-surface leading-relaxed"><AIText text={insight!} /></div>}
            </div>
          )}

          {/* footer：黑色 AI 按鈕 + 關閉（右下角） */}
          <div className="sticky bottom-0 px-7 py-4 flex justify-end gap-2.5 border-t border-outline-variant/60 bg-surface">
            <button
              onClick={() => runInsight(insight !== null)}
              disabled={loading}
              className="px-4 py-2 rounded-[10px] bg-primary text-on-primary text-[13px] font-semibold hover:bg-ai-hover transition-colors disabled:opacity-50"
            >
              {loading ? '分析中…' : insight ? '重新解讀' : 'AI 解讀'}
            </button>
            <button
              onClick={close}
              className="px-4 py-2 rounded-[10px] bg-surface text-on-surface border border-outline-variant text-[13px] font-semibold hover:bg-surface-container transition-colors"
            >
              關閉
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
