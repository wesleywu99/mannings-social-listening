'use client';
import { useEffect, useState } from 'react';
import type { Platform, Post, PlatformKpis } from '@/lib/domain/types';
import { PerspectiveSwitcher, type BrandRow } from './PerspectiveSwitcher';
import { PlatformTabs } from './PlatformTabs';
import { KpiRow } from './KpiRow';
import { PostsTable } from './PostsTable';

export function MonitorClient() {
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [brand, setBrand] = useState('我們的品牌');
  const [platform, setPlatform] = useState<Platform>('threads');
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
    const qs = new URLSearchParams({ brand, platform });
    Promise.all([
      fetch(`/api/data/posts?${qs}`).then((r) => r.json()),
      fetch(`/api/data/kpis?brand=${encodeURIComponent(brand)}`).then((r) => r.json()),
    ])
      .then(([p, k]) => {
        setPosts(Array.isArray(p) ? p : []);
        setKpis(Array.isArray(k) ? k : []);
      })
      .finally(() => setLoading(false));
  }, [brand, platform]);

  const kpi = kpis.find((k) => k.platform === platform);
  const population = posts.map((p) => p.engagementTotal ?? 0);
  const ownTotal = kpis.reduce((sum, k) => sum + k.totalEngagement, 0);

  return (
    <div className="space-y-10">
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
            <h3 className="text-lg font-extrabold capitalize">{platform} 實時數據監測</h3>
            <div className="h-4 w-px bg-outline-variant" />
            <span className="text-xs text-on-surface-variant font-medium">
              共 {posts.length} 筆 · <span className="text-sentiment-neg font-bold">●</span> 代表 +2σ 爆款
              {loading && ' · 載入中…'}
            </span>
          </div>
          <PostsTable posts={posts} population={population} />
        </div>
      </section>
    </div>
  );
}
