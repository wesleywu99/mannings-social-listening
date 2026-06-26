'use client';
import { useMention } from './mentionContext';

/** AI 文字渲染：去行首 markdown 標題、**粗體** 主色強調、@帳號 可點（有 MentionContext 時）。 */
export function AIText({ text }: { text: string }) {
  const onMention = useMention();
  const cleaned = text.replace(/^#{1,6}\s*/gm, '');
  const re = /(\*\*[^*]+\*\*)|(@[\w.一-鿿]+)/g;

  const parts: { t: 'text' | 'b' | 'm'; v: string }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    if (m.index > last) parts.push({ t: 'text', v: cleaned.slice(last, m.index) });
    if (m[1]) parts.push({ t: 'b', v: m[1].slice(2, -2) });
    else parts.push({ t: 'm', v: m[2] });
    last = re.lastIndex;
  }
  if (last < cleaned.length) parts.push({ t: 'text', v: cleaned.slice(last) });

  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) => {
        if (p.t === 'b') return <strong key={i} className="font-bold text-primary">{p.v}</strong>;
        if (p.t === 'm') {
          return onMention
            ? <button key={i} onClick={() => onMention(p.v.slice(1))} className="font-medium text-link hover:underline">{p.v}</button>
            : <span key={i} className="font-medium text-on-surface">{p.v}</span>;
        }
        return <span key={i}>{p.v}</span>;
      })}
    </span>
  );
}
