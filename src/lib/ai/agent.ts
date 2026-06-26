import 'server-only';
import { chatCompletion, getModelHeavy } from './openrouter';
import { buildTools } from './tools';
import { BASE_SYSTEM_PROMPT, INSIGHT_SYSTEM_PROMPT, DAY_INSIGHT_SYSTEM_PROMPT, scopeNote } from './prompts';
import { getKpis, queryPosts } from '@/lib/data/posts';
import type { Post } from '@/lib/domain/types';
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

  const messages: ChatMessage[] = [
    { role: 'system', content: `${BASE_SYSTEM_PROMPT}\n\n${scopeNote(scope)}` },
    ...userMessages,
  ];
  const toolsUsed: string[] = [];

  for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
    const res = await chatCompletion({
      model: getModelHeavy(),
      messages,
      tools: toolSchemas,
      // 第一輪強制至少呼叫一次工具（避免模型偷懶只寒暄/給選單），之後自由
      toolChoice: i === 0 ? 'required' : 'auto',
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
    return { answer: res.content ?? '（無回應）', toolsUsed };
  }

  // 超過工具迴圈上限：強制要最終回答（不帶工具）
  const final = await chatCompletion({ model: getModelHeavy(), messages });
  return { answer: final.content ?? '（無法產生回應）', toolsUsed };
}

export interface DayInsight { topic: string; cause: string; actions: string; }

/** 單日破圈解讀：抓當天（全平台）貼文 + 統計 → AI 產出 主題/成因/行動點 */
export async function runDayInsight(date: string, scope: Scope): Promise<DayInsight> {
  const posts = await queryPosts({
    brand: scope.brand,
    dateStart: `${date}T00:00:00`,
    dateEnd: `${date}T23:59:59`,
  });
  const engs = posts.map((p) => p.engagementTotal ?? 0);
  const totalEng = engs.reduce((a, b) => a + b, 0);
  const epp = posts.length ? Math.round(totalEng / posts.length) : 0;
  const top = [...posts].sort((a, b) => (b.engagementTotal ?? 0) - (a.engagementTotal ?? 0)).slice(0, 10);

  const ctx = [
    `【當日統計】日期=${date}，貼文數=${posts.length}，總互動=${totalEng}，每帖互動=${epp}`,
    '【當日 Top 貼文】',
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
