import { chatCompletion, getModelHeavy } from '../ai/openrouter';
import type { Post } from '../domain/types';

/** 每日摘要的 AI 洞察——回答「為什麼」：在討論什麼、什麼內容贏、該做什麼 */
export interface DigestInsight {
  discussion: string[];      // 今日主要討論主題（2–3 條，各一句）
  winningContent: string[];  // 高互動內容的共性／規律（1–2 條，抽象而非複述單篇）
  takeaway: string;          // 一句可執行建議
  risk: string | null;       // 負面/風險的驅動點（無則 null）
}

const SYSTEM = `你是萬寧（Mannings）BoostUP 活動的社群輿情分析師。給你「過去一天」的社群貼文（含平台、帳號、互動量、情感、內容），請產出讓行銷主管在 20 秒內能據以行動的洞察。

要求：
- discussion：今日受眾「在討論什麼」，歸納 2–3 個主題，每條一句、具體（點出產品/活動/情緒），不要泛泛而談。
- winningContent：抽象出「什麼樣的內容拿到高互動」的共性或規律（如題材、形式、角度、誘因），1–2 條；要從多篇歸納，不是複述某一篇。
- takeaway：一句具體、可立即執行的建議（做什麼/多做什麼/避免什麼）。
- risk：若有負面或風險訊號，用一句點出「驅動原因」（如某優惠碼問題、某次體驗投訴）；若無，回 null。
- 全部用繁體中文。只根據實際貼文，不要杜撰沒有資料支撐的結論。

**只回一個 JSON 物件**，嚴格格式：
{"discussion":["…"],"winningContent":["…"],"takeaway":"…","risk":"… 或 null"}
不要加任何說明文字、不要用 markdown code fence。`;

function isStrArr(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((s) => typeof s === 'string');
}

/**
 * 產出每日洞察。失敗（無 key / 解析失敗 / provider 錯）一律回 null，
 * 讓摘要仍能正常寄出（可靠度優先；洞察為加值非必需）。
 */
export async function buildDigestInsight(
  posts: Post[],
  brandContext?: string | null,
): Promise<DigestInsight | null> {
  if (posts.length < 1) return null;

  // 以互動排序取樣（上限 60，控成本），給 AI 足夠脈絡又不超量
  const items = [...posts]
    .sort((a, b) => (b.engagementTotal ?? 0) - (a.engagementTotal ?? 0))
    .slice(0, 60)
    .map((p) => ({
      platform: p.platform,
      username: p.username ?? '',
      engagement: p.engagementTotal ?? 0,
      sentiment: p.sentiment ?? null,
      content: (p.content ?? '').slice(0, 240),
    }));

  const ctx = brandContext ? `品牌背景：${brandContext}\n\n` : '';
  try {
    const res = await chatCompletion({
      model: getModelHeavy(),
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${ctx}貼文清單（共 ${items.length} 條，依互動由高到低）：\n${JSON.stringify(items)}` },
      ],
      temperature: 0.3,
      maxTokens: 1200,
    });

    const text = (res.content ?? '').trim();
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s === -1 || e === -1) return null;

    const o = JSON.parse(text.slice(s, e + 1)) as Record<string, unknown>;
    const discussion = isStrArr(o.discussion) ? o.discussion.slice(0, 3) : [];
    const winningContent = isStrArr(o.winningContent) ? o.winningContent.slice(0, 2) : [];
    const takeaway = typeof o.takeaway === 'string' ? o.takeaway : '';
    const riskRaw = o.risk;
    const risk = typeof riskRaw === 'string' && riskRaw.trim() && riskRaw.trim().toLowerCase() !== 'null'
      ? riskRaw.trim() : null;

    if (!discussion.length && !winningContent.length && !takeaway) return null; // 全空＝失敗
    return { discussion, winningContent, takeaway, risk };
  } catch (err) {
    console.error('[buildDigestInsight] failed', (err as { message?: string })?.message ?? err);
    return null;
  }
}
