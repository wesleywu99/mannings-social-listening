import type { Platform, Post, PlatformKpis } from './types';
import { anomalyThreshold } from './engagement';

const PLATFORMS: Platform[] = ['threads', 'ig', 'fb'];

export function computeKpis(posts: Post[]): PlatformKpis[] {
  return PLATFORMS.map((platform) => {
    const group = posts.filter((p) => p.platform === platform);
    const engs = group.map((p) => p.engagementTotal ?? 0);
    const total = engs.reduce((a, b) => a + b, 0);
    const count = group.length;
    const threshold = anomalyThreshold(engs);
    const anomalies = engs.filter((e) => e > threshold).length;
    return {
      platform,
      postCount: count,
      totalEngagement: total,
      avgEngagement: count ? Math.round((total / count) * 10) / 10 : 0,
      anomalyRate: count ? anomalies / count : 0,
    };
  });
}

export interface TrendPoint {
  date: string; // YYYY-MM-DD（日）或當週週一（週）
  engagement: number; // 該桶互動量總和
  posts: number; // 該桶貼文數
}

/** 一個時間桶的破圈旗標：eff=效率破圈（少帖高互動），peak=聲量高峰 */
export interface BreakoutFlag {
  eff: boolean;
  peak: boolean;
}

/**
 * 偵測破圈日：對逐桶序列做 +2σ。
 * - peak：當桶總互動 > μ+2σ（聲量高峰）
 * - eff ：當桶每帖互動 > μ+2σ（少帖高互動）
 * 樣本 ≤3 時 anomalyThreshold 回 Infinity → 不誤判。
 */
export function detectBreakouts(eng: number[], posts: number[]): BreakoutFlag[] {
  const eff = eng.map((e, i) => (posts[i] > 0 ? e / posts[i] : 0));
  const engTh = anomalyThreshold(eng);
  const effTh = anomalyThreshold(eff);
  return eng.map((e, i) => ({
    peak: e > engTh,
    eff: posts[i] > 0 && eff[i] > effTh,
  }));
}

const DAY_MS = 86400000;

/** 取 ISO / YYYY-MM-DD 字串的日期部分，轉成 UTC 午夜 Date（無法解析回 null） */
function parseDate(s: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** 取當週週一（UTC） */
function mondayOf(d: Date): Date {
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d.getTime());
  m.setUTCDate(d.getUTCDate() + diff);
  return m;
}

/**
 * 計算各平台逐桶互動量序列。視窗優先採 dateStart/dateEnd，否則由貼文推導。
 * 跨度 ≤ 60 天用「日」，否則用「週」；空桶補 0，序列連續。
 */
export function computeTrends(
  posts: Post[],
  dateStart?: string,
  dateEnd?: string,
): Record<Platform, TrendPoint[]> {
  const result = {} as Record<Platform, TrendPoint[]>;
  for (const p of PLATFORMS) result[p] = [];

  let lo: Date | null = dateStart ? parseDate(dateStart) : null;
  let hi: Date | null = dateEnd ? parseDate(dateEnd) : null;

  if (!lo || !hi) {
    for (const post of posts) {
      const d = parseDate(post.postTime);
      if (!d) continue;
      if (!lo || d < lo) lo = d;
      if (!hi || d > hi) hi = d;
    }
  }
  if (!lo || !hi) return result;

  const spanDays = Math.round((hi.getTime() - lo.getTime()) / DAY_MS) + 1;
  const weekly = spanDays > 60;
  const step = weekly ? 7 : 1;
  const start = weekly ? mondayOf(lo) : lo;
  const end = hi;

  const keys: string[] = [];
  const cur = new Date(start.getTime());
  while (cur.getTime() <= end.getTime()) {
    keys.push(ymd(cur));
    cur.setUTCDate(cur.getUTCDate() + step);
  }
  if (!keys.length || keys[keys.length - 1] !== ymd(end)) keys.push(ymd(end));

  const buckets = {} as Record<Platform, Map<string, { engagement: number; posts: number }>>;
  for (const p of PLATFORMS) buckets[p] = new Map();

  for (const post of posts) {
    const d = parseDate(post.postTime);
    if (!d) continue;
    const key = ymd(weekly ? mondayOf(d) : d);
    const map = buckets[post.platform];
    if (!map) continue;
    const cur = map.get(key) ?? { engagement: 0, posts: 0 };
    cur.engagement += post.engagementTotal ?? 0;
    cur.posts += 1;
    map.set(key, cur);
  }

  for (const p of PLATFORMS) {
    result[p] = keys.map((k) => {
      const v = buckets[p].get(k) ?? { engagement: 0, posts: 0 };
      return { date: k, engagement: v.engagement, posts: v.posts };
    });
  }
  return result;
}
