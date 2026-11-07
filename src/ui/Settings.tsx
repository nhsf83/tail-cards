import { useEffect, useState } from 'react';
import type { DeckBundle } from '../core/model.ts';
import { buildDeck } from '../core/parse-card-md.ts';
import type { SrsState } from '../core/srs.ts';
import { db, deleteDeck, getSetting, loadBundle, saveBundle, setSetting } from '../db/db.ts';
import { MODELS, loadLlmSettings, saveLlmSettings, type LlmSettings } from '../llm/settings.ts';
import { useDecks } from './data.ts';
import { downloadText, readFiles } from './download.ts';

type ExportBundle = DeckBundle & { srs?: SrsState[] };

export function Settings() {
  const { decks, reload } = useDecks();
  const [llm, setLlm] = useState<LlmSettings | null>(null);
  const [perDay, setPerDay] = useState(20);
  const [msg, setMsg] = useState('');
  const [newDeckTitle, setNewDeckTitle] = useState('');

  useEffect(() => {
    void loadLlmSettings().then(setLlm);
    void getSetting('newPerDay', 20).then(setPerDay);
  }, []);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 4000);
  };

  async function importMd() {
    const files = await readFiles('.md,text/markdown', true);
    if (!files.length) return;
    const title = newDeckTitle.trim() || files[0].name.replace(/\.md$/, '');
    const id = `user-${Date.now().toString(36)}`;
    const bundle = buildDeck(
      files.map((f) => ({ fileName: f.name, md: f.text })),
      { id, title, subject: title, description: '가져온 카드형 .md', builtIn: false },
    );
    if (!bundle.cards.length) return flash('카드(### Q…)를 찾지 못했습니다. 카드형 포맷인지 확인해 주세요.');
    await saveBundle(bundle);
    await reload();
    flash(`“${title}” 덱: 챕터 ${bundle.chapters.length}개, 카드 ${bundle.cards.length}장 가져옴`);
  }

  async function exportDeck(deckId: string) {
    const b = await loadBundle(deckId);
    if (!b) return;
    const srs = await db.srs.where('deckId').equals(deckId).toArray();
    const out: ExportBundle = { ...b, srs };
    downloadText(`${b.deck.title}.tailcards.json`, JSON.stringify(out), 'application/json');
  }

  async function importJson() {
    const [f] = await readFiles('.json,application/json', false);
    if (!f) return;
    try {
      const b = JSON.parse(f.text) as ExportBundle;
      if (b.format !== 'tail-cards/deck@1') throw new Error('형식이 다릅니다');
      await saveBundle(b);
      if (b.srs?.length) {
        await db.srs.bulkPut(
          b.srs.map((s) => ({
            ...s,
            due: new Date(s.due),
            last_review: s.last_review ? new Date(s.last_review) : undefined,
          })),
        );
      }
      await reload();
      flash(`“${b.deck.title}” 덱 복원 (학습 기록 ${b.srs?.length ?? 0}건)`);
    } catch (e) {
      flash(`가져오기 실패: ${(e as Error).message}`);
    }
  }

  async function resetProgress(deckId: string) {
    if (!confirm('이 덱의 학습 기록을 모두 지울까요? 되돌릴 수 없습니다.')) return;
    await db.srs.where('deckId').equals(deckId).delete();
    await db.logs.where('deckId').equals(deckId).delete();
    await reload();
    flash('학습 기록을 지웠습니다');
  }

  async function removeDeck(deckId: string, title: string) {
    if (!confirm(`“${title}” 덱과 학습 기록을 삭제할까요? 되돌릴 수 없습니다. (먼저 JSON 내보내기를 권장)`)) return;
    await deleteDeck(deckId);
    await reload();
    flash('삭제했습니다');
  }

  return (
    <div className="stack-lg">
      <h1 className="page-title">설정</h1>
      {msg && <p className="toast">{msg}</p>}

      <section className="panel">
        <h2>학습</h2>
        <label className="field">
          <span>하루 새 카드 수</span>
          <input
            type="number"
            min={0}
            max={500}
            value={perDay}
            onChange={(e) => {
              const v = Number(e.target.value);
              setPerDay(v);
              void setSetting('newPerDay', v);
            }}
          />
        </label>
      </section>

      <section className="panel">
        <h2>AI 카드 생성 (BYOK)</h2>
        <p className="muted small">
          API 키는 이 브라우저(IndexedDB)에만 저장되고, 카드 생성 시 선택한 프로바이더(Anthropic)로만 직접 전송됩니다. 공용 PC에서는 저장하지 마세요.
        </p>
        {llm && (
          <>
            <label className="field">
              <span>Anthropic API 키</span>
              <input
                type="password"
                autoComplete="off"
                placeholder="sk-ant-..."
                value={llm.apiKey}
                onChange={(e) => setLlm({ ...llm, apiKey: e.target.value.trim() })}
              />
            </label>
            <label className="field">
              <span>모델</span>
              <select value={llm.model} onChange={(e) => setLlm({ ...llm, model: e.target.value })}>
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="row">
              <button
                className="btn primary"
                onClick={() => {
                  void saveLlmSettings(llm).then(() => flash('저장했습니다'));
                }}
              >
                저장
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  const cleared = { ...llm, apiKey: '' };
                  setLlm(cleared);
                  void saveLlmSettings(cleared).then(() => flash('키를 지웠습니다'));
                }}
              >
                키 지우기
              </button>
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <h2>가져오기</h2>
        <label className="field">
          <span>새 덱 이름 (.md 가져올 때)</span>
          <input value={newDeckTitle} onChange={(e) => setNewDeckTitle(e.target.value)} placeholder="예: 운영체제" />
        </label>
        <div className="row">
          <button className="btn" onClick={() => void importMd()}>
            카드형 .md 파일들 → 새 덱
          </button>
          <button className="btn" onClick={() => void importJson()}>
            덱 백업(.json) 복원
          </button>
        </div>
        <p className="muted small">
          카드형 .md는 CS-Tutor <code>card-interview</code> 포맷(<code>### Qn.</code> + <code>&gt; [!answer]- 뒷면</code>)입니다. Obsidian에서 그대로 열 수 있습니다.
        </p>
      </section>

      <section className="panel">
        <h2>덱 관리</h2>
        {!decks && <p className="muted">불러오는 중…</p>}
        <ul className="deck-admin">
          {decks?.map(({ bundle, srs }) => (
            <li key={bundle.deck.id}>
              <div>
                <b>{bundle.deck.title}</b>
                <span className="muted small">
                  {' '}
                  · 카드 {bundle.cards.length}장 · 학습 기록 {srs.length}건{bundle.deck.builtIn ? ' · 기본 덱' : ''}
                </span>
              </div>
              <div className="row">
                <button className="btn sm" onClick={() => void exportDeck(bundle.deck.id)}>
                  JSON 내보내기
                </button>
                <button className="btn sm ghost" onClick={() => void resetProgress(bundle.deck.id)}>
                  기록 초기화
                </button>
                {!bundle.deck.builtIn && (
                  <button className="btn sm danger" onClick={() => void removeDeck(bundle.deck.id, bundle.deck.title)}>
                    삭제
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
