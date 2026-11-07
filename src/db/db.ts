import Dexie, { type EntityTable } from 'dexie';
import type { Card, Chapter, Deck, DeckBundle } from '../core/model.ts';
import type { SrsState } from '../core/srs.ts';

export interface ReviewLog {
  id?: number;
  cardId: string;
  deckId: string;
  grade: number;
  at: number;
  answer?: string;
  keywordRatio?: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

class TailDB extends Dexie {
  decks!: EntityTable<Deck, 'id'>;
  chapters!: EntityTable<Chapter, 'id'>;
  cards!: EntityTable<Card, 'id'>;
  srs!: EntityTable<SrsState, 'cardId'>;
  logs!: EntityTable<ReviewLog, 'id'>;
  settings!: EntityTable<Setting, 'key'>;

  constructor() {
    super('tail-cards');
    this.version(1).stores({
      decks: 'id',
      chapters: 'id, deckId, order',
      cards: 'id, deckId, chapterId',
      srs: 'cardId, deckId, due',
      logs: '++id, cardId, deckId, at',
      settings: 'key',
    });
  }
}

export const db = new TailDB();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.settings.get(key);
  return (s?.value as T) ?? fallback;
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}

/** 덱 번들 저장. 같은 id 덱이 있으면 카드·챕터를 교체하되 학습 기록(srs)은 남긴다 */
export async function saveBundle(b: DeckBundle) {
  await db.transaction('rw', db.decks, db.chapters, db.cards, async () => {
    await db.chapters.where('deckId').equals(b.deck.id).delete();
    await db.cards.where('deckId').equals(b.deck.id).delete();
    await db.decks.put(b.deck);
    await db.chapters.bulkPut(b.chapters);
    await db.cards.bulkPut(b.cards);
  });
}

export async function loadBundle(deckId: string): Promise<DeckBundle | undefined> {
  const deck = await db.decks.get(deckId);
  if (!deck) return undefined;
  const chapters = await db.chapters.where('deckId').equals(deckId).sortBy('order');
  const cards = await db.cards.where('deckId').equals(deckId).toArray();
  cards.sort((a, b) => {
    const ca = chapters.findIndex((c) => c.id === a.chapterId);
    const cb = chapters.findIndex((c) => c.id === b.chapterId);
    return ca - cb || a.order - b.order;
  });
  return { format: 'tail-cards/deck@1', deck, chapters, cards };
}

export async function deleteDeck(deckId: string) {
  await db.transaction('rw', [db.decks, db.chapters, db.cards, db.srs, db.logs], async () => {
    await db.decks.delete(deckId);
    await db.chapters.where('deckId').equals(deckId).delete();
    await db.cards.where('deckId').equals(deckId).delete();
    await db.srs.where('deckId').equals(deckId).delete();
    await db.logs.where('deckId').equals(deckId).delete();
  });
}

/** 기본 덱(public/decks) 시드. 버전이 바뀌면(카드 수·내용 해시) 갱신 */
export async function seedBuiltInDecks() {
  const base = import.meta.env.BASE_URL;
  let index: { id: string; file: string; cards: number }[] = [];
  try {
    index = await (await fetch(`${base}decks/index.json`)).json();
  } catch {
    return;
  }
  for (const entry of index) {
    const seededKey = `seed:${entry.id}`;
    const res = await fetch(`${base}decks/${entry.file}`);
    const text = await res.text();
    const sig = `${text.length}:${entry.cards}`;
    if ((await getSetting(seededKey, '')) === sig) continue;
    const bundle = JSON.parse(text) as DeckBundle;
    await saveBundle(bundle);
    await setSetting(seededKey, sig);
  }
}
