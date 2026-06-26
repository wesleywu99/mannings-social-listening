import { NextRequest, NextResponse } from 'next/server';
import { runModuleInsight } from '@/lib/ai/agent';
import type { Platform } from '@/lib/domain/types';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { platform, scope } = await req.json();
    if (!platform || !scope?.brand) {
      return NextResponse.json({ error: 'platform and scope.brand required' }, { status: 400 });
    }
    const insight = await runModuleInsight(platform as Platform, scope);
    return NextResponse.json({ insight });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
