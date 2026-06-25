import { describe, it, expect } from 'vitest';
import { percentile, mean, topShare, round } from '@/lib/ai/stats';

describe('ai stats', () => {
  it('percentile interpolates', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([1, 2, 3, 4], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4], 100)).toBe(4);
    expect(percentile([], 50)).toBe(0);
  });

  it('mean', () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(mean([])).toBe(0);
  });

  it('topShare: top 50% of [1,1,1,7] = 8/10', () => {
    // sorted desc [7,1,1,1], top 50% = ceil(4*0.5)=2 -> 7+1=8, total 10
    expect(topShare([1, 1, 1, 7], 50)).toBe(0.8);
  });

  it('round to 1 dp', () => {
    expect(round(2.345)).toBe(2.3);
    expect(round(2.35, 1)).toBe(2.4);
  });
});
