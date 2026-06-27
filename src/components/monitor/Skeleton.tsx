'use client';

import type { CSSProperties } from 'react';

/** Geist 風骨架單元：hairline 卡片 + surface-container 灰塊 + pulse 動畫 */
export function Sk({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span className={`inline-block rounded bg-surface-container animate-pulse ${className}`} style={style} />;
}

/** KPI 卡骨架（3 張） */
export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-surface p-4 sm:p-5 rounded-2xl border border-outline-variant card-shadow">
          <Sk className="h-2.5 w-20" />
          <Sk className="h-7 w-28 mt-3" />
          <Sk className="h-3 w-16 mt-2.5" />
        </div>
      ))}
    </div>
  );
}

/** 趨勢圖 + 情感餅圖骨架（2/3 + 1/3） */
export function TrendSentimentSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-surface rounded-2xl border border-outline-variant card-shadow p-4 sm:p-5">
        <Sk className="h-3.5 w-48" />
        <Sk className="block w-full mt-4" style={{ height: 210 }} />
      </div>
      <div className="bg-surface rounded-2xl border border-outline-variant card-shadow p-4 sm:p-5">
        <Sk className="h-3 w-40" />
        <div className="flex flex-col items-center gap-3 mt-6">
          <Sk className="w-36 h-36 rounded-full" />
          <div className="grid grid-cols-3 gap-2 w-full">
            {[0, 1, 2].map((i) => <Sk key={i} className="h-8 w-full rounded-lg" />)}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 平台對比表骨架 */
export function PlatformTableSkeleton() {
  return (
    <div className="bg-surface rounded-2xl border border-outline-variant card-shadow overflow-hidden">
      <div className="px-5 py-3 border-b border-outline-variant">
        <Sk className="h-3 w-32" />
      </div>
      <div className="divide-y divide-outline-variant/40">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between px-5 py-3.5">
            <Sk className="h-3.5 w-32" />
            <div className="flex gap-4">
              {[0, 1, 2, 3, 4, 5].map((j) => <Sk key={j} className="h-3.5 w-12" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 貼文表骨架 */
export function PostsTableSkeleton() {
  return (
    <div className="bg-surface rounded-2xl border border-outline-variant card-shadow overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between border-b border-outline-variant/60">
        <Sk className="h-4 w-28" />
        <div className="flex gap-2">
          <Sk className="h-8 w-8 rounded-md" />
          <Sk className="h-8 w-8 rounded-md" />
          <Sk className="h-8 w-16 rounded-md" />
        </div>
      </div>
      <div className="divide-y divide-outline-variant/5">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3.5">
            <Sk className="h-3 w-3 rounded-full shrink-0" />
            <Sk className="h-3 w-24 shrink-0" />
            <Sk className="h-3 w-20 shrink-0" />
            <Sk className="h-3 flex-1 max-w-[240px]" />
            <div className="flex gap-3 ml-auto">
              {[0, 1, 2, 3].map((j) => <Sk key={j} className="h-3 w-10" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
