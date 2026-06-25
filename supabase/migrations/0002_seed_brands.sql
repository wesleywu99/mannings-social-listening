insert into brands (name, is_own, sort_order)
values ('我們的品牌', true, 0)
on conflict (name) do nothing;
