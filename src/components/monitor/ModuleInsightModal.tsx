'use client';
import { useEffect, useState } from 'react';
import type { Platform } from '@/lib/domain/types';
import type { Scope } from '@/lib/ai/types';
import { Modal } from '@/components/Modal';
import { AIText } from './aiText';
import type { useInsightCache } from './useInsightCache';

type InsightCache = ReturnType<typeof useInsightCache>;

const NAME: Record<Platform, string> = { ig: 'Instagram', threads: 'Threads', fb: 'Facebook' };

function cacheKey(platform: Platform, scope: Scope): string {
  return `module:${scope.brand}:${platform}:${scope.dateStart ?? ''}:${scope.dateEnd ?? ''}`;
}

export function ModuleInsightModal({
  platform,
  scope,
  onClose,
  insightCache,
}: {
  platform: Platform;
  scope: Scope;
  onClose: () => void;
  insightCache: InsightCache;
}) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const run = (force = false) => {
    const key = cacheKey(platform, scope);
    if (!force) {
      const cached = insightCache.get(key);
      if (cached) { setText(cached); setLoading(false); return; }
    }
    setLoading(true);
    fetch('/api/insight/module', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, scope }),
    })
      .then((r) => r.json())
      .then((d) => {
        const t = d.insight ?? d.error ?? '（無法產生解讀）';
        setText(t);
        insightCache.set(key, t);
      })
      .catch((e) => setText('發生錯誤：' + String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { run(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <Modal onClose={onClose} maxWidth="560px">
      {(close) => (
        <>
          <div className="px-6 pt-6">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-wide text-mute">
              <span className="text-[#3b5bdb] bg-[#eef1ff] border border-[#dbe1ff] rounded px-1.5 py-0.5 mr-1.5">AI</span>平台解讀
            </div>
            <h3 className="text-xl font-semibold tracking-tight mt-2.5">{NAME[platform]}</h3>
            <p className="text-[12px] text-on-surface-variant/60 mt-1">當前篩選範圍 · 關鍵發現 / 成因 / 行動建議</p>
          </div>
          <div className="px-6 py-5 min-h-[160px]">
            {loading ? (
              <div className="space-y-2">
                <span className="block h-3 w-full rounded bg-surface-container animate-pulse" />
                <span className="block h-3 w-4/5 rounded bg-surface-container animate-pulse" />
                <span className="block h-3 w-11/12 rounded bg-surface-container animate-pulse" />
              </div>
            ) : (
              <div className="text-[13.5px] leading-relaxed text-on-surface"><AIText text={text ?? ''} /></div>
            )}
          </div>
          <div className="sticky bottom-0 flex justify-end gap-2.5 px-6 py-3.5 border-t border-outline-variant/60 bg-surface">
            <button onClick={() => run(true)} disabled={loading}
              className="rounded-[10px] text-[13px] font-semibold px-4 py-2 bg-primary text-on-primary hover:bg-ai-hover transition-colors disabled:opacity-50">
              {loading ? '分析中…' : '重新解讀'}
            </button>
            <button onClick={close}
              className="rounded-[10px] text-[13px] font-semibold px-4 py-2 bg-surface text-on-surface border border-outline-variant hover:bg-surface-container transition-colors">
              關閉
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
