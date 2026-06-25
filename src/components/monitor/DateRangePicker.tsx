'use client';

export function DateRangePicker({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}) {
  const inputCls =
    'bg-transparent text-xs font-medium text-on-surface tabular-nums outline-none cursor-pointer';
  return (
    <div className="flex items-center gap-2 bg-surface border border-outline-variant rounded-xl px-3 py-2">
      <span className="text-on-surface-variant/50 text-sm">📅</span>
      <input type="date" value={start} max={end || undefined} onChange={(e) => onChange(e.target.value, end)} className={inputCls} />
      <span className="text-on-surface-variant/40 text-xs">—</span>
      <input type="date" value={end} min={start || undefined} onChange={(e) => onChange(start, e.target.value)} className={inputCls} />
      {(start || end) && (
        <button
          onClick={() => onChange('', '')}
          className="ml-1 text-[11px] font-bold text-on-surface-variant/50 hover:text-primary transition-colors"
          title="清除日期篩選"
        >
          清除
        </button>
      )}
    </div>
  );
}
