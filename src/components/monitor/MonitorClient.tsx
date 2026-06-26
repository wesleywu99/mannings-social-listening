'use client';
import { useEffect, useState } from 'react';
import type { Platform, Post, PlatformKpis } from '@/lib/domain/types';
import type { TrendPoint } from '@/lib/domain/aggregate';
import { BrandSelector, type BrandRow } from './BrandSelector';
import { PlatformTabs } from './PlatformTabs';
import { PostsTable } from './PostsTable';
import { OverviewSummary } from './OverviewSummary';
import { ModuleInsightModal } from './ModuleInsightModal';
import { buildPostsCsv, downloadCsv } from './exportCsv';
import { DateRangePicker } from './DateRangePicker';
import { DateRangePresets } from './DateRangePresets';
import { ChatWidget } from './ChatWidget';
import { MentionContext } from './mentionContext';
import { useInsightCache } from './useInsightCache';
import { DEFAULT_BRAND } from '@/lib/config';
import type { Scope } from '@/lib/ai/types';

const PLATFORM_LABEL: Record<Platform, string> = {
  ig: 'Instagram',
  threads: 'Threads',
  fb: 'Facebook',
};

const DAY_MS = 86400000;

/** 給定 [start,end]（含），回傳等長的「緊鄰上一期」[ps,pe]；缺日期回 null。 */
function prevWindow(start: string, end: string): { start: string; end: string } | null {
  if (!start || !end) return null;
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  const len = Math.round((e.getTime() - s.getTime()) / DAY_MS) + 1; // 含首尾天數
  const pe = new Date(s.getTime() - DAY_MS); // 上期終點 = 本期起點前一天
  const ps = new Date(pe.getTime() - (len - 1) * DAY_MS);
  const f = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: f(ps), end: f(pe) };
}

export function MonitorClient() {
  const insightCache = useInsightCache();
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [brand, setBrand] = useState(DEFAULT_BRAND);
  const [platform, setPlatform] = useState<Platform>('ig');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [kpis, setKpis] = useState<PlatformKpis[]>([]);
  const [trends, setTrends] = useState<Record<Platform, TrendPoint[]>>({} as Record<Platform, TrendPoint[]>);
  const [prevKpis, setPrevKpis] = useState<PlatformKpis[]>([]);
  const [loading, setLoading] = useState(false);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    fetch('/api/data/brands')
      .then((r) => r.json())
      .then(setBrands)
      .catch(() => setBrands([]));
  }, []);

  // 開機：取資料實際範圍 → 預設聚焦最近 30 天密集視窗（避免雜訊日期把圖撐成整年）
  useEffect(() => {
    let alive = true;
    fetch(`/api/data/range?brand=${encodeURIComponent(brand)}`)
      .then((r) => r.json())
      .then((rg: { start?: string; end?: string }) => {
        if (!alive) return;
        if (rg?.end) {
          const maxD = new Date(`${rg.end}T00:00:00`);
          const back = new Date(maxD); back.setDate(maxD.getDate() - 29);
          const minD = rg.start ? new Date(`${rg.start}T00:00:00`) : back;
          const startD = back < minD ? minD : back;
          const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          setStart(f(startD)); setEnd(rg.end);
        }
      })
      .catch(() => {})
      .finally(() => { if (alive) setBooted(true); });
    return () => { alive = false; };
  }, [brand]);

  useEffect(() => {
    if (!booted) return;
    setLoading(true);
    const range = (p: URLSearchParams) => {
      if (start) p.set('start', `${start}T00:00:00`);
      if (end) p.set('end', `${end}T23:59:59`);
      return p;
    };
    const postQs = range(new URLSearchParams({ brand, platform, limit: '500' }));
    const allQs = range(new URLSearchParams({ brand, limit: '1000' }));
    const kpiQs = range(new URLSearchParams({ brand }));
    const pw = prevWindow(start, end);
    const prevQs = pw ? range(new URLSearchParams({ brand, start: pw.start, end: pw.end })) : null;

    const fetches: Promise<unknown>[] = [
      fetch(`/api/data/posts?${postQs}`).then((r) => r.json()),
      fetch(`/api/data/posts?${allQs}`).then((r) => r.json()),
      fetch(`/api/data/kpis?${kpiQs}`).then((r) => r.json()),
    ];
    if (prevQs) fetches.push(fetch(`/api/data/kpis?${prevQs}`).then((r) => r.json()));

    Promise.all(fetches)
      .then((res) => {
        const p = res[0];
        const ap = res[1];
        const k = res[2];
        const prev = res[3];
        setPosts(Array.isArray(p) ? (p as Post[]) : []);
        setAllPosts(Array.isArray(ap) ? (ap as Post[]) : []);
        if (Array.isArray(k)) {
          setKpis(k as PlatformKpis[]);
          setTrends({} as Record<Platform, TrendPoint[]>);
        } else {
          const ko = k as { kpis?: PlatformKpis[]; trends?: Record<Platform, TrendPoint[]> };
          setKpis(ko.kpis ?? []);
          setTrends((ko.trends ?? {}) as Record<Platform, TrendPoint[]>);
        }
        if (Array.isArray(prev)) {
          setPrevKpis(prev as PlatformKpis[]);
        } else if (prev) {
          setPrevKpis((prev as { kpis?: PlatformKpis[] }).kpis ?? []);
        } else {
          setPrevKpis([]);
        }
      })
      .finally(() => setLoading(false));
  }, [brand, platform, start, end, booted]);

  const population = posts.map((p) => p.engagementTotal ?? 0);

  // 表格控制：搜尋（前端過濾已載入貼文）、AI 平台解讀
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [moduleOpen, setModuleOpen] = useState(false);
  const [closeSignal, setCloseSignal] = useState(0);

  // AI 文字點 @帳號 → 篩選貼文表 + 關閉開啟中的彈窗 + 捲到表格
  const handleMention = (username: string) => {
    setSearch(username);
    setSearchOpen(true);
    setModuleOpen(false);
    setCloseSignal((n) => n + 1);
    setTimeout(() => document.getElementById('posts-table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const q = search.trim().toLowerCase();
  const sentimentFilter = q.startsWith('sentiment:') ? q.slice('sentiment:'.length) : null;
  const shown = posts.filter((p) => {
    if (sentimentFilter) return p.sentiment === sentimentFilter;
    if (q) return (p.content ?? '').toLowerCase().includes(q) || (p.username ?? '').toLowerCase().includes(q);
    return true;
  });

  // chat / 解讀 共用範圍：以 brand + 日期為硬性篩選；platform 不鎖（讓 AI 跨平台分析）
  const scope: Scope = {
    brand,
    dateStart: start ? `${start}T00:00:00` : undefined,
    dateEnd: end ? `${end}T23:59:59` : undefined,
  };

  const handleDownload = () => {
    if (!shown.length) return;
    downloadCsv(`Mannings_${platform}_${start || 'all'}_${end || 'all'}.csv`, buildPostsCsv(shown, platform));
  };

  return (
    <MentionContext.Provider value={handleMention}>
    <div className="space-y-8">
      {/* 統一控制列：左側資料源選擇器、右側時間篩選 */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-outline-variant">
        <BrandSelector brands={brands} active={brand} onSelect={setBrand} />
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePresets
            start={start}
            end={end}
            onChange={(s, e) => { setStart(s); setEnd(e); }}
          />
          <DateRangePicker
            start={start}
            end={end}
            onChange={(s, e) => { setStart(s); setEnd(e); }}
          />
        </div>
      </div>

      <OverviewSummary kpis={kpis} prevKpis={prevKpis} trends={trends} scope={scope} closeSignal={closeSignal} allPosts={allPosts} scopeDates={{ start, end }} />

      <section className="space-y-8">
        <PlatformTabs value={platform} onChange={setPlatform} />
        <div id="posts-table-card" className="bg-surface rounded-2xl card-shadow overflow-hidden border border-outline-variant">
          <div className="px-6 py-4 flex items-center justify-between gap-3 border-b border-outline-variant/60 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <h3 className="text-lg font-semibold">{PLATFORM_LABEL[platform]}</h3>
              <div className="h-4 w-px bg-outline-variant" />
              <span className="text-xs text-on-surface-variant/70 font-medium tabular-nums">
                {shown.length}{q && ` / ${posts.length}`} records{(start || end) ? ' · filtered' : ''} · <span className="text-sentiment-neg font-bold">●</span> +2σ
                {loading && ' · Loading…'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {searchOpen && (
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') { setSearch(''); setSearchOpen(false); } }}
                  placeholder="搜尋內容或帳號…"
                  className="h-8 w-44 rounded-md border border-outline-variant bg-surface px-2.5 text-xs text-on-surface outline-none focus:border-on-surface/40 transition-colors"
                />
              )}
              <button
                title="搜尋貼文 / 帳號"
                onClick={() => { setSearchOpen((o) => { if (o) setSearch(''); return !o; }); }}
                className={`w-8 h-8 inline-flex items-center justify-center rounded-md border transition-colors ${searchOpen ? 'border-on-surface/40 text-on-surface' : 'border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container'}`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              </button>
              <button
                title="下載目前資料 (CSV)"
                onClick={handleDownload}
                disabled={!shown.length}
                className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors disabled:opacity-40"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 21h14" /></svg>
              </button>
              <button
                onClick={() => setModuleOpen(true)}
                className="inline-flex items-center h-8 px-3 rounded-md bg-primary text-on-primary text-[13px] font-semibold hover:bg-ai-hover transition-colors"
              >
                AI 解讀
              </button>
            </div>
          </div>
          <PostsTable posts={shown} population={population} platform={platform} scope={scope} closeSignal={closeSignal} insightCache={insightCache} />
        </div>
      </section>

      {moduleOpen && <ModuleInsightModal platform={platform} scope={scope} onClose={() => setModuleOpen(false)} insightCache={insightCache} />}

      <ChatWidget scope={scope} />
    </div>
    </MentionContext.Provider>
  );
}
