-- 快取報告生成時已算好的「結構化話題分析」，避免 AI Insight 頁每次載入都重跑 LLM 主題聚類。
-- topics_data：analyzeTopics 的結果（Topic[] JSON），供左側「話題互動排名」圖直接讀取。
alter table ai_reports add column if not exists topics_data jsonb;
