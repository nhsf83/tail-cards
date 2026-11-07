import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { LLMError, type LLMProvider } from './provider.ts';
import { MODELS, type LlmSettings } from './settings.ts';

// 브라우저에서 사용자 본인 키(BYOK)로 직접 호출. 키는 이 브라우저에만 저장되고 Anthropic으로만 전송된다.
export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;
  private settings: LlmSettings;

  constructor(settings: LlmSettings) {
    if (!settings.apiKey) throw new LLMError('auth', '설정에서 Anthropic API 키를 먼저 입력해 주세요.');
    this.settings = settings;
    this.client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  }

  private async run(system: string, user: string, format?: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
    const useFallback = MODELS.find((m) => m.id === this.settings.model)?.fallback ?? false;
    try {
      const stream = this.client.beta.messages.stream(
        {
          model: this.settings.model,
          max_tokens: 64000,
          system,
          messages: [{ role: 'user', content: user }],
          output_config: {
            effort: this.settings.effort,
            ...(format ? { format: { type: 'json_schema', schema: format } } : {}),
          },
          // 안전 분류기가 거절하면 서버가 다른 모델로 이어서 처리 (Opus/Sonnet만 지원)
          ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        },
        { signal },
      );
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') {
        throw new LLMError('refusal', `모델이 요청을 거절했습니다${msg.stop_details?.category ? ` (${msg.stop_details.category})` : ''}.`);
      }
      if (msg.stop_reason === 'max_tokens') throw new LLMError('truncated', '출력이 너무 길어 잘렸습니다. 노트를 나눠서 시도해 주세요.');
      return msg.content
        .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('');
    } catch (e) {
      if (e instanceof LLMError) throw e;
      if (e instanceof Anthropic.AuthenticationError) throw new LLMError('auth', 'API 키가 올바르지 않습니다.');
      if (e instanceof Anthropic.PermissionDeniedError) throw new LLMError('auth', '이 키로는 해당 모델을 쓸 수 없습니다.');
      if (e instanceof Anthropic.RateLimitError) throw new LLMError('rate', '요청 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요.');
      if (e instanceof Anthropic.APIUserAbortError) throw new LLMError('other', '취소했습니다.');
      if (e instanceof Anthropic.APIConnectionError) throw new LLMError('network', '네트워크 오류로 Anthropic API에 연결하지 못했습니다.');
      if (e instanceof Anthropic.APIError) throw new LLMError('other', `API 오류 ${e.status ?? ''}: ${e.message}`);
      throw new LLMError('other', String((e as Error)?.message ?? e));
    }
  }

  async generateText(req: { system: string; user: string; signal?: AbortSignal }) {
    return this.run(req.system, req.user, undefined, req.signal);
  }

  async generateJSON<T>(req: { system: string; user: string; schema: z.ZodType<T>; signal?: AbortSignal }): Promise<T> {
    const jsonSchema = z.toJSONSchema(req.schema, { target: 'draft-7' }) as Record<string, unknown>;
    delete jsonSchema.$schema;
    const text = await this.run(req.system, req.user, jsonSchema, req.signal);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new LLMError('invalid', '모델 응답을 JSON으로 읽지 못했습니다. 다시 시도해 주세요.');
    }
    const r = req.schema.safeParse(parsed);
    if (!r.success) throw new LLMError('invalid', `응답 형식이 스키마와 다릅니다: ${r.error.issues[0]?.message ?? ''}`);
    return r.data;
  }
}
