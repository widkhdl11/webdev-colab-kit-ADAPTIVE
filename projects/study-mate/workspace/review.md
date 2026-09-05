---
project: study-mate
status: passed
basis: 8da8c7c47b6b
reviewers: [security-reviewer, code-reviewer, test-auditor]
---

# 리뷰 사인오프 — 세션 가드 (`study-mate-20260904-2`)

## 누구를 파견했고 누구를 왜 뺐나

| 리뷰어 | 판단 |
|---|---|
| `security-reviewer` | 파견 — 인증·세션 표면을 새로 만든 diff 다 |
| `code-reviewer` | 파견 — entities 슬라이스와 배선을 새로 만들었다 |
| `test-auditor` | 파견 — 승인된 스펙의 INV 테스트를 새로 썼다 |
| `ui-reviewer` | **뺐다** — 이번 diff 에 화면이 0장이다. 승인된 design-rules 에서 벗어난 시각 변경이 없어 읽을 것이 없다 |

`test-auditor` 는 처음에 파견하지 못했다. `.claude/agents/test-auditor.md` 의 frontmatter 가
깨져 있어 에이전트가 등록되지 않았고(오류 표시 없이 목록에서 빠져 있었다), 고친 뒤 세션 중에
등록되어 파견했다. 경위는 하네스 백로그에 있다.

## 리뷰가 잡은 것 — 실제로 뚫리던 구멍 하나

`config.matcher` 가 확장자로 경로를 걸러 내고 있었는데, 정규식의 `.` 이 `/` 도 먹어서
**경로 어디에 있든 그 확장자로 끝나면 미들웨어가 통째로 건너뛰어졌다.** `/studies/[id]` 화면을
만드는 순간 `/studies/1.png` 로 비로그인이 보호 화면에 도달했을 것이다. 접두사·완전일치 제외로
바꿨고, 실제 요청으로 닫힌 것을 확인했다.

두 번째로 큰 것은 뚫리는 구멍이 아니라 **검증의 구멍**이었다. 미들웨어 본체에 테스트가
하나도 없어서, INV-A1 을 통째로 무력화하는 변이를 넣어도 25개가 전부 통과했다.

## 고친 것

| 지적한 리뷰어 | 무엇 |
|---|---|
| security | matcher 가 확장자로 걸러 보호 경로를 건너뜀 → 접두사·완전일치로만 제외 |
| code | 미들웨어 본체에 테스트 0개 → `handleRequest` 분리 + `middleware.test.ts` |
| test-auditor | 설정 없을 때 fail-open 으로 뒤집어도 초록불 → 설정 없는 소스로 판정을 붙듦 |
| test-auditor | 프레임워크가 부르는 `middleware` 진입점이 한 번도 안 돌았음 → 진입점 테스트 |
| test-auditor | `middleware-client` 에 테스트 0개 → 쿠키 다리를 `createCookieBridge` 로 분리 + 테스트 |
| test-auditor | 통과 경로의 쿠키 이관·쿼리 제거·목적지 오리진이 안 눌림 → 전부 단언 |
| security | 307 이 POST 본문을 로그인 경로로 재전송 → GET 이 아니면 303 |
| code | `sub: ""` 가드를 아무도 안 붙듦 → 빈 문자열 케이스 |
| code | 판독기가 던지면 "실패 반환" 계약이 깨짐 → 가드 안에서 실패로 변환 |
| code | "getSession 을 안 부른다"가 한 케이스에만 → `afterEach` 로 전 케이스 |
| code | `ActionResult` 가 세션 슬라이스에 있음 → `shared/lib/` 로 이동 |
| code | 배럴이 URL 상수를 공개 → 라우팅 상수 제거 |
| code | `/Studies/123`·`//studies//123` 이 그냥 통과 → 비교 전에 정리(닫는 방향) |
| code | 이름이 동작과 어긋남 → `requireSession` · `SIGNED_OUT_ONLY_PATHS` |
| security·code | 설정 없을 때 증상이 조용함 → 어느 변수가 비었는지 한 번 경고 |
| code | `getClaims` 검증 방식을 한 갈래로 단정한 주석 → 두 갈래 + 진단 로그 |

리뷰 반영 중에 **타입 검사가 하나를 더 잡았다.** `setAll` 의 두 번째 인자는 "이 응답을
캐시하지 마라"는 헤더인데 구현이 그걸 버리고 있었다. 인증 쿠키가 실린 응답이 CDN 에 저장되면
한 사용자의 세션 토큰이 다른 사용자에게 나갈 수 있다. 헤더를 옮기고 테스트로 붙들었다.

## 실행 근거

- `npm test` → **64 passed / 5 files**
- `npm run typecheck` → 오류 0
- `node gates/run-gates.mjs` → 통과 (77개 파일, tsc 3/3 · test 3/3)
- **변이 검증**: 아래를 하나씩 심어 전부 빨간불을 확인하고 복원했다.
  INV-A1 리다이렉트 분기 삭제 / 쿠키 이관 삭제 / 옛 matcher 복원 / 303 분기 삭제 /
  `sub` 빈 문자열 가드 삭제 / 판독기 예외 try-catch 삭제 / 설정 없을 때 fail-open /
  `middleware` 진입점 우회 / 통과 경로 응답 바꿔치기 / 쿼리 제거 삭제 /
  쿠키 다리 `setAll` 삭제 / `response()` 를 새 응답으로 / 캐시 금지 헤더 이관 삭제
- **실제 요청** (`npx next dev -p 3100`, 환경변수 없는 상태):

  | 요청 | 결과 |
  |---|---|
  | `GET /` | 200 |
  | `GET /studies/123` | 307 → `/login` |
  | `GET /studies/1.png` | 307 → `/login` (고치기 전에는 미들웨어가 안 돌았다) |
  | `GET /Studies/123` | 307 → `/login` |
  | `GET /studies/123?tab=members&token=abc` | 307 → `/login` (쿼리가 따라가지 않는다) |
  | `GET /posts` | 404 — 가드를 통과했고 화면이 아직 없다 |
  | `GET /login` | 404 — 비로그인은 로그인 화면에 갈 수 있다 |
  | `POST /studies/123` | 303 → `/login` |

## 통과와 함께 열어 두는 것

**사인오프는 이 diff 에 대한 것이다.** 아래 둘은 이 코드의 결함이 아니라 **스펙 문장에 대한
지적**이고, 사용자 결정 대기다. 결정에 따라 스펙이 바뀌면 `spec` 이 rework 로 내려가고
이 사인오프도 basis 불일치로 낡는다.

- 보호 경로 목록이 제품의 로그인 전용 화면을 다 안 덮는다(모집글 수정·알림·비밀번호 변경).
  security-reviewer 와 code-reviewer 가 독립적으로 같은 지적을 했다.
- 라우트 핸들러(`app/api/**`)가 INV-A1(페이지 경로)과 INV-A4(서버 액션) 사이에 빈다.

그리고 **INV-A4 는 아직 강제되지 않는다.** 가드는 만들어졌지만 서버 액션이 하나도 없고,
액션이 가드를 안 거치는 것을 잡는 장치가 없다. 세 리뷰어가 모두 지적했다 — 액션 첫 파일이
들어올 때 반드시 결정해야 한다(하네스 백로그에 있다).
