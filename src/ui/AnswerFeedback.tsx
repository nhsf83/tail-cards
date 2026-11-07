import { useEffect, useRef, useState } from 'react';
import type { Card } from '../core/model.ts';
import { ClaudeProvider } from '../llm/claude.ts';
import { evaluateAnswer, MAX_ANSWER_LENGTH, type AnswerFeedback as Feedback } from '../llm/evaluate.ts';
import { loadLlmSettings } from '../llm/settings.ts';
import { href } from './route.ts';

const LABELS = { understood: '핵심을 이해했어요', partial: '조금 더 보완해 봐요', review: '핵심 개념을 다시 살펴봐요', insufficient: '판단 보류' };

export function AnswerFeedback({ card, answer }: { card: Card; answer: string }) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);

  const cancel = () => {
    request.current?.abort();
    request.current = null;
    setBusy(false);
  };

  async function evaluate() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const settings = await loadLlmSettings();
      if (controller.signal.aborted) return;
      const result = await evaluateAnswer(new ClaudeProvider(settings), card, answer, controller.signal);
      if (request.current === controller) setFeedback(result);
    } catch {
      // API 오류 본문에는 입력이나 키가 포함될 수 있어 그대로 화면에 노출하지 않는다.
      if (!controller.signal.aborted) setError('피드백을 받지 못했습니다. 설정의 API 키·모델과 네트워크를 확인하고 다시 시도해 주세요.');
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  const invalid = !answer.trim() || answer.trim().length > MAX_ANSWER_LENGTH;
  return (
    <section className="ai-feedback" aria-label="AI 답안 피드백" aria-busy={busy}>
      <h2>AI와 개념 이해하기</h2>
      <p className="muted small">현재 답변과 카드의 질문·기준 설명을 Anthropic에 전송합니다. API 사용 요금이 발생하며, 키는 기존 설정을 사용합니다. <a href={href(['settings'])}>API 설정</a></p>
      {!feedback && !busy && <button className="btn primary" disabled={invalid} onClick={() => void evaluate()}>{error ? 'AI 피드백 다시 받기' : 'AI 피드백 받기'}</button>}
      {!answer.trim() && <p className="muted small">답변을 입력한 카드에서 피드백을 받을 수 있습니다.</p>}
      {answer.trim().length > MAX_ANSWER_LENGTH && <p className="error small">답변은 {MAX_ANSWER_LENGTH}자 이내로 입력해 주세요.</p>}
      {busy && <div className="row"><p role="status">답변을 살펴보고 쉬운 설명을 준비하고 있어요…</p><button className="btn" onClick={cancel}>취소</button></div>}
      {error && <p className="error" role="alert">{error}</p>}
      {feedback && <div className="stack" aria-live="polite">
        <p><strong>{LABELS[feedback.verdict]}</strong> — {feedback.summary}</p>
        {feedback.strengths.length > 0 && <div><h3>잘 이해한 부분</h3><ul>{feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
        {feedback.improvements.length > 0 && <div><h3>보완할 부분</h3><ul>{feedback.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
        {feedback.easyExplanation && <div><h3>쉽게 풀어 설명하면</h3><p>{feedback.easyExplanation}</p></div>}
        {feedback.example && <div className="why"><h3>예시로 이해하기</h3><p>{feedback.example}</p></div>}
        {feedback.modelAnswer && <div><h3>이렇게 답해 볼 수 있어요</h3><p>{feedback.modelAnswer}</p></div>}
        {feedback.checkQuestion && <div><h3>이해 확인 질문</h3><p>{feedback.checkQuestion}</p></div>}
        <p className="muted small">{feedback.limitation} AI 설명은 틀릴 수 있으니 카드의 기준 설명과 함께 확인하세요. 복습 평가는 직접 선택해 주세요.</p>
      </div>}
    </section>
  );
}
