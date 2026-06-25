import { isAnomaly } from '@/lib/domain/engagement';
import type { Post, Platform } from '@/lib/domain/types';

interface MetricCol {
  label: string;
  get: (p: Post) => number | null;
  primary?: boolean;   // 互動量總計：強調樣式
}

/** 每個平台顯示對應的互動維度（對齊原始資料的不同欄位） */
function metricColumns(platform: Platform): MetricCol[] {
  const eng: MetricCol = { label: '互動量', get: (p) => p.engagementTotal, primary: true };
  const likes: MetricCol = { label: '讚', get: (p) => p.likes };
  const comments: MetricCol = { label: '留言', get: (p) => p.comments };
  const m = (key: string, label: string): MetricCol => ({ label, get: (p) => p.metrics?.[key] ?? null });

  switch (platform) {
    case 'threads':
      return [eng, likes, comments, m('quotes', '引用'), m('reposts', '轉發'), m('reshares', '分享')];
    case 'ig':
      return [eng, likes, comments, { label: '粉絲數', get: (p) => p.followerCount }];
    case 'fb':
      return [eng, likes, m('love', '大心'), m('care', '加油'), m('haha', '哈'),
        m('wow', '哇'), m('sad', '嗚'), m('angry', '怒'), comments, m('reshares', '分享')];
  }
}

export function PostsTable({
  posts,
  population,
  platform,
}: {
  posts: Post[];
  population: number[];
  platform: Platform;
}) {
  const cols = metricColumns(platform);
  return (
    <div className="overflow-auto max-h-[70vh]">
      <table className="w-full text-left no-border-table">
        <thead className="sticky top-0 z-10 bg-surface-container text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
          <tr>
            <th className="px-8 py-3.5 w-20">排名</th>
            <th className="px-6 py-3.5 whitespace-nowrap">發布時間</th>
            <th className="px-6 py-3.5">帳號</th>
            <th className="px-6 py-3.5">內容摘要</th>
            {cols.map((c) => (
              <th key={c.label} className="px-4 py-3.5 text-center whitespace-nowrap">{c.label}</th>
            ))}
            <th className="px-4 py-3.5 text-center">媒體</th>
            <th className="px-8 py-3.5 text-right">連結</th>
          </tr>
        </thead>
        <tbody className="text-[13px] divide-y divide-outline-variant/5">
          {posts.length === 0 && (
            <tr>
              <td colSpan={cols.length + 6} className="px-8 py-16 text-center text-on-surface-variant/50">
                此視角暫無資料
              </td>
            </tr>
          )}
          {posts.map((p, i) => {
            const anomaly = isAnomaly(p.engagementTotal ?? 0, population);
            return (
              <tr key={p.postUrl ?? i} className="table-row-hover transition-colors">
                <td className="px-8 py-3.5">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${anomaly ? 'bg-sentiment-neg' : 'bg-transparent'}`}
                      title={anomaly ? '爆款 (+2σ)' : undefined}
                    />
                    <span className="font-black text-primary">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                </td>
                <td className="px-6 py-3.5 text-on-surface-variant/80 whitespace-nowrap">
                  {new Date(p.postTime).toLocaleString()}
                </td>
                <td className="px-6 py-3.5 font-bold whitespace-nowrap">{p.username}</td>
                <td className="px-6 py-3.5 max-w-[220px] truncate text-on-surface-variant">{p.content}</td>
                {cols.map((c) => (
                  <td
                    key={c.label}
                    className={`px-4 py-3.5 text-center ${
                      c.primary ? 'font-extrabold text-primary' : 'text-on-surface-variant'
                    }`}
                  >
                    {(c.get(p) ?? 0).toLocaleString()}
                  </td>
                ))}
                <td className="px-4 py-3.5 text-center text-on-surface-variant">{p.mediaType}</td>
                <td className="px-8 py-3.5 text-right">
                  {p.postUrl && (
                    <a className="text-primary font-bold hover:underline" href={p.postUrl} target="_blank" rel="noreferrer">
                      查看
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
