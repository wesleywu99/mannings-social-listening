/** 與上期比較的變化率 chip。previous 為 0 / undefined 時不渲染（避免除零與無區間情境）。 */
export function Delta({
  current,
  previous,
  title = 'vs previous period',
}: {
  current: number;
  previous?: number;
  title?: string;
}) {
  if (previous == null || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-0.5 text-[11px] tabular-nums font-medium ${
        up ? 'text-sentiment-pos' : 'text-sentiment-neg'
      }`}
    >
      {up ? '▲' : '▼'}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}
