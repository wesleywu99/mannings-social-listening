'use client';
import { useCallback, useRef } from 'react';

/**
 * 頁面級 AI 解讀記憶體快取：同一會話內，相同 key 的解讀結果不重複呼叫 AI。
 * 不持久化（貼文/sentiment/日期範圍可能變；報告類才走 DB 持久化）。
 * 「重新解讀」按鈕會強制刷新：傳 force=true 跳過快取。
 */
export function useInsightCache() {
  const cache = useRef<Map<string, string>>(new Map());

  const get = useCallback((key: string) => cache.current.get(key) ?? null, []);
  const set = useCallback((key: string, value: string) => { cache.current.set(key, value); }, []);
  const has = useCallback((key: string) => cache.current.has(key), []);

  return { get, set, has };
}
