import { describe, it, expect } from 'vitest';
import { computeKpis } from '@/lib/domain/aggregate';
import type { Post } from '@/lib/domain/types';

function post(platform: Post['platform'], eng: number): Post {
  return {
    brand: '我們的品牌', platform, postTime: '2024-03-01T00:00:00Z',
    username: '@x', content: '', postUrl: `u${Math.random()}`, mediaType: 'text',
    likes: 0, comments: 0, followerCount: null, engagementTotal: eng, metrics: {}, sources: [],
  };
}

describe('computeKpis', () => {
  it('aggregates per platform with anomaly rate', () => {
    const posts = [
      ...[10, 10, 10, 10, 50].map((e) => post('threads', e)), // threshold 50 -> 0 anomalies
      post('ig', 5), post('ig', 5),
    ];
    const kpis = computeKpis(posts);
    const threads = kpis.find((k) => k.platform === 'threads')!;
    expect(threads.postCount).toBe(5);
    expect(threads.totalEngagement).toBe(90);
    expect(threads.avgEngagement).toBe(18);
    expect(threads.anomalyRate).toBe(0);
    const ig = kpis.find((k) => k.platform === 'ig')!;
    expect(ig.postCount).toBe(2);
    expect(ig.totalEngagement).toBe(10);
  });

  it('treats null engagement as 0', () => {
    const p = post('fb', 0); p.engagementTotal = null;
    const kpis = computeKpis([p]);
    expect(kpis.find((k) => k.platform === 'fb')!.totalEngagement).toBe(0);
  });
});
