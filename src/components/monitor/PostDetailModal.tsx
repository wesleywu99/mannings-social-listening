'use client';
import { useEffect } from 'react';
import type { Post, Platform } from '@/lib/domain/types';
import { metricColumns, fmtTime } from './columns';

export function PostDetailModal({
  post,
  platform,
  onClose,
}: {
  post: Post | null;
  platform: Platform;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!post) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [post, onClose]);

  if (!post) return null;
  const cols = metricColumns(platform);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-surface rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 頂部：帳號 + 時間 */}
        <div className="px-7 py-5 border-b border-outline-variant/20 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-bold text-on-surface truncate">{post.username}</div>
            <div className="text-xs text-on-surface-variant/60 tabular-nums mt-0.5">
              {fmtTime(post.postTime)} · {platform.toUpperCase()}
            </div>
          </div>
          {post.postUrl && (
            <a
              href={post.postUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs font-bold text-primary hover:underline mt-1"
            >
              原貼文 ↗
            </a>
          )}
        </div>

        {/* 中間：完整貼文內容 */}
        <div className="px-7 py-6 overflow-y-auto">
          <p className="text-sm leading-relaxed text-on-surface whitespace-pre-wrap break-words">
            {post.content || '（無內容）'}
          </p>
        </div>

        {/* 底部：所有互動數據（卡片） */}
        <div className="px-7 py-5 border-t border-outline-variant/20 bg-surface-container/40">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {cols.map((c) => (
              <div key={c.label} className="bg-surface rounded-xl border border-outline-variant/30 px-3 py-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant/50">{c.label}</div>
                <div className={`text-lg font-black tabular-nums ${c.primary ? 'text-primary' : 'text-on-surface'}`}>
                  {(c.get(post) ?? 0).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 關閉 */}
        <div className="px-7 py-4 flex justify-end border-t border-outline-variant/10">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-primary text-on-primary text-sm font-bold hover:opacity-90 transition-opacity"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
