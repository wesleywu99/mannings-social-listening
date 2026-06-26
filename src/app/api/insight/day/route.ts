import { NextRequest, NextResponse } from 'next/server';
import { runDayInsight } from '@/lib/ai/agent';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { date, scope } = await req.json();
    if (!date || !scope?.brand) {
      return NextResponse.json({ error: 'date and scope.brand required' }, { status: 400 });
    }
    const insight = await runDayInsight(date, scope);
    return NextResponse.json(insight);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
