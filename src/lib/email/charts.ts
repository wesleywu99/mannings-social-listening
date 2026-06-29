import { createCanvas } from '@napi-rs/canvas';
import type { DigestData } from './digest';
import { SENTIMENT_COLOR, PLATFORM_COLOR } from './digest';
import type { InlineImage } from './gmail';

export interface PieSlice { label: string; value: number; color: string }

/**
 * 甜甜圈圖 → PNG Buffer，供 email 以 CID 內嵌（Gmail 不支援 SVG/conic-gradient，
 * 故 server 端光柵化為圖片；CID 內嵌＝不發外部請求、不洩資料給第三方）。
 * 文字（圖例）放 HTML，不畫進圖，避免 server 端字型缺失問題。
 */
export function donutPng(slices: PieSlice[], opts: { size?: number } = {}): Buffer {
  const scale = 2;                       // 視網膜清晰度
  const size = (opts.size ?? 150) * scale;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';             // 白底（對齊卡片底色，避免深色模式怪異）
  ctx.fillRect(0, 0, size, size);

  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  const cx = size / 2, cy = size / 2;
  const rOuter = size / 2 - 3 * scale;
  const rInner = rOuter * 0.6;
  let start = -Math.PI / 2;              // 從 12 點鐘開始

  for (const s of slices) {
    if (s.value <= 0) continue;
    const angle = (s.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rOuter, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();
    start += angle;
  }

  ctx.beginPath();                       // 中空
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  return canvas.toBuffer('image/png');
}

/** 由 DigestData 產出情感 / 平台兩張甜甜圈 PNG（供 CID 內嵌）。空維度則略過。 */
export function buildDigestCharts(d: DigestData): { images: InlineImage[]; has: { sentiment: boolean; platform: boolean } } {
  const images: InlineImage[] = [];
  const has = { sentiment: false, platform: false };

  if (d.sentiment.pos + d.sentiment.neu + d.sentiment.neg > 0) {
    images.push({ cid: 'sentiment', content: donutPng([
      { label: '正向', value: d.sentiment.pos, color: SENTIMENT_COLOR.pos },
      { label: '中性', value: d.sentiment.neu, color: SENTIMENT_COLOR.neu },
      { label: '負面', value: d.sentiment.neg, color: SENTIMENT_COLOR.neg },
    ]) });
    has.sentiment = true;
  }
  if (d.platforms.length) {
    images.push({ cid: 'platform', content: donutPng(
      d.platforms.map((p) => ({ label: p.platform, value: p.engagement, color: PLATFORM_COLOR[p.platform] })),
    ) });
    has.platform = true;
  }
  return { images, has };
}
