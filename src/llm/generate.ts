import { z } from 'zod';
import type { LLMProvider } from './provider.ts';
import { cardBackPrompt, conceptPrompt, questionPlanPrompt } from './prompts.ts';
import { slugify } from '../core/model.ts';

export const PlanSchema = z.strictObject({
  noteType: z.enum(['seven_stage', 'method']),
  flow: z.string(),
  cards: z.array(
    z.strictObject({
      num: z.string().describe('Q1, Q2 ... 형식'),
      question: z.string(),
      section: z.string(),
      sourceHeading: z.string(),
      tails: z.array(z.string()),
      draft: z.boolean(),
    }),
  ),
});
export type Plan = z.infer<typeof PlanSchema>;

export const BacksSchema = z.strictObject({
  cards: z.array(
    z.strictObject({
      num: z.string(),
      lead: z.string(),
      keywords: z.array(z.string()),
      explain: z.string(),
      why: z.string(),
      sourceHeadings: z.array(z.string()),
      outsideNote: z.boolean(),
      pitfall: z.string(),
      hint: z.string(),
    }),
  ),
});
export type Backs = z.infer<typeof BacksSchema>;

export interface GenInput {
  subject: string;
  title: string;
  note: string;
  toneSample?: string;
}

export async function normalizeConcept(llm: LLMProvider, input: GenInput, signal?: AbortSignal) {
  const p = conceptPrompt(input.subject, input.title, input.note);
  return llm.generateText({ ...p, signal });
}

export async function planQuestions(llm: LLMProvider, input: GenInput, signal?: AbortSignal): Promise<Plan> {
  const p = questionPlanPrompt(input.subject, input.title, input.note);
  const plan = await llm.generateJSON({ ...p, schema: PlanSchema, signal });
  // 번호 정규화: 순서대로 Q1..Qn, tails도 매핑
  const map = new Map<string, string>();
  plan.cards.forEach((c, i) => map.set(c.num.trim(), `Q${i + 1}`));
  plan.cards = plan.cards.map((c, i) => ({
    ...c,
    num: `Q${i + 1}`,
    tails: c.tails.map((t) => map.get(t.trim())).filter((t): t is string => !!t && t !== `Q${i + 1}`),
  }));
  return plan;
}

export function planToText(plan: Plan): string {
  return [
    `흐름: ${plan.flow}`,
    ...plan.cards.map(
      (c) => `${c.num}. [${c.section}] ${c.question}${c.draft ? ' (draft)' : ''} → 꼬리: ${c.tails.join(', ') || '없음'} / 근거: ${c.sourceHeading || '-'}`,
    ),
  ].join('\n');
}

export async function writeBacks(llm: LLMProvider, input: GenInput, plan: Plan, signal?: AbortSignal): Promise<Backs> {
  const p = cardBackPrompt(input.subject, input.title, input.note, planToText(plan), input.toneSample);
  return llm.generateJSON({ ...p, schema: BacksSchema, signal });
}

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();

/** 생성 결과 → CS-Tutor 카드형 md (Obsidian에서 그대로 열리는 포맷) */
export function toCardMarkdown(input: GenInput, plan: Plan, backs: Backs, noteFileName: string): string {
  const prefix = (slugify(input.title).replace(/[^a-z0-9-]/g, '').slice(0, 12) || 'card').replace(/-+$/, '');
  const id = (num: string) => `${prefix}-q${num.replace(/\D/g, '').padStart(2, '0')}`;
  const noteLink = noteFileName.replace(/\.md$/i, '');
  const backBy = new Map(backs.cards.map((b) => [b.num.trim(), b]));
  const pinned: string[] = [];

  const out: string[] = [
    '### source',
    `**concept** : [[${noteLink}]]`,
    `**생성** : Tail Cards (AI 초안 — 내 말투로 고쳐 쓰기)`,
    '',
    `> [!info] 카드 ID: \`^${prefix}-qNN\``,
    '',
    '---',
    '',
    '## 0. 흐름 한 줄',
    '',
    '```',
    plan.flow.trim(),
    '```',
    '',
    '```mermaid',
    'flowchart LR',
  ];
  const label = (c: Plan['cards'][number]) => `${c.num} ${c.question.replace(/["[\]]/g, '').slice(0, 16)}`;
  const real = plan.cards.filter((c) => !c.draft);
  for (const c of real) {
    const ts = c.tails.filter((t) => real.some((r) => r.num === t));
    if (!ts.length) out.push(`    ${c.num}["${label(c)}"]`);
    for (const t of ts) {
      const to = real.find((r) => r.num === t)!;
      out.push(`    ${c.num}["${label(c)}"] --> ${to.num}["${label(to)}"]`);
    }
  }
  out.push('```', '', '---');

  let section = '';
  let secNo = 0;
  for (const c of real) {
    if (c.section !== section) {
      section = c.section;
      out.push('', `## ${++secNo}. ${section}`);
    }
    const b = backBy.get(c.num);
    out.push('', `### ${c.num}. ${oneLine(c.question)}`, '> [!answer]- 뒷면');
    out.push(`> - **두괄식**: ${oneLine(b?.lead ?? '')}`);
    out.push(`> - **키워드**: ${(b?.keywords ?? []).map((k) => `\`${oneLine(k).replace(/`/g, '')}\``).join(' / ')}`);
    out.push(`> - **풀어 말하기**: ${oneLine(b?.explain ?? '')}`);
    out.push(`> - **왜 이렇게 답하나**: ${oneLine(b?.why ?? '')}`);
    const heads = b?.sourceHeadings?.length ? b.sourceHeadings : c.sourceHeading ? [c.sourceHeading] : [];
    for (const h of heads) {
      const clean = h.replace(/^#+\s*/, '').replace(/[[\]|]/g, '').trim();
      out.push(`>   → ${b?.outsideNote ? '📌 ' : ''}[[${noteLink}#${clean}]]${b?.outsideNote ? ' (노트 미정리)' : ''}`);
    }
    if (!heads.length && b?.outsideNote) out.push('>   → 📌 (노트 미정리 — 일반 지식으로 보충)');
    if (b?.outsideNote) pinned.push(`- ${c.num}: ${oneLine(c.question)}`);
    if (b?.pitfall?.trim()) out.push(`> - **함정**: ${oneLine(b.pitfall)}`);
    const tailLinks = c.tails.filter((t) => real.some((r) => r.num === t)).map((t) => `[[#^${id(t)}|${t}]]`);
    out.push(`> - **꼬리 →** ${tailLinks.join(', ') || '—'}`);
    out.push('', `^${id(c.num)}`);
  }

  const drafts = plan.cards.filter((c) => c.draft);
  if (drafts.length) {
    out.push('', '---', '', '## ✍️ 직접 채울 카드');
    for (const c of drafts) {
      const b = backBy.get(c.num);
      out.push('', `### Q?. ${oneLine(c.question)}`, '> [!answer]- 뒷면 (직접 작성)');
      out.push('> - **두괄식**: ', '> - **키워드**: ', '> - **왜 이렇게 답하나**: ');
      out.push(`> - **힌트 (지울 것)**: ${oneLine(b?.hint || (c.sourceHeading ? `노트 § ${c.sourceHeading}` : ''))}`);
    }
  }
  if (pinned.length) out.push('', '---', '', '## 📌 노트 보강 후보 (노트에 없어 일반 지식으로 보충한 카드)', ...pinned);
  out.push('');
  return out.join('\n');
}
