import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDeck, makeResolver, parseChapterMd } from '../src/core/parse-card-md.ts';
import { renderChapter } from '../src/core/render-card-md.ts';
import { keywords, lead, tails, why, sources } from '../src/core/model.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const CS_TUTOR =
  process.env.CS_TUTOR_CARDS ??
  'G:/내 드라이브/Agent_GeonJae/CS_Tutor/knowledge_base/tail_interview/data_structure';

function load(dir: string) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((fileName) => ({ fileName, md: readFileSync(join(dir, fileName), 'utf8') }));
}

const sets: [string, string][] = [['fixtures', FIXTURES]];
if (existsSync(CS_TUTOR)) sets.push(['CS_Tutor data_structure', CS_TUTOR]);

for (const [name, dir] of sets) {
  describe(name, () => {
    const files = load(dir);
    const deck = buildDeck(files, {
      id: 'ds',
      title: 't',
      subject: 's',
      description: '',
      builtIn: true,
    });
    const resolver = makeResolver(deck.cards);

    for (const f of files.filter((f) => !f.fileName.startsWith('_'))) {
      it(`${f.fileName}: 카드 수 = ### Q 개수, 왕복 동일`, () => {
        const { chapter, cards } = parseChapterMd(f.md, { deckId: 'ds', fileName: f.fileName, order: 0 });
        // 코드 펜스 밖의 ### Q 헤딩 수
        let inFence = false;
        let heads = 0;
        for (const l of f.md.replace(/\r\n?/g, '\n').split('\n')) {
          if (/^\s*```/.test(l)) inFence = !inFence;
          else if (!inFence && /^### Q[^.\s]*\./.test(l)) heads++;
        }
        expect(cards.length).toBe(heads);
        expect(renderChapter(chapter, cards)).toBe(f.md.replace(/\r\n?/g, '\n'));
      });
    }

    it('비-draft 카드는 두괄식·왜 이렇게 답하나·키워드를 가진다', () => {
      const bad = deck.cards
        .filter((c) => !c.draft)
        .filter((c) => !lead(c) || !why(c) || keywords(c).length === 0)
        .map((c) => `${c.chapterId} ${c.num}`);
      expect(bad).toEqual([]);
    });

    it('카드 id는 덱 전체에서 유일', () => {
      const ids = deck.cards.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('꼬리 링크의 cardId는 실제 카드를 가리킨다', () => {
      const ids = new Set(deck.cards.map((c) => c.id));
      for (const c of deck.cards) for (const t of tails(c, resolver(c))) if (t.cardId) expect(ids.has(t.cardId)).toBe(true);
    });

    it('흐름 한 줄과 mermaid를 추출한다', () => {
      const withFlow = deck.chapters.filter((ch) => ch.mermaid);
      expect(withFlow.length).toBeGreaterThan(0);
    });
  });
}

describe('accessor 세부', () => {
  const md = readFileSync(join(FIXTURES, '12 정렬 (카드형).md'), 'utf8');
  const deck = buildDeck([{ fileName: '12 정렬 (카드형).md', md }], {
    id: 'ds', title: 't', subject: 's', description: '', builtIn: true,
  });
  const r = makeResolver(deck.cards);
  const q1 = deck.cards[0];
  it('키워드 백틱 분리', () => {
    expect(keywords(q1)).toHaveLength(3);
  });
  it('꼬리: 같은 파일 링크는 해석, 다른 파일 링크는 note', () => {
    const ts = tails(q1, r(q1));
    expect(ts[0].cardId).toBe('sort-q02');
    expect(ts[1].note).toBeTruthy();
  });
  it('📌 근거 표시', () => {
    const q3 = deck.cards[2];
    expect(sources(q3).some((s) => s.pinned)).toBe(true);
  });
  it('꼬리 → — 는 빈 목록', () => {
    expect(tails(deck.cards[6], r(deck.cards[6]))).toEqual([]);
  });
});
