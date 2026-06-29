import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { sendMail } from '../src/lib/email/gmail';
import { buildDigest, renderDigest, hkDayRangeUTC, hkDateOf, yesterdayHK, dayLabelHK } from '../src/lib/email/digest';
import { buildDigestInsight } from '../src/lib/email/insight';
import { buildDigestCharts } from '../src/lib/email/charts';
import type { Post, Platform, PostSource } from '../src/lib/domain/types';

// 用法：npm run send-report [email] [day=YYYY-MM-DD]
//   email 省略 → 寄給所有訂閱者；day 省略 → 港時昨日（無資料則退回最近一天）
const BRAND = 'Mannings';
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

function rowToPost(r: Record<string, unknown>): Post {
  return {
    id: r.id as number | undefined, brand: r.brand as string, platform: r.platform as Platform,
    postTime: r.post_time as string, username: r.username as string | null,
    content: r.content as string | null, postUrl: r.post_url as string | null,
    mediaType: r.media_type as string | null, likes: r.likes as number | null,
    comments: r.comments as number | null, followerCount: r.follower_count as number | null,
    engagementTotal: r.engagement_total as number | null,
    metrics: (r.metrics as Record<string, number>) ?? {}, sources: (r.sources as PostSource[]) ?? [],
    sentiment: (r.sentiment as Post['sentiment']) ?? null, sentimentScore: (r.sentiment_score as number | null) ?? null,
  };
}

async function main() {
  const arg = process.argv[2];
  const dayArg = process.argv[3];
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const fetchDay = async (start: string, end: string): Promise<Post[]> => {
    const { data } = await s.from('posts').select('*').eq('brand', BRAND).gte('post_time', start).lte('post_time', end);
    return (data ?? []).map(rowToPost);
  };

  // 決定報告日：指定 > 港時昨日 > 最近一天有資料
  let day = dayArg ?? yesterdayHK(new Date().toISOString());
  if (!dayArg) {
    const probe = await fetchDay(...Object.values(hkDayRangeUTC(day)) as [string, string]);
    if (!probe.length) {
      const { data } = await s.from('posts').select('post_time').eq('brand', BRAND).order('post_time', { ascending: false }).limit(1);
      if (data?.[0]?.post_time) day = hkDateOf(data[0].post_time as string);
    }
  }
  const range = hkDayRangeUTC(day);
  const priorDate = (() => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
  const priorRange = hkDayRangeUTC(priorDate);

  const [posts, prior] = await Promise.all([fetchDay(range.start, range.end), fetchDay(priorRange.start, priorRange.end)]);
  const digest = buildDigest(posts, prior, dayLabelHK(day));
  console.log(`報告日 ${day}：${digest.posts} 則貼文、${digest.engagement.toLocaleString()} 互動`);

  // 品牌脈絡 → AI 洞察（核心價值）+ 內嵌餅圖
  const { data: brandRow } = await s.from('brands').select('context').eq('name', BRAND).limit(1);
  const brandCtx = (brandRow?.[0]?.context as unknown) ?? null;
  const insight = await buildDigestInsight(posts, brandCtx ? JSON.stringify(brandCtx) : null);
  console.log(insight ? `AI 洞察：${insight.discussion.length} 討論、${insight.winningContent.length} 規律${insight.risk ? '、有風險提示' : ''}` : 'AI 洞察：略過（失敗或無 key）');
  const { images, has } = buildDigestCharts(digest);

  let recipients: string[];
  if (arg) recipients = [arg];
  else {
    const { data: subs } = await s.from('subscribers').select('email').eq('brand', BRAND).eq('active', true);
    recipients = (subs ?? []).map((x) => x.email as string);
  }
  if (!recipients.length) { console.error('無收件人（無訂閱者）'); process.exit(1); }

  const html = renderDigest(digest, { appUrl: APP_URL, insight, charts: has });
  const subject = `Mannings 每日摘要 · ${day}`;
  let sent = 0;
  for (const to of recipients) {
    try { await sendMail(to, subject, html, images); sent++; } catch (e) { console.error('寄送失敗', to, (e as { message?: string })?.message ?? e); }
  }
  console.log(`摘要寄送：成功 ${sent}/${recipients.length}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.response?.data?.error ?? e?.message ?? e); process.exit(1); });
