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
  topics: string;
  competitor: string;
}

const FALLBACK = '此部分未能生成，請重新生成報告。';

// ─── content_samples 返回值型別（與 tools.ts 對齊） ─────────────────────

interface Sample {
  platform: string;
  postTime: string;
  username: string;
  content: string;
  engagement: number;
  sentiment?: string;
  url?: string;
}

// ─── 格式化輔助 ──────────────────────────────────────────────────────

function fmtSample(p: Sample, i: number): string {
  const date = p.postTime?.slice(0, 10) ?? '';
  const sent = p.sentiment ? ` 情感=${p.sentiment}` : '';
  return `${i + 1}. [${p.platform}] @${p.username ?? ''} ${date} 互動=${p.engagement}${sent}｜${p.content}`;
}

/** 取破圈日（最多 3 天）的 Top 帖子樣本 */
async function fetchBreakoutSamples(
  tools: Record<string, { run: (args: Record<string, unknown>) => Promise<unknown> }>,
  breakouts: Array<{ date: string }>,
): Promise<Sample[]> {
  const dates = breakouts.slice(0, 3).map((b) => b.date);
  const results = await Promise.all(
    dates.map((d) =>
      tools.content_samples.run({
        date_start: `${d}T00:00:00`,
        date_end: `${d}T23:59:59`,
        sort_by: 'engagement',
        limit: 5,
      }) as Promise<Sample[]>,
    ),
  );
  return results.flat();
}

// ─── 報告上下文組裝 ────────────────────────────────────────────────────

/** 用工具組裝確定性數據摘要（SOP），不經 LLM */
async function buildContext(scope: Scope): Promise<string> {
  const tools = Object.fromEntries(buildTools(scope).map((t) => [t.name, t]));

  // 第一波：並行取所有聚合統計 + 帖子樣本 + 話題分析 + 競品對比
  const [
    engagement, platformStats, mediaStats,
    trend, creators, sentiment,
    topSamples, negSamples, topicData, competitorData,
  ] = await Promise.all([
    tools.engagement_stats.run({ group_by: 'overall' }),
    tools.engagement_stats.run({ group_by: 'platform' }),
    tools.engagement_stats.run({ group_by: 'media_type' }),
    tools.trend_analysis.run({}),
    tools.creator_ranking.run({ limit: 10 }),
    tools.sentiment_analysis.run({}),
    tools.content_samples.run({ sort_by: 'engagement', limit: 15 }) as Promise<Sample[]>,
    tools.content_samples.run({ sentiment: 'neg', sort_by: 'engagement', limit: 10 }) as Promise<Sample[]>,
    tools.topic_analysis.run({}),
    tools.competitor_benchmark.run({}),
  ]);

  // 統計段落
  const parts: string[] = [
    `【整體互動統計】${JSON.stringify(engagement)}`,
    `【各平台對比】${JSON.stringify(platformStats)}`,
    `【媒體類型對比】${JSON.stringify(mediaStats)}`,
    `【趨勢與破圈】${JSON.stringify(trend)}`,
    `【Top 創作者】${JSON.stringify(creators)}`,
    `【情感輿情】${JSON.stringify(sentiment)}`,
    `【話題分析】${JSON.stringify(topicData)}`,
  ];

  // 競品對比（無數據時不加入，AI 會自動跳過該段）
  const compData = competitorData as { error?: string };
  if (!compData?.error) {
    parts.push(`【競品對比】${JSON.stringify(competitorData)}`);
  }

  // 帖子原文段落（讓 AI 能分析實際內容，而非只看統計數字）
  if (topSamples.length > 0) {
    parts.push(
      `【高互動帖子樣本（Top ${topSamples.length}）】\n`
      + topSamples.map(fmtSample).join('\n'),
    );
  }

  if (negSamples.length > 0) {
    parts.push(
      `【負面帖子樣本（共 ${negSamples.length} 則）】\n`
      + negSamples.map(fmtSample).join('\n'),
    );
  }

  // 第二波：破圈日帖子（依賴 trend 結果，需順序執行）
  const trendData = trend as { breakouts?: Array<{ date: string }> };
  if (trendData?.breakouts?.length) {
    const breakoutPosts = await fetchBreakoutSamples(tools, trendData.breakouts);
    if (breakoutPosts.length > 0) {
      const dates = trendData.breakouts.slice(0, 3).map((b) => b.date).join('、');
      parts.push(
        `【破圈日帖子樣本（${dates}）】\n`
        + breakoutPosts.map(fmtSample).join('\n'),
      );
    }
  }

  return parts.join('\n\n');
}

function parseSections(text: string): ReportSections {
  const keys: (keyof ReportSections)[] = [
    'summary', 'advice', 'content', 'platform', 'kol', 'sentiment', 'topics', 'competitor',
  ];
  const out = {} as ReportSections;
  for (const k of keys) {
    const re = new RegExp(`={2,}\\s*SECTION\\s*:\\s*${k}\\s*={2,}([\\s\\S]*?)(?:={2,}\\s*SECTION|$)`, 'i');
    const m = text.match(re);
    out[k] = m ? m[1].trim() : FALLBACK;
  }
  return out;
}

/** 生成完整日報（SOP：工具取數 → 單次 AI → 解析 8 段） */
export async function runReport(scope: Scope): Promise<ReportSections> {
  const ctx = await buildContext(scope);
  const res = await chatCompletion({
    model: getModelHeavy(),
    messages: [
      { role: 'system', content: REPORT_SYSTEM_PROMPT },
      { role: 'user', content: ctx },
    ],
    maxTokens: 4800,
  });
  return parseSections(res.content ?? '');
}
