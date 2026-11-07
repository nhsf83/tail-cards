import { useEffect, useRef, useState } from 'react';
import { buildDeck, parseChapterMd } from '../core/parse-card-md.ts';
import { db, loadBundle, saveBundle } from '../db/db.ts';
import { ClaudeProvider } from '../llm/claude.ts';
import { normalizeConcept, planQuestions, toCardMarkdown, writeBacks, type Plan } from '../llm/generate.ts';
import { LLMError } from '../llm/provider.ts';
import { loadLlmSettings, MODELS, type LlmSettings } from '../llm/settings.ts';
import { slugify, type Deck } from '../core/model.ts';
import { downloadText, readFiles } from './download.ts';
import { href, go } from './route.ts';

type Step = 'input' | 'concept' | 'plan' | 'review';

export function Generate() {
  const [llm, setLlm] = useState<LlmSettings | null>(null);
  const [userDecks, setUserDecks] = useState<Deck[]>([]);
  const [deckChoice, setDeckChoice] = useState('new');
  const [newDeck, setNewDeck] = useState('');
  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [noteFile, setNoteFile] = useState('');
  const [tone, setTone] = useState('');
  const [isRaw, setIsRaw] = useState(false);
  const [step, setStep] = useState<Step>('input');
  const [concept, setConcept] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [md, setMd] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    void loadLlmSettings().then(setLlm);
    void db.decks.toArray().then((ds) => setUserDecks(ds.filter((d) => !d.builtIn)));
  }, []);

  const input = () => ({ subject: subject || newDeck || '전공', title: title || noteFile.replace(/\.md$/, '') || '단원', note: step === 'input' ? note : concept || note, toneSample: tone || undefined });

  async function run<T>(label: string, fn: (p: ClaudeProvider, signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
    setErr('');
    setBusy(label);
    abort.current = new AbortController();
    try {
      const provider = new ClaudeProvider(llm!);
      return await fn(provider, abort.current.signal);
    } catch (e) {
      setErr(e instanceof LLMError ? e.message : String((e as Error)?.message ?? e));
      return undefined;
    } finally {
      setBusy('');
    }
  }

  async function start() {
    if (!note.trim()) return setErr('노트를 붙여넣거나 파일을 선택해 주세요.');
    if (isRaw) {
      const c = await run('개념 노트로 정리하는 중…', (p, s) => normalizeConcept(p, { ...input(), note }, s));
      if (c) {
        setConcept(c);
        setStep('concept');
      }
    } else {
      setConcept(note);
      await makePlan(note);
    }
  }

  async function makePlan(base: string) {
    const p = await run('꼬리질문 설계 중…', (pr, s) => planQuestions(pr, { ...input(), note: base }, s));
    if (p) {
      setPlan(p);
      setStep('plan');
    }
  }

  async function makeBacks() {
    if (!plan) return;
    const fixed: Plan = {
      ...plan,
      cards: plan.cards.filter((c) => c.question.trim()),
    };
    const b = await run('카드 뒷면 작성 중… (1~3분)', (pr, s) => writeBacks(pr, { ...input(), note: concept }, fixed, s));
    if (b) {
      const fileNote = `${input().title}.md`;
      setMd(toCardMarkdown({ ...input(), note: concept }, fixed, b, noteFile || fileNote));
      setStep('review');
    }
  }

  async function save() {
    const fileName = `${input().title} (카드형).md`;
    let deckId = deckChoice;
    if (deckChoice === 'new') {
      deckId = `user-${Date.now().toString(36)}`;
      const name = newDeck.trim() || input().subject;
      const b = buildDeck([{ fileName, md }], { id: deckId, title: name, subject: name, description: 'AI로 생성한 꼬리질문 카드', builtIn: false });
      await saveBundle(b);
    } else {
      const b = await loadBundle(deckId);
      if (!b) return setErr('덱을 찾을 수 없습니다');
      const { chapter, cards } = parseChapterMd(md, { deckId, fileName, order: b.chapters.length });
      // 같은 이름의 챕터를 다시 생성하면 교체. 다른 챕터와 카드 id가 겹치면 챕터 id를 붙여 구분
      const others = b.cards.filter((c) => c.chapterId !== chapter.id);
      const taken = new Set(others.map((c) => c.id));
      const rename = new Map<string, string>();
      for (const c of cards) {
        if (taken.has(c.id)) {
          rename.set(c.id, `${chapter.id}-${c.id}`);
          c.id = `${chapter.id}-${c.id}`;
        }
      }
      chapter.blocks = chapter.blocks.map((bl) => (bl.type === 'card' && rename.has(bl.cardId) ? { ...bl, cardId: rename.get(bl.cardId)! } : bl));
      await saveBundle({ ...b, chapters: [...b.chapters.filter((c) => c.id !== chapter.id), chapter], cards: [...others, ...cards] });
    }
    go(href(['chapter', deckId, `${deckId}:${slugify(fileName)}`]));
  }

  if (!llm) return <p className="muted">불러오는 중…</p>;

  return (
    <div className="stack-lg">
      <div>
        <h1 className="page-title">노트로 카드 만들기</h1>
        <p className="muted">
          CS-Tutor의 <code>card-interview</code> 로직: 노트 → (필요하면 개념 정리) → 면접관 꼬리질문 설계 → 카드 뒷면(두괄식·키워드·풀어 말하기·왜 이렇게 답하나·함정). 단계마다 확인하고 고칠 수 있습니다.
        </p>
      </div>

      {!llm.apiKey && (
        <p className="toast warn">
          AI 생성에는 본인의 Anthropic API 키가 필요합니다. <a href={href(['settings'])}>설정에서 키 입력</a> (키는 이 브라우저에만 저장)
        </p>
      )}

      <ol className="steps">
        {(['input', 'concept', 'plan', 'review'] as Step[]).map((s, i) => (
          <li key={s} className={step === s ? 'on' : ''}>
            {i + 1}. {{ input: '노트', concept: '개념 정리', plan: '질문 설계', review: '카드 확인' }[s]}
          </li>
        ))}
      </ol>

      {err && <p className="toast error">{err}</p>}
      {busy && (
        <p className="toast busy">
          <span className="spinner" /> {busy}{' '}
          <button className="btn sm ghost" onClick={() => abort.current?.abort()}>
            취소
          </button>
        </p>
      )}

      {step === 'input' && (
        <section className="panel stack">
          <div className="grid2">
            <label className="field">
              <span>저장할 덱</span>
              <select value={deckChoice} onChange={(e) => setDeckChoice(e.target.value)}>
                <option value="new">+ 새 덱</option>
                {userDecks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </label>
            {deckChoice === 'new' && (
              <label className="field">
                <span>새 덱 이름</span>
                <input value={newDeck} onChange={(e) => setNewDeck(e.target.value)} placeholder="예: 운영체제" />
              </label>
            )}
            <label className="field">
              <span>과목</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="예: 운영체제 (공룡책)" />
            </label>
            <label className="field">
              <span>단원 제목</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 5.3 스케줄링 알고리즘" />
            </label>
          </div>
          <label className="field">
            <span className="row between">
              노트 (마크다운/텍스트)
              <button
                className="btn sm"
                onClick={async () => {
                  const [f] = await readFiles('.md,.txt,text/markdown,text/plain', false);
                  if (f) {
                    setNote(f.text);
                    setNoteFile(f.name);
                    if (!title) setTitle(f.name.replace(/\.(md|txt)$/i, ''));
                  }
                }}
              >
                파일 열기
              </button>
            </span>
            <textarea rows={14} value={note} onChange={(e) => setNote(e.target.value)} placeholder="내가 정리한 개념 노트나 교재 본문을 붙여넣으세요. ## 헤딩이 있으면 카드 근거 링크로 쓰입니다." />
          </label>
          <label className="check">
            <input type="checkbox" checked={isRaw} onChange={(e) => setIsRaw(e.target.checked)} />
            교재 원문/거친 메모예요 → 먼저 면접 깊이의 개념 노트(7단계 또는 방법론형)로 정리
          </label>
          <details>
            <summary className="muted small">말투 샘플 (선택) — 풀어 말하기 문체를 내 말투로</summary>
            <textarea rows={4} value={tone} onChange={(e) => setTone(e.target.value)} placeholder="내가 쓴 면접 답변 문단 하나를 붙여넣으세요" />
          </details>
          <div className="row between">
            <span className="muted small">모델: {MODELS.find((m) => m.id === llm.model)?.label ?? llm.model}</span>
            <button className="btn primary" disabled={!!busy || !llm.apiKey} onClick={() => void start()}>
              {isRaw ? '개념 정리부터 시작' : '꼬리질문 설계'}
            </button>
          </div>
        </section>
      )}

      {step === 'concept' && (
        <section className="panel stack">
          <p className="muted small">정리된 개념 노트입니다. 틀린 부분·빼고 싶은 부분을 고친 뒤 다음으로 가세요.</p>
          <textarea rows={20} value={concept} onChange={(e) => setConcept(e.target.value)} />
          <div className="row between">
            <button className="btn ghost" onClick={() => setStep('input')}>
              ← 처음으로
            </button>
            <div className="row">
              <button className="btn ghost" onClick={() => downloadText(`${input().title}.md`, concept)}>
                노트 .md 저장
              </button>
              <button className="btn primary" disabled={!!busy} onClick={() => void makePlan(concept)}>
                꼬리질문 설계
              </button>
            </div>
          </div>
        </section>
      )}

      {step === 'plan' && plan && (
        <section className="panel stack">
          <label className="field">
            <span>흐름 한 줄</span>
            <textarea rows={3} value={plan.flow} onChange={(e) => setPlan({ ...plan, flow: e.target.value })} />
          </label>
          <ol className="plan-list">
            {plan.cards.map((c, i) => (
              <li key={i} className={c.draft ? 'draft' : ''}>
                <span className="tail-num">{c.num}</span>
                <div className="grow">
                  <input
                    value={c.question}
                    onChange={(e) => setPlan({ ...plan, cards: plan.cards.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)) })}
                  />
                  <span className="muted small">
                    {c.section} · 꼬리 → {c.tails.join(', ') || '—'}
                    {c.sourceHeading ? ` · 근거: ${c.sourceHeading}` : ''}
                  </span>
                </div>
                <label className="check small">
                  <input
                    type="checkbox"
                    checked={c.draft}
                    onChange={(e) => setPlan({ ...plan, cards: plan.cards.map((x, j) => (j === i ? { ...x, draft: e.target.checked } : x)) })}
                  />
                  ✍️직접
                </label>
                <button
                  className="btn sm ghost"
                  aria-label="삭제"
                  onClick={() => {
                    const removed = c.num;
                    setPlan({ ...plan, cards: plan.cards.filter((_, j) => j !== i).map((x) => ({ ...x, tails: x.tails.filter((t) => t !== removed) })) });
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
          <div className="row between">
            <button className="btn ghost" onClick={() => setStep(isRaw ? 'concept' : 'input')}>
              ← 이전
            </button>
            <div className="row">
              <button className="btn ghost" disabled={!!busy} onClick={() => void makePlan(concept)}>
                다시 설계
              </button>
              <button className="btn primary" disabled={!!busy} onClick={() => void makeBacks()}>
                카드 뒷면 쓰기 ({plan.cards.length}장)
              </button>
            </div>
          </div>
        </section>
      )}

      {step === 'review' && (
        <section className="panel stack">
          <p className="muted small">
            CS-Tutor 카드형 포맷(.md)입니다. 여기서 직접 고쳐도 되고, 저장 후 Obsidian으로 내보낼 수도 있습니다.
          </p>
          <textarea className="mono" rows={24} value={md} onChange={(e) => setMd(e.target.value)} />
          <div className="row between">
            <button className="btn ghost" onClick={() => setStep('plan')}>
              ← 질문 설계로
            </button>
            <div className="row">
              <button className="btn ghost" onClick={() => downloadText(`${input().title} (카드형).md`, md)}>
                .md 다운로드
              </button>
              <button className="btn primary" onClick={() => void save()}>
                덱에 저장하고 보기
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
