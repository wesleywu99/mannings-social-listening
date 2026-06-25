export type Platform = 'threads' | 'ig' | 'fb';

export interface Post {
  brand: string;
  platform: Platform;
  postTime: string;        // ISO 8601
  username: string | null;
  content: string | null;
  postUrl: string | null;
  mediaType: string | null;
  likes: number | null;
  comments: number | null;
  followerCount: number | null;
  engagementTotal: number | null;
  metrics: Record<string, number>;
}

export interface PlatformKpis {
  platform: Platform;
  postCount: number;
  totalEngagement: number;
  avgEngagement: number;    // 四捨五入到 1 位小數
  anomalyRate: number;      // 爆款率，0–1
}
