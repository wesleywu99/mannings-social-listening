/** 報告模塊左側的極簡資料視覺（墨黑橫條 / KPI / 清單），Geist 風 */

export function MiniKpis({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map((i) => (
        <div key={i.label} className="border border-outline-variant rounded-xl px-3 py-2.5">
          <div className="text-lg font-semibold tabular-nums text-on-surface leading-tight">{i.value}</div>
          <div className="text-[10px] text-on-surface-variant/60 uppercase tracking-wide mt-0.5">{i.label}</div>
        </div>
      ))}
    </div>
  );
}

export function MiniBars({ items, pct = false }: { items: { label: string; value: number }[]; pct?: boolean }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const fmt = (v: number) => (pct ? `${(v * 100).toFixed(1)}%` : Math.round(v).toLocaleString());
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <div key={it.label}>
          <div className="flex justify-between items-baseline text-[11px] mb-1">
            <span className="text-on-surface-variant truncate pr-2">{it.label}</span>
            <span className="tabular-nums font-medium text-on-surface shrink-0">{fmt(it.value)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-container overflow-hidden">
            <div className="h-full rounded-full bg-on-surface/75" style={{ width: `${(it.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CreatorList({ items }: { items: { username: string; totalEngagement: number }[] }) {
  return (
    <div className="space-y-2">
      {items.map((c, i) => (
        <div key={c.username + i} className="flex items-center justify-between gap-2 text-[12px]">
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-on-surface-variant/40 tabular-nums w-3 text-right">{i + 1}</span>
            <span className="truncate text-on-surface">@{c.username}</span>
          </span>
          <span className="tabular-nums font-medium text-on-surface shrink-0">{c.totalEngagement.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
