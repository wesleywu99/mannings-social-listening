-- 0005: 情感分析欄位
-- 為 posts 加 sentiment（pos/neu/neg）+ sentiment_score（-1~1 置信度）
-- 為 ai_reports 加 sentiment 段（第 7 段日報）

alter table posts
  add column if not exists sentiment text check (sentiment in ('pos','neu','neg')),
  add column if not exists sentiment_score real;

create index if not exists posts_brand_platform_sentiment_idx
  on posts (brand, platform, sentiment);

alter table ai_reports
  add column if not exists sentiment text;
