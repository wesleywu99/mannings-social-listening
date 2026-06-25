import type { Platform } from '@/lib/domain/types';

/** AI 工具與對話運作的資料範圍（當前視角） */
export interface Scope {
  brand: string;
  platform?: Platform;
  dateStart?: string;
  dateEnd?: string;
}

/** 一個可被 AI 呼叫的唯讀工具（模組化、可抽換） */
export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;   // JSON Schema
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  // OpenAI 相容的 tool calling 欄位
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
}
