# Mannings Social Listening

社交媒體監控與輿情看板（Threads / Instagram / Facebook），含 agentic AI 解讀。
**n8n → Supabase → Vercel (Next.js)。** 目標用戶：營銷 / 內容運營 / 社媒負責人。

> 📖 **完整交接文件、架構、決策、Roadmap：[`docs/PROJECT.md`](docs/PROJECT.md)**
> 🔌 **n8n 整合：[`docs/n8n-integration.md`](docs/n8n-integration.md)**

## Quickstart

```bash
npm install
cp .env.example .env.local        # 填入 Supabase / OpenRouter / APP_ACCESS_TOKEN
# Supabase：在 Dashboard SQL Editor 依序執行 supabase/migrations/*.sql
npm run backfill                  # 從 ../Mannings BoostUp Report.xlsx 回填
npm run dev                       # http://localhost:3000/monitor?token=mannings
npm test
```

## 環境變數（`.env.local`）

| 變數 | 說明 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role key（僅伺服端，勿外洩） |
| `APP_ACCESS_TOKEN` | URL gate token（預設 `mannings`） |
| `OPENROUTER_API_KEY` | OpenRouter key（AI 功能） |
| `AI_MODEL_HEAVY` / `AI_MODEL_FAST` | 模型，預設 `deepseek/deepseek-chat`（須支援 function calling） |
| `TZ` | **部署到 Vercel 時設 `Asia/Hong_Kong`**（本機在港/台免設） |

## 技術棧

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres) · OpenRouter · Vitest

## 存取

所有頁面與 API 需 `?token=mannings`（或 cookie）。瀏覽器不直連 Supabase，資料一律走 `/api/*`（service-role）。
