import { NextRequest, NextResponse } from 'next/server';
import { deriveDateRange } from '@/lib/data/reports';
import { DEFAULT_BRAND } from '@/lib/config';

// 回傳該品牌資料的實際日期範圍（給前端設預設視窗用）
export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get('brand') ?? DEFAULT_BRAND;
  try {
    return NextResponse.json(await deriveDateRange(brand));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
