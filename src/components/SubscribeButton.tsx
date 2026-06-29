'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/Modal';

export function SubscribeButton() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<{ email: string }[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/subscribers').then((r) => r.json())
      .then((d) => setList(Array.isArray(d) ? d : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (open) load(); }, [open]);

  const add = async () => {
    const e = email.trim();
    if (!e || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/subscribers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? '加入失敗'); return; }
      setList(d); setEmail('');
    } catch (err) { setError(String(err)); } finally { setBusy(false); }
  };

  const remove = async (target: string) => {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/subscribers', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target }),
      });
      const d = await res.json();
      if (res.ok) setList(d);
    } catch { /* ignore */ } finally { setBusy(false); }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="訂閱報告 Email"
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-outline-variant text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
        訂閱報告
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)} maxWidth="440px">
          {(close) => (
            <>
              <div className="px-6 pt-6">
                <h3 className="text-lg font-semibold tracking-tight">訂閱報告 Email</h3>
                <p className="text-[13px] text-on-surface-variant mt-1">加入你的 email，定期收到 AI 社媒報告。可隨時移除。</p>
              </div>
              <div className="px-6 py-5 flex flex-col gap-4">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
                    placeholder="you@example.com"
                    className="flex-1 h-9 rounded-md border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-on-surface/40 transition-colors"
                  />
                  <button onClick={add} disabled={busy}
                    className="h-9 px-4 rounded-md bg-primary text-on-primary text-sm font-semibold hover:bg-ai-hover transition-colors disabled:opacity-50">加入</button>
                </div>
                {error && <div className="text-[13px] text-sentiment-neg">{error}</div>}

                <div>
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-wide text-mute mb-2">
                    目前訂閱（{list.length}）
                  </div>
                  {loading ? (
                    <div className="text-[13px] text-on-surface-variant/50">載入中…</div>
                  ) : list.length === 0 ? (
                    <div className="text-[13px] text-on-surface-variant/50 border border-dashed border-outline-variant rounded-lg px-3 py-4 text-center">尚無訂閱者</div>
                  ) : (
                    <div className="border border-outline-variant rounded-lg divide-y divide-outline-variant/60">
                      {list.map((s) => (
                        <div key={s.email} className="flex items-center justify-between px-3 py-2 text-[13px]">
                          <span className="truncate text-on-surface">{s.email}</span>
                          <button onClick={() => remove(s.email)} disabled={busy}
                            className="text-on-surface-variant/50 hover:text-sentiment-neg transition-colors shrink-0 ml-2" title="移除">移除</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="px-6 py-3.5 flex justify-end border-t border-outline-variant/60">
                <button onClick={close} className="h-9 px-4 rounded-md bg-surface text-on-surface border border-outline-variant text-sm font-semibold hover:bg-surface-container transition-colors">關閉</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
