# Tail Cards — 꼬리질문 면접 카드

전공 면접을 **면접관의 꼬리질문 체인**으로 연습하는 Anki식 카드 학습 웹앱입니다.
카드는 [CS-Tutor](#cs-tutor-카드형-포맷)의 `card-interview` 포맷을 그대로 씁니다: 질문 앞면 / 두괄식·키워드·풀어 말하기·**왜 이렇게 답하나**·함정 뒷면 / `꼬리 →` 연결.

- **기본 덱**: 자료구조(Data Structures & Algorithms in Python) 36개 챕터, 227장
- **학습**: 앞면 질문 → 🎙️ 말로(한국어 음성 인식) 또는 타이핑으로 30초 답변 → 뒷면에서 **키워드 자동 체크** → 자기 평가(FSRS 간격 반복)
- **체인 모드**: 한 카드를 답하면 면접관이 이어 물을 꼬리질문을 골라 계속 파고들기. 챕터 연결도(mermaid)에서 숙련도 색 확인, 노드를 눌러 그 질문부터 시작
- **내 카드 만들기 (AI, BYOK)**: 다른 과목·교재 노트(md/텍스트)를 넣으면 CS-Tutor 로직으로 카드 생성
  노트 → (교재 원문이면 7단계/방법론형 개념 노트로 정리) → 꼬리질문 설계 → 카드 뒷면 작성. 단계마다 확인·수정 가능
- **Obsidian 호환**: 카드형 `.md` 가져오기/내보내기 (왕복해도 원문과 바이트 단위로 동일)
- **서버 없음**: 정적 사이트(GitHub Pages) + PWA(홈 화면 설치, 오프라인 학습). 학습 기록은 브라우저 IndexedDB에만 저장되고, 설정에서 JSON으로 백업/복원

## 사용

```bash
npm install
npm run dev
```

- 음성 답변은 Web Speech API를 쓰므로 Chrome·Edge·Safari에서 동작합니다(Firefox는 타이핑만).
- AI 카드 생성은 **본인의 Anthropic API 키**가 필요합니다. 설정에 넣으면 이 브라우저에만 저장되고, 요청은 브라우저에서 Anthropic API로 직접 갑니다(중간 서버 없음). 공용 PC에서는 저장하지 마세요.
  기본 모델은 Claude Opus 5.5, 설정에서 Sonnet 5.5 / Haiku 5.5로 바꿀 수 있습니다. Opus·Sonnet은 안전 분류기 거절 시 서버 측 fallback(`fallbacks: "default"`)이 켜져 있습니다.

## AI 답안 피드백

1. 설정에서 본인의 Anthropic API 키와 사용 가능한 모델을 선택합니다.
2. 학습 또는 꼬리질문 체인에서 답변을 입력하고 **뒷면 보기**를 누릅니다.
3. **AI 피드백 받기**를 누르면 맞은 부분, 보완할 부분, 쉬운 설명과 예시, 짧은 모범 답안과 이해 확인 질문을 보여줍니다.

평가는 키워드 일치율 대신 현재 카드의 기준 설명과 답안의 의미를 비교합니다. 카드에 기준 설명이 없으면 판단을 보류합니다. 교재 원문이나 링크 대상 문서를 자동으로 읽는 기능은 없으며, 설명의 정확성은 카드 내용과 함께 확인해야 합니다.

버튼을 누를 때 현재 답안과 카드의 질문·기준 설명이 Anthropic에 전송되고 API 요금이 발생합니다. 별도의 공용 키를 코드에 넣지 않으며 기존 BYOK 설정을 사용합니다. 피드백은 화면에만 유지하고 DB에 추가 저장하지 않습니다. 요청 취소·재시도가 가능하며 카드 이동 시 진행 중인 요청을 취소합니다. 기존 자기 평가와 FSRS 복습 일정은 그대로 유지합니다.

## 배포 (GitHub Pages)

1. GitHub에 레포를 만들고 push
2. Settings → Pages → Source: **GitHub Actions**
3. `main`에 push하면 `.github/workflows/deploy.yml`이 테스트·빌드 후 `https://<user>.github.io/<repo>/`에 배포

## 기본 덱 갱신 (CS-Tutor에서)

```bash
node scripts/import-cs-tutor.ts "<CS_Tutor>/knowledge_base/tail_interview"
```

`tail_interview/<subject>/*.md` 폴더마다 `public/decks/<subject>.json` 덱이 만들어집니다(`_`로 시작하는 파일 제외). 앱은 다음 실행 때 바뀐 덱을 자동으로 갱신하고, 학습 기록은 카드 ID(`^xxx-qNN` 블록 ID)로 유지됩니다.

## CS-Tutor 카드형 포맷

```markdown
## 1. 섹션

### Q1. 맵(Map)이 무엇인지 설명해 주세요.
> [!answer]- 뒷면
> - **두괄식**: 맵은 고유한 키를 값에 연결하는 **추상 자료형**입니다.
> - **키워드**: `고유 키` / `값은 중복 가능` / `ADT → 해시 테이블 or 균형 BST로 구현`
> - **풀어 말하기**: …
> - **왜 이렇게 답하나**: …
>   → [[concepts/data_structure/10.1_10.2 맵과 해시 테이블#맵(ADT)]]
> - **함정**: …
> - **꼬리 →** [[#^maphash-q02|Q2]], [[#^maphash-q13|Q13]]

^maphash-q01
```

- `## 0. 흐름 한 줄`의 코드블록 = 흐름, ` ```mermaid ` = 연결도
- `## ✍️ 직접 채울 카드` 아래 카드는 학습 대상에서 빠지고 챕터 화면에 힌트와 함께 표시
- `→ 📌 [[…]]` = 노트(concept)에 없어 보조 자료로 근거를 댄 카드

## 구조

```
src/core/   model · parse-card-md · render-card-md · srs(ts-fsrs) · keyword-match
src/db/     Dexie(IndexedDB) 저장소, 기본 덱 시드
src/llm/    provider 인터페이스 · Claude 구현 · 프롬프트 · 생성 파이프라인
src/ui/     Home · Study · ChapterView · Generate · Settings
scripts/    import-cs-tutor.ts
test/       파서 왕복(36개 파일)·SRS·키워드·생성 결과 테스트
```

```bash
npm test         # vitest
npm run build    # 타입 체크 + 빌드
```
