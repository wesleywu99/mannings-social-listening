import { NextRequest, NextResponse } from 'next/server';
import { sendDigest } from '@/lib/email/sendDigest';

export const maxDuration = 120;

// 寄送每日摘要給訂閱者（n8n 排程或手動觸發）。
// body 可帶 { to:[...] } 測試寄送、{ day:'YYYY-MM-DD' } 指定報告日（預設港時昨日）。
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await sendDigest({ brand: body.scope?.brand, to: body.to, day: body.day });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
