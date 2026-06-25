import { describe, it, expect } from 'vitest';
import { normalizeRow } from '@/lib/domain/normalize';

describe('normalizeRow', () => {
  it('maps a Threads row into a Post with metrics jsonb', () => {
    const raw = {
      'Post Time': '2024-03-01 12:00:00', Username: '@a', Content: 'hi',
      Likes: 10, Comments: 2, Quotes: 1, Reposts: 3, Reshares: 4,
      'Post URL': 'https://t/1', 'Media Type': 'image', Engagement_Total: 20,
    };
    const post = normalizeRow('threads', '我們的品牌', raw);
    expect(post.platform).toBe('threads');
    expect(post.likes).toBe(10);
    expect(post.followerCount).toBeNull();
    expect(post.metrics).toEqual({ quotes: 1, reposts: 3, reshares: 4 });
    expect(post.engagementTotal).toBe(20);
    expect(post.postTime).toBe(new Date('2024-03-01 12:00:00').toISOString());
  });

  it('maps an IG row including follower_count', () => {
    const raw = {
      'Post Time': '2024-03-02 09:30:00', Username: '@b', Content: 'yo',
      Likes: 50, Comments: 5, 'Post URL': 'https://i/2', 'Media Type': 'reel',
      Follower_Count: 12000, Engagement_Total: 55,
    };
    const post = normalizeRow('ig', '我們的品牌', raw);
    expect(post.followerCount).toBe(12000);
    expect(post.metrics).toEqual({});
  });

  it('maps an FB row: likes from Like, reactions into metrics', () => {
    const raw = {
      'Post Time': '2024-03-03 18:00:00', Username: '@c', Content: 'fb',
      Like: 7, Love: 2, Care: 0, Haha: 1, Wow: 0, Sad: 0, Angry: 0,
      Comments: 3, Reshares: 1, 'Post URL': 'https://f/3', 'Media Type': 'text',
      Engagement_Total: 14,
    };
    const post = normalizeRow('fb', '我們的品牌', raw);
    expect(post.likes).toBe(7);
    expect(post.metrics).toEqual({ love: 2, care: 0, haha: 1, wow: 0, sad: 0, angry: 0, reshares: 1 });
  });

  it('returns null for blank/missing numeric fields', () => {
    const post = normalizeRow('ig', '我們的品牌', { 'Post Time': '2024-03-02', 'Post URL': 'x' });
    expect(post.likes).toBeNull();
    expect(post.engagementTotal).toBeNull();
  });
});
