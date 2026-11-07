import { useCallback, useEffect, useMemo, useState } from 'react';
import { db, loadBundle } from '../db/db.ts';
import type { Card, DeckBundle } from '../core/model.ts';
import { makeResolver } from '../core/parse-card-md.ts';
import type { SrsState } from '../core/srs.ts';

export interface DeckData {
  bundle: DeckBundle;
  srs: Map<string, SrsState>;
  cardById: Map<string, Card>;
  resolve: (from: Card) => (ref: { blockId?: string; num?: string }) => string | undefined;
}

export function useDeck(deckId: string | undefined) {
  const [data, setData] = useState<DeckData | null>(null);
  const [missing, setMissing] = useState(false);

  const reload = useCallback(async () => {
    if (!deckId) return;
    const bundle = await loadBundle(deckId);
    if (!bundle) {
      setMissing(true);
      return;
    }
    const srsList = await db.srs.where('deckId').equals(deckId).toArray();
    setData({
      bundle,
      srs: new Map(srsList.map((s) => [s.cardId, s])),
      cardById: new Map(bundle.cards.map((c) => [c.id, c])),
      resolve: makeResolver(bundle.cards),
    });
  }, [deckId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, missing, reload };
}

export function useDecks() {
  const [decks, setDecks] = useState<{ bundle: DeckBundle; srs: SrsState[] }[] | null>(null);
  const reload = useCallback(async () => {
    const all = await db.decks.toArray();
    all.sort((a, b) => Number(b.builtIn) - Number(a.builtIn) || b.createdAt - a.createdAt);
    const out = [];
    for (const d of all) {
      const bundle = await loadBundle(d.id);
      if (bundle) out.push({ bundle, srs: await db.srs.where('deckId').equals(d.id).toArray() });
    }
    setDecks(out);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { decks, reload };
}

export function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useStats(cards: Card[], srs: Map<string, SrsState> | SrsState[], now: Date) {
  return useMemo(() => {
    const m = srs instanceof Map ? srs : new Map(srs.map((s) => [s.cardId, s]));
    let fresh = 0;
    let due = 0;
    let learned = 0;
    for (const c of cards) {
      if (c.draft) continue;
      const s = m.get(c.id);
      if (!s || s.reps === 0) fresh++;
      else {
        learned++;
        if (s.due <= now) due++;
      }
    }
    return { fresh, due, learned, total: fresh + learned };
  }, [cards, srs, now]);
}
