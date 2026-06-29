import 'server-only';
import { chatCompletion, getModelHeavy } from './openrouter';
import { mean } from './stats';
import type { Post } from '@/lib/domain/types';

export interface Topic {
  name: string;
  description: string;
  postCount: number;
  totalEngagement: number;
  avgEngagement: number;
  posCount: number;
  negCount: number;
  neuCount: number;
  samplePosts: Array<{
    platform: string;
    username: string;
    content: string;
    engagement: number;
  }>;
}

// ─── LLM Prompt ────────────────────────────────────────────────────

const TOPIC_SYSTEM_PROMPT = `你是社交貼文主題分析器。給定一批貼文（含編號、平台、帳號、互動量、情感與內容），識別其中的主要討論主題。

規則：
1. 找出 5-10 個有意義的主題，按帖子數從多到少排列
2. 主題名稱用 2-4 個字概括（如「產品推薦」「促銷活動」「護膚知識」「品牌投訴」「KOL 合作」）
3. 每條貼文只歸入一個最相關的主題
4. 若帖子無法歸類，放入「其他」主題
5. 不要創造沒有帖子支撐的主題

**只回 JSON 陣列**，格式嚴格為：
[{"name":"主題名","description":"一句話描述","postIndices":[0,2,5]}]
不要加任何說明文字、不要用 markdown code fence。`;

interface ApiTopic {
  name: string;
  description: string;
  postIndices: number[];
}

// ─── 分層採樣 ──────────────────────────────────────────────────────

const DAY_MS = 86400000;

function daysBetween(start: string, end: string): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (isNaN(s) || isNaN(e)) return 0;
  return Math.round((e - s) / DAY_MS) + 1;
}

/**
 * 分層採樣：確保高互動 / 中間層 / 負面 / 近期帖子都有覆蓋。
 * 去重後通常 100-140 條，全部交給 LLM 分類。
 */
function stratifiedSample(
  posts: Post[],
  dateStart?: string,
  dateEnd?: string,
): Post[] {
  const seen = new Set<number>();
  const selected: Post[] = [];

  const add = (ps: Post[], limit: number) => {
    let added = 0;
    for (const p of ps) {
      if (added >= limit) break;
      const key = p.id ?? selected.length + posts.indexOf(p);
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(p);
      added++;
    }
  };

  // Layer 1: Top 50 by engagement
  const byEng = [...posts].sort((a, b) => (b.engagementTotal ?? 0) - (a.engagementTotal ?? 0));
  add(byEng, 50);

  // Layer 2: Middle 40 (time-stratified, excluding already selected)
  const remaining = posts.filter((_, i) => !seen.has(posts[i].id ?? i));
  const byTime = [...remaining].sort((a, b) => a.postTime.localeCompare(b.postTime));
  if (byTime.length > 40) {
    const step = Math.floor(byTime.length / 40);
    const picked = byTime.filter((_, i) => i % step === 0);
    add(picked, 40);
  } else {
    add(byTime, 40);
  }

  // Layer 3: Negative sentiment (up to 30)
  const negPosts = posts.filter((p) => p.sentiment === 'neg');
  add(negPosts, 30);

  // Layer 4: Recent posts (only if scope > 7 days)
  if (dateStart && dateEnd && daysBetween(dateStart, dateEnd) > 7) {
    const span = daysBetween(dateStart, dateEnd);
    const recentDays = span > 30 ? 7 : 3;
    const cutoff = new Date(new Date(dateEnd).getTime() - recentDays * DAY_MS).toISOString();
    const recent = posts
      .filter((p) => p.postTime >= cutoff)
      .sort((a, b) => b.postTime.localeCompare(a.postTime));
    add(recent, 20);
  }

  return selected;
}

// ─── 主題分析核心 ───────────────────────────────────────────────────

/** 分析一批帖子的內容，透過分層採樣識別討論主題並計算各主題的互動表現 */
export async function analyzeTopics(
  posts: Post[],
  dateStart?: string,
  dateEnd?: string,
): Promise<Topic[]> {
  if (posts.length < 5) return [];

  const samples = stratifiedSample(posts, dateStart, dateEnd);
  const items = samples.map((p, i) => ({
    i,
    platform: p.platform,
    username: p.username ?? '',
    engagement: p.engagementTotal ?? 0,
    sentiment: p.sentiment ?? null,
    content: (p.content ?? '').slice(0, 250),
  }));

  const res = await chatCompletion({
    model: getModelHeavy(),
    messages: [
      { role: 'system', content: TOPIC_SYSTEM_PROMPT },
      { role: 'user', content: `貼文清單（共 ${items.length} 條）：\n${JSON.stringify(items)}` },
    ],
    temperature: 0.2,
    maxTokens: 3000,
    disableThinking: true,   // 結構化 JSON 任務：關 thinking，避免推理吃光額度導致 content 為空（→ topics 回 []）
  });

  const text = (res.content ?? '').trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1) return [];

  let parsed: ApiTopic[];
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }

  return parsed
    .filter((t) => t.name && Array.isArray(t.postIndices) && t.postIndices.length > 0)
    .map((t) => {
      const topicPosts = t.postIndices
        .filter((idx) => idx >= 0 && idx < samples.length)
        .map((idx) => samples[idx]);

      const engs = topicPosts.map((p) => p.engagementTotal ?? 0);
      const totalEngagement = engs.reduce((a, b) => a + b, 0);

      return {
        name: t.name,
        description: t.description ?? '',
        postCount: topicPosts.length,
        totalEngagement,
        avgEngagement: Math.round(mean(engs)),
        posCount: topicPosts.filter((p) => p.sentiment === 'pos').length,
        negCount: topicPosts.filter((p) => p.sentiment === 'neg').length,
        neuCount: topicPosts.filter((p) => p.sentiment !== 'pos' && p.sentiment !== 'neg').length,
        samplePosts: topicPosts.slice(0, 3).map((p) => ({
          platform: p.platform,
          username: p.username ?? '',
          content: (p.content ?? '').slice(0, 120),
          engagement: p.engagementTotal ?? 0,
        })),
      };
    })
    .sort((a, b) => b.avgEngagement - a.avgEngagement);
}
