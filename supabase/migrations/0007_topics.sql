-- 0007: ai_reports 增加 topics 欄位（話題分析報告段）
ALTER TABLE ai_reports ADD COLUMN IF NOT EXISTS topics text;
