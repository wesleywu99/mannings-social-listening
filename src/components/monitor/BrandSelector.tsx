'use client';

export interface BrandRow {
  name: string;
  is_own: boolean;
}

/** 純資料源切換器（無數字）：segmented 按鈕 + 競品 CTA */
export function BrandSelector({
  brands,
  active,
  onSelect,
}: {
  brands: BrandRow[];
  active: string;
  onSelect: (brand: string) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 p-0.5 bg-surface-container rounded-lg border border-outline-variant">
      {brands.map((b) => {
        const isActive = b.name === active;
        return (
          <button
            key={b.name}
            onClick={() => onSelect(b.name)}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              isActive ? 'bg-surface text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {b.name}
          </button>
        );
      })}
      <button
        type="button"
        title="Competitor pipeline in progress"
        className="px-2.5 py-1 rounded-md text-sm font-medium text-on-surface-variant/70 hover:text-on-surface transition-colors"
      >
        + Competitor
      </button>
    </div>
  );
}
