'use client';
import { useEffect, useMemo, useState } from 'react';
import { isAnomaly } from '@/lib/domain/engagement';
import type { Post, Platform } from '@/lib/domain/types';
import { metricColumns, fmtTime } from './columns';
import { PostDetailModal } from './PostDetailModal';
import type { Scope } from '@/lib/ai/types';

const TIME_KEY = 'Post Time';

export function PostsTable({
  posts,
  population,
  platform,
  scope,
}: {
  posts: Post[];
  population: number[];
  platform: Platform;
  scope: Scope;
}) {
  const [selected, setSelected] = useState<Post | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'Engagement', dir: 'desc' });

  const cols = metricColumns(platform);
  const showMedia = platform !== 'fb';   // FB 媒體型別恆為 'post'，無意義 → 隱藏
  const emptyColSpan = 4 + cols.length + (showMedia ? 1 : 0) + 1;

  // 切平台時重置排序（避免停在新平台不存在的欄）
  useEffect(() => {
    setSort({ key: 'Engagement', dir: 'desc' });
  }, [platform]);

  const sortValue = (p: Post, key: string): number => {
    if (key === TIME_KEY) return new Date(p.postTime).getTime();
    const col = cols.find((c) => c.label === key);
    return col ? (col.get(p) ?? -Infinity) : 0;
  };

  const sorted = useMemo(() => {
    const arr = [...posts];
    arr.sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      return sort.dir === 'asc' ? av - bv : bv - av;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, sort, platform]);

  const toggleSort = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));

  const arrow = (key: string) => (sort.key === key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : '');

  const sortableTh = (key: string) => (
    <th key={key} className="px-4 py-3.5 text-center whitespace-nowrap">
      <button onClick={() => toggleSort(key)} className="hover:text-primary transition-colors uppercase">
        {key}
        <span className="text-primary">{arrow(key)}</span>
      </button>
    </th>
  );

  return (
    <>
      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-left no-border-table">
          <thead className="sticky top-0 z-10 bg-surface-container text-[10px] font-black text-on-surface-variant/60 uppercase tracking-widest">
            <tr>
              <th className="px-3 py-3.5 w-10 text-center">#</th>
              <th className="px-3 py-3.5 whitespace-nowrap text-left">
                <button onClick={() => toggleSort(TIME_KEY)} className="hover:text-primary transition-colors uppercase">
                  {TIME_KEY}
                  <span className="text-primary">{arrow(TIME_KEY)}</span>
                </button>
              </th>
              <th className="px-3 py-3.5">Username</th>
              <th className="px-3 py-3.5">Content</th>
              {cols.map((c) => sortableTh(c.label))}
              {showMedia && <th className="px-3 py-3.5 text-center">Media</th>}
              <th className="px-4 py-3.5 text-right">Link</th>
            </tr>
          </thead>
          <tbody className="text-xs divide-y divide-outline-variant/5">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={emptyColSpan} className="px-8 py-16 text-center text-on-surface-variant/50">
                  此視角暫無資料
                </td>
              </tr>
            )}
            {sorted.map((p, i) => {
              const anomaly = isAnomaly(p.engagementTotal ?? 0, population);
              return (
                <tr key={p.postUrl ?? i} className="table-row-hover transition-colors">
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${anomaly ? 'bg-sentiment-neg' : 'bg-transparent'}`}
                        title={anomaly ? '爆款 (+2σ)' : undefined}
                      />
                      <span className="text-xs font-medium tabular-nums text-on-surface-variant/40">{i + 1}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-xs text-on-surface-variant/60 whitespace-nowrap tabular-nums">
                    {fmtTime(p.postTime)}
                  </td>
                  <td className="px-3 py-3.5 max-w-[120px] truncate text-[11px] text-on-surface-variant/80">{p.username}</td>
                  <td className="px-3 py-3.5">
                    <button
                      onClick={() => setSelected(p)}
                      title="點擊查看完整內容"
                      className="block max-w-[240px] truncate text-left text-on-surface-variant hover:text-primary cursor-pointer transition-colors"
                    >
                      {p.content || '—'}
                    </button>
                  </td>
                  {cols.map((c) => (
                    <td
                      key={c.label}
                      className={`px-4 py-3.5 text-center tabular-nums ${
                        c.primary ? 'font-bold text-on-surface' : 'text-on-surface-variant'
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
                      <a className="text-on-surface-variant/70 hover:underline" href={p.postUrl} target="_blank" rel="noreferrer">
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

      <PostDetailModal post={selected} platform={platform} scope={scope} onClose={() => setSelected(null)} />
    </>
  );
}
