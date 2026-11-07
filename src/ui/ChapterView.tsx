import { useCallback, useMemo } from 'react';
import type { Card } from '../core/model.ts';
import { explain, keywords, lead, pitfall, tails, why } from '../core/model.ts';
import { renderChapter, buildMermaid } from '../core/render-card-md.ts';
import { mastery } from '../core/srs.ts';
import { useDeck } from './data.ts';
import { Inline } from './Inline.tsx';
import { Mermaid } from './Mermaid.tsx';
import { href } from './route.ts';
import { startStudy } from './Study.tsx';
import { downloadText } from './download.ts';

const MASTERY_LABEL = { new: '새 카드', learning: '학습 중', young: '익히는 중', mature: '숙련' } as const;

export function ChapterView({ deckId, chapterId }: { deckId: string; chapterId: string }) {
  const { data } = useDeck(deckId);
  const chapter = data?.bundle.chapters.find((c) => c.id === chapterId);
  const cards = useMemo(() => data?.bundle.cards.filter((c) => c.chapterId === chapterId) ?? [], [data, chapterId]);
  const onPick = useCallback((c: Card) => startStudy(deckId, 'chain', chapterId, c.id), [deckId, chapterId]);

  if (!data) return <p className="muted">불러오는 중…</p>;
  if (!chapter) return <p>챕터를 찾을 수 없습니다. <a href={href([])}>홈으로</a></p>;

  const mermaidCode = chapter.mermaid || buildMermaid(cards, data.resolve);

  return (
    <div className="stack-lg">
      <div>
        <a className="muted small" href={href([])}>
          ← {data.bundle.deck.title}
        </a>
        <h1 className="page-title">{chapter.title}</h1>
        <div className="row">
          <button className="btn primary" onClick={() => startStudy(deckId, 'chain', chapterId)}>
            Q1부터 체인 연습
          </button>
          <button className="btn" onClick={() => startStudy(deckId, 'srs', chapterId)}>
            이 챕터 복습
          </button>
          <button className="btn" onClick={() => startStudy(deckId, 'all', chapterId)}>
            순서대로 전체
          </button>
          <button className="btn ghost" onClick={() => downloadText(chapter.fileName, renderChapter(chapter, cards))}>
            .md 내보내기
          </button>
        </div>
      </div>

      {chapter.flow && (
        <section className="flow">
          <p className="label">흐름 한 줄 (안 보고 써지면 통과)</p>
          <pre>{chapter.flow}</pre>
        </section>
      )}

      <section>
        <p className="label">꼬리질문 연결도 — 노드를 누르면 그 카드부터 체인 연습</p>
        <Mermaid code={mermaidCode} cards={cards} srs={data.srs} onPick={onPick} />
      </section>

      <section className="stack">
        {cards.map((c) => {
          const m = mastery(data.srs.get(c.id));
          const ts = tails(c, data.resolve(c));
          return (
            <details key={c.id} className={`card-row ${c.draft ? 'draft' : ''}`}>
              <summary>
                <span className={`dot m_${m}`} title={MASTERY_LABEL[m]} />
                <b>{c.num}.</b> {c.question}
                {c.draft && <span className="tag">✍️ 직접 채울 카드</span>}
              </summary>
              <div className="card-row-body">
                {lead(c) && (
                  <p className="lead-text">
                    <Inline text={lead(c)} />
                  </p>
                )}
                {keywords(c).length > 0 && (
                  <div className="kw-list static">
                    {keywords(c).map((k) => (
                      <span key={k} className="kw">
                        {k}
                      </span>
                    ))}
                  </div>
                )}
                {explain(c) && (
                  <p className="speak">
                    <Inline text={explain(c)} />
                  </p>
                )}
                {why(c) && (
                  <div className="why-inline">
                    <span className="label">왜 이렇게 답하나</span>
                    <Inline text={why(c)} />
                  </div>
                )}
                {pitfall(c) && (
                  <p className="pitfall">
                    <span className="label">함정</span> <Inline text={pitfall(c)} />
                  </p>
                )}
                {ts.length > 0 && (
                  <p className="small">
                    <span className="label">꼬리 →</span>{' '}
                    {ts.map((t, i) => (
                      <span key={i}>
                        {i > 0 && ', '}
                        {t.cardId ? (
                          <a href={href(['study', deckId], { mode: 'chain', chapter: data.cardById.get(t.cardId)?.chapterId, card: t.cardId })}>
                            {t.label}
                          </a>
                        ) : (
                          <span className="muted">{t.label}</span>
                        )}
                      </span>
                    ))}
                  </p>
                )}
                {!c.draft && (
                  <button className="btn sm" onClick={() => startStudy(deckId, 'chain', chapterId, c.id)}>
                    여기서부터 체인
                  </button>
                )}
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}
