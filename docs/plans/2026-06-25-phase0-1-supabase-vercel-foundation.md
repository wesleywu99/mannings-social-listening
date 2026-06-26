# Phase 0 + 1：Supabase 地基 + 監控儀表板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 Supabase 資料地基、把現有資料回填，並交付一個可上線的監控儀表板（Page 1），資料來自 Supabase。

**Architecture:** 單一 `posts` 表（`brand` + `platform` 兩個切分維度）。Next.js App Router；瀏覽器永不直連 Supabase，所有讀取走 `/api/*` 伺服路由（service-role key）；`?token=mannings` middleware gate。純邏輯（normalize / +2σ / 聚合）抽成可單元測試的模組。

**Tech Stack:** Next.js 15 (App Router, TypeScript)、Tailwind、Chart.js、`@supabase/supabase-js`、Vitest、Supabase CLI（migration）、SheetJS `xlsx`（回填）。

> **工具選擇理由：** npm（零額外安裝、最通用）；Vitest（TS 原生、快、與 Next.js 相容）；Supabase CLI migration（schema 版本控管、可重現，勝過手貼 SQL）。

---

## File Structure

專案根：`C:/Users/wesleywu/Downloads/App Script/webapp`（以下路徑相對此根）

| 檔案 | 責任 |
|---|---|
| `supabase/migrations/0001_init.sql` | 建 `posts` / `ai_reports` / `brands` 表 + 索引 + 約束 |
| `supabase/migrations/0002_seed_brands.sql` | 種入 `我們的品牌` |
| `src/lib/domain/platforms.ts` | 三平台的欄位對應設定（單一事實來源） |
| `src/lib/domain/normalize.ts` | 純函式：raw 平台 row → 統一 `Post`（含 metrics jsonb） |
| `src/lib/domain/engagement.ts` | 純函式：+2σ 異常判定、中位數、百分位 |
| `src/lib/domain/aggregate.ts` | 純函式：posts[] → KPI（帖數/總互動/均值/爆款率） |
| `src/lib/supabase/server.ts` | service-role Supabase client（僅伺服端） |
| `src/lib/data/posts.ts` | 資料存取：queryPosts / getKpis / listBrands |
| `src/lib/auth.ts` | 純函式：`isAuthorized(token)` |
| `middleware.ts` | token gate，套用到 `/api/*` 與頁面 |
| `scripts/backfill.ts` | 解析 xlsx → upsert 進 posts |
| `src/app/api/data/kpis/route.ts` | KPI API |
| `src/app/api/data/posts/route.ts` | 貼文表格 API（分頁/篩選/排序） |
| `src/app/api/data/brands/route.ts` | 品牌清單 API |
| `src/app/monitor/page.tsx` | Page 1 監控工作台（server component 殼） |
| `src/components/monitor/*` | PerspectiveSwitcher / PlatformTabs / KpiRow / PostsTable / charts |

**型別（在 `src/lib/domain/types.ts` 定義，全程共用）：**

```typescript
export type Platform = 'threads' | 'ig' | 'fb';

export interface Post {
  brand: string;
  platform: Platform;
  postTime: string;        // ISO 8601
  username: string | null;
  content: string | null;
  postUrl: string | null;
  mediaType: string | null;
  likes: number | null;
  comments: number | null;
  followerCount: number | null;
  engagementTotal: number | null;
  metrics: Record<string, number>;
}

export interface PlatformKpis {
  platform: Platform;
  postCount: number;
  totalEngagement: number;
  avgEngagement: number;    // 四捨五入到 1 位小數
  anomalyRate: number;      // 爆款率，0–1
}
```

---

## Phase 0 — Supabase 地基 + 回填

### Task 1: 初始化 webapp 專案骨架

**Files:**
- Create: `webapp/package.json`, `webapp/tsconfig.json`, `webapp/next.config.ts`, `webapp/vitest.config.ts`, `webapp/.gitignore`, `webapp/.env.example`

- [ ] **Step 1: 建立 Next.js 專案**

在 `C:/Users/wesleywu/Downloads/App Script` 執行：

```bash
npx create-next-app@latest webapp --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```
全部提示用預設即可。

- [ ] **Step 2: 安裝相依套件**

```bash
cd webapp
npm install @supabase/supabase-js chart.js
npm install -D vitest @vitejs/plugin-react xlsx tsx
```

- [ ] **Step 3: 建立 `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
});
```

- [ ] **Step 4: 加測試指令到 `package.json` 的 scripts**

```json
"test": "vitest run",
"test:watch": "vitest",
"backfill": "tsx scripts/backfill.ts"
```

- [ ] **Step 5: 建立 `.env.example`**

```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
APP_ACCESS_TOKEN=mannings
```

並確認 `.gitignore` 含 `.env.local`。

- [ ] **Step 6: 驗證骨架可跑**

Run: `npm run test`
Expected: Vitest 執行（0 個測試，no test files found 也算通過，exit 0）。

- [ ] **Step 7: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold Next.js webapp"
```

---

### Task 2: 資料庫 migration（posts / ai_reports / brands）

**Files:**
- Create: `webapp/supabase/migrations/0001_init.sql`
- Create: `webapp/supabase/migrations/0002_seed_brands.sql`

- [ ] **Step 1: 初始化 Supabase CLI 連結**

前置：在 supabase.com 建一個 project，取得 project ref、`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`，寫入 `webapp/.env.local`。

```bash
cd webapp
npx supabase init
npx supabase link --project-ref <你的-project-ref>
```

- [ ] **Step 2: 寫 `0001_init.sql`**

```sql
create table if not exists posts (
  id               bigint generated always as identity primary key,
  brand            text not null,
  platform         text not null check (platform in ('threads','ig','fb')),
  post_time        timestamptz not null,
  username         text,
  content          text,
  post_url         text,
  media_type       text,
  likes            int,
  comments         int,
  follower_count   int,
  engagement_total int,
  metrics          jsonb not null default '{}'::jsonb,
  ingested_at      timestamptz not null default now(),
  unique (platform, post_url)
);
create index if not exists posts_brand_platform_time_idx
  on posts (brand, platform, post_time desc);

create table if not exists ai_reports (
  id           bigint generated always as identity primary key,
  brand        text not null,
  date_start   date not null,
  date_end     date not null,
  generated_at timestamptz not null default now(),
  summary text, advice text, content text,
  platform text, kol text, ig_rate text,
  unique (brand, date_start, date_end)
);

create table if not exists brands (
  id               bigint generated always as identity primary key,
  name             text unique not null,
  is_own           boolean not null default false,
  platform_handles jsonb,
  sort_order       int not null default 0
);
```

- [ ] **Step 3: 寫 `0002_seed_brands.sql`**

```sql
insert into brands (name, is_own, sort_order)
values ('我們的品牌', true, 0)
on conflict (name) do nothing;
```

- [ ] **Step 4: 套用 migration 到遠端**

```bash
npx supabase db push
```
Expected: 顯示 `0001_init.sql`、`0002_seed_brands.sql` 已套用。

- [ ] **Step 5: 驗證表存在**

```bash
npx supabase db remote query "select table_name from information_schema.tables where table_schema='public' order by 1;"
```
Expected: 列出 `ai_reports`、`brands`、`posts`。

- [ ] **Step 6: Commit**

```bash
git add supabase && git commit -m "feat: supabase schema (posts, ai_reports, brands)"
```

---

### Task 3: 平台欄位對應設定

**Files:**
- Create: `webapp/src/lib/domain/types.ts`（貼上上方「型別」區塊全文）
- Create: `webapp/src/lib/domain/platforms.ts`

- [ ] **Step 1: 寫 `types.ts`**

貼上本計畫「File Structure → 型別」區塊的完整內容。

- [ ] **Step 2: 寫 `platforms.ts`（單一事實來源，描述每平台 raw 欄位→Post 的對應）**

```typescript
import type { Platform } from './types';

/** 每平台：likes 來源欄、comments 來源欄、是否有 follower、哪些欄進 metrics */
export interface PlatformSchema {
  platform: Platform;
  likesField: string;
  commentsField: string;
  hasFollower: boolean;
  metricFields: string[];   // 進 metrics jsonb 的 raw 欄位名
}

export const PLATFORM_SCHEMAS: Record<Platform, PlatformSchema> = {
  threads: {
    platform: 'threads',
    likesField: 'Likes',
    commentsField: 'Comments',
    hasFollower: false,
    metricFields: ['Quotes', 'Reposts', 'Reshares'],
  },
  ig: {
    platform: 'ig',
    likesField: 'Likes',
    commentsField: 'Comments',
    hasFollower: true,
    metricFields: [],
  },
  fb: {
    platform: 'fb',
    likesField: 'Like',
    commentsField: 'Comments',
    hasFollower: false,
    metricFields: ['Love', 'Care', 'Haha', 'Wow', 'Sad', 'Angry', 'Reshares'],
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/domain && git commit -m "feat: domain types + platform schemas"
```

---

### Task 4: normalize 純函式（raw row → Post）

**Files:**
- Create: `webapp/src/lib/domain/normalize.ts`
- Test: `webapp/tests/unit/normalize.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeRow } from '@/lib/domain/normalize';

describe('normalizeRow', () => {
  it('maps a Threads row into a Post with metrics jsonb', () => {
    const raw = {
      'Post Time': '2024-03-01 12:00:00', Username: '@a', Content: 'hi',
      Likes: 10, Comments: 2, Quotes: 1, Reposts: 3, Reshares: 4,
      'Post URL': 'https://t/1', 'Media Type': 'image', Engagement_Total: 20,
    };
    const post = normalizeRow('threads', '我們的品牌', raw);
    expect(post.platform).toBe('threads');
    expect(post.likes).toBe(10);
    expect(post.followerCount).toBeNull();
    expect(post.metrics).toEqual({ quotes: 1, reposts: 3, reshares: 4 });
    expect(post.engagementTotal).toBe(20);
    expect(post.postTime).toBe(new Date('2024-03-01 12:00:00').toISOString());
  });

  it('maps an IG row including follower_count', () => {
    const raw = {
      'Post Time': '2024-03-02 09:30:00', Username: '@b', Content: 'yo',
      Likes: 50, Comments: 5, 'Post URL': 'https://i/2', 'Media Type': 'reel',
      Follower_Count: 12000, Engagement_Total: 55,
    };
    const post = normalizeRow('ig', '我們的品牌', raw);
    expect(post.followerCount).toBe(12000);
    expect(post.metrics).toEqual({});
  });

  it('maps an FB row: likes from Like, reactions into metrics', () => {
    const raw = {
      'Post Time': '2024-03-03 18:00:00', Username: '@c', Content: 'fb',
      Like: 7, Love: 2, Care: 0, Haha: 1, Wow: 0, Sad: 0, Angry: 0,
      Comments: 3, Reshares: 1, 'Post URL': 'https://f/3', 'Media Type': 'text',
      Engagement_Total: 14,
    };
    const post = normalizeRow('fb', '我們的品牌', raw);
    expect(post.likes).toBe(7);
    expect(post.metrics).toEqual({ love: 2, care: 0, haha: 1, wow: 0, sad: 0, angry: 0, reshares: 1 });
  });

  it('returns null for blank/missing numeric fields', () => {
    const post = normalizeRow('ig', '我們的品牌', { 'Post Time': '2024-03-02', 'Post URL': 'x' });
    expect(post.likes).toBeNull();
    expect(post.engagementTotal).toBeNull();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/unit/normalize.test.ts`
Expected: FAIL（`normalizeRow` is not defined）。

- [ ] **Step 3: 實作 `normalize.ts`**

```typescript
import type { Platform, Post } from './types';
import { PLATFORM_SCHEMAS } from './platforms';

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

export function normalizeRow(
  platform: Platform,
  brand: string,
  raw: Record<string, unknown>,
): Post {
  const schema = PLATFORM_SCHEMAS[platform];
  const metrics: Record<string, number> = {};
  for (const field of schema.metricFields) {
    const n = num(raw[field]);
    metrics[field.toLowerCase()] = n ?? 0;
  }
  const rawTime = raw['Post Time'];
  return {
    brand,
    platform,
    postTime: new Date(String(rawTime)).toISOString(),
    username: str(raw['Username']),
    content: str(raw['Content']),
    postUrl: str(raw['Post URL']),
    mediaType: str(raw['Media Type']),
    likes: num(raw[schema.likesField]),
    comments: num(raw[schema.commentsField]),
    followerCount: schema.hasFollower ? num(raw['Follower_Count']) : null,
    engagementTotal: num(raw['Engagement_Total']),
    metrics,
  };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/unit/normalize.test.ts`
Expected: PASS（4 個測試）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/normalize.ts tests/unit/normalize.test.ts
git commit -m "feat: normalizeRow with per-platform field mapping"
```

---

### Task 5: 回填腳本（xlsx → posts）

**Files:**
- Create: `webapp/scripts/backfill.ts`
- Create: `webapp/src/lib/supabase/server.ts`

- [ ] **Step 1: 寫 service-role client `server.ts`**

```typescript
import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}
```

> 註：`scripts/backfill.ts` 在 Node 直跑（非 Next 伺服器），不能 import `server-only`。腳本內自行 `createClient`，不要 import 此檔。

- [ ] **Step 2: 寫 `backfill.ts`**

```typescript
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
    // 分批 upsert，衝突鍵 (platform, post_url)
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
```

- [ ] **Step 3: 安裝 dotenv（腳本讀 .env.local）**

```bash
npm install -D dotenv
```
`backfill.ts` 已用 `dotenv` 讀 `.env.local`。在 `package.json` 設：
```json
"backfill": "tsx scripts/backfill.ts"
```

- [ ] **Step 4: 執行回填**

```bash
npm run backfill
```
Expected: 印出三行 `Threads/IG/FB: upserted N rows`，N > 0。

- [ ] **Step 5: 驗證資料筆數**

```bash
npx supabase db remote query "select platform, count(*) from posts group by platform order by 1;"
```
Expected: threads / ig / fb 三列，count 與 xlsx 各 sheet 資料列數相符。

- [ ] **Step 6: 再跑一次確認冪等**

Run: `npm run backfill` 再執行一次，重查上面 count。
Expected: count 不變（upsert 冪等，無重複）。

- [ ] **Step 7: Commit**

```bash
git add scripts/backfill.ts src/lib/supabase/server.ts package.json
git commit -m "feat: xlsx backfill into posts (idempotent upsert)"
```

---

## Phase 1 — Next.js app + 監控頁

### Task 6: +2σ 與統計純函式

**Files:**
- Create: `webapp/src/lib/domain/engagement.ts`
- Test: `webapp/tests/unit/engagement.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
import { describe, it, expect } from 'vitest';
import { anomalyThreshold, isAnomaly, median } from '@/lib/domain/engagement';

describe('engagement stats', () => {
  it('median of odd/even sets', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it('anomalyThreshold = mean + 2*populationStdDev', () => {
    // [10,10,10,10,50] mean=18, var=256, sd=16 -> threshold=50
    expect(anomalyThreshold([10, 10, 10, 10, 50])).toBeCloseTo(50, 5);
  });

  it('returns Infinity when sample size <= 3 (avoid small-sample noise)', () => {
    expect(anomalyThreshold([100, 1, 1])).toBe(Infinity);
  });

  it('isAnomaly flags values strictly above threshold', () => {
    const vals = [10, 10, 10, 10, 50];
    expect(isAnomaly(51, vals)).toBe(true);
    expect(isAnomaly(50, vals)).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/unit/engagement.test.ts`
Expected: FAIL（functions not defined）。

- [ ] **Step 3: 實作 `engagement.ts`**

```typescript
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function anomalyThreshold(values: number[]): number {
  if (values.length <= 3) return Infinity;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return mean + 2 * Math.sqrt(variance);
}

export function isAnomaly(value: number, population: number[]): boolean {
  return value > anomalyThreshold(population);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/unit/engagement.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/engagement.ts tests/unit/engagement.test.ts
git commit -m "feat: +2sigma anomaly + median stats"
```

---

### Task 7: KPI 聚合純函式

**Files:**
- Create: `webapp/src/lib/domain/aggregate.ts`
- Test: `webapp/tests/unit/aggregate.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
import { describe, it, expect } from 'vitest';
import { computeKpis } from '@/lib/domain/aggregate';
import type { Post } from '@/lib/domain/types';

function post(platform: Post['platform'], eng: number): Post {
  return {
    brand: '我們的品牌', platform, postTime: '2024-03-01T00:00:00Z',
    username: '@x', content: '', postUrl: `u${Math.random()}`, mediaType: 'text',
    likes: 0, comments: 0, followerCount: null, engagementTotal: eng, metrics: {},
  };
}

describe('computeKpis', () => {
  it('aggregates per platform with anomaly rate', () => {
    const posts = [
      ...[10, 10, 10, 10, 50].map((e) => post('threads', e)), // threshold 50 -> 0 anomalies
      post('ig', 5), post('ig', 5),
    ];
    const kpis = computeKpis(posts);
    const threads = kpis.find((k) => k.platform === 'threads')!;
    expect(threads.postCount).toBe(5);
    expect(threads.totalEngagement).toBe(90);
    expect(threads.avgEngagement).toBe(18);
    expect(threads.anomalyRate).toBe(0);
    const ig = kpis.find((k) => k.platform === 'ig')!;
    expect(ig.postCount).toBe(2);
    expect(ig.totalEngagement).toBe(10);
  });

  it('treats null engagement as 0', () => {
    const p = post('fb', 0); p.engagementTotal = null;
    const kpis = computeKpis([p]);
    expect(kpis.find((k) => k.platform === 'fb')!.totalEngagement).toBe(0);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/unit/aggregate.test.ts`
Expected: FAIL。

- [ ] **Step 3: 實作 `aggregate.ts`**

```typescript
import type { Platform, Post, PlatformKpis } from './types';
import { anomalyThreshold } from './engagement';

const PLATFORMS: Platform[] = ['threads', 'ig', 'fb'];

export function computeKpis(posts: Post[]): PlatformKpis[] {
  return PLATFORMS.map((platform) => {
    const group = posts.filter((p) => p.platform === platform);
    const engs = group.map((p) => p.engagementTotal ?? 0);
    const total = engs.reduce((a, b) => a + b, 0);
    const count = group.length;
    const threshold = anomalyThreshold(engs);
    const anomalies = engs.filter((e) => e > threshold).length;
    return {
      platform,
      postCount: count,
      totalEngagement: total,
      avgEngagement: count ? Math.round((total / count) * 10) / 10 : 0,
      anomalyRate: count ? anomalies / count : 0,
    };
  });
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/unit/aggregate.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/aggregate.ts tests/unit/aggregate.test.ts
git commit -m "feat: per-platform KPI aggregation"
```

---

### Task 8: token gate（純函式 + middleware）

**Files:**
- Create: `webapp/src/lib/auth.ts`
- Test: `webapp/tests/unit/auth.test.ts`
- Create: `webapp/middleware.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
import { describe, it, expect } from 'vitest';
import { isAuthorized } from '@/lib/auth';

describe('isAuthorized', () => {
  it('accepts matching token', () => {
    expect(isAuthorized('mannings', 'mannings')).toBe(true);
  });
  it('rejects wrong/missing token', () => {
    expect(isAuthorized('nope', 'mannings')).toBe(false);
    expect(isAuthorized(null, 'mannings')).toBe(false);
  });
  it('rejects when no expected token configured', () => {
    expect(isAuthorized('mannings', undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/unit/auth.test.ts`
Expected: FAIL。

- [ ] **Step 3: 實作 `auth.ts`**

```typescript
export function isAuthorized(token: string | null, expected: string | undefined): boolean {
  if (!expected) return false;
  return token === expected;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/unit/auth.test.ts`
Expected: PASS。

- [ ] **Step 5: 實作 `middleware.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/auth';

export function middleware(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
    ?? req.cookies.get('app_token')?.value
    ?? null;
  if (!isAuthorized(token, process.env.APP_ACCESS_TOKEN)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  // 把 URL token 寫進 cookie，後續導頁免帶 query
  const res = NextResponse.next();
  if (req.nextUrl.searchParams.get('token')) {
    res.cookies.set('app_token', token!, { httpOnly: true, sameSite: 'lax' });
  }
  return res;
}

export const config = {
  matcher: ['/monitor/:path*', '/api/:path*'],
};
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth.ts tests/unit/auth.test.ts middleware.ts
git commit -m "feat: token gate middleware + isAuthorized"
```

---

### Task 9: 資料存取層

**Files:**
- Create: `webapp/src/lib/data/posts.ts`
- Test: `webapp/tests/integration/posts.test.ts`

> 整合測試吃 `.env.local`，無 env 時自動 skip。用 `vitest run --env-file=.env.local` 或在測試開頭判斷。

- [ ] **Step 1: 寫整合測試（env-gated）**

```typescript
import { describe, it, expect } from 'vitest';
import { listBrands, queryPosts, getKpis } from '@/lib/data/posts';

const hasEnv = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const d = hasEnv ? describe : describe.skip;

d('posts data layer (integration)', () => {
  it('listBrands includes 我們的品牌', async () => {
    const brands = await listBrands();
    expect(brands.some((b) => b.name === '我們的品牌')).toBe(true);
  });

  it('queryPosts returns rows for threads scoped to brand', async () => {
    const rows = await queryPosts({ brand: '我們的品牌', platform: 'threads', limit: 5 });
    expect(Array.isArray(rows)).toBe(true);
    if (rows.length) expect(rows[0].platform).toBe('threads');
  });

  it('getKpis returns 3 platform entries', async () => {
    const kpis = await getKpis({ brand: '我們的品牌' });
    expect(kpis).toHaveLength(3);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/integration/posts.test.ts --env-file=.env.local`
Expected: FAIL（functions not defined）。

- [ ] **Step 3: 實作 `posts.ts`**

```typescript
import { createServiceClient } from '@/lib/supabase/server';
import { computeKpis } from '@/lib/domain/aggregate';
import type { Platform, Post, PlatformKpis } from '@/lib/domain/types';

interface QueryArgs {
  brand: string;
  platform?: Platform;
  dateStart?: string;
  dateEnd?: string;
  limit?: number;
  offset?: number;
  search?: string;
}

function rowToPost(r: Record<string, unknown>): Post {
  return {
    brand: r.brand as string, platform: r.platform as Platform,
    postTime: r.post_time as string, username: r.username as string | null,
    content: r.content as string | null, postUrl: r.post_url as string | null,
    mediaType: r.media_type as string | null, likes: r.likes as number | null,
    comments: r.comments as number | null, followerCount: r.follower_count as number | null,
    engagementTotal: r.engagement_total as number | null,
    metrics: (r.metrics as Record<string, number>) ?? {},
  };
}

export async function listBrands() {
  const supa = createServiceClient();
  const { data, error } = await supa.from('brands').select('*').order('sort_order');
  if (error) throw error;
  return data;
}

export async function queryPosts(args: QueryArgs): Promise<Post[]> {
  const supa = createServiceClient();
  let q = supa.from('posts').select('*').eq('brand', args.brand)
    .order('engagement_total', { ascending: false, nullsFirst: false });
  if (args.platform) q = q.eq('platform', args.platform);
  if (args.dateStart) q = q.gte('post_time', args.dateStart);
  if (args.dateEnd) q = q.lte('post_time', args.dateEnd);
  if (args.search) q = q.ilike('content', `%${args.search}%`);
  if (args.limit) q = q.range(args.offset ?? 0, (args.offset ?? 0) + args.limit - 1);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToPost);
}

export async function getKpis(args: { brand: string; dateStart?: string; dateEnd?: string }):
  Promise<PlatformKpis[]> {
  // KPI 需要全量（不分頁）才能算正確的 +2σ 與總量
  const all = await queryPosts({ ...args });
  return computeKpis(all);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/integration/posts.test.ts --env-file=.env.local`
Expected: PASS（3 個測試）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/posts.ts tests/integration/posts.test.ts
git commit -m "feat: posts data-access layer (queryPosts/getKpis/listBrands)"
```

---

### Task 10: API 路由

**Files:**
- Create: `webapp/src/app/api/data/brands/route.ts`
- Create: `webapp/src/app/api/data/kpis/route.ts`
- Create: `webapp/src/app/api/data/posts/route.ts`

- [ ] **Step 1: 寫 `brands/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { listBrands } from '@/lib/data/posts';

export async function GET() {
  return NextResponse.json(await listBrands());
}
```

- [ ] **Step 2: 寫 `kpis/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getKpis } from '@/lib/data/posts';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const brand = sp.get('brand') ?? '我們的品牌';
  const kpis = await getKpis({
    brand,
    dateStart: sp.get('start') ?? undefined,
    dateEnd: sp.get('end') ?? undefined,
  });
  return NextResponse.json(kpis);
}
```

- [ ] **Step 3: 寫 `posts/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { queryPosts } from '@/lib/data/posts';
import type { Platform } from '@/lib/domain/types';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const rows = await queryPosts({
    brand: sp.get('brand') ?? '我們的品牌',
    platform: (sp.get('platform') as Platform) ?? undefined,
    dateStart: sp.get('start') ?? undefined,
    dateEnd: sp.get('end') ?? undefined,
    search: sp.get('q') ?? undefined,
    limit: Number(sp.get('limit') ?? 50),
    offset: Number(sp.get('offset') ?? 0),
  });
  return NextResponse.json(rows);
}
```

- [ ] **Step 4: 手動驗證（需先 `npm run dev`）**

```bash
npm run dev
# 另開終端：
curl "http://localhost:3000/api/data/kpis?token=mannings&brand=%E6%88%91%E5%80%91%E7%9A%84%E5%93%81%E7%89%8C"
```
Expected: 回傳 3 筆平台 KPI 的 JSON。
再測 `curl "http://localhost:3000/api/data/kpis"`（不帶 token）→ Expected: `401 Unauthorized`。

- [ ] **Step 5: Commit**

```bash
git add src/app/api && git commit -m "feat: /api/data routes (brands, kpis, posts)"
```

---

### Task 11: 監控頁 UI（移植 數據監測工作台.html）

> 來源 markup：`C:/Users/wesleywu/Downloads/App Script/new/數據監測工作台.html`。把它拆成下列 React 元件，套用其既有 Tailwind class，並把 mock 數據換成從 `/api/data/*` 取得的真實資料。本任務以「能用真實資料渲染」為驗收，UI 細節以該檔為準。

**Files:**
- Create: `webapp/src/components/monitor/PerspectiveSwitcher.tsx`（品牌/競品卡，資料來自 `/api/data/brands` + 各 brand KPI；競品無資料時顯示「尚未連接競品數據源」空狀態）
- Create: `webapp/src/components/monitor/PlatformTabs.tsx`（Overview/Threads/IG/FB，控制 active platform state）
- Create: `webapp/src/components/monitor/KpiRow.tsx`（吃 `PlatformKpis`，渲染帖數/總互動/均篇互動/爆款率四卡）
- Create: `webapp/src/components/monitor/PostsTable.tsx`（吃 `Post[]`，渲染表格 + 分頁；`engagementTotal > 該視角 threshold` 顯示紅點）
- Create: `webapp/src/components/monitor/MonitorClient.tsx`（'use client'，持有 brand/platform/date state，呼叫 API，組合上述元件）
- Create: `webapp/src/app/monitor/page.tsx`（server component，render `<MonitorClient/>`）
- Modify: `webapp/src/app/page.tsx`（redirect 到 `/monitor`，保留 query token）

- [ ] **Step 1: 寫 `KpiRow.tsx`（最小可測單元先行）**

```tsx
import type { PlatformKpis } from '@/lib/domain/types';

export function KpiRow({ kpi }: { kpi: PlatformKpis }) {
  const cards = [
    { label: '貼文數', value: kpi.postCount.toLocaleString() },
    { label: '總互動量', value: kpi.totalEngagement.toLocaleString() },
    { label: '均篇互動', value: kpi.avgEngagement.toLocaleString() },
    { label: '爆款貼文率', value: `${(kpi.anomalyRate * 100).toFixed(1)}%` },
  ];
  return (
    <div className="grid grid-cols-4 gap-6">
      {cards.map((c) => (
        <div key={c.label} className="bg-surface p-6 rounded-2xl border border-outline-variant/20 card-shadow">
          <span className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest">{c.label}</span>
          <div className="text-3xl font-black text-on-surface">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 寫 `PostsTable.tsx`**

依來源 HTML 的 `<table>` 結構，欄位：排名 / 發布時間 / 帳號 / 內容摘要(truncate) / 互動量 / 讚 / 留言 / 媒體 / 連結。用 `isAnomaly(post.engagementTotal ?? 0, allEngagements)` 決定紅點（`allEngagements` 由父層傳入該視角全量互動陣列）。引入：

```tsx
import { isAnomaly } from '@/lib/domain/engagement';
import type { Post } from '@/lib/domain/types';

export function PostsTable({ posts, population }: { posts: Post[]; population: number[] }) {
  return (
    <table className="w-full text-left no-border-table">
      {/* thead 依來源 HTML */}
      <tbody className="text-[13px] divide-y divide-outline-variant/5">
        {posts.map((p, i) => (
          <tr key={p.postUrl ?? i} className="table-row-hover">
            <td className="px-8 py-5 flex items-center gap-3">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isAnomaly(p.engagementTotal ?? 0, population) ? 'bg-sentiment-neg' : 'bg-transparent'}`} />
              <span className="font-black text-primary">{String(i + 1).padStart(2, '0')}</span>
            </td>
            <td className="px-6 py-5">{new Date(p.postTime).toLocaleString()}</td>
            <td className="px-6 py-5 font-bold">{p.username}</td>
            <td className="px-6 py-5 max-w-[200px] truncate">{p.content}</td>
            <td className="px-4 py-5 text-center font-extrabold text-primary">{(p.engagementTotal ?? 0).toLocaleString()}</td>
            <td className="px-4 py-5 text-center">{(p.likes ?? 0).toLocaleString()}</td>
            <td className="px-4 py-5 text-center">{(p.comments ?? 0).toLocaleString()}</td>
            <td className="px-4 py-5 text-center">{p.mediaType}</td>
            <td className="px-8 py-5 text-right">{p.postUrl && <a className="text-primary font-bold hover:underline" href={p.postUrl} target="_blank" rel="noreferrer">查看</a>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: 寫 `PlatformTabs.tsx` 與 `PerspectiveSwitcher.tsx`**

- `PlatformTabs`：四個按鈕（overview/threads/ig/fb），props `value` + `onChange`，active 樣式依來源 HTML 底線。
- `PerspectiveSwitcher`：props `brands`（來自 API）、`active`、`onChange`；自家品牌卡顯示其總互動，competitor 卡若該 brand 在 posts 無資料則顯示「尚未連接競品數據源」灰底空狀態。

（兩者皆為受控元件；完整 class 套用來源 HTML 對應區塊。）

- [ ] **Step 4: 寫 `MonitorClient.tsx`（組合 + 取數）**

```tsx
'use client';
import { useEffect, useState } from 'react';
import type { Platform, Post, PlatformKpis } from '@/lib/domain/types';
import { PlatformTabs } from './PlatformTabs';
import { KpiRow } from './KpiRow';
import { PostsTable } from './PostsTable';

export function MonitorClient() {
  const [brand] = useState('我們的品牌');
  const [platform, setPlatform] = useState<Platform>('threads');
  const [posts, setPosts] = useState<Post[]>([]);
  const [kpis, setKpis] = useState<PlatformKpis[]>([]);

  useEffect(() => {
    const qs = new URLSearchParams({ brand, platform });
    fetch(`/api/data/posts?${qs}`).then((r) => r.json()).then(setPosts);
    fetch(`/api/data/kpis?brand=${encodeURIComponent(brand)}`).then((r) => r.json()).then(setKpis);
  }, [brand, platform]);

  const kpi = kpis.find((k) => k.platform === platform);
  const population = posts.map((p) => p.engagementTotal ?? 0);

  return (
    <div className="space-y-8">
      <PlatformTabs value={platform} onChange={setPlatform} />
      {kpi && <KpiRow kpi={kpi} />}
      <div className="bg-surface rounded-3xl card-shadow overflow-hidden border border-outline-variant/20">
        <PostsTable posts={posts} population={population} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 寫 `monitor/page.tsx` 與 `globals.css`**

`page.tsx`：

```tsx
import { MonitorClient } from '@/components/monitor/MonitorClient';
export default function MonitorPage() {
  return <main className="p-10 max-w-7xl mx-auto"><MonitorClient /></main>;
}
```

把來源 HTML 的 `tailwind.config` 自訂色（primary/ai-highlight/facebook/instagram/threads/surface…）移到 `tailwind.config.ts` 的 `theme.extend.colors`；把 `<style>` 內的 `.card-shadow`/`.table-row-hover`/`.no-border-table` 等移到 `globals.css`。

- [ ] **Step 6: 手動驗證**

```bash
npm run dev
```
瀏覽 `http://localhost:3000/monitor?token=mannings`
Expected: 看到平台 tabs、KPI 四卡（真實數字）、貼文表格（真實資料、按互動量排序、爆款紅點）。切換平台 tab → 數字與表格更新。不帶 token → 401。

- [ ] **Step 7: Commit**

```bash
git add src tailwind.config.ts && git commit -m "feat: monitoring page (Page 1) wired to Supabase"
```

---

### Task 12: 全套測試與收尾

- [ ] **Step 1: 跑全部單元測試**

Run: `npx vitest run`
Expected: normalize / engagement / aggregate / auth 全 PASS；integration 在有 env 時 PASS。

- [ ] **Step 2: build 驗證**

Run: `npm run build`
Expected: build 成功，無型別錯誤。

- [ ] **Step 3: Commit（若有修正）**

```bash
git add -A && git commit -m "test: green suite + clean build for phase0-1"
```

---

## 完成定義（Phase 0 + 1）

- Supabase 有 `posts`/`ai_reports`/`brands` 三表，posts 已回填自家品牌資料（冪等）。
- `?token=mannings` 之外的存取一律 401；瀏覽器不直連 Supabase。
- `/monitor` 顯示真實的平台 KPI 與貼文表格，含 +2σ 爆款紅點，可切換平台。
- 競品視角顯示空狀態（待 n8n 競品 flow）。
- 全套 Vitest 綠燈、`npm run build` 成功。

## 下一個計畫（不在本plan）

- Phase 2：AI 引擎 + 工具層 + chat widget + AI 解讀。
- Phase 3：每日報告 + AI Insight Center 頁 + n8n 觸發。
- Phase 4：部署 Vercel + 收尾。
- 另需文件記錄：**n8n 改 upsert 進 Supabase** 的節點設定（屬 n8n 端設定，非 webapp 程式碼）。
