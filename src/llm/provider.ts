import type { z } from 'zod';

/** 프로바이더 교체용 인터페이스. 지금은 Anthropic 구현만 있다 (claude.ts). */
export interface LLMProvider {
  /** 스키마에 맞는 JSON을 생성해 검증 후 반환 */
  generateJSON<T>(req: { system: string; user: string; schema: z.ZodType<T>; signal?: AbortSignal }): Promise<T>;
  /** 자유 텍스트(마크다운) 생성 */
  generateText(req: { system: string; user: string; signal?: AbortSignal }): Promise<string>;
}

export class LLMError extends Error {
  readonly kind: 'auth' | 'rate' | 'refusal' | 'truncated' | 'invalid' | 'network' | 'other';
  constructor(kind: LLMError['kind'], message: string) {
    super(message);
    this.kind = kind;
  }
}
