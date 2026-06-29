import type { StoredReport } from '@/lib/data/reports';

const SECTIONS: { key: keyof StoredReport; title: string }[] = [
  { key: 'summary', title: '核心執行摘要' },
  { key: 'advice', title: '行動建議' },
  { key: 'content', title: '內容洞察' },
  { key: 'platform', title: '平台效能' },
  { key: 'kol', title: '創作者表現' },
  { key: 'sentiment', title: '情感輿情' },
  { key: 'topics', title: '話題洞察' },
  { key: 'competitor', title: '競品對比' },
];

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inlineFmt(s: string): string {
  return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#171717">$1</strong>');
}
function sectionHtml(text: string): string {
  const cleaned = text.replace(/^#{1,6}\s*/gm, '').trim();
  return cleaned.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p style="margin:0 0 10px;line-height:1.75;color:#4d4d4d;font-size:14px">${inlineFmt(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** 把快取報告渲染成 email-safe HTML（inline CSS、table 排版） */
export function renderReportEmail(r: StoredReport): string {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const FALLBACK = '此部分未能生成';
  const blocks = SECTIONS.map((s) => {
    const txt = (r[s.key] as string) ?? '';
    if (!txt || txt.startsWith(FALLBACK)) return '';
    return `<tr><td style="padding:20px 28px;border-top:1px solid #ebebeb">
      <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8f8f8f;margin-bottom:8px">${s.title}</div>
      ${sectionHtml(txt)}
    </td></tr>`;
  }).join('');

  let generated = r.generatedAt;
  try { generated = new Date(r.generatedAt).toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' }); } catch { /* keep raw */ }

  return `<!doctype html><html lang="zh-Hant"><body style="margin:0;background:#fafafa;padding:24px 0;font-family:Arial,'PingFang TC','Microsoft JhengHei',sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #ebebeb;border-radius:12px;overflow:hidden">
      <tr><td style="padding:24px 28px;background:#171717">
        <div style="font-size:18px;font-weight:600;color:#ffffff">Mannings 社媒報告</div>
        <div style="font-size:12px;color:#bdbdbd;margin-top:4px">${r.dateStart} ~ ${r.dateEnd}　·　生成於 ${generated}</div>
      </td></tr>
      ${blocks}
      <tr><td style="padding:18px 28px;border-top:1px solid #ebebeb;background:#fafafa">
        <a href="${appUrl}/monitor?token=mannings" style="color:#0070f3;font-size:13px;text-decoration:none;font-weight:600">→ 開啟完整看板</a>
        <div style="font-size:11px;color:#a1a1a1;margin-top:10px;line-height:1.6">你收到此信因為訂閱了 Mannings 社媒報告。可在看板右上角「訂閱報告」移除。</div>
      </td></tr>
    </table>
  </td></tr></table>
  </body></html>`;
}
