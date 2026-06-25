'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/monitor', label: '數據監測工作台' },
  { href: '/insight', label: 'AI Insight Center' },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-2">
      {ITEMS.map((it) => {
        const active = path === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              active ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
