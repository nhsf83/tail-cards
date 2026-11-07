// 꼬리질문 카드형 스크립트(CS-Tutor card-interview 포맷)의 데이터 모델.
// 원본 md와의 왕복(parse → render)을 위해 카드 뒷면은 "필드 목록" 그대로 보존하고,
// 학습 화면에서 쓰는 값(두괄식, 키워드, 꼬리 …)은 accessor로 꺼낸다.

export interface CardField {
  /** 예: "두괄식", "키워드", "풀어 말하기", "왜 이렇게 답하나", "함정", "꼬리 →" */
  name: string;
  /** 필드 값 (여러 줄이면 '\n'으로 연결. 이어지는 줄의 '>' 접두는 제거된 상태) */
  value: string;
  /** 원본이 `**꼬리 →** x` 처럼 콜론 없이 쓰였는지 */
  noColon?: boolean;
}

export interface Card {
  id: string;
  deckId: string;
  chapterId: string;
  /** 'Q1', 'Q?' 등 */
  num: string;
  question: string;
  /** 소속 '## ' 섹션 제목 */
  section: string;
  /** callout 제목. 기본 '뒷면' */
  calloutTitle: string;
  fields: CardField[];
  /** 필드 시작 전 callout 줄들 (거의 없음) */
  calloutPre: string[];
  /** callout 밖이지만 카드에 속한 줄들 (블록 ID 제외) */
  extra: string[];
  /** 원본 `^xxx-qNN` 블록 ID */
  blockId?: string;
  /** ✍️ 직접 채울 카드 */
  draft: boolean;
  order: number;
}

export type ChapterBlock = { type: 'raw'; md: string } | { type: 'card'; cardId: string };

export interface Chapter {
  id: string;
  deckId: string;
  title: string;
  /** 원본 파일명 (확장자 포함) */
  fileName: string;
  order: number;
  blocks: ChapterBlock[];
  flow: string;
  mermaid: string;
}

export interface Deck {
  id: string;
  title: string;
  subject: string;
  description: string;
  builtIn: boolean;
  createdAt: number;
}

export interface DeckBundle {
  format: 'tail-cards/deck@1';
  deck: Deck;
  chapters: Chapter[];
  cards: Card[];
}

export interface TailLink {
  label: string;
  /** 같은 덱 안 카드로 해석되면 그 카드 id */
  cardId?: string;
  /** 해석되지 않은 텍스트 (예: "(→ 11장 BST)") */
  note?: string;
}

export interface SourceLink {
  label: string;
  target: string;
  /** 📌 skeleton 대체 근거 */
  pinned: boolean;
}

// ---------- accessors ----------

const norm = (s: string) => s.replace(/\s+/g, '');

export function field(card: Card, name: string): string {
  const f = card.fields.find((x) => norm(x.name) === norm(name));
  return f ? f.value.trim() : '';
}

export const lead = (c: Card) => field(c, '두괄식');
export const explain = (c: Card) => field(c, '풀어 말하기');
export const why = (c: Card) => field(c, '왜 이렇게 답하나');
export const pitfall = (c: Card) => field(c, '함정');
export const hint = (c: Card) => field(c, '힌트 (지울 것)') || field(c, '힌트');

export function keywords(c: Card): string[] {
  const raw = field(c, '키워드');
  const ticks = [...raw.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter(Boolean);
  if (ticks.length) return ticks;
  return raw
    .split(/\s\/\s|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const WIKI = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/** "꼬리 →" 필드를 링크 목록으로. resolve(num|blockId) → cardId */
export function tails(c: Card, resolve: (ref: { blockId?: string; num?: string }) => string | undefined): TailLink[] {
  const raw = field(c, '꼬리 →') || field(c, '꼬리');
  if (!raw || /^[—\-–\s]*$/.test(raw)) return [];
  const out: TailLink[] = [];
  // 링크 + 바로 뒤 괄호 메모: [[#^id|Q6]] ("그래도 충돌이 나나요?")
  const LINK_WITH_MEMO = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\](\s*\([^)]*\))?/g;
  let rest = raw;
  for (const m of raw.matchAll(LINK_WITH_MEMO)) {
    const target = m[1];
    const label = (m[2] ?? target).trim();
    const memo = m[3]?.trim();
    const bid = target.match(/#\^([\w-]+)/)?.[1];
    const cardId = bid ? resolve({ blockId: bid }) : undefined;
    const full = memo ? `${label} ${memo}` : label;
    out.push(cardId ? { label: full, cardId } : { label: full, note: full });
    rest = rest.replace(m[0], ' ');
  }
  // 링크 없이 "Q5", "Q2, Q3" 로 쓰인 경우 (템플릿 형식)
  for (const m of rest.matchAll(/\bQ(\d+)\b/g)) {
    const cardId = resolve({ num: `Q${m[1]}` });
    if (cardId) {
      out.push({ label: `Q${m[1]}`, cardId });
      rest = rest.replace(m[0], ' ');
    }
  }
  // 남은 브릿지 문구 ("(10.3 정렬된 맵 / 11장 BST로 연결)", "6장 큐 / 7장 연결 리스트")
  const leftover = rest.replace(/^[\s,/·]+|[\s,/·]+$/g, '').replace(/\s{2,}/g, ' ');
  if (leftover.length > 1) out.push({ label: leftover, note: leftover });
  return out;
}

/** "왜 이렇게 답하나"의 근거 링크 */
export function sources(c: Card): SourceLink[] {
  const raw = why(c);
  const out: SourceLink[] = [];
  for (const line of raw.split('\n')) {
    const pinnedLine = line.includes('📌');
    for (const m of line.matchAll(WIKI)) {
      const target = m[1].trim();
      const label = (m[2] ?? target.split('/').pop() ?? target).trim();
      out.push({ label, target, pinned: pinnedLine });
    }
  }
  return out;
}

export function slugify(s: string): string {
  return s
    .replace(/\(카드형\)/g, '')
    .replace(/\.md$/i, '')
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
