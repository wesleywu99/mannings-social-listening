import { NextRequest, NextResponse } from 'next/server';
import { runChat } from '@/lib/ai/agent';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { messages, scope } = await req.json();
    if (!Array.isArray(messages) || !scope?.brand) {
      return NextResponse.json({ error: 'messages and scope.brand required' }, { status: 400 });
    }
    const result = await runChat(messages, scope);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
