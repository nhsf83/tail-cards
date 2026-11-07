import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../core/model.ts';
import { explain, hint, keywords, lead, pitfall, tails, why } from '../core/model.ts';
import { matchKeywords } from '../core/keyword-match.ts';
import { GRADES, initState, previewIntervals, review, type SrsState } from '../core/srs.ts';
import { db, getSetting, setSetting } from '../db/db.ts';
import { useDeck, type DeckData } from './data.ts';
import { Inline } from './Inline.tsx';
import { href, go } from './route.ts';
import { useSpeech } from './useSpeech.ts';

type Mode = 'srs' | 'chain' | 'all';
type Phase = 'front' | 'back' | 'next';

const today = () => new Date().toLocaleDateString('sv-SE');

async function buildQueue(d: DeckData, mode: Mode, chapterId?: string, startCard?: string): Promise<string[]> {
  const cards = d.bundle.cards.filter((c) => !c.draft && (!chapterId || c.chapterId === chapterId));
  if (mode === 'chain') {
    const start = startCard ? cards.find((c) => c.id === startCard) : cards[0];
    return start ? [start.id] : [];
  }
  if (mode === 'all') return cards.map((c) => c.id);
  const now = new Date();
  const due = cards
    .filter((c) => {
      const s = d.srs.get(c.id);
      return s && s.reps > 0 && s.due <= now;
    })
    .sort((a, b) => +d.srs.get(a.id)!.due - +d.srs.get(b.id)!.due);
  const perDay = await getSetting('newPerDay', 20);
  const used = await getSetting(`newCount:${d.bundle.deck.id}:${today()}`, 0);
  const fresh = cards.filter((c) => !d.srs.get(c.id) || d.srs.get(c.id)!.reps === 0).slice(0, Math.max(0, perDay - used));
  return [...due.map((c) => c.id), ...fresh.map((c) => c.id)];
}

export function Study({ deckId, mode, chapterId, startCard }: { deckId: string; mode: Mode; chapterId?: string; startCard?: string }) {
  const { data, missing } = useDeck(deckId);
  const [queue, setQueue] = useState<string[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('front');
  const [answer, setAnswer] = useState('');
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [srs, setSrs] = useState<Map<string, SrsState>>(new Map());
  const [done, setDone] = useState<{ grade: number; ratio: number }[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    setSrs(new Map(data.srs));
    void buildQueue(data, mode, chapterId, startCard).then(setQueue);
  }, [data, mode, chapterId, startCard]);

  const card: Card | undefined = queue && data ? data.cardById.get(queue[idx]) : undefined;
  const chapter = card && data?.bundle.chapters.find((c) => c.id === card.chapterId);
  const kws = useMemo(() => (card ? keywords(card) : []), [card]);
  const hits = useMemo(() => matchKeywords(answer, kws), [answer, kws]);
  const checked = (k: string, auto: boolean) => overrides[k] ?? auto;
  const ratio = kws.length ? kws.filter((k, i) => checked(k, hits[i].hit)).length / kws.length : 0;
  const state = card ? (srs.get(card.id) ?? initState(card.id, deckId)) : undefined;
  const intervals = useMemo(() => (state && phase === 'back' ? previewIntervals(state) : {}), [state, phase]);

  const speech = useSpeech((t) => {
    setAnswer((a) => (a ? `${a} ${t}` : t));
  });

  const resetCard = () => {
    setPhase('front');
    setAnswer('');
    setOverrides({});
    setStartedAt(null);
    speech.stop();
  };

  const flip = useCallback(() => {
    speech.stop();
    setPhase('back');
  }, [speech]);

  const rate = useCallback(
    async (grade: number) => {
      if (!card || !state || !data) return;
      const now = new Date();
      const wasNew = state.reps === 0;
      const next = review(state, grade as (typeof GRADES)[number]['grade'], now, answer || undefined);
      await db.srs.put(next);
      await db.logs.add({ cardId: card.id, deckId, grade, at: now.getTime(), answer, keywordRatio: ratio });
      if (wasNew) {
        const key = `newCount:${deckId}:${today()}`;
        await setSetting(key, (await getSetting(key, 0)) + 1);
      }
      setSrs((m) => new Map(m).set(card.id, next));
      setDone((d) => [...d, { grade, ratio }]);
      if (mode === 'chain') {
        setPhase('next');
        return;
      }
      if (mode === 'srs' && next.due.getTime() - now.getTime() < 15 * 60000) setQueue((q) => [...q!, card.id]);
      resetCard();
      setIdx((i) => i + 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card, state, data, answer, ratio, deckId, mode],
  );

  const goChain = (cardId: string | null) => {
    resetCard();
    if (!cardId) {
      setIdx(queue!.length); // 종료
      return;
    }
    setQueue((q) => [...q!, cardId]);
    setIdx((i) => i + 1);
  };

  // 단축키
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const inText = (e.target as HTMLElement)?.tagName === 'TEXTAREA';
      if (phase === 'front' && ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || (!inText && e.key === ' '))) {
        e.preventDefault();
        flip();
      } else if (phase === 'back' && !inText && ['1', '2', '3', '4'].includes(e.key)) {
        void rate(Number(e.key));
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [phase, flip, rate]);

  if (missing) return <p>덱을 찾을 수 없습니다. <a href={href([])}>홈으로</a></p>;
  if (!data || !queue) return <p className="muted">불러오는 중…</p>;

  if (!card) {
    const avg = done.length ? Math.round((done.reduce((s, d) => s + d.ratio, 0) / done.length) * 100) : 0;
    return (
      <div className="done-panel">
        <h2>{done.length ? '세션 완료' : '지금 복습할 카드가 없습니다'}</h2>
        {done.length > 0 && (
          <p>
            {done.length}장 답변 · 평균 키워드 {avg}% · 다시 {done.filter((d) => d.grade === 1).length}장
          </p>
        )}
        <div className="row">
          <a className="btn primary" href={href([])}>
            홈으로
          </a>
          {chapterId && (
            <a className="btn" href={href(['chapter', deckId, chapterId])}>
              챕터 보기
            </a>
          )}
          {mode === 'srs' && !done.length && chapterId && (
            <a className="btn" href={href(['study', deckId], { mode: 'all', chapter: chapterId })}>
              이 챕터 전체 훑기
            </a>
          )}
        </div>
      </div>
    );
  }

  const tailLinks = tails(card, data.resolve(card));
  const inDeckTails = tailLinks.filter((t) => t.cardId);
  const nextInOrder = (() => {
    const cs = data.bundle.cards.filter((c) => c.chapterId === card.chapterId && !c.draft);
    const i = cs.findIndex((c) => c.id === card.id);
    return cs[i + 1];
  })();

  return (
    <div className="study">
      <div className="study-top">
        <a className="muted small" href={chapter ? href(['chapter', deckId, chapter.id]) : href([])}>
          ← {chapter?.title}
        </a>
        <span className="muted small">
          {mode === 'chain' ? `체인 ${idx + 1}` : `${idx + 1} / ${queue.length}`}
        </span>
      </div>

      <article className={`card-face ${phase !== 'front' ? 'is-back' : ''}`}>
        <p className="eyebrow">
          {card.num}
          {card.section ? ` · ${card.section}` : ''}
        </p>
        <h1 className="question">{card.question}</h1>

        {phase === 'front' && (
          <AnswerBox
            answer={answer}
            setAnswer={(a) => {
              if (!startedAt) setStartedAt(Date.now());
              setAnswer(a);
            }}
            speech={speech}
            onStart={() => !startedAt && setStartedAt(Date.now())}
            startedAt={startedAt}
            onFlip={flip}
          />
        )}

        {phase === 'next' && <p className="muted small">✓ 평가 완료 — 아래에서 면접관의 다음 질문을 고르세요</p>}

        {phase === 'back' && (
          <CardBack card={card} answer={answer} hits={hits} checked={checked} setOverride={(k, v) => setOverrides((o) => ({ ...o, [k]: v }))} lastAnswer={srs.get(card.id)?.lastAnswer} />
        )}
      </article>

      {phase === 'back' && (
        <div className="grades">
          <p className="muted small center">
            키워드 {Math.round(ratio * 100)}% — 스스로 평가하세요 (1~4)
          </p>
          <div className="grade-row">
            {GRADES.map((g) => (
              <button key={g.grade} className={`btn grade g${g.grade}`} onClick={() => void rate(g.grade)}>
                <b>{g.label}</b>
                <span>{intervals[g.grade]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === 'next' && (
        <div className="next-panel">
          <p className="eyebrow">면접관의 다음 꼬리질문</p>
          <div className="stack">
            {inDeckTails.map((t) => {
              const c = data.cardById.get(t.cardId!)!;
              const other = c.chapterId !== card.chapterId;
              return (
                <button key={t.cardId} className="btn tail" onClick={() => goChain(t.cardId!)}>
                  <span className="tail-num">{other ? '↗' : c.num}</span>
                  <span>{c.question}</span>
                </button>
              );
            })}
            {tailLinks
              .filter((t) => !t.cardId)
              .map((t) => (
                <p key={t.label} className="muted small">
                  <Inline text={`브릿지: ${t.label}`} />
                </p>
              ))}
            {!inDeckTails.length && nextInOrder && (
              <button className="btn tail" onClick={() => goChain(nextInOrder.id)}>
                <span className="tail-num">{nextInOrder.num}</span>
                <span>{nextInOrder.question}</span>
              </button>
            )}
          </div>
          <div className="row">
            <button className="btn ghost" onClick={() => goChain(null)}>
              체인 끝내기
            </button>
            {inDeckTails.length > 0 && nextInOrder && (
              <button className="btn ghost" onClick={() => goChain(nextInOrder.id)}>
                순서대로 다음 ({nextInOrder.num})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AnswerBox({
  answer,
  setAnswer,
  speech,
  onStart,
  startedAt,
  onFlip,
}: {
  answer: string;
  setAnswer: (a: string) => void;
  speech: ReturnType<typeof useSpeech>;
  onStart: () => void;
  startedAt: number | null;
  onFlip: () => void;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => tick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, [startedAt]);
  const sec = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  const over = sec > 30;

  return (
    <div className="answer-box">
      <textarea
        value={answer + (speech.interim ? (answer ? ' ' : '') + speech.interim : '')}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder={speech.supported ? '🎙️ 말하거나 타이핑해서 답해 보세요 (30초)' : '타이핑해서 답해 보세요 (30초)'}
        rows={5}
        readOnly={speech.listening}
      />
      <div className="answer-tools">
        {speech.supported && (
          <button
            className={`btn mic ${speech.listening ? 'on' : ''}`}
            onClick={() => {
              if (speech.listening) speech.stop();
              else {
                onStart();
                speech.start();
              }
            }}
          >
            {speech.listening ? '■ 멈추기' : '🎙️ 말로 답하기'}
          </button>
        )}
        <span className={`timer ${over ? 'over' : ''}`}>
          {startedAt ? `${sec}s` : '30s'}
          <span className="timer-bar">
            <span style={{ width: `${Math.min(100, (sec / 30) * 100)}%` }} />
          </span>
        </span>
        <button className="btn primary" onClick={onFlip}>
          뒷면 보기 <kbd>Space</kbd>
        </button>
      </div>
      {speech.error && <p className="error small">{speech.error}</p>}
    </div>
  );
}

function CardBack({
  card,
  answer,
  hits,
  checked,
  setOverride,
  lastAnswer,
}: {
  card: Card;
  answer: string;
  hits: ReturnType<typeof matchKeywords>;
  checked: (k: string, auto: boolean) => boolean;
  setOverride: (k: string, v: boolean) => void;
  lastAnswer?: string;
}) {
  const kws = keywords(card);
  const p = pitfall(card);
  const h = hint(card);
  return (
    <div className="back">
      {answer && (
        <section className="my-answer">
          <p className="label">내 답변</p>
          <p>{answer}</p>
        </section>
      )}
      {!answer && lastAnswer && (
        <section className="my-answer faded">
          <p className="label">지난번 내 답변</p>
          <p>{lastAnswer}</p>
        </section>
      )}

      <section className="lead">
        <p className="label">두괄식</p>
        <p className="lead-text">
          <Inline text={lead(card) || '(직접 채울 카드)'} />
        </p>
      </section>

      {kws.length > 0 && (
        <section>
          <p className="label">키워드 체크 {answer ? '(자동 판정 · 눌러서 수정)' : '(눌러서 체크)'}</p>
          <div className="kw-list">
            {kws.map((k, i) => {
              const on = checked(k, hits[i]?.hit ?? false);
              return (
                <button key={k} className={`kw ${on ? 'on' : ''}`} onClick={() => setOverride(k, !on)} aria-pressed={on}>
                  <span className="kw-check">{on ? '✓' : ''}</span>
                  <span>
                    {hits[i]?.terms.length && answer
                      ? hits[i].terms.map((t, j) => (
                          <span key={j} className={t.hit ? 'term-hit' : ''}>
                            {j > 0 ? ' · ' : ''}
                            {t.term}
                          </span>
                        ))
                      : k}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {explain(card) && (
        <section>
          <p className="label">풀어 말하기 (30초)</p>
          <p className="speak">
            <Inline text={explain(card)} />
          </p>
        </section>
      )}

      <details className="why" open>
        <summary className="label">왜 이렇게 답하나</summary>
        <div>
          <Inline text={why(card) || '—'} />
        </div>
      </details>

      {p && (
        <section className="pitfall">
          <p className="label">함정</p>
          <p>
            <Inline text={p} />
          </p>
        </section>
      )}
      {h && (
        <section>
          <p className="label">힌트</p>
          <p>
            <Inline text={h} />
          </p>
        </section>
      )}
    </div>
  );
}

export function startStudy(deckId: string, mode: Mode, chapterId?: string, card?: string) {
  go(href(['study', deckId], { mode, chapter: chapterId, card }));
}
