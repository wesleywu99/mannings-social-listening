'use client';
import { useEffect, useState } from 'react';
import type { Platform, Post, PlatformKpis } from '@/lib/domain/types';
import { PerspectiveSwitcher, type BrandRow } from './PerspectiveSwitcher';
import { PlatformTabs } from './PlatformTabs';
import { KpiRow } from './KpiRow';
import { PostsTable } from './PostsTable';
import { DateRangePicker } from './DateRangePicker';
import { ChatWidget } from './ChatWidget';
import { DEFAULT_BRAND } from '@/lib/config';
import type { Scope } from '@/lib/ai/types';

export function MonitorClient() {
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [brand, setBrand] = useState(DEFAULT_BRAND);
  const [platform, setPlatform] = useState<Platform>('ig');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [kpis, setKpis] = useState<PlatformKpis[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/data/brands')
      .then((r) => r.json())
      .then(setBrands)
      .catch(() => setBrands([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    const range = (p: URLSearchParams) => {
      if (start) p.set('start', `${start}T00:00:00`);
      if (end) p.set('end', `${end}T23:59:59`);
      return p;
    };
    const postQs = range(new URLSearchParams({ brand, platform, limit: '500' }));
    const kpiQs = range(new URLSearchParams({ brand }));
    Promise.all([
      fetch(`/api/data/posts?${postQs}`).then((r) => r.json()),
      fetch(`/api/data/kpis?${kpiQs}`).then((r) => r.json()),
    ])
      .then(([p, k]) => {
        setPosts(Array.isArray(p) ? p : []);
        setKpis(Array.isArray(k) ? k : []);
      })
      .finally(() => setLoading(false));
  }, [brand, platform, start, end]);

  const kpi = kpis.find((k) => k.platform === platform);
  const population = posts.map((p) => p.engagementTotal ?? 0);
  const ownTotal = kpis.reduce((sum, k) => sum + k.totalEngagement, 0);

  const scope: Scope = {
    brand,
    platform,
    dateStart: start ? `${start}T00:00:00` : undefined,
    dateEnd: end ? `${end}T23:59:59` : undefined,
  };

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-end">
        <DateRangePicker
          start={start}
          end={end}
          onChange={(s, e) => { setStart(s); setEnd(e); }}
        />
      </div>

      <PerspectiveSwitcher
        brands={brands}
        active={brand}
        ownTotalEngagement={ownTotal}
        onSelect={setBrand}
      />

      <section className="space-y-8">
        <PlatformTabs value={platform} onChange={setPlatform} />
        {kpi && <KpiRow kpi={kpi} />}
        <div className="bg-surface rounded-3xl card-shadow overflow-hidden border border-outline-variant/20">
          <div className="px-8 py-6 flex items-center gap-3 border-b border-outline-variant/10">
            <h3 className="text-lg font-extrabold capitalize">{platform} 數據監測</h3>
            <div className="h-4 w-px bg-outline-variant" />
            <span className="text-xs text-on-surface-variant font-medium">
              共 {posts.length} 筆{(start || end) && '（已篩選日期）'} · <span className="text-sentiment-neg font-bold">●</span> 代表 +2σ 爆款
              {loading && ' · 載入中…'}
            </span>
          </div>
          <PostsTable posts={posts} population={population} platform={platform} scope={scope} />
        </div>
      </section>

      <ChatWidget scope={scope} />
    </div>
  );
}
