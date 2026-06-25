-- 多維度收集來源（keyword / hashtag / mention / account…），一則貼文可命中多個
alter table posts add column if not exists sources jsonb not null default '[]'::jsonb;
create index if not exists posts_sources_gin on posts using gin (sources);

-- brand 改存真實名稱（is_own 旗標標記哪個是我們）
update brands set name = 'Mannings' where name = '我們的品牌';
update posts  set brand = 'Mannings' where brand = '我們的品牌';
