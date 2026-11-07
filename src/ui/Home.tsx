import { useMemo } from 'react';
import type { DeckBundle } from '../core/model.ts';
import type { SrsState } from '../core/srs.ts';
import { mastery } from '../core/srs.ts';
import { href } from './route.ts';
import { useDecks, useNow, useStats } from './data.ts';

export function Home() {
  const { decks } = useDecks();
  if (!decks) return <p className="muted">불러오는 중…</p>;
  if (!decks.length)
    return (
      <div className="empty">
        <h2>덱이 없습니다</h2>
        <p>
          <a href={href(['generate'])}>노트로 카드 만들기</a> 또는 <a href={href(['settings'])}>카드형 .md 가져오기</a>
        </p>
      </div>
    );
  return (
    <div className="stack-lg">
      {decks.map((d) => (
        <DeckPanel key={d.bundle.deck.id} bundle={d.bundle} srs={d.srs} />
      ))}
    </div>
  );
}

function DeckPanel({ bundle, srs }: { bundle: DeckBundle; srs: SrsState[] }) {
  const now = useNow();
  const srsMap = useMemo(() => new Map(srs.map((s) => [s.cardId, s])), [srs]);
  const st = useStats(bundle.cards, srsMap, now);
  const { deck, chapters, cards } = bundle;

  return (
    <section className="deck">
      <header className="deck-head">
        <div>
          <p className="eyebrow">{deck.builtIn ? '기본 덱' : '내 덱'} · 챕터 {chapters.length}개</p>
          <h2>{deck.title}</h2>
        </div>
        <div className="deck-stats">
          <Stat n={st.due} label="복습 예정" tone="due" />
          <Stat n={st.fresh} label="새 카드" tone="new" />
          <Stat n={st.learned} label="학습함" tone="done" />
        </div>
        <a className="btn primary" href={href(['study', deck.id], { mode: 'srs' })}>
          오늘 복습 시작
        </a>
      </header>

      <ol className="chapters">
        {chapters.map((ch) => {
          const cs = cards.filter((c) => c.chapterId === ch.id && !c.draft);
          const counts = { new: 0, learning: 0, young: 0, mature: 0 };
          for (const c of cs) counts[mastery(srsMap.get(c.id))]++;
          const drafts = cards.filter((c) => c.chapterId === ch.id && c.draft).length;
          return (
            <li key={ch.id} className="chapter-row">
              <a className="chapter-title" href={href(['chapter', deck.id, ch.id])}>
                {ch.title}
              </a>
              <span className="muted small nowrap">
                {cs.length}장{drafts ? ` · ✍️${drafts}` : ''}
              </span>
              <MasteryBar counts={counts} total={cs.length} />
              <span className="row-actions">
                <a className="btn ghost sm" href={href(['study', deck.id], { mode: 'chain', chapter: ch.id })}>
                  체인
                </a>
                <a className="btn ghost sm" href={href(['study', deck.id], { mode: 'srs', chapter: ch.id })}>
                  복습
                </a>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className={`stat ${tone}`}>
      <b>{n}</b>
      <span>{label}</span>
    </div>
  );
}

export function MasteryBar({ counts, total }: { counts: Record<string, number>; total: number }) {
  if (!total) return <span className="bar" />;
  return (
    <span className="bar" title={`숙련 ${counts.mature} · 익히는 중 ${counts.young} · 학습 중 ${counts.learning} · 새 ${counts.new}`}>
      {(['mature', 'young', 'learning'] as const).map((k) =>
        counts[k] ? <span key={k} className={`seg m_${k}`} style={{ width: `${(counts[k] / total) * 100}%` }} /> : null,
      )}
    </span>
  );
}
