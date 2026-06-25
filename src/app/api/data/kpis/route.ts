import { NextRequest, NextResponse } from 'next/server';
import { getKpis } from '@/lib/data/posts';
import { DEFAULT_BRAND } from '@/lib/config';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const brand = sp.get('brand') ?? DEFAULT_BRAND;
  const kpis = await getKpis({
    brand,
    dateStart: sp.get('start') ?? undefined,
    dateEnd: sp.get('end') ?? undefined,
  });
  return NextResponse.json(kpis);
}
