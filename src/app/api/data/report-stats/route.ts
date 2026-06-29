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
    // 全部為確定性計算（不含 LLM）。話題分析改由報告生成時快取（report.topicsData），此處不再即時跑 topic_analysis，避免每次載入都呼叫 AI。
    const [byPlatformStats, byMedia, creators, sentiment, allPosts] = await Promise.all([
      tools.engagement_stats.run({ group_by: 'platform' }),
      tools.engagement_stats.run({ group_by: 'media_type' }),
      tools.creator_ranking.run({ limit: 5 }),
      tools.sentiment_analysis.run({}),
      queryPosts({ brand: scope.brand, dateStart: scope.dateStart, dateEnd: scope.dateEnd }),
    ]);
    const heatmap = computeHeatmap(allPosts);
    return NextResponse.json({
      byPlatform: byPlatformStats,
      byMedia,
      creators,
      heatmap,
      sentiment,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
