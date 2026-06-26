import type { Platform, Post } from './types';
import { PLATFORM_SCHEMAS } from './platforms';

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();   // 去除前後空白／換行（來源資料常見尾隨 \r\n）
  return s === '' ? null : s;
}

/** Post Time 可能是字串、JS Date，或 Excel 序列號（xlsx 數字日期格）。回傳 ISO 或 null。 */
function toISO(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === 'number') {
    // Excel 序列號：自 1899-12-30 起算的天數
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function normalizeRow(
  platform: Platform,
  brand: string,
  raw: Record<string, unknown>,
): Post {
  const schema = PLATFORM_SCHEMAS[platform];
  const metrics: Record<string, number> = {};
  for (const field of schema.metricFields) {
    const n = num(raw[field]);
    metrics[field.toLowerCase()] = n ?? 0;
  }
  return {
    brand,
    platform,
    postTime: toISO(raw['Post Time']) ?? '',
    username: str(raw['Username']),
    content: str(raw['Content']),
    postUrl: str(raw['Post URL']),
    mediaType: str(raw['Media Type']),
    likes: num(raw[schema.likesField]),
    comments: num(raw[schema.commentsField]),
    followerCount: schema.hasFollower ? num(raw['Follower_Count']) : null,
    engagementTotal: num(raw['Engagement_Total']),
    metrics,
    sources: [],   // xlsx 回填無來源資訊；未來 n8n 多維度收集時填入
  };
}
