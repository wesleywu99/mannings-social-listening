'use client';

const WK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WK_FULL = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const ROW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 顯示週一→週日（matrix 以 getDay 0=Sun 索引）

export function Heatmap({
  matrix,
  max,
  best,
}: {
  matrix: number[][];
  max: number;
  best: { weekday: number; hour: number; avg: number } | null;
}) {
  const cell = (avg: number) => {
    if (max <= 0 || avg <= 0) return { background: 'var(--color-surface-container)' };
    const t = 0.12 + 0.78 * (avg / max); // 墨黑 opacity 漸層
    return { backgroundColor: `rgba(23,23,23,${t.toFixed(3)})` };
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* 小時刻度 */}
          <div className="flex items-center gap-[3px] pl-9 mb-1">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="w-[14px] text-[8px] text-on-surface-variant/40 text-center tabular-nums">
                {h % 6 === 0 ? h : ''}
              </div>
            ))}
          </div>
          {ROW_ORDER.map((wd, ri) => (
            <div key={wd} className="flex items-center gap-[3px] mb-[3px]">
              <div className="w-8 text-[9px] font-medium text-on-surface-variant/50 text-right pr-1">{WK[ri]}</div>
              {Array.from({ length: 24 }, (_, h) => {
                const avg = matrix[wd]?.[h] ?? 0;
                return (
                  <div
                    key={h}
                    className="w-[14px] h-[14px] rounded-[3px]"
                    style={cell(avg)}
                    title={`${WK_FULL[wd]} ${String(h).padStart(2, '0')}:00 · 平均互動 ${avg.toLocaleString()}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 mt-4 text-[11px] text-on-surface-variant/50">
        <span>低</span>
        <div className="flex gap-1">
          {[0.12, 0.32, 0.52, 0.72, 0.9].map((t) => (
            <div key={t} className="w-3.5 h-3.5 rounded-[3px]" style={{ backgroundColor: `rgba(23,23,23,${t})` }} />
          ))}
        </div>
        <span>高</span>
        {best && (
          <span className="ml-auto text-on-surface-variant">
            黃金時段：<b className="text-on-surface">{WK_FULL[best.weekday]} {String(best.hour).padStart(2, '0')}:00</b>（平均互動 {best.avg.toLocaleString()}）
          </span>
        )}
      </div>
    </div>
  );
}
