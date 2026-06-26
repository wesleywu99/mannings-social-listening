'use client';
import { createContext, useContext } from 'react';

/** 提供「點擊 AI 文字中的 @帳號 → 篩選貼文表」的處理器；null 時 @帳號渲染為純樣式 */
export const MentionContext = createContext<((username: string) => void) | null>(null);
export const useMention = () => useContext(MentionContext);
