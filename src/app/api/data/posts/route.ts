import { NextRequest, NextResponse } from 'next/server';
import { queryPosts } from '@/lib/data/posts';
import type { Platform } from '@/lib/domain/types';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const rows = await queryPosts({
    brand: sp.get('brand') ?? '我們的品牌',
    platform: (sp.get('platform') as Platform) ?? undefined,
    dateStart: sp.get('start') ?? undefined,
    dateEnd: sp.get('end') ?? undefined,
    search: sp.get('q') ?? undefined,
    limit: Number(sp.get('limit') ?? 50),
    offset: Number(sp.get('offset') ?? 0),
  });
  return NextResponse.json(rows);
}
