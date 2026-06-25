import type { Platform, Post } from './types';
import { PLATFORM_SCHEMAS } from './platforms';

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

export function normalizeRow(
  platform: Platform,
  brand: string,
  raw: Record<string, unknown>,
): Post {
  const schema = PLATFORM_SCHEMAS[platform];
  const metrics: Record<string, number> = {};
  for (const field of schema.metricFields) {
    const n = num(raw[field]);
    metrics[field.toLowerCase()] = n ?? 0;
  }
  const rawTime = raw['Post Time'];
  return {
    brand,
    platform,
    postTime: new Date(String(rawTime)).toISOString(),
    username: str(raw['Username']),
    content: str(raw['Content']),
    postUrl: str(raw['Post URL']),
    mediaType: str(raw['Media Type']),
    likes: num(raw[schema.likesField]),
    comments: num(raw[schema.commentsField]),
    followerCount: schema.hasFollower ? num(raw['Follower_Count']) : null,
    engagementTotal: num(raw['Engagement_Total']),
    metrics,
  };
}
