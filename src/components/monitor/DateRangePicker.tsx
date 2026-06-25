'use client';
import { useEffect, useRef, useState } from 'react';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parse(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function buildGrid(view: Date): Date[] {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

export function DateRangePicker({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(() => parse(start) ?? parse(end) ?? new Date(2026, 3, 1));
  // 範圍選擇進行中的暫存錨點（點第一下後等第二下）
  const [anchor, setAnchor] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const startD = parse(start);
  const endD = parse(end);

  const pickDay = (d: Date) => {
    const s = ymd(d);
    if (!anchor) {
      setAnchor(s);
      onChange(s, '');               // 第一下：設起點，清終點
    } else {
      if (s >= anchor) { onChange(anchor, s); } else { onChange(s, anchor); }
      setAnchor(null);
      setOpen(false);                // 第二下：完成範圍，關閉
    }
  };

  const label = start || end
    ? `${start || '…'}　—　${end || '…'}`
    : '選擇日期範圍';

  const inRange = (d: Date) => {
    const s = ymd(d);
    if (anchor && !endD) return s === anchor;
    if (startD && endD) return s >= ymd(startD) && s <= ymd(endD);
    if (startD) return s === ymd(startD);
    return false;
  };
  const isEndpoint = (d: Date) => {
    const s = ymd(d);
    return s === start || s === end || s === anchor;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-surface border border-outline-variant rounded-xl px-3 py-2 text-xs font-semibold text-on-surface-variant hover:border-primary/40 transition-colors tabular-nums"
      >
        <span className="text-on-surface-variant/50">📅</span>
        {label}
        <span className="text-on-surface-variant/40">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 z-50 w-[300px] bg-surface rounded-2xl border border-outline-variant/40 shadow-2xl p-4">
          {/* 月份導航 */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
            >‹</button>
            <span className="text-sm font-bold text-on-surface">{MONTHS[view.getMonth()]} {view.getFullYear()}</span>
            <button
              onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
            >›</button>
          </div>

          {/* 星期列 */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-[10px] font-bold text-on-surface-variant/40 text-center py-1 uppercase">{w}</div>
            ))}
          </div>

          {/* 日期網格 */}
          <div className="grid grid-cols-7 gap-1">
            {buildGrid(view).map((d, i) => {
              const otherMonth = d.getMonth() !== view.getMonth();
              const endpoint = isEndpoint(d);
              const ranged = inRange(d) && !endpoint;
              return (
                <button
                  key={i}
                  onClick={() => pickDay(d)}
                  className={[
                    'h-8 rounded-full text-xs font-medium tabular-nums transition-colors',
                    endpoint ? 'bg-primary text-on-primary font-bold' : '',
                    ranged ? 'bg-primary/10 text-primary' : '',
                    !endpoint && !ranged ? (otherMonth ? 'text-on-surface-variant/30 hover:bg-surface-container' : 'text-on-surface hover:bg-surface-container') : '',
                  ].join(' ')}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* 動作列 */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-outline-variant/20">
            <button
              onClick={() => { onChange('', ''); setAnchor(null); }}
              className="text-[11px] font-bold text-on-surface-variant/50 hover:text-primary transition-colors"
            >清除</button>
            <button
              onClick={() => setOpen(false)}
              className="text-[11px] font-bold text-primary hover:opacity-80 transition-opacity"
            >完成</button>
          </div>
        </div>
      )}
    </div>
  );
}
