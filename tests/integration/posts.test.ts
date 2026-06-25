import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';

beforeAll(() => { config({ path: '.env.local' }); });

const hasEnv = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const d = hasEnv ? describe : describe.skip;

d('posts data layer (integration)', () => {
  it('listBrands includes 我們的品牌', async () => {
    const { listBrands } = await import('@/lib/data/posts');
    const brands = await listBrands();
    expect(brands.some((b: { name: string }) => b.name === '我們的品牌')).toBe(true);
  });

  it('queryPosts returns rows for threads scoped to brand', async () => {
    const { queryPosts } = await import('@/lib/data/posts');
    const rows = await queryPosts({ brand: '我們的品牌', platform: 'threads', limit: 5 });
    expect(Array.isArray(rows)).toBe(true);
    if (rows.length) expect(rows[0].platform).toBe('threads');
  });

  it('getKpis returns 3 platform entries', async () => {
    const { getKpis } = await import('@/lib/data/posts');
    const kpis = await getKpis({ brand: '我們的品牌' });
    expect(kpis).toHaveLength(3);
  });
});
