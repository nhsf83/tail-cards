import { describe, expect, it } from 'vitest';
import { GRADES, initState, mastery, previewIntervals, review } from '../src/core/srs.ts';
import { matchKeywords } from '../src/core/keyword-match.ts';

describe('srs', () => {
  it('새 카드 → 좋음 평가 시 미래 due, reps 증가', () => {
    const now = new Date('2026-11-07T10:00:00Z');
    const s = initState('c1', 'd1', now);
    expect(mastery(s)).toBe('new');
    const next = review(s, GRADES[2].grade, now, '답변');
    expect(next.reps).toBe(1);
    expect(next.due.getTime()).toBeGreaterThan(now.getTime());
    expect(next.lastAnswer).toBe('답변');
    expect(Object.keys(previewIntervals(s, now))).toHaveLength(4);
  });
});

describe('keyword match', () => {
  it('용어 단위 부분일치', () => {
    const [h] = matchKeywords('버블 정렬은 인접한 원소를 swap 하고 안정적입니다', ['버블: 인접 swap, 안정']);
    expect(h.hit).toBe(true);
    expect(h.ratio).toBe(1);
  });
  it('빈 답변은 전부 미통과', () => {
    expect(matchKeywords('', ['재해싱 시 재사용']).every((h) => !h.hit)).toBe(true);
  });
  it('일부만 맞으면 비율', () => {
    const [h] = matchKeywords('해시 코드는 테이블 크기와 무관합니다', ['해시 코드는 N과 무관']);
    expect(h.ratio).toBeGreaterThan(0);
  });
});
