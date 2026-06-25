'use client';
import { useState } from 'react';
import { isAnomaly } from '@/lib/domain/engagement';
import type { Post, Platform } from '@/lib/domain/types';
import { metricColumns, fmtTime } from './columns';
import { PostDetailModal } from './PostDetailModal';

export function PostsTable({
  posts,
  population,
  platform,
}: {
  posts: Post[];
  population: number[];
  platform: Platform;
}) {
  const [selected, setSelected] = useState<Post | null>(null);
  const cols = metricColumns(platform);
  const showMedia = platform !== 'fb';   // FB 媒體型別恆為 'post'，無意義 → 隱藏
  const emptyColSpan = 4 + cols.length + (showMedia ? 1 : 0) + 1;

  return (
    <>
      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-left no-border-table">
          <thead className="sticky top-0 z-10 bg-surface-container text-[10px] font-black text-on-surface-variant/60 uppercase tracking-widest">
            <tr>
              <th className="px-3 py-3.5 w-10 text-center">#</th>
              <th className="px-3 py-3.5 whitespace-nowrap">Post Time</th>
              <th className="px-3 py-3.5">Username</th>
              <th className="px-3 py-3.5">Content</th>
              {cols.map((c) => (
                <th key={c.label} className="px-4 py-3.5 text-center whitespace-nowrap">{c.label}</th>
              ))}
              {showMedia && <th className="px-3 py-3.5 text-center">Media</th>}
              <th className="px-4 py-3.5 text-right">Link</th>
            </tr>
          </thead>
          <tbody className="text-xs divide-y divide-outline-variant/5">
            {posts.length === 0 && (
              <tr>
                <td colSpan={emptyColSpan} className="px-8 py-16 text-center text-on-surface-variant/50">
                  此視角暫無資料
                </td>
              </tr>
            )}
            {posts.map((p, i) => {
              const anomaly = isAnomaly(p.engagementTotal ?? 0, population);
              return (
                <tr key={p.postUrl ?? i} className="table-row-hover transition-colors">
                  {/* 排名：弱化為灰階小字，僅保留爆款紅點 */}
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${anomaly ? 'bg-sentiment-neg' : 'bg-transparent'}`}
                        title={anomaly ? '爆款 (+2σ)' : undefined}
                      />
                      <span className="text-xs font-medium tabular-nums text-on-surface-variant/40">{i + 1}</span>
                    </div>
                  </td>
                  {/* 時間：24h、小字、弱化 */}
                  <td className="px-3 py-3.5 text-xs text-on-surface-variant/60 whitespace-nowrap tabular-nums">
                    {fmtTime(p.postTime)}
                  </td>
                  {/* 帳號：弱化字重 + 截斷 */}
                  <td className="px-3 py-3.5 max-w-[120px] truncate text-[11px] text-on-surface-variant/80">{p.username}</td>
                  {/* 內容：hover 變藍提示可點，點擊看完整內容 + 互動數據 */}
                  <td className="px-3 py-3.5">
                    <button
                      onClick={() => setSelected(p)}
                      title="點擊查看完整內容"
                      className="block max-w-[240px] truncate text-left text-on-surface-variant hover:text-primary cursor-pointer transition-colors"
                    >
                      {p.content || '—'}
                    </button>
                  </td>
                  {/* 互動維度：焦點 */}
                  {cols.map((c) => (
                    <td
                      key={c.label}
                      className={`px-4 py-3.5 text-center tabular-nums ${
                        c.primary ? 'font-extrabold text-primary' : 'text-on-surface'
                      }`}
                    >
                      {(c.get(p) ?? 0).toLocaleString()}
                    </td>
                  ))}
                  {showMedia && (
                    <td className="px-3 py-3.5 text-center text-on-surface-variant/70">{p.mediaType}</td>
                  )}
                  <td className="px-4 py-3.5 text-right">
                    {p.postUrl && (
                      <a className="text-primary font-bold hover:underline" href={p.postUrl} target="_blank" rel="noreferrer">
                        View
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PostDetailModal post={selected} platform={platform} onClose={() => setSelected(null)} />
    </>
  );
}
