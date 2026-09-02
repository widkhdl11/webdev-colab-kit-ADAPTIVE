# 한 요청이 실제로 어떻게 굴러가는가

그림 일곱 장은 각각 한 층씩만 보여준다. 이 문서는 **요청 하나를 끝까지 따라가면서** 그 층들이
언제 서로를 부르는지 보여준다. 같은 프로젝트(signal)에서 요청 둘을 돌려 본다 — 하나는 1턴에 끝나고,
하나는 8턴이 걸린다. **둘의 차이가 이 하네스의 전부다.**

아래 상태 JSON과 명령 출력은 `graph.mjs` · `gates/graph-stop.mjs` · `gates/propagate.mjs` ·
`gates/run-gates.mjs` 를 읽고 그 규칙대로 적은 것이다. 출발 상태와 브리핑은 2026-08-30 세션의 실제 값이다.

> **`projects/signal/` 은 2026-08-31 에 레포에서 지웠다** (하네스로 처음부터 다시 만들어 보려고 —
> 지금 자리는 `projects/signal2/`). 아래의 경로 · 해시 · 파일명은 전부 **지워지기 전 signal 의 값**이고,
> 지금 디스크에서는 찾을 수 없다. 그대로 두는 이유는 이 문서가 하네스 설명이 아니라 **실제로 돌아간
> 세션 하나의 기록**이기 때문이다 — 이름만 바꾸면 해시와 경로가 아무것도 안 가리키는 거짓이 된다.
> 원본을 꺼내려면 `git show ccc8edc:projects/signal/workspace/HANDOFF.md` (signal 이 마지막으로 남아 있던 커밋).

---

## 출발점 — 그때 signal 의 상태

`projects/signal/workspace/HANDOFF.md` 에 이렇게 들어 있었다.

```
프론티어(지금 작업할 노드, 파생값): 없음 — 전부 clean
n/a(이번 작업엔 해당 없음): deploy(signal 배포는 다른 에이전트가 맡는다)
```

| 노드 | 상태 | 해시 |
|---|---|---|
| product | clean | `63a5444cbddd` |
| spec | clean | `16c8cc594137` |
| design | clean | (집계 노드, 해시 없음) |
| design/page-designer | clean | `f91657dbba4c` |
| design/schema-designer | clean | `fa51d24cbac2` |
| implement | clean | `d43269656730` |
| qa | clean | `e31c6847e02c` |
| review | clean | `fb9b0627ca33` |
| deploy | **n/a** | — |

해시는 그 노드가 만드는 파일들의 내용을 이어붙여 sha256 한 값의 앞 12자다.
예를 들어 `implement` 의 `d43269656730` 은 `projects/signal/src/**` 전부의 지문이다.
**주석 한 줄만 바꿔도 이 값이 달라진다.**

---

## 시나리오 A — "카드에 '어제' 대신 '1일 전'으로 써줘"

### 턴 1 (그리고 유일한 턴)

**내가 하는 판단.** 무엇을 건드리나? 화면에 나가는 글자 하나다. 데이터 구조도, 계산 규칙도,
로그인·결제도 아니다. 되돌리는 비용이 거의 0이다.
→ 붙는 절차: **자동 게이트만.** 시안도 스펙도 리뷰어도 없다.

**한 문단 선언.** "`article-card.tsx` 의 상대시각 문구를 바꿉니다. 건드리는 건 글자뿐이라
시안·스펙·리뷰어는 안 붙이고 자동 게이트만 돕니다." → 동의.

**편집.** `Edit` 도구가 파일을 고친다. 그 순간 훅 셋이 먼저 돈다.

```
PreToolUse  → protect-files   (gates/·graph.mjs·.claude/hooks 인가? 아니다 → 통과)
PreToolUse  → protect-secrets (.env 인가? 아니다 → 통과)
편집 적용
PostToolUse → run-gates.mjs --quick
              게이트 통과 (138개 파일, 2개 프로젝트, quick — tsc·test 는 안 돌림)
```

**턴을 끝낸다.** Stop 훅이 `graph-stop.mjs` 를 부르고, 이게 여섯 단계를 순서대로 한다.

1. `run-gates.mjs` 를 **전체 모드로** 다시 돌린다 (이번엔 tsc·테스트까지)
2. 노드마다 산출물 해시를 다시 계산해 저장된 값과 비교 → `implement` 만 달라졌다
3. 달라진 노드를 dirty 로 찍고 **하류 전부**를 dirty 로 찍는다 → `qa`·`review`·`deploy` 도 dirty
4. 게이트 에러가 0건인 dirty 노드를 다시 clean 으로 내린다 → `implement` clean, `qa` clean
5. `HANDOFF.md` 를 다시 쓴다
6. 남은 게이트 에러가 있으면 턴을 막는다 → 없으니 그냥 끝

**결과.** 화면에 이렇게 찍힌다.

```
● HANDOFF 갱신 (projects/signal/workspace/HANDOFF.md). 프론티어: review
  ↳ review 사인오프 대기 — 막힌 이유: basis 불일치 (기록 d43269656730 ≠ 현재 8a1f...)
     workspace/review.md 에 'status: passed' + 'basis: 8a1f...' + 'reviewers: [...]' 기록 시 clean
```

**여기서 두 가지가 눈에 띈다.**

- 글자 하나 고쳤는데 `review` 가 다시 dirty 가 됐다. 리뷰 대상 코드가 바뀌었으니 지난 리뷰는
  더 이상 그 코드에 대한 리뷰가 아니다. 이건 오작동이 아니라 설계다.
- `deploy` 의 n/a 가 **사라졌다.** 상류가 흔들리면 "이번 작업엔 해당 없다"는 판단의 전제가
  깨진 것이라, 기계가 사유째로 지운다 (`propagate.mjs` 의 `markDirty` 가 `reason` 을 안 물려준다).
  다시 건너뛰려면 `--na deploy "<사유>"` 를 다시 찍어야 한다.

리뷰는 기능이 완성됐을 때 한 번 몰아서 하므로, 글자 하나 때문에 지금 리뷰어를 부르지는 않는다.
`review` 는 dirty 인 채로 남아 프론티어에 계속 보인다 — **밀린 리뷰가 눈에 보이는 상태**로 남는 것이다.

---

## 시나리오 B — "피드 카드에 태그를 보여줘"

같은 프로젝트, 같은 파일(`article-card.tsx`)을 건드리는데 8턴이 걸린다.

### 턴 1 — 무엇을 건드리는지 센다

- **화면**: 카드에 태그 칩이 새로 들어간다. `design-rules.md` 에 칩 언어가 없다 → **새 시각 방향**
- **데이터**: `tag`·`item_tag` 테이블이 이미 있고 쿼리도 있다 → 데이터 모델은 안 건드린다
- **로그인·결제·권한**: 안 건드린다
- **계산 규칙**: 태그 정렬 기준이 필요하다 → 단순 알파벳순이면 도메인 로직 아님

→ 표면 하나(새 시각 방향). 붙는 절차: **시안 → checkpoint → design-rules 갱신 → 구현 → ui-reviewer.**

선언하고 동의를 받는다. 아직 파일을 안 건드렸으므로 턴이 끝나도 상태는 그대로다.

### 턴 2 — design-rules 를 손대는 순간 하류가 전부 열린다

시안을 만들려면 `docs/design/mockups/feed-card-tag.html` 이 생기고, 승인 뒤엔
`design-rules.md` 에 블록이 붙는다. 둘 다 `design/page-designer` 가 만드는 파일이다.

Stop 훅이 해시 변경을 잡는 순간, **전파 규칙 하나**가 도미노를 넘긴다:

> 상류가 dirty → 그에 기대는 하류 전부 dirty

```
design/page-designer  clean → dirty      (파일이 바뀌었다)
design                clean → dirty      (자식 하나가 안 끝났다 — 집계)
implement             clean → dirty      (design 에 기댄다)
qa                    clean → dirty
review                clean → dirty
deploy                n/a   → dirty      (n/a 판단의 전제가 깨졌다)

프론티어: design
```

**재작업 범위를 내가 선언한 적이 없다.** `graph.mjs` 에는 "무엇이 무엇에 기대는지"만 적혀 있고
"그다음 어디로 가라"는 문장이 한 줄도 없다. 위 목록은 전부 그 의존 관계에서 계산된 것이다.

### 턴 3 — 시안을 만들고, 내가 직접 열어 본다

`design-drafter` 에 위임해 정적 HTML 시안을 받는다. 그런데 **그 보고를 그대로 사용자에게 넘기지 않는다.**

```
node scripts/preview.mjs signal        # file: 은 Playwright 가 막으므로 http 로 서빙
```

띄운 뒤 Playwright 로 열어 **글자 대비를 computed style 로 전부 훑는다.** 눈으로 보지 않는다 —
회색 카드 위에 얹은 태그 칩 색은 4.5:1 을 넘기지 못하는 경우가 흔하고, 안 재면 미달인 채로 승인된다.
실측값은 승인 시 `design-rules.md` 에 적어 둔다. 다음 화면이 그 하한을 물려받는다.

### 턴 4 — 승인이 파일 한 줄로 바뀐다

사용자가 시안을 보고 승인한다. 그 승인은 대화로 끝나지 않는다:

```yaml
---
status: approved      # ← 게이트가 읽는 것은 오직 이 줄이다
---
```

Stop 훅이 `design/page-designer` 를 검사한다 — 프론트매터가 `status: approved` 인가? 예 → clean.
자식 둘이 다 clean 이므로 부모 `design` 도 clean. 프론티어가 `implement` 로 넘어간다.

### 턴 5 — 구현. 승인이 없었다면 여기서 막혔다

`article-card.tsx` 를 고친다. 편집 직후 게이트가 돌면서 `design/BEFORE_UI` 를 검사한다:

> UI 레이어 작업이 시작됐는데 `design-rules.md` 가 없거나 `status: approved` 아님

턴 4 에서 승인을 받았으니 통과한다. **받지 않았다면 이 편집 자체가 거부된다** — 그래서
"시안 먼저"가 문서에 적힌 권고가 아니라 기계가 지키는 하한선이다.

턴이 끝나면 `implement` 가 clean 이 되고 프론티어가 `qa` 로 간다.

### 턴 6 — 테스트가 깨진다. 어디를 고쳐야 하나

태그가 4개 이상인 항목에서 카드 레이아웃이 무너지는 테스트가 실패한다.

```
↩ qa dirty + 검증 실패 — 분류기(qa-classifier) 필요:
   실패를 spec/design/impl 레벨로 귀속해 해당 노드 mark-dirty.
```

**실패한 자리는 코드지만, 틀린 것은 코드가 아니다.** 승인된 시안에 태그 개수 상한이 없었다.
코드에서 4개를 잘라내면 이번 테스트는 통과하지만, 다음 화면이 같은 시안 언어를 물려받아
같은 실패를 다시 낸다. 그래서 판정은 `design` 레벨이다.

거부는 두 단계다. **파일만 고치고 끝내면 안 된다.**

```
① design-rules.md 의 status: approved → draft
② node gates/graph-stop.mjs --mark design "태그 4개 이상일 때의 카드 레이아웃 기준이 없다"
```

②를 빠뜨리면 `HANDOFF.md` 가 옛 프론티어를 든 채로 남는다. 실제로 2026-08-06 에 그 상태에서
재작업 순서를 손으로 추론하다 거꾸로 간 적이 있다.

### 턴 6 의 상태 — 여기서 `rework` 가 왜 필요한지 드러난다

`design` 은 지금 clean 이었으므로, mark 하면 `dirty` 가 아니라 **`rework`** 가 된다.
"아직 안 했다"와 "했다가 취소됐다"는 다른 말이고, 사유가 남는다.

```
design                clean → rework  ("태그 4개 이상일 때의 카드 레이아웃 기준이 없다")
design/page-designer  clean → rework  (같은 사유)
design/schema-designer clean → rework (← 건드리지도 않았는데 같이 딸려온다)
implement             clean → dirty   (하류는 거부된 게 아니라 상류가 흔들린 것)
qa                    dirty → dirty
review                clean → dirty
프론티어: design
```

`rework` 가 `dirty` 와 다른 점은 **딱 하나**다. `design-rules.md` 가 이제 `draft` 라서
`design/BEFORE_UI` 게이트가 실패하는데, 그 실패가 **턴을 막지 않는다.**

왜 그래야 하나: 이 게이트를 푸는 유일한 방법은 사용자에게 재승인을 받는 것이고,
재승인을 받으려면 턴이 끝나서 사용자 차례가 와야 한다. 게이트가 턴을 막으면
**게이트를 푸는 유일한 길이 게이트 때문에 닫힌다.** 실제로 세 번 관찰된 뒤에 만들어진 규칙이다.

화면에는 이렇게 찍힌다.

```
⚠ [graph/EXPECTED] design 실패가 남았지만 턴은 막지 않는다 —
   design 가 rework(태그 4개 이상일 때의 카드 레이아웃 기준이 없다) — 재승인은 턴을 끝내야 받는다.
   하류는 그대로 막혀 있다. 다음에 할 일: design — 진행이 아니라 턴 종료만 허용된 것이다.
```

**낮춰도 강제력은 그대로다.** 노드는 여전히 rework 이고, `implement` 아래는 전부 막혀 있고,
프론티어도 계속 `design` 을 가리킨다. 허용된 건 "턴을 끝내는 것" 하나뿐이다.

여기서 하나 눈에 걸리는 게 있다 — `design/schema-designer` 도 같이 `rework` 가 됐다.
`--mark` 는 집계 노드를 찍으면 자식 둘 다에 같은 표시를 남긴다. DB 스키마는 이번 일과 무관한데
같이 되돌아간 것이다. 지금 구조에서는 자식만 따로 찍을 방법이 없다.

### 턴 7 — 기준을 고치고 재승인

시안에 "태그는 최대 3개, 넘으면 `+N`" 을 넣어 다시 승인받는다.
`status: approved` 로 돌아가면 `design` 이 clean 이 되고, 하류가 다시 열린다.

### 턴 8 — 재구현, 테스트 통과, 그리고 사인오프

`implement` clean → `qa` clean → 프론티어 `review`.

```
● HANDOFF 갱신. 프론티어: review
  ↳ review 사인오프 대기 — 막힌 이유: basis 불일치 (기록 d43269656730 ≠ 현재 9c07...)
     workspace/review.md 에 'status: passed' + 'basis: 9c07...' +
     'reviewers: [실제로 돌린 리뷰어]' — 이 코드는 security-reviewer 를 포함해야 한다
```

**리뷰어를 고른다.** 이번 diff 가 건드린 것은 시각(새 태그 칩 컴포넌트)뿐이다.
→ `ui-reviewer` 를 부른다. 도메인 로직·상태 관리는 안 바뀌었으니 `code-reviewer` 는 뺀다.
새로 쓴 테스트가 스펙 INV 를 검증하는 게 아니니 `test-auditor` 도 뺀다.
**뺀 이유는 한 줄로 알린다** — 뺀 판단도 보고 대상이다.

그런데 위 출력이 `security-reviewer` 를 요구한다. 이번 diff 는 로그인 근처에도 안 갔는데.

이유는 이렇다. 게이트는 diff 가 아니라 **프로젝트 전체 소스**에서 위험 패턴을 찾는다:

```
ℹ [risk-surface/DETECTED] projects/signal — auth, authz, concurrency
ℹ [risk-surface/AT] projects/signal — auth@projects/signal/src/app/api/ingest/route.ts:34,
   authz@projects/signal/src/app/api/ingest/route.ts:34,
   concurrency@projects/signal/src/features/ingestion/api/ports.ts:149
```

`AT` 줄이 어디서 걸렸는지 말해 준다 — signal 에는 예전부터 `CRON_SECRET` 을 비교하는 `Bearer`
토큰 코드와 RLS 정책이 있고, 그게 매번 감지된다. 사인오프 검사는 그 감지 결과를 쓰므로, **이 프로젝트에서는 어떤 diff 든
`reviewers:` 에 `security-reviewer` 가 없으면 review 가 clean 이 되지 않는다.**

기록하면 끝난다.

```yaml
---
status: passed
basis: 9c07...
reviewers: [ui-reviewer, security-reviewer]
---
```

`basis` 가 `implement` 의 현재 해시와 일치해야 하므로, 사인오프 뒤에 코드를 한 줄이라도 고치면
자동으로 낡아서 다시 리뷰를 받아야 한다.

### 세션 끝

`PROGRESS.md` 의 다섯 줄을 갱신하고, 미룬 것은 `BACKLOG.md` 로 뺀다.
**여기 안 적힌 것은 다음 세션에 존재하지 않는다** — 다음 세션의 브리핑은 이 파일들만 읽는다.

---

## 두 시나리오가 갈린 지점

| | A (글자 하나) | B (태그 칩) |
|---|---|---|
| 건드린 것 | 화면에 나가는 글자 | 새 시각 언어 |
| 시안 | 없음 | 있음 (+ 대비 실측) |
| 사용자 승인 | 없음 | 두 번 (첫 승인 + 재승인) |
| 리뷰어 | 안 부름 (밀린 리뷰로 남김) | ui-reviewer + security-reviewer |
| 턴 수 | 1 | 8 |
| 되돌아간 횟수 | 0 | 1 (design 까지) |

**갈린 자리는 딱 하나다** — 턴 1 에서 "무엇을 건드리나"에 답한 결과.
옛 방식이었다면 둘 다 같은 등급을 받아 같은 절차를 돌았다.

그리고 **A 가 얕게 간 것이 안전한 이유**는 내가 조심해서가 아니다.
A 가 로그인 코드를 건드렸다면 `risk-surface` 게이트가 편집 자체를 거부했을 것이고,
승인 없이 새 화면을 만들려 했다면 `design/BEFORE_UI` 가 막았을 것이다.
**얕게 갈 수 있는 범위를 기계가 정해 준다.**

---

## 이 흐름을 읽고 나면 그림이 이렇게 붙는다

| 이 문서의 어디 | 그림 |
|---|---|
| 시나리오 B 전체 | `feature-path.html` |
| 턴 1 의 "무엇을 건드리나" | `depth-decision.html` |
| 턴 2 의 도미노 | `graph-judgment.html` |
| 턴 5 의 BEFORE_UI, 턴 6 의 낮춤 | `gates.html` |
| 턴 6 의 귀속과 mark | `failure-routing.html` |
| 턴 6 의 rework | `node-states.html` |
| 턴 1·5 의 훅 순서 | `harness-turn.html` |

---

## 읽다 걸린 것 (고치지 않고 기록만)

1. **`--mark` 는 집계 노드의 자식을 가려내지 못한다.** `design` 을 찍으면 `page-designer` 와
   `schema-designer` 가 같이 rework 가 된다. 시각 기준만 거부하고 싶어도 DB 스키마가 같이 되돌아간다.
2. **사인오프의 리뷰어 요구는 diff 가 아니라 프로젝트 전체를 본다.** signal 처럼 어딘가에
   `Bearer` 한 줄만 있어도, 글자 하나 고친 diff 의 사인오프에까지 `security-reviewer` 가 요구된다.
   안전한 방향으로 틀린 것이지만, 요구가 헐거워지면 사람이 형식적으로 이름만 적게 된다.
3. **n/a 는 상류가 흔들릴 때마다 사유째로 지워진다.** 재선언이 필요하다는 안내가 따로 없어서,
   프론티어에 갑자기 나타난 노드를 보고서야 알게 된다.
