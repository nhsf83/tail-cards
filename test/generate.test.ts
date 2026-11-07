import { describe, expect, it } from 'vitest';
import { toCardMarkdown, planQuestions, type Backs, type Plan } from '../src/llm/generate.ts';
import { buildDeck, makeResolver } from '../src/core/parse-card-md.ts';
import { keywords, lead, sources, tails, why } from '../src/core/model.ts';
import type { LLMProvider } from '../src/llm/provider.ts';

const plan: Plan = {
  noteType: 'seven_stage',
  flow: '곱셈기 → 시프트-덧셈 → 하드웨어 최적화',
  cards: [
    { num: 'Q1', question: '곱셈 하드웨어는 어떻게 동작하나요?', section: '기본 곱셈기', sourceHeading: '구현', tails: ['Q2', 'Q3'], draft: false },
    { num: 'Q2', question: '왜 곱셈기를 최적화하나요?', section: '기본 곱셈기', sourceHeading: '이렇게 구현하는 이유', tails: ['Q3'], draft: false },
    { num: 'Q3', question: '부호 있는 곱셈은?', section: '부호', sourceHeading: '', tails: [], draft: false },
    { num: 'Q4', question: 'Booth 알고리즘은?', section: '부호', sourceHeading: '단점·한계', tails: [], draft: true },
  ],
};
const backs: Backs = {
  cards: [
    { num: 'Q1', lead: '**시프트와 덧셈**을 반복합니다.', keywords: ['시프트', '덧셈 반복', '32번'], explain: '승수의 비트를 보고 더하구요.', why: 'Q2로 유도', sourceHeadings: ['구현'], outsideNote: false, pitfall: '', hint: '' },
    { num: 'Q2', lead: '느리기 때문입니다.', keywords: ['클럭', '병렬 덧셈기'], explain: '...', why: 'Q3 유도', sourceHeadings: ['이렇게 구현하는 이유'], outsideNote: false, pitfall: '무조건 빠르다 ❌', hint: '' },
    { num: 'Q3', lead: '부호를 따로 처리합니다.', keywords: ['부호 비트', 'XOR'], explain: '...', why: '노트에 없어 보충', sourceHeadings: [], outsideNote: true, pitfall: '', hint: '' },
    { num: 'Q4', lead: '', keywords: [], explain: '', why: '', sourceHeadings: [], outsideNote: false, pitfall: '', hint: 'Q3와 연결' },
  ],
};

describe('생성 결과 → 카드형 md', () => {
  const md = toCardMarkdown({ subject: '컴퓨터구조', title: '3.3 곱셈', note: '' }, plan, backs, '3.3 곱셈.md');
  const deck = buildDeck([{ fileName: '3.3 곱셈 (카드형).md', md }], {
    id: 'g', title: 'g', subject: 's', description: '', builtIn: false,
  });
  const r = makeResolver(deck.cards);

  it('카드 4장(draft 1) 파싱, 필드 보존', () => {
    expect(deck.cards).toHaveLength(4);
    expect(deck.cards.filter((c) => c.draft)).toHaveLength(1);
    const [q1, q2, q3] = deck.cards;
    expect(lead(q1)).toContain('시프트');
    expect(keywords(q1)).toEqual(['시프트', '덧셈 반복', '32번']);
    expect(why(q2)).toContain('Q3');
    expect(sources(q3).some((s) => s.pinned) || why(q3).includes('📌')).toBe(true);
  });

  it('꼬리 링크가 블록 ID로 해석된다', () => {
    const q1 = deck.cards[0];
    expect(tails(q1, r(q1)).map((t) => t.cardId)).toEqual([deck.cards[1].id, deck.cards[2].id]);
  });

  it('흐름·mermaid 추출', () => {
    expect(deck.chapters[0].flow).toContain('시프트-덧셈');
    expect(deck.chapters[0].mermaid).toContain('Q1');
  });
});

describe('planQuestions 번호 정규화', () => {
  it('Q 번호를 순서대로 다시 매기고 tails를 매핑', async () => {
    const fake: LLMProvider = {
      generateText: async () => '',
      generateJSON: async () =>
        ({
          noteType: 'method',
          flow: 'a → b',
          cards: [
            { num: 'Q3', question: 'a', section: 's', sourceHeading: '', tails: ['Q7'], draft: false },
            { num: 'Q7', question: 'b', section: 's', sourceHeading: '', tails: ['Q3', 'Q9'], draft: false },
          ],
        }) as never,
    };
    const p = await planQuestions(fake, { subject: 's', title: 't', note: 'n' });
    expect(p.cards.map((c) => c.num)).toEqual(['Q1', 'Q2']);
    expect(p.cards[0].tails).toEqual(['Q2']);
    expect(p.cards[1].tails).toEqual(['Q1']);
  });
});
