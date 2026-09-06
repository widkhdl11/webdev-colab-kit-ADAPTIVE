---
project: study-mate
status: passed
basis: dd49d36be276
reviewers: [security-reviewer, test-auditor, code-reviewer]
---

# 리뷰 사인오프 — 서버 액션 다섯에 검사를 붙인다 (`study-mate-20260906-5`)

## 누구를 파견했고 왜 셋인가

| 리뷰어 | 판단 |
|---|---|
| `security-reviewer` | 파견 — 인증·권한 표면에 정면으로 닿는다(가드 배치가 바뀌었다). 그래프도 요구한다 |
| `test-auditor` | 파견 — 이 사이클의 산출물이 곧 검사다. 「이걸 지워도 잘못된 구현이 통과하는가」가 이 작업의 판정 기준이다 |
| `code-reviewer` | 파견 — 네 슬라이스의 `api/` 세그먼트를 갈랐다. 도메인 로직의 위치가 바뀐 diff다 |
| `ui-reviewer` | **뺐다** — 새 시각 요소가 없다. 화면 변경은 상수를 `model/` 에서 가져오게 바꾼 것과, 승인된 `FormError` 를 한 자리에 더한 것뿐이다 |

## 이 리뷰에서 가장 크게 드러난 것

### ① 검사를 붙였는데 정작 배포되는 액션은 아무도 안 붙들고 있었다 (code-reviewer · test-auditor, 높음)

조립 함수(`makeApply` 등)를 검사가 직접 부르므로, **액션 파일이 그 조립에 가짜 판독기를
끼우도록 바뀌면 전부 초록불**이었다.

```
const guarded = makeChangeParticipation(async () => ({ id: "0000…" }));
```

이 한 줄이면 비로그인 요청이 남의 스터디 멤버를 강퇴하는데, 유닛·통합·변이 어느 것도
빨간불이 되지 않는다. 「변이 전부 빨간불」은 **본체**에 대한 판정이지 액션 파일에 대한
판정이 아니었다.

액션 파일 넷에 배포되는 이름을 직접 부르는 검사를 붙이고, 그 호출부를 찍는 변이 다섯
(`apply-action-unguarded` 외)을 등록했다.

### ② 내가 등록한 변이 하나의 판정이 거짓이었다 (test-auditor, 높음)

`chat-length-unbounded` 는 `MESSAGE_MAX` 를 `Number.MAX_SAFE_INTEGER` 로 바꾼다. 그러면
검사의 `"가".repeat(MAX + 1)` 이 `RangeError` 를 던져서 빨간불이 난다 — **단언이 상한을
붙들어서가 아니라 문자열을 못 만들어서**다.

2000 → 20000 으로 바꾸는 `chat-length-loosened` 로 교체했고, 같은 이유로 검사 문구에
숫자를 직접 박았다(상수를 import 해서 상대적으로만 보면 상한을 옮겨도 양쪽이 같이 움직인다).

### ③ 가장 위험한 액션의 오류 갈래에 검사가 0건이었다 (test-auditor, 치명)

`change-status.ts` 의 `if (error)` 를 `return { ok: true }` 로 바꿔도 전부 초록불이었다.
이 액션이 받는 오류의 대부분이 **우리가 지은 한국어 문장**(정원 초과·지워진 스터디·끝난
신청을 되돌리기)이라, 삼키면 호스트는 「수락했습니다」를 보고 신청자는 영원히 안 들어온다.

### ④ 폼 하나로 데이터베이스 구조를 읽을 수 있었다 (security-reviewer, 중간)

`insert-study.ts` 만 `error.message` 를 문구에 붙이고 있었다. `recruitUntil=infinity` 를
보내면 `violates check constraint "studies_recruit_until_finite"` 가, 정책이 거부하면
`violates row-level security policy for table "studies"` 가 화면에 뜬다.

**`dbErrorMessage` 로 바꾸는 것만으로는 절반만 닫혔다** — 검사 제약 위반은 트리거의 한국어
문장과 같은 코드(`23514`)로 오고, `db-error.ts` 가 그 코드를 통째로 통과시키고 있었다.
둘을 가르는 값이 코드에 없으므로 문장 모양(`violates check constraint`)으로 갈랐다.

### ⑤ 일정 저장이 실패하면 같은 스터디가 하나 더 생길 수 있었다 (code-reviewer, 높음)

스터디는 만들어졌는데 `ok: false` 로 id 를 버리고 개설 폼에 남겼다. 가장 자연스러운 다음
행동이 다시 제출이고, 스터디에는 유일 제약이 없다. 게다가 문구가 **없는 화면**(스터디 수정)을
가리키고 있었다.

성공으로 돌려주고 `?slots=failed` 로 그 스터디로 보낸다. 그리고 이 갈래로 가는 가장 흔한
입력(끝 시각이 앞섬·같은 요일 중복)은 `model/slots.ts` 가 데이터베이스에 가기 전에 거른다.

### ⑥ 화면이 서버의 숫자를 다시 적고 있었다 (code-reviewer, 중간)

`maxLength={2000}` · `min={2} max={100}` · `MODES` · `Transition` union 넷이 손으로 복사돼
있었다. **복사할 수밖에 없던 이유는 배치다** — 그 값들이 서버 전용 모듈 안에 있어서
클라이언트 컴포넌트가 값으로 import 할 수 없었다. `model/` 로 옮겨 양쪽이 같은 자리를 본다.

`vocabulary.test.ts` 가 어휘 두 벌을 데이터베이스와 대조하는데 **쓰기를 실제로 막는 목록은
그 대조 밖**이었다. `MEETING_MODES`·`ALLOWED` 를 대조 대상에 넣었다.

## 판정의 근거

| | |
|---|---|
| 유닛 | 237건 통과 (사이클 시작 시 164건) |
| 통합 | vocabulary 4건 포함, 기준선 초록 |
| 변이 | **86/86 빨간불** · 빠져나간 것 0 · 엉뚱한 빨간불 0 · 판정 불가 0 (새 유닛 변이 28건 포함) |
| tsc · 프로덕션 빌드 | 통과 |

## 반영하지 않고 백로그로 넘긴 것

`makeCreatePost`·`makeChangePassword` 의 옛 시그니처 · `study_sessions` 제약 둘의 통합 검사 ·
`db.테이블` 단언의 의도 명시 · `db-error.ts` 의 `23514` 판정을 제약 이름 표로 바꾸는 것.
넷 다 `docs/BACKLOG.md` 에 되살릴 조건과 함께 있다.
