import { describe, it, expect } from 'vitest';
import { detectSignals, aggregateDay, isOwn, statusFromSignals, DEFAULT_DETECTORS } from '../../src/lib/domain/signals';
import type { Post, Platform, Sentiment, PostSource } from '../../src/lib/domain/types';

function mkPost(o: { platform?: Platform; eng?: number; sentiment?: Sentiment | null; sources?: PostSource[]; url?: string } = {}): Post {
  return {
    brand: 'Mannings', platform: o.platform ?? 'ig', postTime: '2026-04-26T10:00:00Z',
    username: 'u', content: 'c', postUrl: o.url ?? 'https://x', mediaType: null,
    likes: 0, comments: 0, followerCount: null, engagementTotal: o.eng ?? 1,
    metrics: {}, sources: o.sources ?? [], sentiment: o.sentiment ?? null, sentimentScore: null,
  };
}
// 造 N 個基準日，每日固定總互動 base、posts 篇數
function baseDays(n: number, perDayEng: number, postsPerDay = 5) {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-04-${String(10 + i).padStart(2, '0')}`,
    posts: Array.from({ length: postsPerDay }, () => mkPost({ eng: perDayEng / postsPerDay })),
  }));
}

describe('aggregateDay & isOwn', () => {
  it('彙總互動/情感/平台/詞頻', () => {
    const posts = [
      mkPost({ platform: 'ig', eng: 100, sentiment: 'pos', sources: [{ type: 'hashtag', value: '#BoostUP' }] }),
      mkPost({ platform: 'fb', eng: 20, sentiment: 'neg', sources: [{ type: 'keyword', value: '優惠碼' }] }),
    ];
    const a = aggregateDay('2026-04-26', posts);
    expect(a.engagement).toBe(120);
    expect(a.sent).toEqual({ pos: 1, neu: 0, neg: 1 });
    expect(a.platform.ig.engagement).toBe(100);
    expect(a.terms['#boostup']).toBe(1);
    expect(a.terms['優惠碼']).toBe(1);
  });
  it('isOwn：sources 含 account 才算自有', () => {
    expect(isOwn(mkPost({ sources: [{ type: 'account', value: 'mannings' }] }))).toBe(true);
    expect(isOwn(mkPost({ sources: [{ type: 'mention', value: 'mannings' }] }))).toBe(false);
  });
});

describe('engagement detector', () => {
  it('基準不足 3 天 → 不報', () => {
    const s = detectSignals('2026-04-26', [mkPost({ eng: 9999 })], baseDays(2, 1000));
    expect(s.filter((x) => x.kind === 'engagement')).toHaveLength(0);
  });
  it('互動突升 → 報 watch/act、direction up', () => {
    const today = Array.from({ length: 5 }, () => mkPost({ eng: 800 })); // 4000，基準均 1000
    const s = detectSignals('2026-04-26', today, baseDays(7, 1000));
    const e = s.find((x) => x.kind === 'engagement');
    expect(e).toBeDefined();
    expect(e!.direction).toBe('up');
    expect(['watch', 'act']).toContain(e!.severity);
  });
  it('變化 < 25% → 不報', () => {
    const today = Array.from({ length: 5 }, () => mkPost({ eng: 210 })); // 1050 vs 1000
    const s = detectSignals('2026-04-26', today, baseDays(7, 1000));
    expect(s.find((x) => x.kind === 'engagement')).toBeUndefined();
  });
});

describe('sentiment detector', () => {
  it('負面突增 → act/watch，附負面貼文 URL', () => {
    const today = [
      ...Array.from({ length: 6 }, (_, i) => mkPost({ sentiment: 'neg', eng: 50, url: `https://neg/${i}` })),
      ...Array.from({ length: 4 }, () => mkPost({ sentiment: 'pos' })),
    ];
    const base = baseDays(7, 1000).map((d) => ({ ...d, posts: d.posts.map((p) => ({ ...p, sentiment: 'pos' as Sentiment })) }));
    const s = detectSignals('2026-04-26', today, base);
    const sig = s.find((x) => x.kind === 'sentiment');
    expect(sig).toBeDefined();
    expect(['watch', 'act']).toContain(sig!.severity);
    expect(sig!.evidence?.postUrls?.length).toBeGreaterThan(0);
  });
  it('負面 < 3 則 → 不報（小數字）', () => {
    const today = [mkPost({ sentiment: 'neg' }), mkPost({ sentiment: 'neg' }), mkPost({ sentiment: 'pos' })];
    const s = detectSignals('2026-04-26', today, baseDays(7, 1000));
    expect(s.find((x) => x.kind === 'sentiment')).toBeUndefined();
  });
});

describe('topic detector', () => {
  it('某詞今日竄升 → 報 topic，偏負面則 act', () => {
    const today = Array.from({ length: 5 }, () => mkPost({ sentiment: 'neg', sources: [{ type: 'keyword', value: '兌換失敗' }] }));
    const s = detectSignals('2026-04-26', today, baseDays(7, 1000));
    const t = s.find((x) => x.kind === 'topic');
    expect(t).toBeDefined();
    expect(t!.severity).toBe('act');           // 全負面
    expect(t!.evidence?.term).toBe('兌換失敗');
  });
});

describe('channel detector', () => {
  it('某平台動能升且自有發文佔比低 → 機會 watch', () => {
    // 今日 threads 互動高，但自有貼文都在 ig
    const today = [
      ...Array.from({ length: 3 }, () => mkPost({ platform: 'threads', eng: 500 })),          // earned
      ...Array.from({ length: 8 }, () => mkPost({ platform: 'ig', eng: 50, sources: [{ type: 'account', value: 'm' }] })), // own
    ];
    const base = baseDays(7, 100).map((d) => ({ ...d, posts: d.posts.map((p) => ({ ...p, platform: 'threads' as Platform, engagementTotal: 40 })) }));
    const s = detectSignals('2026-04-26', today, base);
    const c = s.find((x) => x.kind === 'channel');
    expect(c).toBeDefined();
    expect(c!.evidence?.platform).toBe('threads');
    expect(c!.action).toContain('Threads');
  });
});

describe('statusFromSignals', () => {
  it('有 act→red、有 watch→yellow、皆無→green', () => {
    expect(statusFromSignals([{ kind: 'topic', severity: 'act', title: '', detail: '' }]).level).toBe('red');
    expect(statusFromSignals([{ kind: 'volume', severity: 'watch', title: '', detail: '' }]).level).toBe('yellow');
    expect(statusFromSignals([]).level).toBe('green');
  });
  it('預設偵測器數量穩定（registry）', () => {
    expect(DEFAULT_DETECTORS.length).toBe(5);
  });
});
