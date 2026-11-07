import type { Card, CardField, Chapter, ChapterBlock, Deck, DeckBundle } from './model.ts';
import { slugify } from './model.ts';

const CARD_HEAD = /^### (Q[^.\s]*)\.\s*(.*)$/;
const FIELD = /^- \*\*(.+?)\*\*(:?)\s?(.*)$/;
const CALLOUT = /^\[!(\w+)\]([-+]?)\s?(.*)$/;
const BLOCK_ID = /^\^([\w-]+)\s*$/;
const CARD_END = /^(#{1,3} |---\s*$)/;

export interface ParseOptions {
  deckId: string;
  fileName: string;
  order: number;
}

export interface ParsedChapter {
  chapter: Chapter;
  cards: Card[];
}

export function chapterTitle(fileName: string): string {
  return fileName.replace(/\.md$/i, '').replace(/\s*\(카드형\)\s*$/, '').trim();
}

export function parseChapterMd(md: string, opts: ParseOptions): ParsedChapter {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const chapterId = `${opts.deckId}:${slugify(opts.fileName)}`;
  const blocks: ChapterBlock[] = [];
  const cards: Card[] = [];
  const usedIds = new Set<string>();
  let raw: string[] = [];
  let section = '';
  let inDraftSection = false;
  let inFence = false;
  let fenceLang = '';
  let fenceBuf: string[] = [];
  let flow = '';
  let mermaid = '';
  let inFlowSection = false;

  const flushRaw = () => {
    if (raw.length) blocks.push({ type: 'raw', md: raw.join('\n') });
    raw = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      if (!inFence) {
        inFence = true;
        fenceLang = line.trim().slice(3).trim();
        fenceBuf = [];
      } else {
        inFence = false;
        const body = fenceBuf.join('\n');
        if (fenceLang === 'mermaid' && !mermaid) mermaid = body;
        else if (!fenceLang && inFlowSection && !flow) flow = body;
      }
      raw.push(line);
      continue;
    }
    if (inFence) {
      fenceBuf.push(line);
      raw.push(line);
      continue;
    }

    const sec = line.match(/^## (.*)$/);
    if (sec) {
      section = sec[1].replace(/^\d+\.\s*/, '').trim();
      inDraftSection = /✍️|직접 채울/.test(sec[1]);
      inFlowSection = /^0\.|흐름/.test(sec[1]);
      raw.push(line);
      continue;
    }

    const head = line.match(CARD_HEAD);
    if (!head) {
      raw.push(line);
      continue;
    }

    // ---- 카드 블록 수집 ----
    flushRaw();
    let j = i + 1;
    while (j < lines.length && !CARD_END.test(lines[j])) j++;
    let end = j; // exclusive
    while (end > i + 1 && lines[end - 1].trim() === '') end--;
    const body = lines.slice(i + 1, end);

    const card = parseCardBody(head[1], head[2], body);
    card.deckId = opts.deckId;
    card.chapterId = chapterId;
    card.section = section;
    card.draft = inDraftSection || /직접/.test(card.calloutTitle);
    card.order = cards.length;

    let id = card.blockId ?? `${chapterId}-${card.num.toLowerCase().replace(/[^\w]/g, '') || 'q'}`;
    if (usedIds.has(id)) {
      let k = 2;
      while (usedIds.has(`${id}-${k}`)) k++;
      id = `${id}-${k}`;
    }
    usedIds.add(id);
    card.id = id;
    cards.push(card);
    blocks.push({ type: 'card', cardId: id });

    i = end - 1;
  }
  flushRaw();

  const chapter: Chapter = {
    id: chapterId,
    deckId: opts.deckId,
    title: chapterTitle(opts.fileName),
    fileName: opts.fileName,
    order: opts.order,
    blocks,
    flow,
    mermaid,
  };
  return { chapter, cards };
}

function parseCardBody(num: string, question: string, body: string[]): Card {
  const fields: CardField[] = [];
  const calloutPre: string[] = [];
  const extra: string[] = [];
  let calloutTitle = '뒷면';
  let calloutSeen = false;
  let blockId: string | undefined;

  for (const line of body) {
    if (line.startsWith('>')) {
      const content = line.replace(/^> ?/, '');
      if (!calloutSeen) {
        const c = content.match(CALLOUT);
        if (c) {
          calloutSeen = true;
          calloutTitle = c[3];
          continue;
        }
      }
      const f = content.match(FIELD);
      if (f) {
        fields.push({ name: f[1].trim(), value: f[3], ...(f[2] ? {} : { noColon: true }) });
      } else if (fields.length) {
        fields[fields.length - 1].value += '\n' + content;
      } else {
        calloutPre.push(content);
      }
      continue;
    }
    const b = line.match(BLOCK_ID);
    if (b) {
      blockId = b[1];
      continue;
    }
    if (line.trim()) extra.push(line);
  }

  return {
    id: '',
    deckId: '',
    chapterId: '',
    num,
    question: question.trim(),
    section: '',
    calloutTitle,
    fields,
    calloutPre,
    extra,
    blockId,
    draft: false,
    order: 0,
  };
}

/** 여러 카드형 md 파일 → 하나의 덱 번들 */
export function buildDeck(
  files: { fileName: string; md: string }[],
  meta: Omit<Deck, 'createdAt'> & { createdAt?: number },
): DeckBundle {
  const sorted = [...files]
    .filter((f) => !f.fileName.startsWith('_'))
    .sort((a, b) => a.fileName.localeCompare(b.fileName, 'ko', { numeric: true }));
  const chapters: Chapter[] = [];
  const cards: Card[] = [];
  const ids = new Set<string>();
  sorted.forEach((f, order) => {
    const { chapter, cards: cs } = parseChapterMd(f.md, { deckId: meta.id, fileName: f.fileName, order });
    // 덱 전체에서 id 유일성 보장 (블록 ID가 파일 간 겹치는 경우)
    for (const c of cs) {
      if (ids.has(c.id)) {
        const old = c.id;
        c.id = `${chapter.id}-${old}`;
        for (const b of chapter.blocks) if (b.type === 'card' && b.cardId === old) b.cardId = c.id;
      }
      ids.add(c.id);
    }
    chapters.push(chapter);
    cards.push(...cs);
  });
  return {
    format: 'tail-cards/deck@1',
    deck: { ...meta, createdAt: meta.createdAt ?? Date.now() },
    chapters,
    cards,
  };
}

/** 꼬리 링크 해석기: 블록 ID는 덱 전체, Qn 번호는 같은 챕터에서 찾는다 */
export function makeResolver(cards: Card[]) {
  const byBlock = new Map<string, string>();
  const byNum = new Map<string, string>();
  for (const c of cards) {
    if (c.blockId) byBlock.set(c.blockId, c.id);
    byNum.set(`${c.chapterId}|${c.num}`, c.id);
  }
  return (from: Card) =>
    (ref: { blockId?: string; num?: string }): string | undefined => {
      if (ref.blockId) return byBlock.get(ref.blockId);
      if (ref.num) return byNum.get(`${from.chapterId}|${ref.num}`);
      return undefined;
    };
}
