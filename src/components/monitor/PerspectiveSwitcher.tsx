'use client';

export interface BrandRow {
  name: string;
  is_own: boolean;
}

export function PerspectiveSwitcher({
  brands,
  active,
  ownTotalEngagement,
  onSelect,
}: {
  brands: BrandRow[];
  active: string;
  ownTotalEngagement: number;
  onSelect: (brand: string) => void;
}) {
  return (
    <section>
      <h2 className="text-[11px] font-bold text-on-surface-variant/60 uppercase tracking-[0.18em] mb-4">
        數據視角
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {brands.map((b) => {
          const isActive = b.name === active;
          return (
            <button
              key={b.name}
              onClick={() => onSelect(b.name)}
              className={`text-left p-6 rounded-2xl bg-surface border transition-colors card-shadow ${
                isActive ? 'border-on-surface' : 'border-outline-variant hover:border-on-surface/30'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-on-surface-variant/70 flex items-center gap-2">
                  {b.name}
                  {b.is_own && (
                    <span className="px-1.5 py-0.5 rounded border border-outline-variant text-[9px] font-semibold text-on-surface-variant/70 normal-case tracking-normal">
                      本品牌
                    </span>
                  )}
                </span>
                {isActive && <span className="text-[10px] font-bold text-on-surface-variant/50">作用中</span>}
              </div>
              <div className="mt-5">
                <span className="text-3xl font-bold tabular-nums text-on-surface">{ownTotalEngagement.toLocaleString()}</span>
                <p className="text-[11px] text-on-surface-variant/60 mt-1">總互動量</p>
              </div>
            </button>
          );
        })}

        {/* 競品空狀態：n8n 競品 flow 上線前的佔位 */}
        <div className="p-6 rounded-2xl border border-dashed border-outline-variant flex flex-col items-center justify-center text-center text-on-surface-variant/40">
          <span className="text-sm font-semibold">尚未連接競品數據源</span>
          <span className="text-[11px] mt-1">待 n8n 競品爬取流程上線後自動顯示</span>
        </div>
      </div>
    </section>
  );
}
