# 社交媒體數據看板 — Supabase + Vercel 遷移設計

> 日期：2026-06-25
> 專案：Mannings BoostUp 社媒監控看板
> 狀態：設計已確認，待寫實作計畫

---

## 1. 背景與目標

### 現況

```
n8n → Google Sheets（Threads / IG / FB + AI_Cache）→ Apps Script（Code.gs doGet + Index.html）→ 使用者
```

- 後端 `Code.gs`（~80KB）、前端單一 `Index.html`（~160KB）。
- AI 走 OpenRouter（DeepSeek v4 Pro）：6 段每日報告、浮動 chat、row/chart/模塊 AI 解讀。
- 既有特色：三平台儀表板、Chart.js 圖表、+2σ 紅點（純前端統計）、Flatpickr 日期篩選、`@mention` 跳表格。

### 要逃離的限制

- Apps Script 6 分鐘執行上限。
- `google.script.run` 無法 streaming（單向一次性）。
- 單一 160KB HTML 檔難維護、難做多頁面。

### 目標架構

```
n8n（自家品牌；競品之後）→ Supabase（Postgres）→ Vercel（Next.js）→ 使用者
```

### 產品核心價值（決定成敗的維度）

**跨平台 + 跨品牌的分析能力，產出 Insight 與 Action。** 所有架構決策都以「讓洞察與行動建議又快又可靠」為最高優先。

---

## 2. 範圍

| 項目 | 決定 |
|---|---|
| 既有功能 | 全部遷移（三平台儀表板、6 段報告、chat、AI 解讀、+2σ、日期篩選、@mention） |
| 競品分析 | 本次納入：schema + UI 先備好；competitor 空狀態；n8n 競品 flow 之後補（零重工） |
| Email 推送 | **本次不做**，架構預留（`ai_reports` 已支援、之後加 `subscribers` 表 + n8n email 節點） |
| 登入驗證 | 不做完整 Auth；用 `?token=mannings` URL gate，資料一律走伺服端 service-role |
| Realtime | 不做；定期 + 手動刷新 |

---

## 3. 系統架構

```
                          ┌─────────── Vercel（Next.js App Router）───────────┐
 n8n（自家品牌 now,        │   /app 頁面（監控工作台 / AI Insight Center）        │
 競品 later）              │      └─ 呼叫 ─▶ /api 伺服路由 ──┐                   │
      │                   │                                 │ service-role key  │
      ▼ upsert            │   /api/data    （KPI/表格/圖表） ┤                   │
 ┌──────────┐  讀/聚合     │   /api/report  （6 段每日報告）   │                   │
 │ Supabase │◀────────────┤   /api/insight （一次性 AI 解讀） │  OpenRouter ◀─────┤
 │ Postgres │             │   /api/chat    （agentic 工具迴圈）┘                   │
 └──────────┘             │            ▲ 每個路由都過 token=mannings gate         │
                          └────────────┴──────────────────────────────────────────┘
```

**核心原則**

- **瀏覽器永不直連 Supabase**：所有讀取走 `/api/*`，用 service-role key；`?token=mannings` 守在路由前。
- **n8n 只負責寫入與排程**，不再擁有 AI 或前端呈現。
- **AI 全部移到 Vercel 伺服路由**（可 streaming、無 6 分鐘限制）。

---

## 4. 資料模型（Option A — 單一 posts 表）

選擇理由：跨平台/跨品牌分析 = 對同一張表按不同維度切分。三張分開的表會讓每個跨維度查詢都要 UNION、複雜度 3 倍，與產品核心價值相違。

### 4.1 `posts`

```sql
posts (
  id               bigint generated always as identity primary key,
  brand            text not null,          -- 真實品牌名 'Mannings' | 'Watsons' | ...（is_own 標記哪個是我們）
  platform         text not null,          -- 'threads' | 'ig' | 'fb'
  post_time        timestamptz not null,
  username         text,
  content          text,
  post_url         text,
  media_type       text,
  likes            int,
  comments         int,
  follower_count   int,                    -- IG 用（nullable）；IG 分層/破圈分析
  engagement_total int,                    -- 上游已算好
  metrics          jsonb,                  -- 平台特有：
                                           --   threads: {quotes,reposts,reshares}
                                           --   fb:      {love,care,haha,wow,sad,angry}
  sources          jsonb default '[]',     -- 多維度收集 [{type:'keyword'|'hashtag'|'mention'|'account', value}]
  ingested_at      timestamptz default now(),
  unique (platform, post_url)              -- 去重鍵：同平台同 URL 視為同一則
);
create index on posts (brand, platform, post_time);
create index on posts using gin (sources);
```

> **brand 命名**：存真實名稱（`Mannings`），`brands.is_own=true` 標記自家；前端對 is_own 顯示「我們」徽章。
>
> **去重**：以 `unique (platform, post_url)` 為去重鍵，重複抓到同一則 → 更新而非新增（見第 5 節去重策略）。

**平台欄位對應（來自 Mannings BoostUp Report.xlsx）**

| 平台 | 共用欄位（升為 column） | 進 metrics jsonb |
|---|---|---|
| Threads | post_time, username, content, post_url, media_type, likes, comments, engagement_total | quotes, reposts, reshares |
| IG | 同上 + follower_count | （無；follower_count 為 column） |
| FB | post_time, username, content, post_url, media_type, comments, engagement_total（FB 的 likes 對應 `Like`） | love, care, haha, wow, sad, angry, reshares |

> 註：跨平台比較以 `engagement_total`（與 likes/comments）為共同尺度，確保 apples-to-apples。

### 4.2 `ai_reports`（取代 AI_Cache sheet）

```sql
ai_reports (
  id          bigint generated always as identity primary key,
  brand       text not null,
  date_start  date not null,
  date_end    date not null,
  generated_at timestamptz default now(),
  summary     text,   advice   text,   content text,
  platform    text,   kol      text,   ig_rate text,   -- 6 段
  unique (brand, date_start, date_end)
);
```

### 4.3 `brands`（驅動視角切換器）

```sql
brands (
  id              bigint generated always as identity primary key,
  name            text unique not null,
  is_own          boolean default false,
  platform_handles jsonb,
  sort_order      int
);
```

### 4.4 Chat

本次 **ephemeral，不持久化**（簡化）。未來可加 `chat_sessions` / `messages`。

---

## 5. 資料管線（Ingestion）與去重策略

- n8n 把抓取結果 **直接 insert 進 `posts`**（`brand = 'Mannings'`，多維度收集時帶上 `sources`）。
- 一次性把現有資料（xlsx）回填進 `posts`（回填腳本 `scripts/backfill.ts`，brand=Mannings，sources=[]）。
- 競品：未來新 n8n flow 用相同抓法、寫相同表、`brand = '<競品真名>'`、`is_own=false` → 無 schema 變動。

**去重策略（DB 觸發器 `posts_dedup_merge`）：**
- 去重鍵 `unique (platform, post_url)`。
- BEFORE INSERT 觸發器：偵測到同一則 → 就地 **更新互動數至最新** + **union 合併 `sources`（去重）**，跳過 insert；不存在則正常 insert。
- 好處：**寫入端（n8n）只管 insert**，DB 自動去重/合併/刷新，毋須懂邏輯。重抓同一則不會產生重複列，多監測項命中會累加 sources。
- 互動數採「最新覆蓋」；歷史時間序列為未來選項（snapshots 表）。

---

## 6. AI Agentic 引擎（產品核心）

### 6.1 固定工具集（唯讀、可組合、吃 brand/platform/date 參數）

即「固定 SOP 數據算法」。每個工具是確定性 SQL/TS 計算，AI 只能呼叫工具但可自由組合。

| 工具 | 作用 | 對應舊 buildDataContext |
|---|---|---|
| `aggregate_metrics({brand?, platform?, date, group_by})` | 帖數/總互動/均值/中位數，可按 platform/brand/media_type/日/時段/星期分組 | summary |
| `query_posts({filters, sort_by, limit})` | 取貼文（Top 榜、篩選、搜尋） | top_posts |
| `top_creators({brand?, platform?, by, limit})` | KOL 排行 + 集中度/巴士係數 | kol_analysis |
| `engagement_distribution({...})` | P10–P99、桶狀分佈、Top10%/25%/50% 佔比（頭部依賴 vs 遍地開花） | 互動分佈 |
| `time_patterns({...})` | 時段/星期熱力、最佳發文窗口 | heatmap |
| `ig_tier_analysis({brand?, date})` | IG 粉絲分層 + 破圈帖偵測 | ig_tier |

**關鍵升級**：每個工具吃 `brand` 與 `platform` 參數 → AI 可對任意品牌/平台/日期做分析與比較，跨平台跨品牌能力內建於工具層。

### 6.2 一個引擎，三種用法

共用：工具層 + base prompt + OpenRouter client。

| 用法 | 模式 | 說明 |
|---|---|---|
| 每日報告 | 固定流程（SOP） | 照預定順序呼叫一組工具 → 餵 AI → 6 段報告；可排程、確定性 |
| Chat（右下角 widget） | 完整 agentic | AI 在「當前視角範圍」內自由呼叫工具迴圈 → 串流回答；即「react 取數空間」 |
| AI 解讀（row/圖表/表格） | 一次性 | 預設提示詞 + 該對象聚合數據（1–2 工具）→ 解讀；**獨立對話串**，不與 chat 合併 |

> Chat 與 AI 解讀對話串分開，但兩者都站在同一套工具上；Chat 永遠在當前視角（brand/platform/date 篩選）範圍內運作，所以使用者可「基於前面的數據」追問。

### 6.3 模組化（可擴展）

- 每個工具實作同一 `Tool` 介面（`name` / `schema` / `run(params)`），放入 registry → 新增/抽換工具不動引擎。
- 每個 AI 功能的提示詞 = 獨立 config 檔。
- 模型走 OpenRouter，需支援 function calling（DeepSeek v4 Pro 支援）；重型/輕型在 env 切換。

---

## 7. 前端（2 頁 + 浮動 chat）

> 修正自初版：競品不是獨立頁（視角切換器已在工作台頂部）；chat 是 widget 不是頁。

**Page 1 — 數據與競品監控**（參考 `new/數據監測工作台.html`）

- 頂部品牌/競品**視角切換器**（我們的品牌 / 競品A / 競品B）：點選即按 `brand` 重篩整頁；競品在 flow 上線前顯示空狀態。
- 平台 tabs（Overview/Threads/IG/FB）→ 動態 KPI 列 → 資料表（分頁、+2σ 紅點）。
- 每列與「AI 深度解讀」按鈕 → 預設提示詞 + 聚合數據 → AI 解讀（一次性）。

**Page 2 — AI Insight Center**（參考 `new/AI Insight Center.html`）

- 6 段每日報告 + 手動「重新生成」。

**浮動 chat widget（兩頁右下角）** — agentic，吃當前視角範圍。

**導覽**：精簡 2 項 sidebar（監控 / AI Insight）+ 設定。

**技術棧**：Next.js App Router + TypeScript + Tailwind；Chart.js；`?token=mannings` middleware gate；資料一律走伺服端。

---

## 8. 每日報告觸發

由 **n8n 統籌**一條 flow：

```
每日排程
  └─ n8n：抓 Threads/IG/FB → upsert Supabase posts
       └─ 呼叫 Vercel /api/report（生成 6 段，寫 ai_reports）
            └─（未來）讀 ai_reports → 寄 email 給訂閱者
```

App 內 AI Insight Center 保留隨時手動重生版本。

---

## 9. 競品處理

- `brand` 維度自第一天內建；現有資料全標 `Mannings`（is_own=true）。
- 競品分析 UI 做好但顯示「尚未連接競品數據源」空狀態。
- 未來 n8n 競品 flow 上線（相同抓法、相同表、不同 brand）→ 資料自動出現，零重工。

---

## 10. 分階段建置

| Phase | 內容 | 驗證 |
|---|---|---|
| 0 | Supabase + 表/索引；n8n 改 upsert（自家品牌）；回填現有資料 | Supabase 查得到正確三平台資料 |
| 1 | Next.js 骨架 + token gate；`/api/data`；移植 Page 1 監控工作台 | 核心儀表板可用，資料來自 Supabase（**可上線**） |
| 2 | `Tool` 介面 + registry + 6 工具；`/api/chat`（串流）+ chat widget；`/api/insight` + AI 解讀按鈕 | chat 能跨平台/跨品牌取數；AI 解讀出結果 |
| 3 | `/api/report`（SOP）+ 寫 ai_reports；移植 Page 2；n8n 呼叫 /api/report | 每日自動產報告、頁面正確渲染 |
| 4 | 競品空狀態收尾；部署 Vercel、env、token gate、QA | 上線可用 |

---

## 11. 範圍外（架構已預留）

- Email 推送（`subscribers` 表 + n8n email 節點）。
- 完整 Supabase Auth（取代 token gate）。
- Realtime 訂閱。
- Chat 歷史持久化。

---

## 12. 決策記錄

| # | 決策 | 選擇 |
|---|---|---|
| 1 | 遷移範圍 | 搬遷全部 + 競品分析 |
| 2 | 競品數據源 | n8n 將收集（相同 schema） |
| 3 | AI 邏輯位置 | Vercel 伺服函式 |
| 4 | 競品分期 | Schema+UI 先備好，flow 之後補 |
| 5 | 前端棧 | Next.js App Router |
| 6 | 登入 | `?token=mannings` URL gate |
| 7 | AI 取數深度 | 固定工具集（唯讀） |
| 8 | 頁面結構 | 2 頁 + 浮動 chat widget |
| 9 | AI 解讀 vs chat | 對話串分開，共用工具層 |
| 10 | 資料模型 | Option A 單一 posts 表 |
| 11 | Email | 本次不做，預留 |
| 12 | 報告排程 | n8n 統籌 |
| 13 | brand 命名 | 真實名稱（Mannings）+ is_own 旗標 |
| 14 | 多維度收集 | posts 加 `sources` jsonb 陣列（GIN 索引） |
| 15 | 去重 | DB 觸發器自動去重 + 合併 sources + 刷新互動數 |
