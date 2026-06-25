import type { Platform, Post, PlatformKpis } from './types';
import { anomalyThreshold } from './engagement';

const PLATFORMS: Platform[] = ['threads', 'ig', 'fb'];

export function computeKpis(posts: Post[]): PlatformKpis[] {
  return PLATFORMS.map((platform) => {
    const group = posts.filter((p) => p.platform === platform);
    const engs = group.map((p) => p.engagementTotal ?? 0);
    const total = engs.reduce((a, b) => a + b, 0);
    const count = group.length;
    const threshold = anomalyThreshold(engs);
    const anomalies = engs.filter((e) => e > threshold).length;
    return {
      platform,
      postCount: count,
      totalEngagement: total,
      avgEngagement: count ? Math.round((total / count) * 10) / 10 : 0,
      anomalyRate: count ? anomalies / count : 0,
    };
  });
}
