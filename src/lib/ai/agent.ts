import 'server-only';
import { chatCompletion, chatCompletionStream, getModelHeavy } from './openrouter';
import { buildTools } from './tools';
import { BASE_SYSTEM_PROMPT, INSIGHT_SYSTEM_PROMPT, DAY_INSIGHT_SYSTEM_PROMPT, MODULE_INSIGHT_SYSTEM_PROMPT, scopeNote } from './prompts';
import { getKpis, queryPosts, getBrandContext } from '@/lib/data/posts';
import { median } from '@/lib/domain/engagement';
import type { Platform, Post } from '@/lib/domain/types';
import type { Scope, ChatMessage } from './types';

const MAX_TOOL_ROUNDS = 6;

/** Agentic 對話：AI 可多輪呼叫工具取數後回答 */
export async function runChat(
  userMessages: ChatMessage[],
  scope: Scope,
): Promise<{ answer: string; toolsUsed: string[] }> {
  const tools = buildTools(scope);
  const toolSchemas = tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

  // 品牌背景注入（多品牌時每品牌獨立 context）
  const brandContext = await getBrandContext(scope.brand);
  const brandNote = brandContext
    ? `\n\n【品牌背景】${JSON.stringify(brandContext)}`
    : '';

  const messages: ChatMessage[] = [
    { role: 'system', content: `${BASE_SYSTEM_PROMPT}${brandNote}\n\n${scopeNote(scope)}` },
    ...userMessages,
  ];
  const toolsUsed: string[] = [];
  let firstRoundSkippedTools = false;

  for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
    const res = await chatCompletion({
      model: getModelHeavy(),
      messages,
      tools: toolSchemas,
      // SenseNova 不支援 'required'，全用 'auto'；靠 prompt + 補救邏輯保證首輪取數
      toolChoice: 'auto',
      maxTokens: 2000,
    });
    if (res.tool_calls?.length) {
      messages.push({ role: 'assistant', content: res.content ?? null, tool_calls: res.tool_calls });
      for (const tc of res.tool_calls) {
        let result: unknown;
        try {
          const args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
          const tool = byName[tc.function.name];
          result = tool ? await tool.run(args) : { error: `unknown tool ${tc.function.name}` };
        } catch (e) {
          result = { error: String(e) };
        }
        toolsUsed.push(tc.function.name);
        messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: JSON.stringify(result) });
      }
      continue;
    }
    // 補救：第一輪未呼叫工具 → 注入 system 訊息強制取數後再試一輪
    if (i === 0 && !firstRoundSkippedTools) {
      firstRoundSkippedTools = true;
      messages.push({ role: 'assistant', content: res.content ?? null });
      messages.push({
        role: 'system',
        content: '你剛才未呼叫任何工具。記住規則：回答任何數據相關問題前必須先呼叫至少一個工具取得真實數字。請現在立即呼叫一個適當的工具。',
      });
      continue;
    }
    return { answer: res.content ?? '（無回應）', toolsUsed };
  }

  // 超過工具迴圈上限：強制要最終回答（不帶工具）
  const final = await chatCompletion({ model: getModelHeavy(), messages });
  return { answer: final.content ?? '（無法產生回應）', toolsUsed };
}

/** Agentic 對話（串流版）：yield { type, content } 事件給前端逐字渲染 */
export type ChatStreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'tools'; toolsUsed: string[] }
  | { type: 'done'; toolsUsed: string[] };

export async function* runChatStream(
  userMessages: ChatMessage[],
  scope: Scope,
): AsyncGenerator<ChatStreamEvent> {
  const tools = buildTools(scope);
  const toolSchemas = tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

  const brandContext = await getBrandContext(scope.brand);
  const brandNote = brandContext ? `\n\n【品牌背景】${JSON.stringify(brandContext)}` : '';

  const messages: ChatMessage[] = [
    { role: 'system', content: `${BASE_SYSTEM_PROMPT}${brandNote}\n\n${scopeNote(scope)}` },
    ...userMessages,
  ];
  const toolsUsed: string[] = [];
  let firstRoundSkippedTools = false;

  for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
    const stream = chatCompletionStream({
      model: getModelHeavy(),
      messages,
      tools: toolSchemas,
      toolChoice: 'auto',
      maxTokens: 2000,
    });

    let result = null;
    for await (const ev of stream) {
      if (ev.type === 'delta' && ev.content) {
        yield { type: 'delta', content: ev.content };
      } else if (ev.type === 'done') {
        result = ev.result;
      }
    }
    if (!result) break;

    if (result.tool_calls?.length) {
      messages.push({ role: 'assistant', content: result.content ?? null, tool_calls: result.tool_calls });
      for (const tc of result.tool_calls) {
        let toolResult: unknown;
        try {
          const args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
          const tool = byName[tc.function.name];
          toolResult = tool ? await tool.run(args) : { error: `unknown tool ${tc.function.name}` };
        } catch (e) {
          toolResult = { error: String(e) };
        }
        toolsUsed.push(tc.function.name);
        yield { type: 'tools', toolsUsed: [...toolsUsed] };
        messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: JSON.stringify(toolResult) });
      }
      continue;
    }

    // 補救：第一輪未呼叫工具 → 強制取數後再試一輪
    if (i === 0 && !firstRoundSkippedTools) {
      firstRoundSkippedTools = true;
      messages.push({ role: 'assistant', content: result.content ?? null });
      messages.push({
        role: 'system',
        content: '你剛才未呼叫任何工具。記住規則：回答任何數據相關問題前必須先呼叫至少一個工具取得真實數字。請現在立即呼叫一個適當的工具。',
      });
      continue;
    }
    yield { type: 'done', toolsUsed };
    return;
  }

  // 超過工具迴圈上限：強制要最終回答（不帶工具，串流）
  const finalStream = chatCompletionStream({ model: getModelHeavy(), messages, maxTokens: 2000 });
  for await (const ev of finalStream) {
    if (ev.type === 'delta' && ev.content) {
      yield { type: 'delta', content: ev.content };
    }
  }
  yield { type: 'done', toolsUsed };
}

export interface DayInsight { topic: string; cause: string; actions: string; }

/** 破圈區間解讀（日桶/週桶通用）：抓區間內（全平台）貼文 + 統計 → AI 產出 主題/成因/行動點 */
export async function runDayInsight(start: string, end: string, scope: Scope): Promise<DayInsight> {
  const posts = await queryPosts({
    brand: scope.brand,
    dateStart: `${start}T00:00:00`,
    dateEnd: `${end}T23:59:59`,
  });
  const engs = posts.map((p) => p.engagementTotal ?? 0);
  const totalEng = engs.reduce((a, b) => a + b, 0);
  const epp = posts.length ? Math.round(totalEng / posts.length) : 0;
  const top = [...posts].sort((a, b) => (b.engagementTotal ?? 0) - (a.engagementTotal ?? 0)).slice(0, 10);
  const span = start === end ? `日期=${start}` : `期間=${start}~${end}`;

  const ctx = [
    `【區間統計】${span}，貼文數=${posts.length}，總互動=${totalEng}，每帖互動=${epp}`,
    '【區間 Top 貼文】',
    ...top.map((p, i) =>
      `${i + 1}. [${p.platform}] @${p.username ?? ''} 互動=${p.engagementTotal ?? 0}${p.followerCount != null ? ` 粉絲=${p.followerCount}` : ''}｜${(p.content ?? '').slice(0, 160)}`,
    ),
  ].join('\n');

  const res = await chatCompletion({
    model: getModelHeavy(),
    messages: [
      { role: 'system', content: DAY_INSIGHT_SYSTEM_PROMPT },
      { role: 'user', content: ctx },
    ],
    maxTokens: 1600,
  });
  const text = res.content ?? '';
  const grab = (key: string) => {
    const m = text.match(new RegExp(`={2,}\\s*SECTION\\s*:\\s*${key}\\s*={2,}([\\s\\S]*?)(?:={2,}\\s*SECTION|$)`, 'i'));
    return m ? m[1].trim() : '';
  };
  return {
    topic: grab('topic') || text.trim() || '（無法產生解讀）',
    cause: grab('cause'),
    actions: grab('actions'),
  };
}

/** 平台級 AI 解讀：對當前篩選的單一平台數據做三段分析 */
export async function runModuleInsight(platform: Platform, scope: Scope): Promise<string> {
  const posts = await queryPosts({ brand: scope.brand, platform, dateStart: scope.dateStart, dateEnd: scope.dateEnd });
  const engs = posts.map((p) => p.engagementTotal ?? 0);
  const total = engs.reduce((a, b) => a + b, 0);
  const avg = posts.length ? Math.round(total / posts.length) : 0;
  const med = median(engs);
  const top = [...posts].sort((a, b) => (b.engagementTotal ?? 0) - (a.engagementTotal ?? 0)).slice(0, 10);
  const name = { ig: 'Instagram', threads: 'Threads', fb: 'Facebook' }[platform];
  const ctx = [
    `【${name} 當前篩選統計】貼文數=${posts.length}，總互動=${total}，均互動=${avg}，中位數=${med}`,
    '【Top 10 貼文】',
    ...top.map((p, i) => `${i + 1}. @${p.username ?? ''} 互動=${p.engagementTotal ?? 0}${p.followerCount != null ? ` 粉絲=${p.followerCount}` : ''}｜${(p.content ?? '').slice(0, 120)}`),
  ].join('\n');
  const res = await chatCompletion({
    model: getModelHeavy(),
    messages: [{ role: 'system', content: MODULE_INSIGHT_SYSTEM_PROMPT }, { role: 'user', content: ctx }],
    maxTokens: 900,
  });
  return res.content ?? '（無法產生解讀）';
}

/** AI 解讀：針對單一貼文的一次性解讀（與當前平台基準比較） */
export async function runInsight(post: Post, scope: Scope): Promise<string> {
  const { kpis } = await getKpis({ brand: scope.brand, dateStart: scope.dateStart, dateEnd: scope.dateEnd });
  const k = kpis.find((x) => x.platform === post.platform);
  const ctx = [
    '【貼文資料】',
    `平台=${post.platform}`,
    `帳號=${post.username}`,
    `發布時間=${post.postTime}`,
    `互動量=${post.engagementTotal}`,
    `讚=${post.likes}　留言=${post.comments}`,
    post.followerCount != null ? `粉絲數=${post.followerCount}` : '',
    `其他互動=${JSON.stringify(post.metrics)}`,
    post.sentiment ? `情感標記=${post.sentiment === 'pos' ? '正面' : post.sentiment === 'neg' ? '負面' : '中性'}（置信度=${post.sentimentScore ?? 'N/A'}）` : '',
    `內容=${(post.content ?? '').slice(0, 500)}`,
    '',
    '【該平台基準】',
    k ? `均互動=${k.avgEngagement}，爆款率=${(k.anomalyRate * 100).toFixed(1)}%，總帖數=${k.postCount}` : '（無基準資料）',
  ].filter(Boolean).join('\n');

  const res = await chatCompletion({
    model: getModelHeavy(),
    messages: [
      { role: 'system', content: INSIGHT_SYSTEM_PROMPT },
      { role: 'user', content: ctx },
    ],
    maxTokens: 800,
  });
  return res.content ?? '（無法產生解讀）';
}
