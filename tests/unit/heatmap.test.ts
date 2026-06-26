import { describe, it, expect } from 'vitest';
import { computeHeatmap } from '@/lib/domain/aggregate';
import type { Post } from '@/lib/domain/types';

function post(iso: string, eng: number): Post {
  return {
    brand: 'B', platform: 'ig', postTime: iso, username: '@x', content: '', postUrl: iso + eng,
    mediaType: 'Photo', likes: 0, comments: 0, followerCount: null, engagementTotal: eng, metrics: {}, sources: [],
  };
}

describe('computeHeatmap', () => {
  it('averages engagement per weekday/hour and finds the best slot', () => {
    // 2024-03-04 is a Monday (getDay=1). Use local-time ISO so getHours is deterministic.
    const hm = computeHeatmap([
      post('2024-03-04T10:00:00', 100),
      post('2024-03-04T10:00:00', 300), // same slot -> avg 200
      post('2024-03-05T15:00:00', 50),
    ]);
    const d = new Date('2024-03-04T10:00:00');
    expect(hm.matrix[d.getDay()][10]).toBe(200);
    expect(hm.best?.avg).toBe(200);
    expect(hm.best?.hour).toBe(10);
  });

  it('empty slots are 0', () => {
    const hm = computeHeatmap([]);
    expect(hm.max).toBe(0);
    expect(hm.best).toBeNull();
    expect(hm.matrix[0][0]).toBe(0);
  });
});
