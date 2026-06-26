import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { tagPosts } from '@/lib/ai/sentiment';
import type { Post } from '@/lib/domain/types';

export const maxDuration = 120;

/** n8n 入庫後呼叫：批量標記指定 post ids 的 sentiment */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids: number[] = Array.isArray(body.post_ids) ? body.post_ids : [];
    if (!ids.length) {
      return NextResponse.json({ error: 'post_ids 必填（陣列）' }, { status: 400 });
    }

    const supa = createServiceClient();
    const { data, error } = await supa
      .from('posts')
      .select('id, brand, platform, post_time, username, content')
      .in('id', ids)
      .is('sentiment', null);
    if (error) throw error;

    const posts = (data ?? []) as unknown as Post[];
    if (!posts.length) {
      return NextResponse.json({ tagged: 0, message: '無待標記貼文' });
    }

    const tags = await tagPosts(posts);
    let written = 0;
    for (const t of tags) {
      const { error: upErr } = await supa
        .from('posts')
        .update({ sentiment: t.sentiment, sentiment_score: t.score })
        .eq('id', t.id);
      if (upErr) throw upErr;
      written++;
    }
    return NextResponse.json({ tagged: written, total: posts.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
