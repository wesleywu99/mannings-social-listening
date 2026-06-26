import 'server-only';
import { queryPosts } from '@/lib/data/posts';
import { median } from '@/lib/domain/engagement';
import { computeSentimentSummary, computeSentimentTrend, detectSentimentSpikes } from '@/lib/domain/aggregate';
import type { Platform, Post } from '@/lib/domain/types';
import type { Scope, ToolDef } from './types';
import { percentile, mean, topShare, groupBy, round } from './stats';

const scopeParams = {
  platform: { type: 'string', enum: ['threads', 'ig', 'fb'], description: '平台；省略則用當前視角' },
  date_start: { type: 'string', description: '起始日期（YYYY-MM-DD）；省略則用當前視角' },
  date_end: { type: 'string', description: '結束日期（YYYY-MM-DD）；省略則用當前視角' },
};

async function fetchScoped(scope: Scope, args: Record<string, unknown>, forcePlatform?: Platform): Promise<Post[]> {
  return queryPosts({
    brand: (args.brand as string) ?? scope.brand,
    platform: forcePlatform ?? ((args.platform as Platform) ?? scope.platform),
    dateStart: (args.date_start as string) ?? scope.dateStart,
    dateEnd: (args.date_end as string) ?? scope.dateEnd,
    search: (args.search as string) ?? undefined,
  });
}

const engs = (posts: Post[]) => posts.map((p) => p.engagementTotal ?? 0);

function summarize(posts: Post[]) {
  const e = engs(posts);
  return {
    postCount: posts.length,
    totalEngagement: e.reduce((a, b) => a + b, 0),
    avgEngagement: round(mean(e)),
    medianEngagement: median(e),
  };
}

export function buildTools(scope: Scope): ToolDef[] {
  return [
    {
      name: 'aggregate_metrics',
      description: '聚合互動指標（帖數/總互動/均值/中位數），可按平台、媒體類型、日期、星期分組。回答整體表現、比較類問題時用。',
      parameters: {
        type: 'object',
        properties: {
          ...scopeParams,
          group_by: { type: 'string', enum: ['overall', 'platform', 'media_type', 'day', 'weekday'], description: '分組維度' },
        },
      },
      run: async (args) => {
        const posts = await fetchScoped(scope, args);
        const gb = (args.group_by as string) ?? 'overall';
        const keyFn: Record<string, (p: Post) => string> = {
          overall: () => 'all',
          platform: (p) => p.platform,
          media_type: (p) => p.mediaType ?? 'unknown',
          day: (p) => p.postTime.slice(0, 10),
          weekday: (p) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(p.postTime).getDay()],
        };
        const groups = groupBy(posts, keyFn[gb] ?? keyFn.overall);
        return {
          group_by: gb,
          groups: [...groups.entries()].map(([group, ps]) => ({ group, ...summarize(ps) })),
        };
      },
    },
    {
      name: 'query_posts',
      description: '取出符合條件的貼文清單（預設按互動量由高到低）。要看具體貼文、Top 榜、含某關鍵字的貼文時用。',
      parameters: {
        type: 'object',
        properties: {
          ...scopeParams,
          search: { type: 'string', description: '在內容中搜尋的關鍵字' },
          sort_by: { type: 'string', enum: ['engagement', 'recent'], description: '排序方式' },
          limit: { type: 'number', description: '回傳筆數，預設 10' },
        },
      },
      run: async (args) => {
        let posts = await fetchScoped(scope, args);
        if (args.sort_by === 'recent') posts = [...posts].sort((a, b) => b.postTime.localeCompare(a.postTime));
        const limit = Math.min((args.limit as number) ?? 10, 30);
        return posts.slice(0, limit).map((p) => ({
          platform: p.platform,
          postTime: p.postTime,
          username: p.username,
          content: (p.content ?? '').slice(0, 200),
          engagement: p.engagementTotal,
          likes: p.likes,
          comments: p.comments,
          url: p.postUrl,
        }));
      },
    },
    {
      name: 'top_creators',
      description: '依互動量排出 Top 創作者/帳號，含集中度（頭部帳號佔比）。分析 KOL 表現、誰貢獻最多聲量時用。',
      parameters: {
        type: 'object',
        properties: { ...scopeParams, limit: { type: 'number', description: 'Top N，預設 10' } },
      },
      run: async (args) => {
        const posts = await fetchScoped(scope, args);
        const byUser = groupBy(posts, (p) => p.username ?? '(unknown)');
        const rows = [...byUser.entries()].map(([username, ps]) => ({
          username,
          posts: ps.length,
          totalEngagement: engs(ps).reduce((a, b) => a + b, 0),
          avgEngagement: round(mean(engs(ps))),
        })).sort((a, b) => b.totalEngagement - a.totalEngagement);
        const total = rows.reduce((a, b) => a + b.totalEngagement, 0);
        const limit = Math.min((args.limit as number) ?? 10, 30);
        return {
          totalCreators: rows.length,
          top10Share: total ? round(rows.slice(0, Math.ceil(rows.length * 0.1)).reduce((a, b) => a + b.totalEngagement, 0) / total, 3) : 0,
          creators: rows.slice(0, limit),
        };
      },
    },
    {
      name: 'engagement_distribution',
      description: '互動量分佈：百分位（P10–P99）與集中度（Top10%/25%/50% 帖佔總互動比）。判斷「頭部依賴型 vs 遍地開花型」時用。',
      parameters: { type: 'object', properties: { ...scopeParams } },
      run: async (args) => {
        const posts = await fetchScoped(scope, args);
        const e = engs(posts);
        return {
          count: e.length,
          min: e.length ? Math.min(...e) : 0,
          max: e.length ? Math.max(...e) : 0,
          mean: round(mean(e)),
          median: median(e),
          p10: round(percentile(e, 10)), p25: round(percentile(e, 25)), p50: round(percentile(e, 50)),
          p75: round(percentile(e, 75)), p90: round(percentile(e, 90)), p95: round(percentile(e, 95)), p99: round(percentile(e, 99)),
          top10pctShare: round(topShare(e, 10), 3),
          top25pctShare: round(topShare(e, 25), 3),
          top50pctShare: round(topShare(e, 50), 3),
        };
      },
    },
    {
      name: 'time_patterns',
      description: '發文時段分析：各小時與各星期的平均互動。回答「最佳發文時間」「哪天表現好」時用。',
      parameters: { type: 'object', properties: { ...scopeParams } },
      run: async (args) => {
        const posts = await fetchScoped(scope, args);
        const byHour = groupBy(posts, (p) => String(new Date(p.postTime).getHours()));
        const byWeekday = groupBy(posts, (p) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(p.postTime).getDay()]);
        return {
          byHour: [...byHour.entries()].map(([hour, ps]) => ({ hour: Number(hour), posts: ps.length, avgEngagement: round(mean(engs(ps))) })).sort((a, b) => a.hour - b.hour),
          byWeekday: [...byWeekday.entries()].map(([weekday, ps]) => ({ weekday, posts: ps.length, avgEngagement: round(mean(engs(ps))) })),
        };
      },
    },
    {
      name: 'ig_tier_analysis',
      description: 'Instagram 粉絲分層分析（nano/micro/macro/mega），各層平均互動、互動率，以及破圈貼文（互動量 > 粉絲數）。僅適用 IG。',
      parameters: { type: 'object', properties: { date_start: scopeParams.date_start, date_end: scopeParams.date_end } },
      run: async (args) => {
        const posts = await fetchScoped(scope, args, 'ig');
        const tierOf = (f: number) => (f < 10000 ? 'nano(<1萬)' : f < 100000 ? 'micro(1-10萬)' : f < 1000000 ? 'macro(10-100萬)' : 'mega(>100萬)');
        const withF = posts.filter((p) => (p.followerCount ?? 0) > 0);
        const tiers = groupBy(withF, (p) => tierOf(p.followerCount ?? 0));
        const breakout = posts.filter((p) => (p.engagementTotal ?? 0) > (p.followerCount ?? Infinity));
        return {
          tiers: [...tiers.entries()].map(([tier, ps]) => ({
            tier,
            posts: ps.length,
            avgEngagement: round(mean(engs(ps))),
            avgEngagementRate: round(mean(ps.map((p) => (p.engagementTotal ?? 0) / (p.followerCount || 1))), 4),
          })),
          breakoutPosts: breakout.length,
          breakoutExamples: breakout.slice(0, 5).map((p) => ({ username: p.username, engagement: p.engagementTotal, followers: p.followerCount })),
        };
      },
    },
    {
      name: 'sentiment_breakdown',
      description: '情感輿情分析：正/負/中占比、負面突增信號、Top 負面貼文。回答「負面聲量」「情緒占比」「為什麼負面上升」時用。',
      parameters: {
        type: 'object',
        properties: { ...scopeParams, top_n: { type: 'number', description: '回傳 Top N 負面貼文，預設 5' } },
      },
      run: async (args) => {
        const posts = await fetchScoped(scope, args);
        const summary = computeSentimentSummary(posts);
        const trend = computeSentimentTrend(posts, (args.date_start as string) ?? scope.dateStart, (args.date_end as string) ?? scope.dateEnd);
        const spikes = detectSentimentSpikes(trend);
        const topNeg = posts
          .filter((p) => p.sentiment === 'neg')
          .sort((a, b) => (b.sentimentScore ?? 0) - (a.sentimentScore ?? 0))
          .slice(0, (args.top_n as number) ?? 5)
          .map((p) => ({
            platform: p.platform,
            username: p.username,
            content: (p.content ?? '').slice(0, 150),
            engagement: p.engagementTotal,
            score: p.sentimentScore,
          }));
        return { summary, spikes, topNegativePosts: topNeg };
      },
    },
  ];
}
