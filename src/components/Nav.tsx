'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/monitor', label: 'Dashboard' },
  { href: '/insight', label: 'AI Insight Center' },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1">
      {ITEMS.map((it) => {
        const active = path === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active ? 'text-on-surface bg-surface-container' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
