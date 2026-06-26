import { createServiceClient } from '@/lib/supabase/server';
import { computeKpis, computeTrends, type TrendPoint } from '@/lib/domain/aggregate';
import type { Platform, Post, PlatformKpis, PostSource } from '@/lib/domain/types';

interface QueryArgs {
  brand: string;
  platform?: Platform;
  dateStart?: string;
  dateEnd?: string;
  limit?: number;
  offset?: number;
  search?: string;
}

function rowToPost(r: Record<string, unknown>): Post {
  return {
    brand: r.brand as string, platform: r.platform as Platform,
    postTime: r.post_time as string, username: r.username as string | null,
    content: r.content as string | null, postUrl: r.post_url as string | null,
    mediaType: r.media_type as string | null, likes: r.likes as number | null,
    comments: r.comments as number | null, followerCount: r.follower_count as number | null,
    engagementTotal: r.engagement_total as number | null,
    metrics: (r.metrics as Record<string, number>) ?? {},
    sources: (r.sources as PostSource[]) ?? [],
  };
}

export async function listBrands() {
  const supa = createServiceClient();
  const { data, error } = await supa.from('brands').select('*').order('sort_order');
  if (error) throw error;
  return data;
}

export async function queryPosts(args: QueryArgs): Promise<Post[]> {
  const supa = createServiceClient();
  let q = supa.from('posts').select('*').eq('brand', args.brand)
    .order('engagement_total', { ascending: false, nullsFirst: false });
  if (args.platform) q = q.eq('platform', args.platform);
  if (args.dateStart) q = q.gte('post_time', args.dateStart);
  if (args.dateEnd) q = q.lte('post_time', args.dateEnd);
  if (args.search) q = q.ilike('content', `%${args.search}%`);
  if (args.limit) q = q.range(args.offset ?? 0, (args.offset ?? 0) + args.limit - 1);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToPost);
}

export async function getKpis(
  args: { brand: string; dateStart?: string; dateEnd?: string },
): Promise<{ kpis: PlatformKpis[]; trends: Record<Platform, TrendPoint[]> }> {
  // KPI 需要全量（不分頁）才能算正確的 +2σ 與總量；趨勢搭同一份資料順帶算出（零額外查詢）
  const all = await queryPosts({ ...args });
  return {
    kpis: computeKpis(all),
    trends: computeTrends(all, args.dateStart, args.dateEnd),
  };
}
