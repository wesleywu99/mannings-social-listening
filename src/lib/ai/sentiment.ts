import { chatCompletion, getModelFast } from './openrouter';
import type { Post, Sentiment } from '@/lib/domain/types';

export interface SentimentTag {
  id: number;
  sentiment: Sentiment;
  score: number;  // -1 ~ 1
}

const BATCH_SIZE = 10;

const SYSTEM_PROMPT = `你是社交貼文情感分類器。給定一批貼文（含編號與內容），對每條判斷它對品牌（Mannings 萬寧）的情緒傾向：

- pos：正面（讚美、推薦、喜愛、期待、好評）
- neg：負面（抱怨、批評、不滿、失望、負面體驗）
- neu：中性（純分享、資訊轉發、無明顯情緒、或與品牌無關）

同時給一個置信度分數（-1 到 1，負面越接近 -1，正面越接近 1，中性接近 0）。

**只回 JSON 陣列**，格式嚴格為：[{"id":123,"sentiment":"pos","score":0.8}]
不要加任何說明文字、不要用 markdown code fence。`;

interface ApiTag { id: number; sentiment: string; score: number }

/** 把一批貼文（≤10 條）交給 AI 標記，回傳標記結果 */
export async function tagPostsBatch(posts: Post[]): Promise<SentimentTag[]> {
  if (!posts.length) return [];
  const items = posts.map((p) => ({
    id: p.id,
    content: (p.content ?? '').slice(0, 300),
    platform: p.platform,
    username: p.username,
  }));
  const userMsg = `貼文清單（共 ${items.length} 條）：\n${JSON.stringify(items, null, 2)}`;

  const res = await chatCompletion({
    model: getModelFast(),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
    temperature: 0.1,
    maxTokens: 1500,
  });

  const text = (res.content ?? '').trim();
  // 寬鬆解析：抓第一個 [ 到最後一個 ]
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1) {
    throw new Error('AI 回應不含 JSON 陣列: ' + text.slice(0, 200));
  }
  const json = text.slice(start, end + 1);
  const parsed = JSON.parse(json) as ApiTag[];

  const valid: Sentiment[] = ['pos', 'neu', 'neg'];
  return parsed
    .filter((t) => valid.includes(t.sentiment as Sentiment) && typeof t.id === 'number')
    .map((t) => ({
      id: t.id,
      sentiment: t.sentiment as Sentiment,
      score: typeof t.score === 'number' ? Math.max(-1, Math.min(1, t.score)) : 0,
    }));
}

/** 把多批貼文串起來標記，回傳所有結果（失敗的批次跳過並 log） */
export async function tagPosts(
  posts: Post[],
  onBatchDone?: (done: number, total: number) => void,
): Promise<SentimentTag[]> {
  const out: SentimentTag[] = [];
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    try {
      const tags = await tagPostsBatch(batch);
      out.push(...tags);
    } catch (e) {
      console.error(`[sentiment] batch ${Math.floor(i / BATCH_SIZE)} failed:`, e);
    }
    onBatchDone?.(Math.min(i + BATCH_SIZE, posts.length), posts.length);
  }
  return out;
}

const CONCURRENCY = 2;
const BATCH_DELAY_MS = 500;  // 每批之間間隔，避免觸發限流

/** 並發版本：同時跑 CONCURRENCY 批，加快大規模標記 */
export async function tagPostsConcurrent(
  posts: Post[],
  onBatchDone?: (done: number, total: number) => void,
): Promise<SentimentTag[]> {
  const batches: Post[][] = [];
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    batches.push(posts.slice(i, i + BATCH_SIZE));
  }
  const results: SentimentTag[][] = new Array(batches.length);
  let done = 0;
  let idx = 0;

  async function worker() {
    while (idx < batches.length) {
      const myIdx = idx++;
      try {
        results[myIdx] = await tagPostsBatch(batches[myIdx]);
      } catch (e) {
        console.error(`[sentiment] batch ${myIdx} failed:`, e);
        results[myIdx] = [];
      }
      done++;
      onBatchDone?.(done * BATCH_SIZE, posts.length);
      if (BATCH_DELAY_MS > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, () => worker()));
  return results.flat();
}
