import 'server-only';
import { queryPosts, listBrands } from '@/lib/data/posts';
import {
  computeKpis,
  computeTrends,
  detectBreakouts,
  computeSentimentSummary,
  computeSentimentTrend,
  detectSentimentSpikes,
  type TrendPoint,
} from '@/lib/domain/aggregate';
import { anomalyThreshold, median } from '@/lib/domain/engagement';
import type { Platform, Post } from '@/lib/domain/types';
import type { Scope, ToolDef } from './types';
import { percentile, mean, topShare, groupBy, round } from './stats';
import { analyzeTopics } from './topics';

const scopeParams = {
  platform: { type: 'string', enum: ['threads', 'ig', 'fb'], description: '平台；省略則用當前視角（跨平台）' },
  date_start: { type: 'string', description: '起始日期（YYYY-MM-DD）；省略則用當前視角' },
  date_end: { type: 'string', description: '結束日期（YYYY-MM-DD）；省略則用當前視角' },
};

/** 任意組合過濾參數（用於 ad-hoc 聚合 + content_samples） */
const filterParams = {
  ...scopeParams,
  username: { type: 'string', description: '精確帳號（不分大小寫），如查某個創作者時用' },
  follower_min: { type: 'number', description: '粉絲數下限（含）' },
  follower_max: { type: 'number', description: '粉絲數上限（不含）' },
  sentiment: { type: 'string', enum: ['pos', 'neu', 'neg'], description: '情感標記過濾' },
  search: { type: 'string', description: '內容關鍵字' },
};

async function fetchScoped(scope: Scope, args: Record<string, unknown>, forcePlatform?: Platform): Promise<Post[]> {
  return queryPosts({
    brand: (args.brand as string) ?? scope.brand,
    platform: forcePlatform ?? ((args.platform as Platform) ?? scope.platform),
    dateStart: (args.date_start as string) ?? scope.dateStart,
    dateEnd: (args.date_end as string) ?? scope.dateEnd,
    search: (args.search as string) ?? undefined,
    username: (args.username as string) ?? undefined,
    followerMin: (args.follower_min as number) ?? undefined,
    followerMax: (args.follower_max as number) ?? undefined,
    sentiment: (args.sentiment as Post['sentiment']) ?? undefined,
  });
}

/** 取上一期（與當前視角等長的緊鄰區間） */
function prevRange(scope: Scope): { dateStart: string; dateEnd: string } | null {
  if (!scope.dateStart || !scope.dateEnd) return null;
  const DAY = 86400000;
  const s = new Date(scope.dateStart).getTime();
  const e = new Date(scope.dateEnd).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  const len = Math.round((e - s) / DAY) + 1;
  const pe = s - DAY;
  const ps = pe - (len - 1) * DAY;
  const f = (t: number) => {
    const d = new Date(t);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  };
  return { dateStart: `${f(ps)}T00:00:00`, dateEnd: `${f(pe)}T23:59:59` };
}

const engs = (posts: Post[]) => posts.map((p) => p.engagementTotal ?? 0);

export function buildTools(scope: Scope): ToolDef[] {
  return [
    // 1. 互動統計（含跨期對比）
    {
      name: 'engagement_stats',
      description: '互動指標統計：帖數/總互動/均值/中位數/百分位/集中度，可按平台/媒體分組，含與上一期的變化（Δ）。回答整體表現、平台對比、比上期好或差時用。',
      parameters: {
        type: 'object',
        properties: {
          ...scopeParams,
          group_by: { type: 'string', enum: ['overall', 'platform', 'media_type'], description: '分組維度，預設 overall' },
        },
      },
      run: async (args) => {
        const posts = await fetchScoped(scope, args);
        const gb = (args.group_by as string) ?? 'overall';
        const keyFn: Record<string, (p: Post) => string> = {
          overall: () => 'all',
          platform: (p) => p.platform,
          media_type: (p) => p.mediaType ?? 'unknown',
        };
        const groups = groupBy(posts, keyFn[gb] ?? keyFn.overall);

        // 當期統計
        const cur = [...groups.entries()].map(([group, ps]) => {
          const e = engs(ps);
          return {
            group,
            postCount: ps.length,
            totalEngagement: e.reduce((a, b) => a + b, 0),
            avgEngagement: round(mean(e)),
            medianEngagement: median(e),
            p25: round(percentile(e, 25)),
            p75: round(percentile(e, 75)),
            p90: round(percentile(e, 90)),
            top10pctShare: round(topShare(e, 10), 3),  // 集中度
            anomalyRate: ps.length ? e.filter((x) => x > anomalyThreshold(e)).length / ps.length : 0,
            sentiment: computeSentimentSummary(ps),
          };
        });

        // 上一期對比（僅 overall 模式做跨期，分組模式跨期太複雜）
        let comparison: { prevPostCount: number; prevTotalEng: number; prevAvg: number; deltaTotal: number; deltaAvg: number } | null = null;
        if (gb === 'overall') {
          const pr = prevRange(scope);
          if (pr) {
            const prevPosts = await queryPosts({ brand: scope.brand, dateStart: pr.dateStart, dateEnd: pr.dateEnd });
            const pe = engs(prevPosts);
            const curTotal = cur[0]?.totalEngagement ?? 0;
            const curAvg = cur[0]?.avgEngagement ?? 0;
            const prevTotal = pe.reduce((a, b) => a + b, 0);
            const prevAvg = prevPosts.length ? mean(pe) : 0;
            comparison = {
              prevPostCount: prevPosts.length,
              prevTotalEng: prevTotal,
              prevAvg: round(prevAvg),
              deltaTotal: prevTotal ? round((curTotal - prevTotal) / prevTotal, 3) : 0,
              deltaAvg: prevAvg ? round((curAvg - prevAvg) / prevAvg, 3) : 0,
            };
          }
        }

        return { group_by: gb, groups: cur, comparison };
      },
    },

    // 2. 趨勢分析（時間序列 + 破圈 + 情感趨勢 + 突增信號）
    {
      name: 'trend_analysis',
      description: '時間趨勢分析：逐日/週的互動量+帖數+情感占比序列、破圈日清單、負面突增信號。回答「哪天爆了」「最近趨勢如何」「負面何時上升」時用。',
      parameters: {
        type: 'object',
        properties: {
          ...scopeParams,
          metric: { type: 'string', enum: ['engagement', 'posts', 'sentiment'], description: '趨勢指標，預設 engagement' },
        },
      },
      run: async (args) => {
        const posts = await fetchScoped(scope, args);
        const trends = computeTrends(posts, args.date_start as string, args.date_end as string);
        // 合併三平台為全平台序列
        const platforms: Platform[] = ['ig', 'threads', 'fb'];
        const days = trends[platforms[0]] ?? [];
        const merged = days.map((_, i) => ({
          date: days[i].date,
          engagement: platforms.reduce((s, p) => s + (trends[p]?.[i]?.engagement ?? 0), 0),
          posts: platforms.reduce((s, p) => s + (trends[p]?.[i]?.posts ?? 0), 0),
        }));

        const engSeries = merged.map((m) => m.engagement);
        const postSeries = merged.map((m) => m.posts);
        const flags = detectBreakouts(engSeries, postSeries);
        const breakouts = merged
          .map((m, i) => ({ date: m.date, engagement: m.engagement, posts: m.posts, ...flags[i] }))
          .filter((x) => x.eff || x.peak);

        const sentimentTrend = computeSentimentTrend(posts, args.date_start as string, args.date_end as string);
        const sentimentSpikes = detectSentimentSpikes(sentimentTrend);

        return {
          series: merged,
          breakouts,  // 破圈日
          sentimentSpikes,  // 負面突增
          summary: {
            totalDays: merged.length,
            breakoutCount: breakouts.length,
            spikeCount: sentimentSpikes.length,
            bestDay: merged.length ? merged.reduce((a, b) => (b.engagement > a.engagement ? b : a)) : null,
          },
        };
      },
    },

    // 3. 創作者排名（含黑馬偵測）
    {
      name: 'creator_ranking',
      description: '創作者排名：Top N 帳號依互動量，含集中度、黑馬（粉少互動高）、衰退（高粉低互動）。回答「誰貢獻最多聲量」「有哪些黑馬KOL」時用。',
      parameters: {
        type: 'object',
        properties: {
          ...scopeParams,
          limit: { type: 'number', description: 'Top N，預設 10' },
        },
      },
      run: async (args) => {
        const posts = await fetchScoped(scope, args);
        const byUser = groupBy(posts, (p) => p.username ?? '(unknown)');
        const rows = [...byUser.entries()].map(([username, ps]) => {
          const e = engs(ps);
          const avgFollowers = ps.length ? mean(ps.map((p) => p.followerCount ?? 0)) : 0;
          return {
            username,
            posts: ps.length,
            totalEngagement: e.reduce((a, b) => a + b, 0),
            avgEngagement: round(mean(e)),
            avgFollowers: Math.round(avgFollowers),
            platforms: [...new Set(ps.map((p) => p.platform))],
          };
        }).sort((a, b) => b.totalEngagement - a.totalEngagement);

        const total = rows.reduce((s, r) => s + r.totalEngagement, 0);
        const limit = Math.min((args.limit as number) ?? 10, 30);
        const top = rows.slice(0, limit);

        // 黑馬：粉絲 < 1萬 且 平均互動 > 整體均值的 1.5 倍
        const overallAvg = total ? total / posts.length : 0;
        const darkHorses = rows
          .filter((r) => r.avgFollowers > 0 && r.avgFollowers < 10000 && r.avgEngagement > overallAvg * 1.5)
          .slice(0, 5);

        // 衰退：粉絲 > 5萬 且 平均互動 < 整體均值的 0.5 倍
        const declining = rows
          .filter((r) => r.avgFollowers > 50000 && r.avgEngagement < overallAvg * 0.5)
          .slice(0, 5);

        return {
          totalCreators: rows.length,
          top10Share: total ? round(rows.slice(0, Math.ceil(rows.length * 0.1)).reduce((s, r) => s + r.totalEngagement, 0) / total, 3) : 0,
          top,
          darkHorses,
          declining,
        };
      },
    },

    // 4. 情感分析（占比 + 突增 + Top 負面帖摘要）
    {
      name: 'sentiment_analysis',
      description: '情感輿情：正/中/負占比、情緒指數、負面突增信號、Top 負面帖文摘要。回答「負面聲量」「情緒健康度」「為什麼負面上升」時用。',
      parameters: {
        type: 'object',
        properties: {
          ...scopeParams,
          top_n: { type: 'number', description: '回傳 Top N 負面帖摘要，預設 5' },
        },
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
            postTime: p.postTime,
          }));
        return { summary, spikes, topNegativePosts: topNeg };
      },
    },

    // 4.5 Ad-hoc 聚合（任意組合過濾 → 預聚合統計，不返回 raw array）
    {
      name: 'aggregate_filtered',
      description: 'Ad-hoc 聚合：對任意組合過濾條件（帳號/粉絲區間/關鍵詞/情感/平台/日期）做預聚合統計。回答「@某人表現如何」「含X的帖情感如何」「粉絲1-10萬誰互動高」等預設工具未覆蓋的問題時用。返回統計描述（帖數/互動/情感占比/Top5帖摘要），不返回 raw array。',
      parameters: {
        type: 'object',
        properties: filterParams,
      },
      run: async (args) => {
        const posts = await fetchScoped(scope, args);
        const e = engs(posts);
        const summary = computeSentimentSummary(posts);
        // Top 5 帖摘要（精簡，不帶 raw metrics）
        const top = [...posts].slice(0, 5).map((p) => ({
          platform: p.platform,
          username: p.username,
          content: (p.content ?? '').slice(0, 120),
          engagement: p.engagementTotal,
          sentiment: p.sentiment,
          postTime: p.postTime,
        }));
        return {
          filter: {
            platform: args.platform ?? 'all',
            username: args.username ?? null,
            followerRange: [args.follower_min ?? null, args.follower_max ?? null],
            sentiment: args.sentiment ?? null,
            search: args.search ?? null,
            dateRange: [args.date_start ?? null, args.date_end ?? null],
          },
          stats: {
            postCount: posts.length,
            totalEngagement: e.reduce((a, b) => a + b, 0),
            avgEngagement: round(mean(e)),
            medianEngagement: median(e),
            p90: round(percentile(e, 90)),
          },
          sentiment: summary,
          topPosts: top,
        };
      },
    },

    // 5. 帖文樣本（受限 raw，僅用於看具體帖文）
    {
      name: 'content_samples',
      description: '取出符合條件的帖文樣本（按互動量或時間排序）。支持任意組合過濾（帳號/粉絲區間/關鍵詞/情感/平台/日期）。僅用於「看具體帖文」「列出 Top 帖」時用；統計性問題請用 engagement_stats 或 aggregate_filtered。回傳字段精簡。',
      parameters: {
        type: 'object',
        properties: {
          ...filterParams,
          sort_by: { type: 'string', enum: ['engagement', 'recent'], description: '排序，預設 engagement' },
          limit: { type: 'number', description: '回傳筆數，預設 5，最多 15' },
        },
      },
      run: async (args) => {
        let posts = await fetchScoped(scope, args);
        if (args.sort_by === 'recent') posts = [...posts].sort((a, b) => b.postTime.localeCompare(a.postTime));
        const limit = Math.min((args.limit as number) ?? 5, 15);
        return posts.slice(0, limit).map((p) => ({
          platform: p.platform,
          postTime: p.postTime,
          username: p.username,
          content: (p.content ?? '').slice(0, 200),
          engagement: p.engagementTotal,
          likes: p.likes,
          comments: p.comments,
          sentiment: p.sentiment,
          url: p.postUrl,
        }));
      },
    },

    // 6. 主題聚類（分層採樣 → LLM 分類 → 結構化話題列表）
    {
      name: 'topic_analysis',
      description: '話題分析：從帖子內容中識別 5-10 個討論主題，含各主題的帖數、互動量、情感分布。回答「什麼話題最受關注」「哪些話題互動效率高」「負面集中在什麼話題」時用。',
      parameters: {
        type: 'object',
        properties: {
          ...scopeParams,
        },
      },
      run: async (args) => {
        const posts = await fetchScoped(scope, args);
        return analyzeTopics(posts, scope.dateStart, scope.dateEnd);
      },
    },

    // 7. 競品對比（多品牌聲量/互動/情感/內容差距分析）
    {
      name: 'competitor_benchmark',
      description: '競品對比分析：比較自有品牌與所有競品的聲量份額、互動效率、情感健康度、內容策略差距、KOL 重疊。回答「競品表現如何」「我們的優勢和弱點」「競品做了什麼我們沒做」時用。若無競品資料則回傳空結果。',
      parameters: {
        type: 'object',
        properties: {
          ...scopeParams,
        },
      },
      run: async (args) => {
        const MIN_POSTS = 10;
        const brands = await listBrands();
        const competitors = brands.filter((b: Record<string, unknown>) => !b.is_own);
        if (competitors.length === 0) return { error: 'no_competitors', brands: [] };

        const dateStart = (args.date_start as string) ?? scope.dateStart;
        const dateEnd = (args.date_end as string) ?? scope.dateEnd;

        // 並行取所有品牌帖子
        const allBrands = [scope.brand, ...competitors.map((c: Record<string, unknown>) => c.name as string)];
        const brandPosts = new Map<string, Post[]>();
        await Promise.all(
          allBrands.map(async (brand) => {
            brandPosts.set(brand, await queryPosts({ brand, dateStart, dateEnd }));
          }),
        );

        // 各品牌基礎指標
        const comparisons = allBrands.map((brand) => {
          const posts = brandPosts.get(brand) ?? [];
          const engs = posts.map((p) => p.engagementTotal ?? 0);
          const totalEng = engs.reduce((a, b) => a + b, 0);
          return {
            brand,
            isOwn: brand === scope.brand,
            postCount: posts.length,
            totalEngagement: totalEng,
            avgEngagement: posts.length ? Math.round(mean(engs)) : 0,
            medianEngagement: median(engs),
            sentiment: computeSentimentSummary(posts),
            sufficient: posts.length >= MIN_POSTS,
          };
        });

        // Share of Voice（互動量份額）
        const grandTotalEng = comparisons.reduce((s, c) => s + c.totalEngagement, 0);
        const shareOfVoice = comparisons.map((c) => ({
          brand: c.brand,
          isOwn: c.isOwn,
          engagementShare: grandTotalEng ? round(c.totalEngagement / grandTotalEng, 3) : 0,
          postShare: round(
            c.postCount / Math.max(1, comparisons.reduce((s, x) => s + x.postCount, 0)), 3,
          ),
        }));

        // 只保留數據充足的品牌做深度對比
        const sufficient = comparisons.filter((c) => c.sufficient);
        const ourPosts = brandPosts.get(scope.brand) ?? [];

        // KOL 重疊分析
        const ourUsernames = new Set(ourPosts.map((p) => p.username).filter(Boolean));
        const kolOverlap: Array<{ username: string; ownEngagement: number; competitorBrand: string; competitorEngagement: number }> = [];
        for (const comp of competitors) {
          const compPosts = brandPosts.get(comp.name) ?? [];
          const byUser = groupBy(compPosts, (p) => p.username ?? '');
          for (const [username, ps] of byUser) {
            if (!username || !ourUsernames.has(username)) continue;
            const compEng = ps.reduce((s, p) => s + (p.engagementTotal ?? 0), 0);
            const ownEng = ourPosts
              .filter((p) => p.username === username)
              .reduce((s, p) => s + (p.engagementTotal ?? 0), 0);
            kolOverlap.push({ username, ownEngagement: ownEng, competitorBrand: comp.name, competitorEngagement: compEng });
          }
        }

        // 內容格式分布對比
        const formatMix = allBrands.map((brand) => {
          const posts = brandPosts.get(brand) ?? [];
          if (posts.length < MIN_POSTS) return null;
          const byMedia = groupBy(posts, (p) => p.mediaType ?? 'unknown');
          return {
            brand,
            mix: [...byMedia.entries()].map(([type, ps]) => ({
              type,
              count: ps.length,
              share: round(ps.length / posts.length, 2),
              avgEngagement: Math.round(mean(ps.map((p) => p.engagementTotal ?? 0))),
            })),
          };
        }).filter(Boolean);

        return {
          ownBrand: scope.brand,
          shareOfVoice,
          engagementEfficiency: sufficient.map((c) => ({
            brand: c.brand, isOwn: c.isOwn, avgEngagement: c.avgEngagement, medianEngagement: c.medianEngagement,
          })),
          sentimentComparison: sufficient.map((c) => ({
            brand: c.brand, isOwn: c.isOwn,
            posPct: c.sentiment.posPct, negPct: c.sentiment.negPct, avgScore: c.sentiment.avgScore,
          })),
          kolOverlap: kolOverlap.sort((a, b) => b.competitorEngagement - a.competitorEngagement).slice(0, 10),
          formatMix,
          dataSufficiency: comparisons.map((c) => ({
            brand: c.brand, postCount: c.postCount, sufficient: c.sufficient,
            note: c.sufficient ? null : `僅 ${c.postCount} 條帖子（需 ≥${MIN_POSTS}），未納入深度對比`,
          })),
        };
      },
    },
  ];
}
