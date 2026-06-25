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

/** 24 小時制、與地區無關的固定格式 YYYY-MM-DD HH:mm（本地時區） */
function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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
        <thead className="sticky top-0 z-10 bg-surface-container text-[10px] font-black text-on-surface-variant/60 uppercase tracking-widest">
          <tr>
            <th className="px-3 py-3.5 w-10 text-center">#</th>
            <th className="px-3 py-3.5 whitespace-nowrap">時間</th>
            <th className="px-3 py-3.5">帳號</th>
            <th className="px-3 py-3.5">內容摘要</th>
            {cols.map((c) => (
              <th key={c.label} className="px-4 py-3.5 text-center whitespace-nowrap">{c.label}</th>
            ))}
            <th className="px-3 py-3.5 text-center">媒體</th>
            <th className="px-4 py-3.5 text-right">連結</th>
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
                {/* 帳號：弱化字重 + 截斷，不搶焦點 */}
                <td className="px-3 py-3.5 max-w-[120px] truncate text-on-surface-variant/80">{p.username}</td>
                {/* 內容 */}
                <td className="px-3 py-3.5 max-w-[200px] truncate text-on-surface-variant">{p.content}</td>
                {/* 互動維度：焦點 */}
                {cols.map((c) => (
                  <td
                    key={c.label}
                    className={`px-4 py-3.5 text-center tabular-nums ${
                      c.primary ? 'font-extrabold text-primary text-[15px]' : 'text-on-surface'
                    }`}
                  >
                    {(c.get(p) ?? 0).toLocaleString()}
                  </td>
                ))}
                <td className="px-3 py-3.5 text-center text-on-surface-variant/70">{p.mediaType}</td>
                <td className="px-4 py-3.5 text-right">
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
