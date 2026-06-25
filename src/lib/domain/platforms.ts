import type { Platform } from './types';

/** 每平台：likes 來源欄、comments 來源欄、是否有 follower、哪些欄進 metrics */
export interface PlatformSchema {
  platform: Platform;
  likesField: string;
  commentsField: string;
  hasFollower: boolean;
  metricFields: string[];   // 進 metrics jsonb 的 raw 欄位名
}

export const PLATFORM_SCHEMAS: Record<Platform, PlatformSchema> = {
  threads: {
    platform: 'threads',
    likesField: 'Likes',
    commentsField: 'Comments',
    hasFollower: false,
    metricFields: ['Quotes', 'Reposts', 'Reshares'],
  },
  ig: {
    platform: 'ig',
    likesField: 'Likes',
    commentsField: 'Comments',
    hasFollower: true,
    metricFields: [],
  },
  fb: {
    platform: 'fb',
    likesField: 'Like',
    commentsField: 'Comments',
    hasFollower: false,
    metricFields: ['Love', 'Care', 'Haha', 'Wow', 'Sad', 'Angry', 'Reshares'],
  },
};
