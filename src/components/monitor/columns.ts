import type { Post, Platform } from '@/lib/domain/types';

export interface MetricCol {
  label: string;                       // 英文欄名（對齊原始資料欄位）
  get: (p: Post) => number | null;
  primary?: boolean;                   // 互動量總計：強調樣式
}

/** 每個平台顯示對應的互動維度，欄名保持英文 */
export function metricColumns(platform: Platform): MetricCol[] {
  const eng: MetricCol = { label: 'Engagement', get: (p) => p.engagementTotal, primary: true };
  const likes: MetricCol = { label: 'Likes', get: (p) => p.likes };
  const comments: MetricCol = { label: 'Comments', get: (p) => p.comments };
  const m = (key: string, label: string): MetricCol => ({ label, get: (p) => p.metrics?.[key] ?? null });

  switch (platform) {
    case 'threads':
      return [eng, likes, comments, m('quotes', 'Quotes'), m('reposts', 'Reposts'), m('reshares', 'Reshares')];
    case 'ig':
      return [eng, likes, comments, { label: 'Followers', get: (p) => p.followerCount }];
    case 'fb':
      return [eng, likes, m('love', 'Love'), m('care', 'Care'), m('haha', 'Haha'),
        m('wow', 'Wow'), m('sad', 'Sad'), m('angry', 'Angry'), comments, m('reshares', 'Reshares')];
  }
}

/** 24 小時制、與地區無關的固定格式 YYYY-MM-DD HH:mm（本地時區） */
export function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
