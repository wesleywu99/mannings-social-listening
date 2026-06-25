import { describe, it, expect, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const hasEnv = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const d = hasEnv ? describe : describe.skip;

const supa = hasEnv
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })
  : null;

const TEST_URL = 'test://dedup-merge-1';

d('posts dedup + merge trigger', () => {
  afterAll(async () => {
    await supa!.from('posts').delete().eq('post_url', TEST_URL);
  });

  it('re-ingesting the same post merges sources and refreshes engagement', async () => {
    await supa!.from('posts').delete().eq('post_url', TEST_URL);

    // 第一次：關鍵字監測抓到，互動 100
    await supa!.from('posts').insert({
      brand: 'Mannings', platform: 'threads', post_time: '2024-03-01T00:00:00Z',
      post_url: TEST_URL, engagement_total: 100,
      sources: [{ type: 'keyword', value: '保健品' }],
    });

    // 第二次：hashtag 監測抓到同一則，互動漲到 250
    await supa!.from('posts').insert({
      brand: 'Mannings', platform: 'threads', post_time: '2024-03-01T00:00:00Z',
      post_url: TEST_URL, engagement_total: 250,
      sources: [{ type: 'hashtag', value: '#萬寧' }],
    });

    const { data } = await supa!.from('posts').select('engagement_total,sources').eq('post_url', TEST_URL);
    expect(data).toHaveLength(1);                       // 沒有重複列
    expect(data![0].engagement_total).toBe(250);        // 互動刷新成最新
    const vals = (data![0].sources as { value: string }[]).map((s) => s.value).sort();
    expect(vals).toEqual(['#萬寧', '保健品'].sort());   // sources 合併
  });

  it('re-ingesting an identical source does not duplicate it', async () => {
    await supa!.from('posts').insert({
      brand: 'Mannings', platform: 'threads', post_time: '2024-03-01T00:00:00Z',
      post_url: TEST_URL, engagement_total: 300,
      sources: [{ type: 'keyword', value: '保健品' }],
    });
    const { data } = await supa!.from('posts').select('sources').eq('post_url', TEST_URL);
    const keywordCount = (data![0].sources as { type: string; value: string }[])
      .filter((s) => s.type === 'keyword' && s.value === '保健品').length;
    expect(keywordCount).toBe(1);                       // union 去重，不重複
  });
});
