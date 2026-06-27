import 'server-only';
import { chatCompletion, getModelHeavy } from './openrouter';
import { buildTools } from './tools';
import { REPORT_SYSTEM_PROMPT } from './prompts';
import type { Scope } from './types';

export interface ReportSections {
  summary: string;
  advice: string;
  content: string;
  platform: string;
  kol: string;
  sentiment: string;
}

const FALLBACK = '此部分未能生成，請重新生成報告。';

/** 用工具組裝確定性數據摘要（SOP），不經 LLM */
async function buildContext(scope: Scope): Promise<string> {
  const tools = Object.fromEntries(buildTools(scope).map((t) => [t.name, t]));
  const [engagement, trend, creators, sentiment] = await Promise.all([
    tools.engagement_stats.run({ group_by: 'overall' }),
    tools.engagement_stats.run({ group_by: 'platform' }),
    tools.trend_analysis.run({}),
    tools.creator_ranking.run({ limit: 10 }),
    tools.sentiment_analysis.run({}),
  ]);
  return [
    `【整體互動統計】${JSON.stringify(engagement)}`,
    `【各平台對比】${JSON.stringify(trend)}`,
    `【趨勢與破圈】${JSON.stringify(trend)}`,
    `【Top 創作者】${JSON.stringify(creators)}`,
    `【情感輿情】${JSON.stringify(sentiment)}`,
  ].join('\n\n');
}

function parseSections(text: string): ReportSections {
  const keys: (keyof ReportSections)[] = ['summary', 'advice', 'content', 'platform', 'kol', 'sentiment'];
  const out = {} as ReportSections;
  for (const k of keys) {
    const re = new RegExp(`={2,}\\s*SECTION\\s*:\\s*${k}\\s*={2,}([\\s\\S]*?)(?:={2,}\\s*SECTION|$)`, 'i');
    const m = text.match(re);
    out[k] = m ? m[1].trim() : FALLBACK;
  }
  return out;
}

/** 生成完整日報（SOP：工具取數 → 單次 AI → 解析 6 段） */
export async function runReport(scope: Scope): Promise<ReportSections> {
  const ctx = await buildContext(scope);
  const res = await chatCompletion({
    model: getModelHeavy(),
    messages: [
      { role: 'system', content: REPORT_SYSTEM_PROMPT },
      { role: 'user', content: ctx },
    ],
    maxTokens: 3600,
  });
  return parseSections(res.content ?? '');
}
