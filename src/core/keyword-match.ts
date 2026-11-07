// 음성/타이핑 답변에 카드 키워드가 들어갔는지 대략 판정.
// 키워드는 "버블: 인접 swap, 안정" 처럼 여러 용어가 섞여 있으므로 용어 단위로 쪼개 부분일치 비율을 본다.

const STOP = new Set(['vs', 'or', 'and', '또는', '및', '등', '→', '=']);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[`*_~"'“”‘’()[\]{}<>]/g, '')
    .replace(/\s+/g, '');
}

export function keywordTerms(keyword: string): string[] {
  return keyword
    .split(/[:,/→=·+|()\s]+|\bvs\b/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t.toLowerCase()))
    .filter((t) => !/^[\d.]+$/.test(t));
}

export interface KeywordHit {
  keyword: string;
  terms: { term: string; hit: boolean }[];
  ratio: number;
  /** 절반 이상 용어가 들어가면 통과 */
  hit: boolean;
}

export function matchKeywords(answer: string, keywords: string[]): KeywordHit[] {
  const a = normalize(answer);
  return keywords.map((keyword) => {
    const ts = keywordTerms(keyword);
    const terms = ts.map((term) => ({ term, hit: a.length > 0 && a.includes(normalize(term)) }));
    const ratio = terms.length ? terms.filter((t) => t.hit).length / terms.length : 0;
    const whole = a.length > 0 && a.includes(normalize(keyword));
    return { keyword, terms, ratio: whole ? 1 : ratio, hit: whole || ratio >= 0.5 };
  });
}
