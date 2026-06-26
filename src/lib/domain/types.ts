export type Platform = 'threads' | 'ig' | 'fb';

export type Sentiment = 'pos' | 'neu' | 'neg';

/** 一則貼文被哪些監測維度抓到（keyword / hashtag / mention / account…）；可同時多個 */
export interface PostSource {
  type: string;   // 'keyword' | 'hashtag' | 'mention' | 'account' | ...
  value: string;
}

export interface Post {
  id?: number;                       // Supabase bigint PK（標記 sentiment 時用）
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
  sources: PostSource[];
  sentiment: Sentiment | null;      // pos / neu / neg（AI 標記，可為空）
  sentimentScore: number | null;    // -1 ~ 1 置信度
}

export interface PlatformKpis {
  platform: Platform;
  postCount: number;
  totalEngagement: number;
  avgEngagement: number;    // 四捨五入到 1 位小數
  anomalyRate: number;      // 爆款率，0–1
}
