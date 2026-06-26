# n8n 整合說明（Supabase 寫入 + 每日報告觸發）

> 對象：負責設定 n8n 的人。webapp 本身不含 n8n 流程，這份說明 n8n 端怎麼接。

## 1. 寫入貼文資料（Ingestion）

n8n 抓完 Threads / IG / FB 後，**直接 insert 進 Supabase `posts` 表**即可 —— 資料庫的去重觸發器會自動處理「同一則重抓」（合併 sources、刷新互動數、不產生重複列），所以 n8n 不需要先查再寫，也不需要 upsert 邏輯。

**寫入方式**：Supabase node（或 HTTP node 打 PostgREST）→ table `posts` → insert。

**每列欄位**（對齊原始資料）：

| 欄位 | 說明 |
|---|---|
| `brand` | 品牌真實名稱。自家固定填 `Mannings`；競品填競品真名（之後） |
| `platform` | `threads` / `ig` / `fb` |
| `post_time` | 發文時間（ISO 8601，如 `2026-04-30T21:11:56`） |
| `username` | 帳號 |
| `content` | 完整貼文內容（**不要截斷**，輿情分析需要全文） |
| `post_url` | 貼文連結（**去重鍵**之一，務必有值且唯一） |
| `media_type` | 媒體類型（Threads/IG：Photo/Video/Carousel/Text…；FB 可留 `post`） |
| `likes` | 讚（FB 填 `Like` 欄的值） |
| `comments` | 留言 |
| `follower_count` | 粉絲數（IG 必填；其他可空） |
| `engagement_total` | 總互動（上游算好） |
| `metrics` | jsonb，平台特有：Threads `{quotes,reposts,reshares}`；FB `{love,care,haha,wow,sad,angry,reshares}`；IG `{}` |
| `sources` | jsonb 陣列，多維度收集來源，如 `[{"type":"keyword","value":"保健品"},{"type":"hashtag","value":"#萬寧"}]`。無則 `[]` |

> 去重鍵是 `(platform, post_url)`。同一則被多個監測項（keyword/hashtag/mention）抓到時，分別 insert 即可，DB 會把各自的 `sources` 合併到同一列。

## 2. 每日報告觸發

n8n 一條排程 flow，順序如下：

```
每日排程 (Schedule node)
  └─ 抓 Threads/IG/FB → insert Supabase posts（上一節）
       └─ HTTP Request node：POST https://<你的vercel網域>/api/report?token=mannings
            Body (JSON): { "scope": { "brand": "Mannings" } }
            （不傳日期則自動用資料的實際日期範圍）
```

這個呼叫會：用工具組裝數據摘要 → 呼叫 AI 生成 6 段報告 → 寫入 `ai_reports` 表。前端 AI Insight Center 頁讀最新一筆顯示。

- **逾時**：報告生成約 20–60 秒，HTTP node timeout 請設 ≥ 120 秒。
- **驗證**：所有 `/api/*` 都需要 `?token=mannings`（或帶 `app_token` cookie）。n8n 用 query token 即可。

## 3. 之後（本次未做，架構已預留）

- **競品**：competitor flow 用相同抓法、寫相同 `posts` 表、`brand` 填競品真名 → 看板競品卡自動出現。
- **Email 推送**：報告生成後，n8n 讀 `ai_reports` 最新一筆 → Email node 寄給訂閱者（需先做 `subscribers` 表 + 訂閱 UI）。
