-- 報告訂閱者：看板用戶自助加入/移除自己的 email 以收取報告
create table if not exists subscribers (
  id         bigint generated always as identity primary key,
  email      text not null,
  brand      text not null default 'Mannings',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (email, brand)
);
create index if not exists subscribers_brand_idx on subscribers (brand) where active;
