import { NextRequest, NextResponse } from 'next/server';
import { sendReport } from '@/lib/email/sendReport';

export const maxDuration = 120;

// 寄送最新報告給訂閱者（n8n 排程或手動觸發）。body 可帶 { to:[...] } 做測試寄送。
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await sendReport({ brand: body.scope?.brand, to: body.to });
    if (!result.report) return NextResponse.json({ error: '尚未生成報告，請先生成日報' }, { status: 400 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
