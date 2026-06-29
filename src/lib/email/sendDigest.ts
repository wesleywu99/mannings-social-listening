import { createServiceClient } from '@/lib/supabase/server';
import { queryPosts, getBrandContext } from '@/lib/data/posts';
import { listSubscribers } from '@/lib/data/subscribers';
import { sendMail } from './gmail';
import { buildDigest, renderDigest, hkDayRangeUTC, hkDateOf, yesterdayHK, dayLabelHK, groupPostsByHkDay } from './digest';
import { buildDigestInsight } from './insight';
import { buildDigestCharts } from './charts';
import { detectSignals } from '@/lib/domain/signals';
import { DEFAULT_BRAND } from '@/lib/config';

const addHkDays = (date: string, n: number): string => {
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
const BASELINE_DAYS = 7;

export interface DigestResult { day: string; hasData: boolean; total: number; sent: number; failed: string[]; }

/** 決定要報哪一天：預設港時昨日；若昨日無資料（如靜態示範檔），退回「最近一天有資料」 */
async function resolveDay(brand: string, nowIso: string): Promise<string> {
  let day = yesterdayHK(nowIso);
  const { start, end } = hkDayRangeUTC(day);
  const probe = await queryPosts({ brand, dateStart: start, dateEnd: end, limit: 1 });
  if (probe.length) return day;

  const supa = createServiceClient();
  const { data } = await supa.from('posts').select('post_time').eq('brand', brand)
    .order('post_time', { ascending: false }).limit(1);
  if (data?.[0]?.post_time) day = hkDateOf(data[0].post_time as string);
  return day;
}

/**
 * 寄送每日摘要（短、含 CSS 圖表）。to 指定收件人（測試）；否則寄給該品牌訂閱者。
 * 邊界：當天無貼文 → 不寄（除非明確 to 測試），避免騷擾。逐封寄保護彼此隱私。
 */
export async function sendDigest(
  opts: { brand?: string; to?: string[]; day?: string; nowIso?: string } = {},
): Promise<DigestResult> {
  const brand = opts.brand ?? DEFAULT_BRAND;
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  const nowIso = opts.nowIso ?? new Date().toISOString();

  const day = opts.day ?? (await resolveDay(brand, nowIso));

  // 一次撈「報告日 + 前 7 天」，分桶供基準/異常偵測
  const winStart = hkDayRangeUTC(addHkDays(day, -BASELINE_DAYS)).start;
  const winEnd = hkDayRangeUTC(day).end;
  const all = await queryPosts({ brand, dateStart: winStart, dateEnd: winEnd });
  const byDay = groupPostsByHkDay(all);
  const posts = byDay[day] ?? [];
  const prior = byDay[addHkDays(day, -1)] ?? [];
  const baselineDays = Array.from({ length: BASELINE_DAYS }, (_, i) => {
    const dt = addHkDays(day, -(i + 1)); return { date: dt, posts: byDay[dt] ?? [] };
  });

  const data = buildDigest(posts, prior, dayLabelHK(day));

  // 空日不主動寄（測試指定 to 時仍寄，方便預覽）
  if (!data.hasData && !opts.to) return { day, hasData: false, total: 0, sent: 0, failed: [] };

  // 異常偵測（決策簡報核心，確定性）+ AI 洞察（加值，失敗回 null）+ 內嵌餅圖
  const signals = data.hasData ? detectSignals(day, posts, baselineDays) : [];
  const brandCtx = await getBrandContext(brand);
  const insight = data.hasData ? await buildDigestInsight(posts, brandCtx ? JSON.stringify(brandCtx) : null) : null;
  const { images, has } = buildDigestCharts(data);

  const recipients = opts.to ?? (await listSubscribers(brand)).map((s) => s.email);
  const html = renderDigest(data, { appUrl, insight, charts: has, signals });
  const subject = `Mannings 每日摘要 · ${day}`;

  let sent = 0;
  const failed: string[] = [];
  for (const to of recipients) {
    try { await sendMail(to, subject, html, images); sent++; }
    catch (e) { console.error('[sendDigest] failed', to, e); failed.push(to); }
  }
  return { day, hasData: data.hasData, total: recipients.length, sent, failed };
}
