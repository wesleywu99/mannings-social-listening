'use client';
import { useEffect, useRef, useState } from 'react';
import type { Scope } from '@/lib/ai/types';
import { AIText } from './aiText';

interface Msg { role: 'user' | 'assistant'; content: string; followups?: string[]; }

const SAMPLES = ['哪個平台互動效率最高？', 'Top 3 創作者是誰？', '最佳發文時段是什麼時候？'];

/** 從回答末尾解析 ===FOLLOWUPS=== 推薦問題 */
function parseFollowups(text: string): { content: string; followups: string[] } {
  const m = text.match(/===FOLLOWUPS===\s*([\s\S]*)$/i);
  if (!m) return { content: text, followups: [] };
  const followups = m[1].split('\n').map((s) => s.replace(/^[-*\d.、]+\s*/, '').trim()).filter(Boolean);
  return { content: text.slice(0, m.index).trim(), followups };
}

export function ChatWidget({ scope }: { scope: Scope }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight); }, [msgs, loading]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    const next: Msg[] = [...msgs, { role: 'user', content: q }];
    setMsgs([...next, { role: 'assistant', content: '' }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })), scope }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accContent = '';
      const toolsUsed: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const ev = JSON.parse(data);
            if (ev.type === 'delta' && ev.content) {
              accContent += ev.content;
              setMsgs((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: 'assistant', content: accContent };
                return copy;
              });
            } else if (ev.type === 'tools' && ev.toolsUsed) {
              toolsUsed.length = 0;
              toolsUsed.push(...ev.toolsUsed);
            } else if (ev.type === 'done') {
              const { content, followups } = parseFollowups(accContent);
              setMsgs((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: 'assistant', content, followups };
                return copy;
              });
            } else if (ev.type === 'error') {
              setMsgs((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: 'assistant', content: '發生錯誤：' + ev.message };
                return copy;
              });
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      setMsgs((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'assistant', content: '發生錯誤：' + String(e) };
        return copy;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-8 right-8 z-[60] flex items-center gap-3 bg-ai-highlight text-on-primary px-6 py-4 rounded-[2rem] shadow-2xl hover:bg-ai-hover transition-all hover:scale-105"
        >
          <span className="text-sm font-black">AI 解讀</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-8 right-8 z-[60] w-[400px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-4rem)] bg-surface rounded-3xl shadow-2xl border border-outline-variant/30 flex flex-col overflow-hidden">
          <div className="px-5 py-4 bg-ai-highlight text-on-primary flex items-center justify-between">
            <div className="flex items-center gap-2"><span className="font-black text-sm">AI 解讀</span></div>
            <button onClick={() => setOpen(false)} className="text-on-primary/80 hover:text-on-primary text-xl leading-none">×</button>
          </div>
          <div className="px-5 py-2 text-[11px] text-on-surface-variant/60 border-b border-outline-variant/10">
            範圍：{scope.brand}{scope.platform ? ` · ${scope.platform}` : ''}{(scope.dateStart || scope.dateEnd) ? ' · 已篩日期' : ''}
          </div>
          <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {msgs.length === 0 && (
              <div className="text-xs text-on-surface-variant/50 mt-6 space-y-2">
                <p className="text-center">問我任何關於數據的問題，例如：</p>
                {SAMPLES.map((s) => (
                  <button key={s} onClick={() => send(s)} className="block w-full text-left px-3 py-2 rounded-xl bg-surface-container hover:bg-primary/5 hover:text-primary transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={m.role === 'user'
                  ? 'bg-primary text-on-primary rounded-2xl rounded-br-sm px-3.5 py-2 text-sm max-w-[80%]'
                  : 'bg-surface-container rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm max-w-[90%] text-on-surface leading-relaxed'}>
                  {m.role === 'assistant' ? (
                    <>
                      {m.content ? <AIText text={m.content} /> : <span className="text-on-surface-variant/60">分析中…</span>}
                      {m.followups && m.followups.length > 0 && (
                        <div className="mt-2.5 pt-2.5 border-t border-outline-variant/40 space-y-1.5">
                          <p className="text-[10px] font-mono uppercase tracking-wide text-mute">繼續追問</p>
                          {m.followups.slice(0, 4).map((f, j) => (
                            <button key={j} onClick={() => send(f)} className="block w-full text-left text-[12px] px-2.5 py-1.5 rounded-lg bg-surface hover:bg-primary/5 hover:text-primary transition-colors border border-outline-variant/60">
                              {f}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : m.content}
                </div>
              </div>
            ))}
            {loading && msgs[msgs.length - 1]?.role === 'user' && (
              <div className="flex justify-start">
                <div className="bg-surface-container rounded-2xl px-3.5 py-2.5 text-sm text-on-surface-variant/60">分析中…</div>
              </div>
            )}
          </div>
          <div className="p-3 border-t border-outline-variant/20 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="輸入問題…"
              className="flex-1 bg-surface-container rounded-xl px-3 py-2 text-sm outline-none"
            />
            <button onClick={() => send()} disabled={loading} className="bg-ai-highlight text-on-primary rounded-xl px-4 text-sm font-bold disabled:opacity-50">
              送出
            </button>
          </div>
        </div>
      )}
    </>
  );
}
