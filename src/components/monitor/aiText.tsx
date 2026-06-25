/** 極簡 AI 文字渲染：去除行首 markdown 標題符號，支援 **粗體**（主色強調），保留換行 */
export function AIText({ text }: { text: string }) {
  const cleaned = text.replace(/^#{1,6}\s*/gm, '');   // 去掉行首 #/##/### 等標題符號
  const parts = cleaned.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <strong key={i} className="font-bold text-primary">{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}
