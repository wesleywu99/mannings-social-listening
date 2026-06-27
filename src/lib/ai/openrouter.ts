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

/** 串流版本：回傳 async generator，yield 內容 delta；工具調用累積後回傳 */
export interface StreamResult {
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
}

export async function* chatCompletionStream(
  opts: CompletionOpts,
): AsyncGenerator<{ type: 'delta' | 'tool_calls' | 'done'; content?: string; result?: StreamResult }> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('Missing OPENROUTER_API_KEY');

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 4096,
    stream: true,
  };
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice === 'none' ? 'none' : 'auto';
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI provider HTTP ${res.status}: ${await res.text()}`);
  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  const toolCallMap = new Map<number, { id: string; name: string; args: string }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;
        // 內容 delta（reasoning_content 不流給前端，是模型推理過程）
        if (delta.content) {
          content += delta.content;
          yield { type: 'delta', content: delta.content };
        }
        // 工具調用累積
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const existing = toolCallMap.get(idx) ?? { id: tc.id ?? '', name: '', args: '' };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name += tc.function.name;
            if (tc.function?.arguments) existing.args += tc.function.arguments;
            toolCallMap.set(idx, existing);
          }
        }
      } catch {
        // 忽略解析失敗的 chunk
      }
    }
  }

  const tool_calls = toolCallMap.size
    ? [...toolCallMap.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => ({
        id: v.id,
        type: 'function' as const,
        function: { name: v.name, arguments: v.args },
      }))
    : undefined;

  const result: StreamResult = { content: content || null, tool_calls };
  yield { type: 'done', result };
}
