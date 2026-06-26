'use client';

const DAY_MS = 86400000;

const PRESETS = [
  { id: '7d', label: '7D', days: 7 },
  { id: '30d', label: '30D', days: 30 },
  { id: '90d', label: '90D', days: 90 },
];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 快捷區間：以「今天」為終點往前推 N 天。active 態與 date picker 共用 start/end 比對。 */
export function DateRangePresets({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {PRESETS.map((p) => {
        const e = new Date();
        const s = new Date(e.getTime() - (p.days - 1) * DAY_MS);
        const ps = ymd(s);
        const pe = ymd(e);
        const active = start === ps && end === pe;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(ps, pe)}
            className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              active
                ? 'text-on-surface bg-surface-container'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
