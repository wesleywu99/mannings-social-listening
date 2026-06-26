import { describe, it, expect } from 'vitest';
import { detectBreakouts } from '@/lib/domain/aggregate';

describe('detectBreakouts', () => {
  it('flags an efficiency outlier (few posts, high engagement)', () => {
    // day 3: 12 posts, 22000 eng -> 1833/post, far above others (~150-260/post)
    const eng = [8200, 12400, 9800, 22000, 15200, 13000, 16900, 12261];
    const posts = [48, 62, 51, 12, 60, 90, 64, 49];
    const flags = detectBreakouts(eng, posts);
    expect(flags[3].eff).toBe(true);
    // a normal day is not an efficiency outlier
    expect(flags[0].eff).toBe(false);
  });

  it('flags an absolute peak day', () => {
    const eng = [5000, 5200, 4800, 5100, 4900, 5300, 90000, 5000];
    const posts = [50, 50, 50, 50, 50, 50, 50, 50];
    const flags = detectBreakouts(eng, posts);
    expect(flags[6].peak).toBe(true);
    expect(flags[0].peak).toBe(false);
  });

  it('returns no breakouts for <=3 samples (avoids small-sample noise)', () => {
    const flags = detectBreakouts([100, 1, 1], [1, 1, 1]);
    expect(flags.every((f) => !f.eff && !f.peak)).toBe(true);
  });
});
