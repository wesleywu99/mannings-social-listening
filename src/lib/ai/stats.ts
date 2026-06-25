/** 純統計輔助函式（供 AI 工具計算用） */

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Top N% 的項目佔總量的比例（集中度） */
export function topShare(values: number[], pct: number): number {
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  const n = Math.max(1, Math.ceil(values.length * (pct / 100)));
  const top = sorted.slice(0, n).reduce((a, b) => a + b, 0);
  return top / total;
}

export function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it); else m.set(k, [it]);
  }
  return m;
}

export function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
