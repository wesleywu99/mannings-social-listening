import { config } from 'dotenv';
config({ path: '.env.local' });   // 讀 .env.local（版本穩定，不依賴 Node --env-file）
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { normalizeRow } from '../src/lib/domain/normalize';
import type { Platform } from '../src/lib/domain/types';

const XLSX_PATH = process.argv[2]
  ?? 'C:/Users/wesleywu/Downloads/App Script/Mannings BoostUp Report.xlsx';
const BRAND = '我們的品牌';
const SHEET_TO_PLATFORM: Record<string, Platform> = {
  Threads: 'threads', IG: 'ig', FB: 'fb',
};

async function main() {
  const wb = XLSX.read(readFileSync(XLSX_PATH));
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  for (const [sheet, platform] of Object.entries(SHEET_TO_PLATFORM)) {
    const ws = wb.Sheets[sheet];
    if (!ws) { console.warn(`sheet ${sheet} missing`); continue; }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    const posts = rows
      .filter((r) => r['Post URL'])
      .map((r) => {
        const p = normalizeRow(platform, BRAND, r);
        return {
          brand: p.brand, platform: p.platform, post_time: p.postTime,
          username: p.username, content: p.content, post_url: p.postUrl,
          media_type: p.mediaType, likes: p.likes, comments: p.comments,
          follower_count: p.followerCount, engagement_total: p.engagementTotal,
          metrics: p.metrics,
        };
      });
    for (let i = 0; i < posts.length; i += 500) {
      const batch = posts.slice(i, i + 500);
      const { error } = await supa.from('posts')
        .upsert(batch, { onConflict: 'platform,post_url' });
      if (error) throw error;
    }
    console.log(`${sheet}: upserted ${posts.length} rows`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
