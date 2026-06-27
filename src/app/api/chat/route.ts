import { NextRequest } from 'next/server';
import { runChatStream } from '@/lib/ai/agent';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { messages, scope } = await req.json();
    if (!Array.isArray(messages) || !scope?.brand) {
      return new Response(JSON.stringify({ error: 'messages and scope.brand required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        try {
          for await (const ev of runChatStream(messages, scope)) {
            send(ev);
          }
        } catch (e) {
          send({ type: 'error', message: String(e) });
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
