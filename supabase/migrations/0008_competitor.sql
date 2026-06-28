-- 0008: ai_reports 增加 competitor 欄位（競品態勢報告段）
ALTER TABLE ai_reports ADD COLUMN IF NOT EXISTS competitor text;
