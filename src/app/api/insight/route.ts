import { NextRequest, NextResponse } from 'next/server';
import { runInsight } from '@/lib/ai/agent';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { post, scope } = await req.json();
    if (!post?.platform || !scope?.brand) {
      return NextResponse.json({ error: 'post and scope.brand required' }, { status: 400 });
    }
    const insight = await runInsight(post, scope);
    return NextResponse.json({ insight });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
