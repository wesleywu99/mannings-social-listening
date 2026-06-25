import { describe, it, expect } from 'vitest';
import { anomalyThreshold, isAnomaly, median } from '@/lib/domain/engagement';

describe('engagement stats', () => {
  it('median of odd/even sets', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it('anomalyThreshold = mean + 2*populationStdDev', () => {
    // [10,10,10,10,50] mean=18, var=256, sd=16 -> threshold=50
    expect(anomalyThreshold([10, 10, 10, 10, 50])).toBeCloseTo(50, 5);
  });

  it('returns Infinity when sample size <= 3 (avoid small-sample noise)', () => {
    expect(anomalyThreshold([100, 1, 1])).toBe(Infinity);
  });

  it('isAnomaly flags values strictly above threshold', () => {
    const vals = [10, 10, 10, 10, 50];
    expect(isAnomaly(51, vals)).toBe(true);
    expect(isAnomaly(50, vals)).toBe(false);
  });
});
