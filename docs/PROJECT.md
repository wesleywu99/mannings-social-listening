# Mannings Social Listening — 專案總覽 & 深度優化 Plan

> 這份文件是專案的**單一事實來源 / 交接文件**。換一部電腦、或新成員加入，看這份即可接手。
> 最後更新：2026-06（持續維護）

---

## 0. 一句話

Mannings（萬寧）BoostUP 社群監控看板：把原本「n8n → Google Sheets → Apps Script」的方案，**遷移為 n8n → Supabase → Vercel(Next.js)**，並升級成有 **agentic AI 解讀**的社交聆聽（輿情）產品。目標用戶：**營銷 / 內容運營 / 社媒負責人**。第一性原理：**給用戶決策價值，不為做而做**。

---

## 1. 背景

- 原系統：`../Code.gs`（Apps Script 後端）+ `../Index.html`（160KB 單檔前端），資料在 Google Sheets。逃離原因：Apps Script 6 分鐘上限、`google.script.run` 無法 streaming、單檔難維護。
- 原始資料形態：`../Mannings BoostUp Report.xlsx`（Threads / IG / FB 三個 sheet，欄位各異）。
- 新 UI 設計參考：`../new/`（數據監測工作台.html、AI Insight Center.html）；視覺語言對齊 `Downloads/DESIGN-vercel.md`（Vercel Geist 極簡：墨黑 on 近白、細灰邊線、中性灰階、Geist 字體、顏色極少）。

## 2. 架構

```
 n8n（自家品牌；競品之後）
   │  直接 insert（DB 觸發器自動去重/合併/刷新）
   ▼
 Supabase (Postgres)  ── posts / ai_reports / brands
   ▲ service-role only
   │  /api/* 伺服路由（service-role key；瀏覽器永不直連 DB）
 Vercel (Next.js 16 App Router, TS, Tailwind v4)
   ├─ /monitor      數據監測工作台
   ├─ /insight      AI Insight Center
   └─ /api/...      data / ai（OpenRouter）
        ▲ 每條路由都過 ?token=mannings gate（src/proxy.ts）
```

- **前端棧**：Next.js 16（App Router、`src/`、`proxy.ts` 非 `middleware.ts`）、Tailwind v4（`@theme` 在 `globals.css`，非 config 檔）、Geist 字體、Chart 用自繪 SVG（無圖表庫）。
- **AI**：OpenRouter（OpenAI 相容），預設 `deepseek/deepseek-chat`（須支援 function calling）。
- **存取控制**：`?token=mannings` URL gate（`APP_ACCESS_TOKEN`）。瀏覽器只打 `/api/*`，server 用 service-role 讀 Supabase。

## 3. 關鍵決策（accumulated）

| # | 決策 | 選擇 |
|---|---|---|
| 1 | 範圍 | 搬遷全部既有功能 + 競品分析（schema/UI 先備） |
| 2 | 資料模型 | **單一 `posts` 表** + `brand` + `platform` 兩切分維度（跨平台/跨品牌分析） |
| 3 | brand 命名 | 真實名稱 `Mannings` + `is_own` 旗標（非「我們的品牌」） |
| 4 | 多維度收集 | posts 加 `sources` jsonb 陣列（keyword/hashtag/mention/account），GIN 索引 |
| 5 | 去重 | **DB 觸發器 `posts_dedup_merge`**：同 (platform, post_url) → 合併 sources(union) + 刷新互動數；n8n 只管 insert |
| 6 | AI 位置 | Vercel 伺服函式（streaming-ready），離開 Apps Script |
| 7 | AI 取數 | 固定唯讀工具集（agentic tool-calling），第一輪強制取數 |
| 8 | 頁面 | 2 頁（監控 / AI Insight）+ 右下角浮動 chat widget |
| 9 | AI 解讀 vs chat | 對話串分開，共用工具/資料層 |
| 10 | 登入 | `?token=mannings` URL gate（上線前可換 Supabase Auth） |
| 11 | Email 推送 | 暫緩（架構預留） |
| 12 | 報告排程 | n8n 統籌（抓→寫→呼叫 /api/report） |
| 13 | 視覺風格 | Vercel Geist 極簡；無 emoji；大數字近黑、細灰邊線 |
| 14 | 預設視窗 | 最近 30 天密集視窗（避開雜訊日期撐成整年） |
| 15 | 破圈偵測 | 趨勢圖逐日 +2σ：效率破圈（每帖互動）+ 聲量高峰（總互動），可鑽取 |

## 4. 資料模型（Supabase）

Project ref：`eigrewvzlfwtejxugbgp`（名 `mannings-social-listening`，RLS 啟用，service_role 繞過）。
Migration SQL：`supabase/migrations/`（0001 建表、0002 種 brand、0003 sources+改名、0004 去重觸發器）。

- **posts**：`id, brand, platform('threads'|'ig'|'fb'), post_time(timestamptz,UTC), username, content, post_url, media_type, likes, comments, follower_count, engagement_total, metrics(jsonb 平台特有), sources(jsonb 多維度), ingested_at`；`unique(platform, post_url)`；索引 `(brand,platform,post_time)` + GIN(sources)。
- **ai_reports**：6 段日報快取 `summary/advice/content/platform/kol/ig_rate` + `brand,date_start,date_end,generated_at`；`unique(brand,date_start,date_end)`。
- **brands**：`name, is_own, platform_handles, sort_order`（驅動品牌選擇器）。
- **去重觸發器**：見 `0004_posts_dedup_merge_trigger.sql`。

平台欄位對應（來自 xlsx）：Threads `Likes/Comments/Quotes/Reposts/Reshares`；IG `Likes/Comments/Follower_Count`；FB `Like/Love/Care/Haha/Wow/Sad/Angry/Comments/Reshares`。共用欄升為 column，平台特有進 `metrics`。

## 5. 已完成功能（current state）

**監控頁 `/monitor`**
- 頂部控制列：品牌選擇器（BrandSelector）+ 日期預設/日曆（自訂日曆，非原生）
- Cross-channel 總覽：總量三卡 + 期間 Δ；雙軸趨勢圖（互動折線 + 貼文長條）含**破圈日標記**（點任一日 → DayDetailModal：統計卡 + 平台占比 + Top 貼文 + **AI 單日解讀**）；平台對比表（Posts/Engagement/Avg/**Outlier%**/Share/Δ）
- 平台分頁 → 貼文表（可點欄名排序、+2σ 紅點、內容點擊開 PostDetailModal 看全文+全互動+AI 解讀）
- 表格工具列：**搜尋**（前端過濾）、**下載 CSV**（平台感知欄位 + UTF-8 BOM）、**AI 解讀**（平台級三段：關鍵發現/成因/行動建議）
- 右下角 **AI 智能分析師**（agentic chat，吃當前 brand+日期範圍，會呼叫工具取數）

**AI Insight Center `/insight`**
- 6 段 AI 日報（SOP 流程：工具組裝 context → 單次 AI → 解析），每模塊**左側對應圖表/數據**（KPI / 媒體均值 / 平台互動 / Top 創作者 / IG 分層）+ **發文時段熱力圖**（第 07 模塊）
- 「重新生成報告」；報告快取在 ai_reports

**AI 引擎 `src/lib/ai/`**
- 工具層 `tools.ts`：`aggregate_metrics / query_posts / top_creators / engagement_distribution / time_patterns / ig_tier_analysis`（唯讀、吃 brand/platform/date）
- `agent.ts`：`runChat`（多輪工具迴圈）、`runDayInsight`（區間）、`runModuleInsight`（平台）、`runInsight`（單貼文）、`runReport`（6 段）
- `openrouter.ts`：function calling + 重試；模型 env 可換
- 統一模態框 `components/Modal.tsx`：scale + 漸變模糊動畫 350ms ease-in-out

**測試**：Vitest（normalize / +2σ / KPI / auth / stats / breakouts / heatmap 單元 + posts/dedup 整合）。

## 6. 本機開發（換電腦接手步驟）

```bash
# 1. 取得程式碼
git clone <repo-url> && cd webapp
npm install

# 2. 建 .env.local（見 .env.example），填：
#    NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
#    APP_ACCESS_TOKEN=mannings
#    OPENROUTER_API_KEY / AI_MODEL_HEAVY / AI_MODEL_FAST
#    （本機在港/台時區，無需設 TZ）

# 3. Supabase 表：到 Dashboard SQL Editor 依序執行 supabase/migrations/*.sql
#    （或用 Supabase CLI：supabase link + db push）

# 4. 回填現有資料（從 xlsx）
npm run backfill           # 讀 ../Mannings BoostUp Report.xlsx

# 5. 開發
npm run dev                # http://localhost:3000/monitor?token=mannings
npm test                   # 單元 + 整合測試
```

## 7. n8n 整合

詳見 `docs/n8n-integration.md`（要點）：
- **寫入**：n8n 抓 Threads/IG/FB → 直接 `insert` 進 `posts`（去重觸發器自動處理）；欄位對照見該文件；自家 `brand='Mannings'`，競品填真名 + `is_own=false`。
- **每日報告**：排程 flow：抓→寫→`POST /api/report?token=mannings`（body `{scope:{brand:'Mannings'}}`，timeout ≥120s）。

## 8. 部署（Vercel）

1. 推 GitHub（見 README）。
2. Vercel 連這個 repo（Root Directory = `webapp`）。
3. **環境變數**（Vercel → Settings → Environment Variables）：
   - `NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`
   - `APP_ACCESS_TOKEN=mannings`
   - `OPENROUTER_API_KEY`、`AI_MODEL_HEAVY`、`AI_MODEL_FAST`
   - **`TZ=Asia/Hong_Kong`**（關鍵：讓伺服器端時段運算＝香港時間，否則熱力圖/時段偏 8 小時）
4. Deploy。存取：`https://<app>.vercel.app/monitor?token=mannings`。

> ⚠️ 上線前：把曾在對話貼出的 Supabase / OpenRouter 密鑰**重新產生（rotate）**。

## 9. 深度優化 Roadmap（挨個做）

狀態：✅ 完成 / 🔜 進行中 / ⬜ 待辦

| 優先 | 項目 | 說明 | 狀態 |
|---|---|---|---|
| P0 | 時區（部署） | Vercel 設 `TZ=Asia/Hong_Kong`（不需改碼） | 🔜 待用戶在 Vercel Dashboard 設 env var + redeploy |
| P0 | 數據清潔 | normalize trim 前後空白/換行；username 已清 | ✅ |
| P0 | 雜訊日期 | 2026-06-26 經 DB 直查確認無雜訊日期（earliest 2025-04-30，latest 2026-05-02）；預設 30 天視窗已避開稀疏期 | ✅ |
| P0 | Vercel 部署 | 已綁定 GitHub 自動部署；需設 `TZ` env var | 🔜 待設 env |
| P1 | 情感分析 | posts 加 `sentiment`+`sentiment_score`；AI 批次標記 456 篇（pos 295/neu 156/neg 5）；圓環餅圖 + 負面突增複合信號（red/orange/yellow）+ AI 成因；Insight 第 06 段 | ✅ |
| P1 | 數據串聯 | @mention 已做；創作者/媒體/熱力圖格點擊回填未做（整體完善後回顧） | ⬜ |
| P2 | Chat 升級 | ✅ 串流逐字輸出 + 後續問題 chip + ReAct thought 透明 + 工具重構為 5 統計型 + ad-hoc 聚合 + 品牌背景注入 | ✅ |
| P2 | 全頁 loading 骨架 | MonitorClient 開機骨架 + InsightClient 報告骨架 | ✅ |
| P2 | 內容主題聚類 | 混合方案（算法聚類 + AI 命名）。**待設計問題**：多品牌場景下 Insight 頁主題模塊如何呈現？單品牌專屬 vs 跨品牌對比？ | ⬜ 待設計 |
| P3 | 主動告警 | 破圈/負面突增 → email/Slack | ⬜ |
| P3 | 競品對標 | 等 n8n 競品 flow（schema 已備，零重工） | ⬜ |
| P3 | Email 日報 | `subscribers` 表 + n8n email 節點 | ⬜ |
| P3 | Supabase Auth | 取代 token gate | ⬜ |

### 9.1 已完成項目詳情

**P1 情感分析**（commit `c7f102d`, `65b874c`）
- Schema: `0005_sentiment.sql`（posts + ai_reports 加欄）
- 456 篇全部標記：pos 295 (65%) / neu 156 (34%) / neg 5 (1%)
- neg 樣本經驗證為真實負面（活動報名系統故障、曬傷抱怨）
- UI: OverviewSummary 圓環餅圖（2/3 趨勢 + 1/3 情感）、DayDetailModal 當日情感卡、PostsTable 情感列已移除（點開貼文即可見）
- AI: runInsight 傳 sentiment，INSIGHT_SYSTEM_PROMPT 納入情感維度
- 配色: pos `#0f766e` 墨綠 / neu `#d4d4d4` 灰 / neg `#ee0000` Vercel error

**P2 Chat 串流 + ReAct**（commit `948ce8a`, `c2620ec`）
- 工具重構 7 → 5 統計型：engagement_stats / trend_analysis / creator_ranking / sentiment_analysis / content_samples
- 新增 aggregate_filtered：任意組合過濾（帳號/粉絲區間/關鍵詞/情感/平台/日期）→ 預聚合統計
- 第一性原則：AI 拿預聚合統計做解讀，不拿 raw data 自己算
- 串流 SSE：reasoning_content → thought 事件（可摺疊渲染），content → delta 事件（逐字）
- 後續問題 chip：`===FOLLOWUPS===` 解析
- 品牌背景注入：`0006_brand_context.sql`，brands.context jsonb，服務端按 scope.brand 查
- ReAct 多步查詢實測：@charlztrevor → 2 工具 + 135 thought + 875 delta，正確返回數據

**P2 全頁 loading 骨架**（commit `68654bf`）
- MonitorClient: KpiSkeleton / TrendSentimentSkeleton / PlatformTableSkeleton / PostsTableSkeleton
- InsightClient: 6 段報告卡片骨架
- Geist 風：surface-container 灰塊 + hairline 卡 + pulse 動畫

**AI 解讀快取**（commit `65b874c`）
- useInsightCache: 頁面級記憶體快取
- PostDetailModal key=`post:{id}`，ModuleInsightModal key=`module:{brand}:{platform}:{dateStart}:{dateEnd}`
- 「重新解讀」強制刷新（force=true）

### 9.2 P2 內容主題聚類 — 待設計問題

用戶提問：**多品牌場景下 Insight 頁主題模塊如何呈現？**

待決策點：
1. 主題是「品牌專屬」還是「跨品牌共享」？Mannings 的主題 vs 競品的主題是否可比？
2. Insight 頁是「單品牌報告」還是「跨品牌對比報告」？當前架構是單品牌（scope.brand 鎖定）
3. 主題聚類的粒度：大主題（5-8 個）vs 細主題（15-20 個）？
4. 主題命名：AI 一次性生成 vs 人工標籤庫？
5. 主題的時間演進：主題是否隨時間變化？如何呈現趨勢？

實現方案（已選）: 混合 — 算法聚類（關鍵詞共現）+ AI 命名
- 算法: TF-IDF 提取高頻詞 + 共現矩陣聚成原始簇
- AI: 給每個簇命名 + 描述（一次性，可快取）
- 統計: 每主題的帖數/互動/情感/Top 帖

### 9.3 後續計劃（優先序）

1. **P0 時區**（待用戶操作）：Vercel 設 `TZ=Asia/Hong_Kong` + redeploy
2. **P2 內容主題聚類**（待設計決策）：先回答 9.2 的問題再動手
3. **P1 數據串聯**（整體完善後回顧）：創作者/媒體/熱力圖格點擊回填
4. **P2 Chat 問題**（整體完善後回顧）：實測發現的問題再修
5. **P3** 主動告警 / 競品對標 / Email 日報 / Supabase Auth

## 10. 已知問題 / 注意

- **AI provider**：已從 OpenRouter 切至 **SenseNova**（`deepseek-v4-flash`，OpenAI 相容）。env var 名保留 `OPENROUTER_API_KEY` 歷史相容。`tool_choice:'required'` 不支持（回 502001），agent.ts 已改全用 `'auto'` + 首輪未取數補救邏輯。
- **OpenRouter 額度偏低**（free tier，曾回 402）：已切 SenseNova 規避；maxTokens 已壓低。
- **雜訊日期**：見上表 P0；預設 30 天視窗已避開，手動選 >60 天會切週桶。
- **整合測試**需 `.env.local`（有 Supabase 憑證才跑，否則 skip）。
- **Next 16 / Tailwind v4** 與舊版差異：`proxy.ts`（非 middleware）、`@theme`（非 config）。

## 11. 關鍵檔案地圖

```
webapp/
  src/proxy.ts                      token gate
  src/lib/config.ts                 DEFAULT_BRAND
  src/lib/supabase/server.ts        service-role client
  src/lib/domain/                   types / platforms / normalize / engagement(+2σ) / aggregate(KPI/trends/breakouts/heatmap)
  src/lib/data/                     posts.ts（queryPosts/getKpis）, reports.ts
  src/lib/ai/                       tools / agent / openrouter / prompts / stats / types
  src/app/api/                      data/* , insight/{day,module,''} , report , chat
  src/components/monitor/           MonitorClient, OverviewSummary, PostsTable, DayDetailModal, PostDetailModal,
                                    ModuleInsightModal, ChatWidget, BrandSelector, DateRangePicker, columns, exportCsv
  src/components/insight/           InsightClient, MiniViz, Heatmap
  src/components/Modal.tsx, Nav.tsx
  supabase/migrations/              0001..0004
  scripts/backfill.ts               xlsx → posts
  docs/PROJECT.md（本檔）, docs/n8n-integration.md
```
