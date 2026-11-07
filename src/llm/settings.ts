import { getSetting, setSetting } from '../db/db.ts';

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (기본 · 품질 최고)', fallback: true },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (빠르고 저렴)', fallback: true },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (가장 저렴 · 품질 낮음)', fallback: false },
] as const;

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface LlmSettings {
  provider: 'anthropic';
  apiKey: string;
  model: string;
  effort: Effort;
}

const DEFAULTS: LlmSettings = { provider: 'anthropic', apiKey: '', model: 'claude-opus-5-5', effort: 'high' };

export async function loadLlmSettings(): Promise<LlmSettings> {
  return { ...DEFAULTS, ...(await getSetting<Partial<LlmSettings>>('llm', {})) };
}

export async function saveLlmSettings(s: LlmSettings) {
  await setSetting('llm', s);
}
