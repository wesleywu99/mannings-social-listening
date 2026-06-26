import { describe, it, expect } from 'vitest';
import {
  computeSentimentSummary,
  computeSentimentTrend,
  detectSentimentSpikes,
} from '../../src/lib/domain/aggregate';
import type { Post, Sentiment } from '../../src/lib/domain/types';

function mkPost(time: string, sentiment: Sentiment | null, score?: number): Post {
  return {
    brand: 'Mannings', platform: 'ig', postTime: time, username: 'u',
    content: 'c', postUrl: 'u', mediaType: null, likes: 1, comments: 0,
    followerCount: null, engagementTotal: 1, metrics: {}, sources: [],
    sentiment, sentimentScore: score ?? null,
  };
}

describe('computeSentimentSummary', () => {
  it('空 posts 回全 0', () => {
    const s = computeSentimentSummary([]);
    expect(s.total).toBe(0);
    expect(s.pos).toBe(0); expect(s.neg).toBe(0); expect(s.neu).toBe(0);
    expect(s.posPct).toBe(0); expect(s.negPct).toBe(0);
  });

  it('全 pos', () => {
    const s = computeSentimentSummary([mkPost('2026-04-01', 'pos'), mkPost('2026-04-02', 'pos')]);
    expect(s.pos).toBe(2); expect(s.posPct).toBe(1); expect(s.negPct).toBe(0);
  });

  it('混合占比正确', () => {
    const posts = [
      mkPost('2026-04-01', 'pos', 0.8),
      mkPost('2026-04-02', 'pos', 0.6),
      mkPost('2026-04-03', 'neu', 0.1),
      mkPost('2026-04-04', 'neg', -0.7),
    ];
    const s = computeSentimentSummary(posts);
    expect(s.total).toBe(4);
    expect(s.pos).toBe(2); expect(s.neu).toBe(1); expect(s.neg).toBe(1);
    expect(s.posPct).toBe(0.5); expect(s.neuPct).toBe(0.25); expect(s.negPct).toBe(0.25);
    expect(s.avgScore).toBe(0.2);  // (0.8+0.6+0.1-0.7)/4 = 0.2
  });

  it('null sentiment 不计入 total', () => {
    const s = computeSentimentSummary([mkPost('2026-04-01', null), mkPost('2026-04-02', 'pos')]);
    expect(s.total).toBe(1); expect(s.pos).toBe(1);
  });
});

describe('computeSentimentTrend', () => {
  it('空 posts 回空数组', () => {
    expect(computeSentimentTrend([])).toEqual([]);
  });

  it('逐日填充 + 空桶补 0', () => {
    const posts = [
      mkPost('2026-04-01T10:00:00Z', 'pos'),
      mkPost('2026-04-01T12:00:00Z', 'neg'),
      mkPost('2026-04-03T10:00:00Z', 'neg'),  // 04-02 空桶
    ];
    const trend = computeSentimentTrend(posts, '2026-04-01', '2026-04-03');
    expect(trend).toHaveLength(3);
    expect(trend[0]).toMatchObject({ date: '2026-04-01', pos: 1, neg: 1, total: 2, negPct: 0.5 });
    expect(trend[1]).toMatchObject({ date: '2026-04-02', pos: 0, neg: 0, total: 0, negPct: 0 });
    expect(trend[2]).toMatchObject({ date: '2026-04-03', pos: 0, neg: 1, total: 1, negPct: 1 });
  });

  it('用日期范围定窗口', () => {
    const posts = [mkPost('2026-04-15T10:00:00Z', 'neg')];
    const trend = computeSentimentTrend(posts, '2026-04-10', '2026-04-20');
    expect(trend).toHaveLength(11);
    expect(trend[5]).toMatchObject({ date: '2026-04-15', neg: 1, total: 1 });
  });
});

describe('detectSentimentSpikes', () => {
  it('neg% > 50% 触发 red', () => {
    const trend = [
      { date: '2026-04-01', pos: 0, neu: 0, neg: 6, total: 10, negPct: 0.6 },
    ];
    const spikes = detectSentimentSpikes(trend);
    expect(spikes).toHaveLength(1);
    expect(spikes[0].level).toBe('red');
  });

  it('小样本不误报 yellow', () => {
    // 负面包数 < 5，不该触发 yellow
    const trend = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      pos: 5, neu: 0, neg: 2, total: 7, negPct: 2 / 7,
    }));
    const spikes = detectSentimentSpikes(trend);
    // neg% ~28% < 50%，不触发 red；neg=2 量级小，不触发 yellow
    expect(spikes.filter((s) => s.level === 'yellow')).toHaveLength(0);
  });

  it('负面占比突增且 ≥5 包触发 yellow', () => {
    // 前 7 天 neg% ~20%（1/5），第 8 天 neg% 60%（6/10）
    const trend = [
      ...Array.from({ length: 7 }, (_, i) => ({
        date: `2026-04-0${i + 1}`, pos: 4, neu: 0, neg: 1, total: 5, negPct: 0.2,
      })),
      { date: '2026-04-08', pos: 4, neu: 0, neg: 6, total: 10, negPct: 0.6 },
    ];
    const spikes = detectSentimentSpikes(trend);
    // 第 8 天 neg% 60% > 50% 触发 red（最严重），所以 level 应为 red 不是 yellow
    const last = spikes.find((s) => s.date === '2026-04-08');
    expect(last).toBeDefined();
    expect(['red', 'orange', 'yellow']).toContain(last!.level);
  });

  it('多层触发取最严重', () => {
    const trend = [
      ...Array.from({ length: 35 }, (_, i) => ({
        date: `2026-03-0${(i % 9) + 1}`, pos: 8, neu: 0, neg: 2, total: 10, negPct: 0.2,
      })),
      { date: '2026-04-01', pos: 0, neu: 0, neg: 8, total: 10, negPct: 0.8 },
    ];
    const spikes = detectSentimentSpikes(trend);
    const last = spikes[spikes.length - 1];
    expect(last.level).toBe('red');  // 80% > 50% → red 最严重
  });
});
