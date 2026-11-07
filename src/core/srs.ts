import { createEmptyCard, fsrs, Rating, type Card as FsrsCard, type Grade } from 'ts-fsrs';

export interface SrsState extends FsrsCard {
  cardId: string;
  deckId: string;
  lastAnswer?: string;
}

export const GRADES = [
  { grade: Rating.Again as Grade, label: '다시', key: '1' },
  { grade: Rating.Hard as Grade, label: '어려움', key: '2' },
  { grade: Rating.Good as Grade, label: '좋음', key: '3' },
  { grade: Rating.Easy as Grade, label: '쉬움', key: '4' },
] as const;

const scheduler = fsrs({ enable_fuzz: true, request_retention: 0.9 });

export function initState(cardId: string, deckId: string, now = new Date()): SrsState {
  return { ...createEmptyCard(now), cardId, deckId };
}

export function review(state: SrsState, grade: Grade, now = new Date(), answer?: string): SrsState {
  const { card } = scheduler.next(state, now, grade);
  return { ...card, cardId: state.cardId, deckId: state.deckId, lastAnswer: answer ?? state.lastAnswer };
}

/** 각 평가 버튼 아래에 보여줄 다음 간격 */
export function previewIntervals(state: SrsState, now = new Date()): Record<number, string> {
  const out: Record<number, string> = {};
  for (const g of GRADES) {
    const { card } = scheduler.next(state, now, g.grade);
    out[g.grade] = humanInterval(card.due.getTime() - now.getTime());
  }
  return out;
}

export function humanInterval(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m}분`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}일`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}개월`;
  return `${(d / 365).toFixed(1)}년`;
}

export type Mastery = 'new' | 'learning' | 'young' | 'mature';

export function mastery(s?: SrsState): Mastery {
  if (!s || s.reps === 0) return 'new';
  if (s.state === 1 || s.state === 3) return 'learning';
  return s.stability >= 21 ? 'mature' : 'young';
}
