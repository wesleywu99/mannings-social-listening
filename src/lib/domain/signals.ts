import type { Post, Platform, Sentiment } from './types';

// ─── 型別 ───────────────────────────────────────────────────────────

export type SignalSeverity = 'info' | 'watch' | 'act';
export type SignalKind = 'engagement' | 'volume' | 'sentiment' | 'topic' | 'channel';

export interface Signal {
  kind: SignalKind;
  severity: SignalSeverity;
  direction?: 'up' | 'down';
  title: string;       // 一句話標題
  detail: string;      // 數據說明
  action?: string;     // 建議行動
  evidence?: { platform?: Platform; term?: string; postUrls?: string[] };
}

/** 單日彙總（偵測器的輸入單位） */
export interface DayAgg {
  date: string;
  posts: number;
  engagement: number;
  sent: { pos: number; neu: number; neg: number };
  platform: Record<Platform, { posts: number; engagement: number; own: number }>;
  terms: Record<string, number>;   // sources 的 keyword/hashtag/mention 詞頻
}

export interface SignalContext {
  today: DayAgg;
  baseline: DayAgg[];   // 過去 N 天（不含今日），可能少於 7
  todayPosts: Post[];   // 供取證（URL/情感）
}

/** 一個可抽換的偵測策略（registry pattern；新增信號只要加一個 detector） */
export interface SignalDetector {
  name: string;
  detect: (ctx: SignalContext) => Signal[];
}

// ─── 小工具 ─────────────────────────────────────────────────────────

const PLATFORMS: Platform[] = ['ig', 'threads', 'fb'];
const TERM_TYPES = new Set(['keyword', 'hashtag', 'mention']);

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}
const sevRank: Record<SignalSeverity, number> = { act: 3, watch: 2, info: 1 };
const eng = (p: Post) => p.engagementTotal ?? 0;

/** 自有貼文判定：sources 含 type='account'（官方帳號發文）。無此標記則全為 earned。 */
export function isOwn(p: Post): boolean {
  return (p.sources ?? []).some((s) => s.type === 'account');
}

export function aggregateDay(date: string, posts: Post[]): DayAgg {
  const platform = Object.fromEntries(PLATFORMS.map((p) => [p, { posts: 0, engagement: 0, own: 0 }])) as DayAgg['platform'];
  const sent = { pos: 0, neu: 0, neg: 0 };
  const terms: Record<string, number> = {};

  for (const p of posts) {
    const pf = platform[p.platform];
    if (pf) { pf.posts++; pf.engagement += eng(p); if (isOwn(p)) pf.own++; }
    const s = p.sentiment as Sentiment | null;
    if (s === 'pos') sent.pos++; else if (s === 'neg') sent.neg++; else if (s === 'neu') sent.neu++;
    for (const src of p.sources ?? []) {
      if (!TERM_TYPES.has(src.type) || !src.value) continue;
      const k = src.value.trim().toLowerCase();
      if (k) terms[k] = (terms[k] ?? 0) + 1;
    }
  }
  return { date, posts: posts.length, engagement: posts.reduce((a, p) => a + eng(p), 0), sent, platform, terms };
}

// ─── 偵測器（每個都是一個策略，可獨立增刪）────────────────────────────

const MIN_BASELINE_DAYS = 3;
const PNAME: Record<Platform, string> = { ig: 'Instagram', threads: 'Threads', fb: 'Facebook' };

/** 互動量 vs 7 日基準（mean±std），偵測突升/突跌 */
const engagementDetector: SignalDetector = {
  name: 'engagement',
  detect({ today, baseline }) {
    if (baseline.length < MIN_BASELINE_DAYS) return [];
    const base = baseline.map((d) => d.engagement);
    const m = mean(base), sd = std(base);
    if (m < 200) return [];                                  // 量太小不報，避免噪音
    const deltaPct = (today.engagement - m) / m;
    if (Math.abs(deltaPct) < 0.25) return [];                // 變化不足 25% 不報
    const z = sd ? (today.engagement - m) / sd : 0;
    // 顯著度取「標準差」與「百分比」兩者較高者（基準無變異時 z=0，仍能靠 % 觸發）
    const rank = Math.max(
      Math.abs(z) >= 2.5 ? 3 : Math.abs(z) >= 1.5 ? 2 : 1,
      Math.abs(deltaPct) >= 0.6 ? 3 : Math.abs(deltaPct) >= 0.35 ? 2 : 1,
    );
    if (rank < 2) return [];
    // 量的變化＝留意/機會，不佔用紅燈「需行動」（紅燈保留給負面情感/危機話題等真風險）
    const severity: SignalSeverity = 'watch';
    const up = today.engagement >= m;
    const pct = `${up ? '+' : ''}${Math.round(deltaPct * 100)}%`;
    return [{
      kind: 'engagement', severity, direction: up ? 'up' : 'down',
      title: up ? '聲量明顯高於常態' : '聲量明顯低於常態',
      detail: `昨日互動 ${today.engagement.toLocaleString()}，較 7 日均值 ${Math.round(m).toLocaleString()} ${pct}。`,
      action: up ? '把握動能：複製昨日高互動的內容類型再推一波。' : '檢視是否發文減少或題材疲乏，今日補強主打內容。',
    }];
  },
};

/** 發文量 vs 基準（與互動互補：少帖高互動 / 多帖低互動皆有意義） */
const volumeDetector: SignalDetector = {
  name: 'volume',
  detect({ today, baseline }) {
    if (baseline.length < MIN_BASELINE_DAYS) return [];
    const base = baseline.map((d) => d.posts);
    const m = mean(base), sd = std(base);
    if (m < 3) return [];
    const deltaPct = (today.posts - m) / m;
    const z = sd ? (today.posts - m) / sd : 0;
    if (Math.abs(deltaPct) < 0.4) return [];
    if (sd > 0 && Math.abs(z) < 1.5) return [];              // 有變異但未達顯著；基準無變異則靠 % 觸發
    const up = today.posts >= m;
    return [{
      kind: 'volume', severity: 'watch', direction: up ? 'up' : 'down',
      title: up ? '討論篇數明顯增加' : '討論篇數明顯減少',
      detail: `昨日 ${today.posts} 篇，較 7 日均值 ${Math.round(m)} 篇 ${up ? '+' : ''}${Math.round(deltaPct * 100)}%。`,
      action: up ? '聲量在擴散，確認是正面話題還是需要介入的事件。' : '聲量轉冷，今日加大內容投放或話題引導。',
    }];
  },
};

/** 負面占比 vs 基準上升（digest 級風險；更嚴重的走即時告警） */
const sentimentDetector: SignalDetector = {
  name: 'sentiment',
  detect({ today, baseline, todayPosts }) {
    const negToday = today.sent.neg;
    if (negToday < 3) return [];                              // 小數字不報
    const totToday = today.sent.pos + today.sent.neu + today.sent.neg || 1;
    const negPct = negToday / totToday;
    const baseNeg = baseline.length >= MIN_BASELINE_DAYS
      ? mean(baseline.map((d) => { const t = d.sent.pos + d.sent.neu + d.sent.neg || 1; return d.sent.neg / t; }))
      : 0;
    const jump = negPct - baseNeg;
    if (negPct < 0.25 && jump < 0.12) return [];             // 既不高、也沒明顯上升
    const severity: SignalSeverity = negPct >= 0.4 || jump >= 0.2 ? 'act' : 'watch';
    const urls = todayPosts.filter((p) => p.sentiment === 'neg').sort((a, b) => eng(b) - eng(a)).slice(0, 3).map((p) => p.postUrl).filter((u): u is string => !!u);
    return [{
      kind: 'sentiment', severity, direction: 'up',
      title: '負面情感高於常態',
      detail: `昨日負面占比 ${Math.round(negPct * 100)}%（${negToday} 則）${baseNeg ? `，基準約 ${Math.round(baseNeg * 100)}%` : ''}。`,
      action: '點開負面貼文確認主因，必要時客服／公關今日介入。',
      evidence: { postUrls: urls },
    }];
  },
};

/** 新興話題：sources 詞頻今日相對基準竄升 */
const topicDetector: SignalDetector = {
  name: 'topic',
  detect({ today, baseline, todayPosts }) {
    const out: Signal[] = [];
    for (const [term, count] of Object.entries(today.terms)) {
      if (count < 3) continue;
      const baseAvg = baseline.length ? mean(baseline.map((d) => d.terms[term] ?? 0)) : 0;
      if (count < baseAvg * 2 + 2) continue;                 // 需明顯高於基準
      const termPosts = todayPosts.filter((p) => (p.sources ?? []).some((s) => TERM_TYPES.has(s.type) && s.value?.trim().toLowerCase() === term));
      const neg = termPosts.filter((p) => p.sentiment === 'neg').length;
      const negSkew = termPosts.length ? neg / termPosts.length : 0;
      const risky = negSkew >= 0.3;
      out.push({
        kind: 'topic', severity: risky ? 'act' : 'watch', direction: 'up',
        title: risky ? `「${term}」討論升溫且偏負面` : `「${term}」討論升溫`,
        detail: `昨日 ${count} 則提及「${term}」${baseAvg ? `（基準約 ${baseAvg.toFixed(1)} 則/日）` : ''}${neg ? `，其中 ${neg} 則負面` : ''}。`,
        action: risky ? '優先確認是否輿情事件，客服／公關跟進。' : '順勢產出相關內容，承接這波討論。',
        evidence: { term, postUrls: termPosts.sort((a, b) => eng(b) - eng(a)).slice(0, 3).map((p) => p.postUrl).filter((u): u is string => !!u) },
      });
    }
    return out.sort((a, b) => sevRank[b.severity] - sevRank[a.severity]).slice(0, 2);
  },
};

/** 平台動能 vs 你的投放：某平台互動上升、但你自有貼文佔比低＝機會 */
const channelDetector: SignalDetector = {
  name: 'channel',
  detect({ today, baseline }) {
    if (baseline.length < MIN_BASELINE_DAYS) return [];
    const ownTotal = PLATFORMS.reduce((a, p) => a + today.platform[p].own, 0);
    const out: Signal[] = [];
    for (const pf of PLATFORMS) {
      const e = today.platform[pf].engagement;
      const base = mean(baseline.map((d) => d.platform[pf].engagement));
      if (base < 200 || e < base * 1.3) continue;            // 需明顯上升動能
      const ownHere = today.platform[pf].own;
      const lowOwn = ownTotal > 0 && ownHere / ownTotal < 0.2;  // 自有投放佔比偏低
      out.push({
        kind: 'channel', severity: lowOwn ? 'watch' : 'info', direction: 'up',
        title: lowOwn ? `${PNAME[pf]} 動能上升，但你發文偏少` : `${PNAME[pf]} 互動動能上升`,
        detail: `${PNAME[pf]} 昨日互動 ${e.toLocaleString()}，較基準 +${Math.round((e / base - 1) * 100)}%${ownTotal ? `；你自有貼文僅 ${ownHere} 篇` : ''}。`,
        action: lowOwn ? `聲量正流向你發最少的平台，今日在 ${PNAME[pf]} 補 2–3 篇主打內容。` : undefined,
        evidence: { platform: pf },
      });
    }
    return out.filter((s) => s.severity !== 'info').slice(0, 1);
  },
};

/** 預設偵測器清單（可抽換／擴充） */
export const DEFAULT_DETECTORS: SignalDetector[] = [
  engagementDetector, volumeDetector, sentimentDetector, topicDetector, channelDetector,
];

// ─── 引擎 ───────────────────────────────────────────────────────────

/** 跑全部偵測器，回傳依嚴重度排序的信號（上限 maxSignals，保持輕量） */
export function detectSignals(
  todayDate: string,
  todayPosts: Post[],
  baselineDays: { date: string; posts: Post[] }[],
  opts: { detectors?: SignalDetector[]; maxSignals?: number } = {},
): Signal[] {
  const ctx: SignalContext = {
    today: aggregateDay(todayDate, todayPosts),
    baseline: baselineDays.map((d) => aggregateDay(d.date, d.posts)),
    todayPosts,
  };
  const detectors = opts.detectors ?? DEFAULT_DETECTORS;
  const signals = detectors.flatMap((d) => {
    try { return d.detect(ctx); } catch { return []; }       // 單一偵測器壞掉不拖垮整體
  });
  return signals.sort((a, b) => sevRank[b.severity] - sevRank[a.severity]).slice(0, opts.maxSignals ?? 4);
}

/** 由信號決定整體狀態燈 */
export function statusFromSignals(signals: Signal[]): { level: 'green' | 'yellow' | 'red'; label: string } {
  if (signals.some((s) => s.severity === 'act')) return { level: 'red', label: '需行動' };
  if (signals.some((s) => s.severity === 'watch')) return { level: 'yellow', label: '留意' };
  return { level: 'green', label: '正常' };
}
