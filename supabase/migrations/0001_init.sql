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
