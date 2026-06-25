-- 去重 + 合併：同 (platform, post_url) 重抓時，更新互動數並 union 合併 sources，而非新增重複列。
-- BEFORE INSERT 觸發：若已存在則就地更新並跳過 insert；不存在則正常 insert。

create or replace function posts_dedup_merge() returns trigger
language plpgsql as $$
begin
  update posts p set
    brand            = new.brand,
    username         = new.username,
    content          = new.content,
    media_type       = new.media_type,
    likes            = new.likes,
    comments         = new.comments,
    follower_count   = new.follower_count,
    engagement_total = new.engagement_total,
    metrics          = new.metrics,
    ingested_at      = now(),
    sources          = p.sources || (
      select coalesce(jsonb_agg(e), '[]'::jsonb)
      from jsonb_array_elements(new.sources) e
      where not p.sources @> jsonb_build_array(e)
    )
  where p.platform = new.platform and p.post_url = new.post_url;

  if found then
    return null;   -- 已存在：已合併更新，跳過 insert
  end if;
  return new;      -- 不存在：正常 insert
end;
$$;

drop trigger if exists posts_dedup_merge_trg on posts;
create trigger posts_dedup_merge_trg
  before insert on posts
  for each row execute function posts_dedup_merge();
