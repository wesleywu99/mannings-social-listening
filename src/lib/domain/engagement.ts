export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function anomalyThreshold(values: number[]): number {
  if (values.length <= 3) return Infinity;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return mean + 2 * Math.sqrt(variance);
}

export function isAnomaly(value: number, population: number[]): boolean {
  return value > anomalyThreshold(population);
}
