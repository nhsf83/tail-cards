# CS-Tutor 로직 → 프롬프트 대응표

| CS-Tutor 원본 | 이 앱 |
|---|---|
| `AGENTS.md` §9 7단계 개념 요약 (배경-정의-구현-이유-활용-장점-한계) | `conceptPrompt` A유형 |
| `card-interview` §3 방법론형 질문 (문제설정·핵심아이디어·정당성·복잡도·비교·경계조건) | `conceptPrompt` B유형, `questionPlanPrompt` 규칙 2 |
| `card-interview` §3 "면접관이 파고드는 순서", "예상 꼬리질문/?" 우선 카드화, 미정리 → ✍️ | `questionPlanPrompt` 규칙 1·4 |
| `card-interview` §5 카드 1장 = 질문 1개 = 30초 | `questionPlanPrompt` 규칙 3, `cardBackPrompt` explain |
| `card-interview` §5 뒷면 필수 항목 (두괄식·키워드·풀어 말하기·왜 이렇게 답하나·함정·꼬리) | `cardBackPrompt` 필드 규칙, `BacksSchema` |
| §2 근거 우선순위 (concept → skeleton 📌) | 입력 노트 = concept. 노트에 없으면 `outsideNote` → `📌 (노트 미정리)` + 파일 끝 "노트 보강 후보" |
| 예시본 `10.1_10.2 맵과 해시 테이블 (카드형).md` | `EXAMPLE_CARDS` few-shot (Q1, Q3) |
| 템플릿 mermaid · `^id` 블록 ID · `[[#^id|Qn]]` 꼬리 링크 | `toCardMarkdown` |

과목 의존 부분(자료구조 전용 경로, `knowledge_base/...`)은 제거하고 과목·단원을 입력값으로 받는다.
