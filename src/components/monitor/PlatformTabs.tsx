'use client';
import type { Platform } from '@/lib/domain/types';

const TABS: { key: Platform; label: string; dot: string }[] = [
  { key: 'ig', label: 'Instagram', dot: 'bg-instagram' },
  { key: 'threads', label: 'Threads', dot: 'bg-threads' },
  { key: 'fb', label: 'Facebook', dot: 'bg-facebook' },
];

export function PlatformTabs({
  value,
  onChange,
}: {
  value: Platform;
  onChange: (p: Platform) => void;
}) {
  return (
    <div className="flex gap-10 border-b border-outline-variant/30 pb-4">
      {TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`relative px-2 py-2 text-sm font-bold flex items-center gap-2 transition-colors ${
            value === t.key ? 'text-primary' : 'text-on-surface-variant/60 hover:text-on-surface'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
          {t.label}
          {value === t.key && (
            <span className="absolute -bottom-[17px] left-0 right-0 h-1 bg-primary rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}
