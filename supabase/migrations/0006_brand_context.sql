-- 0006: 品牌背景資訊（注入 AI system prompt，多品牌時每品牌獨立 context）
alter table brands add column if not exists context jsonb;

-- 種子：Mannings 背景資訊
update brands set context = '{
  "industry": "藥妝零售（香港）",
  "description": "Mannings 萬寧是香港連鎖藥妝品牌，屬牛奶公司集團，銷售藥品、保健品、美妝、個人護理用品。",
  "campaigns": [
    {
      "name": "BoostUP 好狀態嘉年華",
      "period": "2026-04-25 ~ 2026-04-26",
      "venue": "西九文化區",
      "description": "沉浸式健康生活體驗活動，含 40+ 場身心充電體驗（跑步、瑜伽、聲療、Funky Dance 等），門票制，須預約。"
    }
  ],
  "tone": "專業、健康、活力、社區關懷",
  "note": "社群監控聚焦 BoostUP 活動聲量與品牌情感健康度。"
}'::jsonb where name = 'Mannings';
