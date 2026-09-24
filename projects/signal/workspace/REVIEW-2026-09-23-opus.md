# 리뷰 지적 — 요약 단계 Opus 5.5 교체 (커밋 d11430a, push 안 함)

랩업 뒤에 도착한 것을 적어 둔다. **2026-09-24 에 고쳤다** — 처리 결과는 맨 아래.

## 보안 리뷰 (security-reviewer) — high/medium 없음

**low**
1. **거부(refusal)를 명시적으로 거르지 않는다** — `src/features/ingestion/api/ports.ts:528` 이 `stop_reason === "max_tokens"` 만 거른다.
   거부된 응답도 JSON 파싱까지 가고, 거의 다 빈 요약이 되지만 보장은 아니다(부분 텍스트가 우연히 완결 객체면 통과).
   고칠 것: `stop_reason !== "end_turn"` 이면 빈 값 — 통과시킬 값만 적는다. server-only 파일이라 판정을 순수 함수로 빼서 테스트로 고정.
   알아둘 동작: 거부도 실패 횟수로 센다 → bio 분류기가 오탐하는 바이오·제약 글은 세 번째에 요약을 포기한다(오탐 여부는 미확인).
2. **시간 초과로 끝난 호출은 하루 요금 상한에 안 더해진다** — `run-ingest.ts:644-655`. 게다가 `new Anthropic({ apiKey })` 에 `maxRetries` 가 없어
   SDK 기본 재시도 2회 → 한 건이 최악 30초×3 이다(INV-CB9 「한 건 최악 30초」와 어긋남). 2600토큰/30초 근거인 「초당 95토큰」은 sonnet 실측이고 opus 는 안 쟀다.
   고칠 것: enrich 호출에 `maxRetries: 0` 명시(또는 재시도를 최악 시간에 넣기). 첫 실행 리포트에서 요약 실패 중 시간 초과 비율 확인.

**참고**
- `budgets.ts:311-314` 상한 $10 근거(평범한 날 $1.71 · 요약 $0.57)는 sonnet 단가 기준 — 판정 영향 없음, 주석만 낡음.
- `budgets.ts:341-342` 「max_tokens 1,400 대 300」은 지금 값(2600/1200)과 다르다.

**문제 없음 확인**: 생각 블록은 저장·로그로 안 샌다(텍스트 블록만 모음) · 하루 상한은 새 단가($4/$20)로 계산되고 생각 토큰도 포함 ·
과거 실행은 그때 모델로 계산돼 다시 매겨지지 않는다 · 모르는 모델은 여전히 비싸게 잡는다.

## 코드 리뷰 (code-reviewer)

요금 계산은 문제 없음. 위험은 **시간** 쪽이다 — 근거가 sonnet 실측이고 opus 는 안 쟀다("틀렸다"가 아니라 "확인 안 됨").

**high**
1. **한 건이 30초가 아니라 최악 90초 넘게** — 보안 low 2 와 같은 자리. `ports.ts:463,495` 클라이언트에 `maxRetries` 없음 → SDK 기본 2회,
   시간 초과도 재시도(`node_modules/@anthropic-ai/sdk/client.js:111`, 549-557). `WORST_CASE_MS.enrich = 30_000`(budgets.ts:359·365-371)의 전제가 깨져
   남은 31초에 시작한 호출이 Vercel 300초를 넘길 수 있다. 전부터 있던 결함이지만 opus 에서 30초 초과가 잦아지면 터진다.
   고칠 것: 요약 호출 옵션 `{ timeout: SUMMARY_TIMEOUT_MS, maxRetries: 0 }` — 다른 세 단계도 같다.

**medium**
2. **2600토큰·30초 근거(초당 95토큰)가 sonnet 실측** — `ports.ts:481-486`. opus 가 초당 87토큰보다 느리면 못 끝난다.
   시간 초과는 실패 횟수를 안 올리고 요금 상한에도 안 잡혀 **늘 시간 초과 나는 글은 3회 포기에 안 걸린다**.
   고칠 것: opus 1회 경과 시간을 재서 초당 토큰 확인 → 주석·상한·`ENRICH_TIMEOUT_MS`·`budgets.test.ts` 조정. (시간 초과도 세는지 같이 판단)
3. **제목만 번역하는 호출(max_tokens 500)이 생각을 끌 수 없다** — `ports.ts:486`, `run-ingest.ts:609-617,635`.
   생각이 500 을 다 먹으면 빈 값 → 제목 번역 실패. 3회 포기는 요약에만 걸려 같은 글이 매 주기 다시 잘린다(단가 두 배).
   고칠 것: 제목만 호출을 opus 로 1회 재서 생각 토큰 확인, 모자라면 500 을 올리고 budgets.ts 로 내려 테스트로 고정.

**low**
- 낡은 주석: `budgets.ts:90`(월 71,000→54,000원 sonnet 기준) · `budgets.ts:311-314`(평범한 날 약 $2.3 로 → 상한은 네 배 남짓) ·
  `budgets.ts:341-342` · `widgets/ingest-dashboard/ui/ingest-dashboard.tsx:23` · `entities/ingest-run/lib/estimate-cost.ts:4`.
- `scripts/count-prompt-tokens.ts:35,38-41,45` 가 sonnet 단가·상한 1400 그대로 → 요약 요금을 절반으로 보여 준다. `ENRICH_MODEL`·`ratesForModel` 을 쓰게.

**문제 없음 확인**: 실행 기록·화면·하루 상한이 같은 `stageCostUsd` 로 새 단가 계산 · 옛 실행은 소급 안 됨 · 「모르는 모델」 규칙을 타는 실제 계산 없음 ·
SDK 가 `output_config.effort` 지원 · prefill·tool_choice 없음 · effort medium 은 3회 포기 규칙과 맞다(실측 1053 이면 2600 대비 2.5배 여유).

## 처리 (2026-09-24)

실측: `npm run probe:enrich` (opus-5-5 · medium · 4건, 약 $0.16) —
요약 초당 94~104토큰(평균 99) · 출력 703~1124토큰 · 최장 11.7초 · 전부 end_turn /
제목만 94·141·179·**405** 토큰(상한 500) · 초당 45~71.

| 지적 | 처리 |
|---|---|
| 코드 high 1 · 보안 low 2 (재시도로 한 건 최악 90초) | 클라이언트에 `maxRetries: MODEL_MAX_RETRIES(0)`. 최악 시간을 `타임아웃 × (재시도+1)` 로 계산하게 바꿔 둘이 못 갈리게 함 |
| 보안 low 1 (거부 응답) | `enrichStopAccepted` — `end_turn` 만 읽는다. 순수 함수 + 테스트 |
| 코드 medium 2 (2600/30초 근거가 sonnet) | 실측으로 확인 — opus 도 초당 99. 2600 그대로, 근거를 실측으로 교체하고 테스트로 고정 |
| 코드 medium 3 (제목만 500) | 실측 405 → **1000** 으로 올림. 값은 budgets.ts 로 내려 테스트로 고정 |
| 보안 low 2 뒷부분 (시간 초과는 요금 상한에 안 잡힘) | 그대로 둔다. 재시도를 끈 뒤 한 건이 버리는 몫은 최대 출력 2600토큰(약 $0.05)이다 |
| 코드 medium 2 뒷부분 (시간 초과도 실패로 셀지) | 세지 않는다. 실측 최장 11.7초로 30초에 여유가 크고, 센다면 API가 잠깐 느린 날 멀쩡한 글을 포기하게 된다 |
| low 낡은 주석 · count-prompt-tokens 단가 | 고침. 스크립트는 `ENRICH_MODEL`·`ratesForModel`·`ENRICH_MAX_TOKENS` 를 쓴다 |

검사: 유닛 1111 green · tsc 통과 · 강제 장치를 하나씩 풀면 잡힌다(거부 거르기 · 재시도 0 · 제목 상한).
최악 시간 계산의 `× (재시도 + 1)` 은 재시도가 0 인 동안 지워도 값이 같아 **따로 잡히지 않는다** —
그것을 붙드는 것은 `MODEL_MAX_RETRIES === 0` 고정이다(재시도를 올리면 두 검사가 같이 깨진다, 확인함).
유닛이 못 보는 곳: `api/ports.ts`(server-only)가 실제로 `MODEL_MAX_RETRIES` 를 클라이언트에 넘기는지 — 코드로만 확인.
