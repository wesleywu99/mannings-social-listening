import { NextRequest, NextResponse } from 'next/server';
import { listSubscribers, addSubscriber, removeSubscriber, isValidEmail } from '@/lib/data/subscribers';

export async function GET() {
  try {
    return NextResponse.json(await listSubscribers());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || !isValidEmail(String(email))) {
      return NextResponse.json({ error: '請輸入有效的 email' }, { status: 400 });
    }
    await addSubscriber(String(email));
    return NextResponse.json(await listSubscribers());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });
    await removeSubscriber(String(email));
    return NextResponse.json(await listSubscribers());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
