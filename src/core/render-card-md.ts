import type { Card, Chapter } from './model.ts';
import { tails } from './model.ts';

const q = (s: string) => (s === '' ? '>' : `> ${s}`);

export function renderCard(card: Card): string {
  const out: string[] = [`### ${card.num}. ${card.question}`, `> [!answer]- ${card.calloutTitle}`];
  for (const l of card.calloutPre) out.push(q(l));
  for (const f of card.fields) {
    const [first, ...rest] = f.value.split('\n');
    out.push(`> - **${f.name}**${f.noColon ? '' : ':'} ${first}`);
    for (const l of rest) out.push(q(l));
  }
  if (card.extra.length) out.push(...card.extra);
  if (card.blockId) out.push('', `^${card.blockId}`);
  return out.join('\n');
}

export function renderChapter(chapter: Chapter, cards: Card[]): string {
  const byId = new Map(cards.map((c) => [c.id, c]));
  return chapter.blocks
    .map((b) => {
      if (b.type === 'raw') return b.md;
      const c = byId.get(b.cardId);
      return c ? renderCard(c) : '';
    })
    .join('\n');
}

/** tails 그래프에서 mermaid flowchart 생성 (생성 덱·편집 후 갱신용) */
export function buildMermaid(
  cards: Card[],
  resolve: (from: Card) => (ref: { blockId?: string; num?: string }) => string | undefined,
): string {
  const label = (c: Card) => `${c.num} ${c.question.replace(/["[\]]/g, '').slice(0, 18)}`;
  const nodeId = (c: Card) => c.num.replace(/[^\w]/g, '') || 'Q';
  const inChapter = new Set(cards.map((c) => c.id));
  const byId = new Map(cards.map((c) => [c.id, c]));
  const lines = ['flowchart LR'];
  const declared = new Set<string>();
  const decl = (c: Card) => {
    if (declared.has(c.id)) return nodeId(c);
    declared.add(c.id);
    return `${nodeId(c)}["${label(c)}"]`;
  };
  for (const c of cards) {
    if (c.draft) continue;
    const ts = tails(c, resolve(c)).filter((t) => t.cardId && inChapter.has(t.cardId));
    if (!ts.length && !declared.has(c.id)) lines.push(`    ${decl(c)}`);
    for (const t of ts) {
      const to = byId.get(t.cardId!)!;
      lines.push(`    ${decl(c)} --> ${decl(to)}`);
    }
  }
  return lines.join('\n');
}
