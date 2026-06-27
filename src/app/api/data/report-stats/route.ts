import { NextRequest, NextResponse } from 'next/server';
import { buildTools } from '@/lib/ai/tools';
import { queryPosts } from '@/lib/data/posts';
import { computeHeatmap } from '@/lib/domain/aggregate';
import { DEFAULT_BRAND } from '@/lib/config';
import type { Scope } from '@/lib/ai/types';

// 報告各模塊左側圖表用的聚合數據（複用 AI 工具層的確定性計算）
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const start = sp.get('start');
  const end = sp.get('end');
  const scope: Scope = {
    brand: sp.get('brand') ?? DEFAULT_BRAND,
    dateStart: start ? `${start}T00:00:00` : undefined,
    dateEnd: end ? `${end}T23:59:59` : undefined,
  };
  try {
    const tools = Object.fromEntries(buildTools(scope).map((t) => [t.name, t]));
    const [byPlatformStats, creators, sentiment, allPosts] = await Promise.all([
      tools.engagement_stats.run({ group_by: 'platform' }),
      tools.creator_ranking.run({ limit: 5 }),
      tools.sentiment_analysis.run({}),
      queryPosts({ brand: scope.brand, dateStart: scope.dateStart, dateEnd: scope.dateEnd }),
    ]);
    const heatmap = computeHeatmap(allPosts);
    // 媒體分組要另外查（engagement_stats group_by=media_type）
    const byMedia = await tools.engagement_stats.run({ group_by: 'media_type' });
    const igTier = { tiers: [] };  // 舊 ig_tier_analysis 已移除，保留空避免前端壞
    return NextResponse.json({
      byPlatform: byPlatformStats,
      byMedia,
      creators,
      igTier,
      heatmap,
      sentiment,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
