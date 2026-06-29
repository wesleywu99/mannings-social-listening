import type { Post, Platform } from '@/lib/domain/types';
import type { DigestInsight } from './insight';

const PNAME: Record<Platform, string> = { ig: 'Instagram', threads: 'Threads', fb: 'Facebook' };
const ORDER: Platform[] = ['ig', 'threads', 'fb'];

/** 圖表配色（HTML 圖例與 PNG 餅圖共用，確保一致） */
export const SENTIMENT_COLOR = { pos: '#0f766e', neu: '#d4d4d4', neg: '#ee0000' } as const;
export const PLATFORM_COLOR: Record<Platform, string> = { ig: '#d62976', threads: '#111111', fb: '#1877f2' };

export interface DigestData {
  dayLabel: string;
  hasData: boolean;
  posts: number;
  engagement: number;
  deltaPosts: number | null;       // ratio vs prior（null=無前期）
  deltaEng: number | null;
  sentiment: { pos: number; neu: number; neg: number };  // 佔比 0–1
  negCount: number;
  platforms: { platform: Platform; engagement: number; share: number }[];
  topPost: { username: string; platform: Platform; engagement: number; content: string; url: string | null } | null;
  verdict: string;
}

const eng = (p: Post) => p.engagementTotal ?? 0;

// ─── 港時日界（純函式，可測）：資料以 UTC 儲存，港時 = UTC+8、無夏令 ──────────
const HK = '+08:00';

/** ISO 時間 → 該時刻的港時日期 'YYYY-MM-DD' */
export function hkDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 給 now 的 ISO，回傳「港時昨日」'YYYY-MM-DD'（傳入 now 以保持可測） */
export function yesterdayHK(nowIso: string): string {
  const d = new Date(hkDateOf(nowIso) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** 港時某日 'YYYY-MM-DD' → 對應的 UTC 起訖 ISO（供 post_time 範圍查詢） */
export function hkDayRangeUTC(hkDate: string): { start: string; end: string } {
  return {
    start: new Date(`${hkDate}T00:00:00.000${HK}`).toISOString(),
    end: new Date(`${hkDate}T23:59:59.999${HK}`).toISOString(),
  };
}

/** 'YYYY-MM-DD'（港時）→ 顯示用標籤，如「2026年4月25日（週五）」 */
export function dayLabelHK(hkDate: string): string {
  const wd = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  const d = new Date(`${hkDate}T12:00:00${HK}`);
  const [y, m, day] = hkDate.split('-');
  return `${y}年${Number(m)}月${Number(day)}日（${wd[d.getUTCDay()]}）`;
}

/** 純函式：由「當日 posts + 前一日 posts」算出每日摘要（無 LLM、可測、可重現） */
export function buildDigest(posts: Post[], prior: Post[], dayLabel: string): DigestData {
  const totalEng = posts.reduce((s, p) => s + eng(p), 0);
  const priorEng = prior.reduce((s, p) => s + eng(p), 0);
  const n = posts.length;

  const sCount = { pos: 0, neu: 0, neg: 0 };
  for (const p of posts) { if (p.sentiment === 'pos') sCount.pos++; else if (p.sentiment === 'neg') sCount.neg++; else if (p.sentiment === 'neu') sCount.neu++; }
  const sTotal = sCount.pos + sCount.neu + sCount.neg || 1;
  const sentiment = { pos: sCount.pos / sTotal, neu: sCount.neu / sTotal, neg: sCount.neg / sTotal };

  const platforms = ORDER.map((pf) => {
    const e = posts.filter((p) => p.platform === pf).reduce((s, p) => s + eng(p), 0);
    return { platform: pf, engagement: e, share: totalEng ? e / totalEng : 0 };
  }).filter((x) => x.engagement > 0).sort((a, b) => b.engagement - a.engagement);

  const top = [...posts].sort((a, b) => eng(b) - eng(a))[0] ?? null;
  const topPost = top ? {
    username: top.username ?? '', platform: top.platform, engagement: eng(top),
    content: (top.content ?? '').slice(0, 120), url: top.postUrl,
  } : null;

  const deltaEng = priorEng ? (totalEng - priorEng) / priorEng : null;
  const deltaPosts = prior.length ? (n - prior.length) / prior.length : null;

  // 模板化健康判語（無 LLM，可靠即時）
  const pct = (r: number | null) => (r == null ? '' : `${r >= 0 ? '+' : ''}${Math.round(r * 100)}%`);
  let verdict: string;
  if (n === 0) verdict = '昨日無社群活動。';
  else {
    const parts = [`聲量 ${totalEng.toLocaleString()} 次互動${deltaEng != null ? `（${pct(deltaEng)} vs 前日）` : ''}`];
    parts.push(`情感正向 ${Math.round(sentiment.pos * 100)}%`);
    if (sCount.neg > 0) parts.push(`⚠️ ${sCount.neg} 則負面需留意`);
    verdict = parts.join('，') + '。';
  }

  return {
    dayLabel, hasData: n > 0, posts: n, engagement: totalEng,
    deltaPosts, deltaEng, sentiment, negCount: sCount.neg, platforms, topPost, verdict,
  };
}

// ─── email HTML（純 CSS 圖表，無圖片、無外部請求，全客戶端可顯示）──────────

function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function deltaChip(r: number | null): string {
  if (r == null) return '';
  const up = r >= 0;
  return `<span style="font-size:12px;font-weight:600;color:${up ? '#0f766e' : '#b42318'}">${up ? '▲' : '▼'} ${Math.abs(Math.round(r * 100))}%</span>`;
}

const LABEL = 'font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#a1a1a1';

/** 圖例一列（色塊 + 文字） */
function legendRow(color: string, label: string, value: string): string {
  return `<tr>
    <td style="padding:3px 6px 3px 0;vertical-align:middle"><span style="display:inline-block;width:9px;height:9px;background:${color};border-radius:2px"></span></td>
    <td style="font-size:12px;color:#4d4d4d;padding:3px 0;vertical-align:middle">${label}</td>
    <td style="font-size:12px;color:#171717;font-weight:600;text-align:right;padding:3px 0;vertical-align:middle">${value}</td>
  </tr>`;
}

/** 洞察區塊（AI）——本封信的核心價值 */
function renderInsight(ins: DigestInsight): string {
  const block = (title: string, lines: string[]) => lines.length ? `
    <div style="margin-top:12px">
      <div style="${LABEL};margin-bottom:5px">${title}</div>
      ${lines.map((l) => `<div style="font-size:13px;color:#2b2b2b;line-height:1.65;padding-left:14px;text-indent:-14px">・${esc(l)}</div>`).join('')}
    </div>` : '';

  return `<tr><td style="padding:8px 16px">
    <div style="border:1px solid #e6e6e6;border-left:3px solid #0f766e;border-radius:10px;padding:14px 16px;background:#fbfdfd">
      <div style="font-size:13px;font-weight:700;color:#0f766e;letter-spacing:.02em">今日洞察 · AI</div>
      ${block('在討論什麼', ins.discussion)}
      ${block('什麼內容贏', ins.winningContent)}
      ${ins.takeaway ? `<div style="margin-top:12px;padding-top:12px;border-top:1px dashed #d9e6e4">
        <span style="${LABEL}">行動建議</span>
        <div style="font-size:14px;color:#0f766e;font-weight:600;line-height:1.6;margin-top:4px">→ ${esc(ins.takeaway)}</div>
      </div>` : ''}
      ${ins.risk ? `<div style="margin-top:10px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:9px 12px">
        <span style="font-size:12px;font-weight:700;color:#b42318">⚠️ 風險</span>
        <span style="font-size:13px;color:#7f1d1d;line-height:1.6"> ${esc(ins.risk)}</span>
      </div>` : ''}
    </div>
  </td></tr>`;
}

export function renderDigest(
  d: DigestData,
  opts: { appUrl: string; insight?: DigestInsight | null; charts?: { sentiment?: boolean; platform?: boolean } },
): string {
  const SENT = [
    { label: '正向', color: SENTIMENT_COLOR.pos, v: d.sentiment.pos },
    { label: '中性', color: SENTIMENT_COLOR.neu, v: d.sentiment.neu },
    { label: '負面', color: SENTIMENT_COLOR.neg, v: d.sentiment.neg },
  ];
  const hasSent = d.sentiment.pos + d.sentiment.neu + d.sentiment.neg > 0;

  // 情感區塊：優先用內嵌餅圖（cid:sentiment），否則退回 CSS 堆疊條
  const sentLegend = `<table cellpadding="0" cellspacing="0" width="100%">${SENT.map((s) => legendRow(s.color, s.label, `${Math.round(s.v * 100)}%`)).join('')}</table>`;
  const sentPanel = opts.charts?.sentiment
    ? `<table width="100%" cellpadding="0" cellspacing="0"><tr>
         <td width="140" style="vertical-align:middle"><img src="cid:sentiment" width="120" height="120" alt="情感分佈" style="display:block"></td>
         <td style="vertical-align:middle;padding-left:6px">${sentLegend}</td>
       </tr></table>`
    : `<table width="100%" cellpadding="0" cellspacing="0" style="border-radius:5px;overflow:hidden"><tr>${
        SENT.filter((s) => s.v > 0).map((s) => `<td bgcolor="${s.color}" width="${(s.v * 100).toFixed(1)}%" style="height:10px;font-size:0;line-height:0">&nbsp;</td>`).join('') || '<td bgcolor="#d4d4d4" style="height:10px">&nbsp;</td>'
      }</tr></table><div style="margin-top:8px">${SENT.map((s) => `<span style="font-size:11px;color:#4d4d4d;margin-right:14px"><span style="display:inline-block;width:8px;height:8px;background:${s.color};border-radius:2px;margin-right:5px"></span>${s.label} ${Math.round(s.v * 100)}%</span>`).join('')}</div>`;

  // 平台區塊：優先用內嵌餅圖（cid:platform，互動聲量佔比），否則退回 CSS 橫條
  const platLegend = `<table cellpadding="0" cellspacing="0" width="100%">${d.platforms.map((p) => legendRow(PLATFORM_COLOR[p.platform], PNAME[p.platform], `${p.engagement.toLocaleString()} · ${Math.round(p.share * 100)}%`)).join('')}</table>`;
  const maxEng = Math.max(1, ...d.platforms.map((p) => p.engagement));
  const platPanel = opts.charts?.platform
    ? `<table width="100%" cellpadding="0" cellspacing="0"><tr>
         <td width="140" style="vertical-align:middle"><img src="cid:platform" width="120" height="120" alt="各平台互動佔比" style="display:block"></td>
         <td style="vertical-align:middle;padding-left:6px">${platLegend}</td>
       </tr></table>`
    : `<table width="100%" cellpadding="0" cellspacing="0">${d.platforms.map((p) => `
        <tr>
          <td style="font-size:12px;color:#4d4d4d;padding:4px 8px 4px 0;white-space:nowrap">${PNAME[p.platform]}</td>
          <td style="padding:4px 0;width:100%"><table cellpadding="0" cellspacing="0" width="100%"><tr><td bgcolor="${PLATFORM_COLOR[p.platform]}" width="${Math.round((p.engagement / maxEng) * 100)}%" style="height:8px;border-radius:4px;font-size:0;line-height:0">&nbsp;</td><td>&nbsp;</td></tr></table></td>
          <td style="font-size:12px;color:#171717;font-weight:600;text-align:right;padding:4px 0 4px 8px;white-space:nowrap">${p.engagement.toLocaleString()}</td>
        </tr>`).join('')}</table>`;

  const kpi = (label: string, value: string, delta: number | null) =>
    `<td width="50%" style="padding:0 8px"><div style="border:1px solid #ebebeb;border-radius:10px;padding:12px 14px">
      <div style="${LABEL}">${label}</div>
      <div style="font-size:24px;font-weight:600;color:#171717;margin-top:4px">${value} ${deltaChip(delta)}</div>
    </div></td>`;

  const topHtml = d.topPost ? `
    <div style="border:1px solid #ebebeb;border-radius:10px;padding:12px 14px;margin-top:8px">
      <div style="${LABEL};margin-bottom:6px">今日最高互動</div>
      <div style="font-size:13px;color:#4d4d4d;line-height:1.6">${esc(d.topPost.content)}</div>
      <div style="font-size:11px;color:#8f8f8f;margin-top:6px">@${esc(d.topPost.username)} · ${PNAME[d.topPost.platform]} · <strong style="color:#171717">${d.topPost.engagement.toLocaleString()}</strong> 互動</div>
    </div>` : '';

  const section = (title: string, body: string) => `<tr><td style="padding:12px 24px">
    <div style="${LABEL};margin-bottom:8px">${title}</div>${body}
  </td></tr>`;

  return `<!doctype html><html lang="zh-Hant"><body style="margin:0;background:#fafafa;padding:24px 0;font-family:Arial,'PingFang TC','Microsoft JhengHei',sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #ebebeb;border-radius:12px;overflow:hidden">
      <tr><td style="padding:22px 24px;background:#171717">
        <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9aa0a6">Mannings · Daily Digest</div>
        <div style="font-size:18px;font-weight:600;color:#fff;margin-top:4px">${d.dayLabel}</div>
      </td></tr>
      <tr><td style="padding:18px 24px 4px">
        <div style="font-size:15px;line-height:1.6;color:#171717;font-weight:500">${esc(d.verdict)}</div>
      </td></tr>
      ${opts.insight ? renderInsight(opts.insight) : ''}
      ${d.hasData ? `
      <tr><td style="padding:12px 16px"><table width="100%" cellpadding="0" cellspacing="0"><tr>
        ${kpi('貼文數', d.posts.toLocaleString(), d.deltaPosts)}
        ${kpi('總互動', d.engagement.toLocaleString(), d.deltaEng)}
      </tr></table></td></tr>
      ${hasSent ? section('情感分佈', sentPanel) : ''}
      ${d.platforms.length ? section('各平台互動聲量', platPanel) : ''}
      <tr><td style="padding:4px 24px 8px">${topHtml}</td></tr>
      ` : ''}
      <tr><td style="padding:18px 24px;border-top:1px solid #ebebeb;background:#fafafa">
        <a href="${opts.appUrl}/monitor?token=mannings" style="color:#0070f3;font-size:13px;text-decoration:none;font-weight:600">→ 開啟完整看板</a>
        <div style="font-size:11px;color:#a1a1a1;margin-top:10px;line-height:1.6">你訂閱了 Mannings 每日摘要。可在看板右上角管理訂閱。</div>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}
