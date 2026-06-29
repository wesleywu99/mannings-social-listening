import { describe, it, expect } from 'vitest';
import {
  buildDigest, renderDigest, hkDateOf, yesterdayHK, hkDayRangeUTC, dayLabelHK,
} from '../../src/lib/email/digest';
import type { Post, Platform, Sentiment } from '../../src/lib/domain/types';

function mkPost(p: Partial<Post> & { platform?: Platform; sentiment?: Sentiment | null; eng?: number }): Post {
  return {
    brand: 'Mannings', platform: p.platform ?? 'ig', postTime: p.postTime ?? '2026-04-25T10:00:00Z',
    username: p.username ?? 'u', content: p.content ?? 'c', postUrl: p.postUrl ?? 'https://x',
    mediaType: null, likes: 1, comments: 0, followerCount: null,
    engagementTotal: p.eng ?? 1, metrics: {}, sources: [],
    sentiment: p.sentiment ?? null, sentimentScore: null,
  };
}

describe('港時日界 helpers', () => {
  it('hkDateOf：UTC 15:07 = 港時隔日 23:07，仍屬同日', () => {
    expect(hkDateOf('2026-04-25T15:07:00Z')).toBe('2026-04-25'); // 23:07 HK
  });
  it('hkDateOf：UTC 16:00 = 港時 00:00 隔日', () => {
    expect(hkDateOf('2026-04-25T16:00:00Z')).toBe('2026-04-26');
  });
  it('yesterdayHK：跨月正確', () => {
    expect(yesterdayHK('2026-05-01T02:00:00Z')).toBe('2026-04-30'); // 港時 5/1 10:00 → 昨日 4/30
  });
  it('hkDayRangeUTC：港時整日對應 UTC 前日16:00 ~ 當日15:59', () => {
    const r = hkDayRangeUTC('2026-04-25');
    expect(r.start).toBe('2026-04-24T16:00:00.000Z');
    expect(r.end).toBe('2026-04-25T15:59:59.999Z');
  });
  it('dayLabelHK：含星期', () => {
    expect(dayLabelHK('2026-04-25')).toBe('2026年4月25日（週六）');
  });
});

describe('buildDigest', () => {
  it('空日：hasData=false、verdict 提示無活動', () => {
    const d = buildDigest([], [], '今日');
    expect(d.hasData).toBe(false);
    expect(d.posts).toBe(0);
    expect(d.verdict).toContain('無社群活動');
  });

  it('彙總互動、情感佔比、平台排序、最高互動貼文', () => {
    const posts = [
      mkPost({ platform: 'ig', eng: 100, sentiment: 'pos', content: 'top post' }),
      mkPost({ platform: 'ig', eng: 50, sentiment: 'neg' }),
      mkPost({ platform: 'fb', eng: 30, sentiment: 'neu' }),
    ];
    const d = buildDigest(posts, [], '今日');
    expect(d.posts).toBe(3);
    expect(d.engagement).toBe(180);
    expect(d.sentiment.pos).toBeCloseTo(1 / 3);
    expect(d.sentiment.neg).toBeCloseTo(1 / 3);
    expect(d.negCount).toBe(1);
    expect(d.platforms[0].platform).toBe('ig'); // 150 > 30，排第一
    expect(d.platforms[0].engagement).toBe(150);
    expect(d.topPost?.content).toBe('top post');
    expect(d.topPost?.engagement).toBe(100);
  });

  it('delta：相對前日比例', () => {
    const today = [mkPost({ eng: 150 })];
    const prior = [mkPost({ eng: 100 })];
    const d = buildDigest(today, prior, '今日');
    expect(d.deltaEng).toBeCloseTo(0.5);  // +50%
  });

  it('無前日資料 → delta 為 null（不假裝 +100%）', () => {
    const d = buildDigest([mkPost({ eng: 10 })], [], '今日');
    expect(d.deltaEng).toBeNull();
    expect(d.deltaPosts).toBeNull();
  });

  it('排除互動為 0 的平台', () => {
    const d = buildDigest([mkPost({ platform: 'ig', eng: 10 })], [], '今日');
    expect(d.platforms.map((p) => p.platform)).toEqual(['ig']);
  });
});

describe('renderDigest', () => {
  it('輸出 HTML、含品牌與看板連結', () => {
    const d = buildDigest([mkPost({ eng: 10, sentiment: 'pos' })], [], '2026年4月25日（週六）');
    const html = renderDigest(d, { appUrl: 'https://app.example' });
    expect(html).toContain('Mannings');
    expect(html).toContain('https://app.example/monitor?token=mannings');
  });

  it('無 charts → 用 CSS 圖表、無任何圖片', () => {
    const d = buildDigest([mkPost({ eng: 10, sentiment: 'pos' })], [], '今日');
    const html = renderDigest(d, { appUrl: 'https://app.example' });
    expect(html).not.toContain('<img');
  });

  it('charts 開啟 → 用 cid 內嵌圖片，絕不發外部圖片請求', () => {
    const d = buildDigest([mkPost({ platform: 'ig', eng: 10, sentiment: 'pos' })], [], '今日');
    const html = renderDigest(d, { appUrl: 'https://app.example', charts: { sentiment: true, platform: true } });
    expect(html).toContain('src="cid:sentiment"');
    expect(html).toContain('src="cid:platform"');
    expect(html).not.toMatch(/src=["']https?:/i); // 無外部 http(s) 圖片
  });

  it('帶 insight → 渲染討論/規律/行動建議/風險', () => {
    const d = buildDigest([mkPost({ eng: 10, sentiment: 'neg' })], [], '今日');
    const html = renderDigest(d, {
      appUrl: 'https://app.example',
      insight: { discussion: ['優惠碼兌換討論熱'], winningContent: ['開箱類 UGC 互動高'], takeaway: '多做開箱', risk: '優惠碼失效投訴' },
    });
    expect(html).toContain('今日洞察');
    expect(html).toContain('優惠碼兌換討論熱');
    expect(html).toContain('開箱類 UGC 互動高');
    expect(html).toContain('多做開箱');
    expect(html).toContain('優惠碼失效投訴');
  });

  it('帶 signals → 顯示狀態燈、決策簡報、完整數據分區', () => {
    const d = buildDigest([mkPost({ eng: 10, sentiment: 'pos' })], [], '今日');
    const html = renderDigest(d, {
      appUrl: 'https://app.example',
      signals: [{ kind: 'topic', severity: 'act', title: '「優惠碼」討論升溫', detail: '昨日 5 則', action: '客服跟進' }],
    });
    expect(html).toContain('今日狀態：需行動');   // act → 紅燈
    expect(html).toContain('今天值得你知道的');
    expect(html).toContain('「優惠碼」討論升溫');
    expect(html).toContain('客服跟進');
    expect(html).toContain('完整數據');
  });

  it('無 signals（平靜日）→ 綠燈 + 一切正常', () => {
    const d = buildDigest([mkPost({ eng: 10, sentiment: 'pos' })], [], '今日');
    const html = renderDigest(d, { appUrl: 'https://app.example', signals: [] });
    expect(html).toContain('今日狀態：正常');
    expect(html).toContain('一切正常');
  });

  it('跳脫 HTML，避免貼文內容與洞察文字注入', () => {
    const d = buildDigest([mkPost({ eng: 10, content: '<script>x</script>' })], [], '今日');
    const html = renderDigest(d, { appUrl: 'https://app.example', insight: { discussion: ['<b>hi</b>'], winningContent: [], takeaway: '', risk: null } });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<b>hi</b>');
  });
});
