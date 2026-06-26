import type { ChatMessage } from './types';

const ENDPOINT = 'https://token.sensenova.cn/v1/chat/completions';

export function getModelHeavy(): string {
  return process.env.AI_MODEL_HEAVY || 'deepseek/deepseek-chat';
}
export function getModelFast(): string {
  return process.env.AI_MODEL_FAST || getModelHeavy();
}

interface CompletionOpts {
  model: string;
  messages: ChatMessage[];
  tools?: { type: 'function'; function: { name: string; description: string; parameters: unknown } }[];
  toolChoice?: 'auto' | 'required' | 'none';
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionResult {
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
}

/** 呼叫 AI provider（OpenAI 相容，現為 SenseNova），含簡易重試。回傳 assistant 訊息。 */
export async function chatCompletion(opts: CompletionOpts): Promise<CompletionResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('Missing OPENROUTER_API_KEY');

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 4096,
  };
  if (opts.tools?.length) {
    body.tools = opts.tools;
    // SenseNova 不支援 tool_choice:'required'（回 502001），僅用 'auto'
    body.tool_choice = opts.toolChoice === 'none' ? 'none' : 'auto';
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`AI provider HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`AI provider HTTP ${res.status}: ${await res.text()}`);
      const json = await res.json();
      const msg = json.choices?.[0]?.message ?? {};
      return { content: msg.content ?? null, tool_calls: msg.tool_calls };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('AI provider request failed');
}
