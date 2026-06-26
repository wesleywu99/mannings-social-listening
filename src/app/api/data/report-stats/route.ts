import { NextRequest, NextResponse } from 'next/server';
import { buildTools } from '@/lib/ai/tools';
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
    const [byPlatform, byMedia, creators, igTier] = await Promise.all([
      tools.aggregate_metrics.run({ group_by: 'platform' }),
      tools.aggregate_metrics.run({ group_by: 'media_type' }),
      tools.top_creators.run({ limit: 5 }),
      tools.ig_tier_analysis.run({}),
    ]);
    return NextResponse.json({ byPlatform, byMedia, creators, igTier });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
