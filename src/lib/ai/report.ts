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
  igRate: string;
}

const FALLBACK = '此部分未能生成，請重新生成報告。';

/** 用工具組裝確定性數據摘要（SOP），不經 LLM */
async function buildContext(scope: Scope): Promise<string> {
  const tools = Object.fromEntries(buildTools(scope).map((t) => [t.name, t]));
  const [overall, platform, creators, dist, time, igTier] = await Promise.all([
    tools.aggregate_metrics.run({ group_by: 'overall' }),
    tools.aggregate_metrics.run({ group_by: 'platform' }),
    tools.top_creators.run({ limit: 10 }),
    tools.engagement_distribution.run({}),
    tools.time_patterns.run({}),
    tools.ig_tier_analysis.run({}),
  ]);
  return [
    `【整體】${JSON.stringify(overall)}`,
    `【各平台】${JSON.stringify(platform)}`,
    `【Top 創作者】${JSON.stringify(creators)}`,
    `【互動分佈】${JSON.stringify(dist)}`,
    `【發文時段】${JSON.stringify(time)}`,
    `【IG 粉絲分層】${JSON.stringify(igTier)}`,
  ].join('\n\n');
}

function parseSections(text: string): ReportSections {
  const keys: (keyof ReportSections)[] = ['summary', 'advice', 'content', 'platform', 'kol', 'igRate'];
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
    maxTokens: 3000,
  });
  return parseSections(res.content ?? '');
}
