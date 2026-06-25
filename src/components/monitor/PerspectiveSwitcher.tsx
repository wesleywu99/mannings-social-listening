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
      <h2 className="text-xs font-bold text-on-surface-variant/50 uppercase tracking-[0.2em] mb-6">
        選擇數據視角
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {brands.map((b) => {
          const isActive = b.name === active;
          return (
            <button
              key={b.name}
              onClick={() => onSelect(b.name)}
              className={`text-left p-7 rounded-[2rem] transition-all hover:-translate-y-1 ${
                isActive
                  ? 'bg-primary text-on-primary active-brand-glow'
                  : 'bg-surface card-shadow border border-outline-variant/30 hover:border-primary/30'
              }`}
            >
              <span
                className={`text-[10px] font-black uppercase tracking-[0.15em] ${
                  isActive ? 'opacity-80' : 'text-on-surface-variant/60'
                }`}
              >
                {b.is_own ? '我們的品牌' : b.name}
              </span>
              <div className="mt-6 flex flex-col">
                <span className="text-3xl font-black">{ownTotalEngagement.toLocaleString()}</span>
                <span className={`text-[10px] font-bold ${isActive ? 'opacity-70' : 'text-on-surface-variant/60'}`}>
                  總互動量
                </span>
              </div>
            </button>
          );
        })}

        {/* 競品空狀態：n8n 競品 flow 上線前的佔位 */}
        <div className="p-7 rounded-[2rem] border-2 border-dashed border-outline-variant/50 flex flex-col items-center justify-center text-center text-on-surface-variant/40">
          <span className="text-sm font-bold">尚未連接競品數據源</span>
          <span className="text-[11px] mt-1">待 n8n 競品爬取流程上線後自動顯示</span>
        </div>
      </div>
    </section>
  );
}
