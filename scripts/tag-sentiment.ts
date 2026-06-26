import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { tagPostsConcurrent } from '../src/lib/ai/sentiment';
import type { Post } from '../src/lib/domain/types';

async function main() {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // 查所有 sentiment IS NULL 的貼文（只取標記所需欄位）
  const { data, error } = await supa
    .from('posts')
    .select('id, brand, platform, post_time, username, content')
    .is('sentiment', null)
    .order('id');
  if (error) throw error;

  const posts = (data ?? []) as unknown as Post[];
  console.log(`[tag-sentiment] 找到 ${posts.length} 篇待標記貼文`);
  if (!posts.length) { console.log('無需標記'); return; }

  const tags = await tagPostsConcurrent(posts, (done, total) => {
    console.log(`[tag-sentiment] 進度 ${Math.min(done, total)}/${total} (${Math.round(Math.min(done, total) / total * 100)}%)`);
  });

  console.log(`[tag-sentiment] 標記完成 ${tags.length} 筆，寫回 DB...`);

  // 分批 update（id 是 GENERATED ALWAYS 身份列，不能 upsert，只能 update）
  let written = 0;
  for (let i = 0; i < tags.length; i += 100) {
    const batch = tags.slice(i, i + 100);
    for (const t of batch) {
      const { error: upErr } = await supa
        .from('posts')
        .update({ sentiment: t.sentiment, sentiment_score: t.score })
        .eq('id', t.id);
      if (upErr) console.error(`[tag-sentiment] update id=${t.id} 失敗:`, upErr);
      else written++;
    }
  }
  console.log(`[tag-sentiment] 寫回 ${written} 筆完成`);

  // 統計結果
  const { data: stats } = await supa
    .from('posts')
    .select('sentiment')
    .not('sentiment', 'is', null);
  const cnt = { pos: 0, neu: 0, neg: 0 };
  for (const r of (stats ?? [])) cnt[r.sentiment as keyof typeof cnt]++;
  console.log(`[tag-sentiment] 分布: pos=${cnt.pos} neu=${cnt.neu} neg=${cnt.neg}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
