import { NextRequest, NextResponse } from 'next/server';
import { runReport } from '@/lib/ai/report';
import { saveReport, getLatestReport, deriveDateRange } from '@/lib/data/reports';
import { DEFAULT_BRAND } from '@/lib/config';

export const maxDuration = 120;

// 取最新已快取報告
export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get('brand') ?? DEFAULT_BRAND;
  try {
    return NextResponse.json(await getLatestReport(brand));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// 生成 + 儲存報告（n8n 排程或前端「重新生成」都呼叫此）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const scope = body.scope ?? {};
    const brand: string = scope.brand ?? DEFAULT_BRAND;
    let { dateStart, dateEnd } = scope as { dateStart?: string; dateEnd?: string };
    if (!dateStart || !dateEnd) {
      const r = await deriveDateRange(brand);
      dateStart = dateStart || r.start;
      dateEnd = dateEnd || r.end;
    }
    const { sections, topicsData } = await runReport({ brand, dateStart, dateEnd });
    await saveReport(brand, dateStart.slice(0, 10), dateEnd.slice(0, 10), sections, topicsData);
    return NextResponse.json({ ...sections, topicsData, brand, dateStart: dateStart.slice(0, 10), dateEnd: dateEnd.slice(0, 10), generatedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
