import { NextRequest, NextResponse } from 'next/server';
import { getKpis } from '@/lib/data/posts';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const brand = sp.get('brand') ?? '我們的品牌';
  const kpis = await getKpis({
    brand,
    dateStart: sp.get('start') ?? undefined,
    dateEnd: sp.get('end') ?? undefined,
  });
  return NextResponse.json(kpis);
}
