# 06. review

**깊은 검증.** 리뷰어의 판단은 사람이 읽고 판단하는 일이라 게이트로 자동 판정이 안 된다 ([graph.mjs:79-80](../../../graph.mjs#L79-L80)).
그래서 `signoff` 라는 다른 종류의 `clean_when` 을 쓰는 두 노드 중 하나다.

## Purpose

컴파일러와 정적 게이트가 못 잡는 것 — 도메인 로직의 위치, 신뢰 경계, 승인된 디자인과의 불일치 — 을 사람(에이전트)이 읽어서 잡는다.
없으면 깨지는 것: `deploy` 가 `review` 에 의존하므로([graph.mjs:92](../../../graph.mjs#L92)) **review 가 dirty 인 동안 배포가 차단된다.** 리뷰를 건너뛰면 배포도 못 한다.

## Entry condition

| 조건 | 어디서 막나 |
|---|---|
| `qa` 가 clean | [graph.mjs:84](../../../graph.mjs#L84) `depends_on: ["qa"]` |
| **기능-완성 마일스톤**에 도달 | [CLAUDE.md:75](../../../CLAUDE.md#L75) — "깊은 리뷰는 이 기능-완성 마일스톤에만 파견한다(잦은 리뷰 방지)" |

프론티어에 올라와도 **저절로 진행되지 않는다.** 게이트가 아니라 마커를 기다리는 노드라, 사람이 리뷰어를 파견하고 결과를 기록해야 움직인다.
개발 중에는 dirty 로 남아 밀린 리뷰가 프론티어에 그대로 보인다 ([graph.mjs:82](../../../graph.mjs#L82)).

## What it does

**등급에 따라 파견 규모가 다르다** ([CLAUDE.md:77-80](../../../CLAUDE.md#L77-L80)):

| 등급 | 파견 |
|---|---|
| 정식 경로 | `code-reviewer` + `security-reviewer` + (UI면) `ui-reviewer`. 테스트 작성 후 `test-auditor` 로 품질 감사 |
| 빠른 경로 | `code-reviewer` 1개 (UI 작업이면 `ui-reviewer`). **보안 표면이 실제로 닿을 때만** security-reviewer 추가 — 없으면 생략 |

1. 리뷰어를 파견한다. 각 리뷰어는 **판단 기준이 되는 문서를 먼저 읽는다** — 문서에 없는 취향은 지적하지 않는다 ([code-reviewer.md:6-7](../../../.claude/agents/code-reviewer.md#L6-L7) · [ui-reviewer.md:9-11](../../../.claude/agents/ui-reviewer.md#L9-L11))
2. 지적이 나오면 `qa-classifier` 로 레벨을 귀속한다 — 분류기는 qa 실패뿐 아니라 **리뷰어 지적도** 입력으로 받는다 ([qa-classifier.md:10](../../../.claude/agents/qa-classifier.md#L10))
3. 통과하면 `workspace/review.md` 에 `status: passed` + `basis: <해시>` 를 기록한다 ([CLAUDE.md:72-73](../../../CLAUDE.md#L72-L73))
4. **basis 값은 지어내지 않는다** — graph-stop 이 프론티어 안내에서 출력해 준다 ([graph-stop.mjs:259-262](../../../gates/graph-stop.mjs#L259-L262))

## Skills and tools

| name | when | evidence |
|---|---|---|
| `code-reviewer` | 항상 (두 등급 모두) | [CONFIRMED: ../../../.claude/agents/code-reviewer.md:3] |
| `security-reviewer` | 정식 경로는 항상 / 빠른 경로는 보안 표면이 닿을 때만 | [CONFIRMED: ../../../CLAUDE.md:79] |
| `ui-reviewer` | UI 작업일 때 | [CONFIRMED: ../../../.claude/agents/ui-reviewer.md:3] |
| `test-auditor` | 정식 경로, 테스트 작성 후 | [CONFIRMED: ../../../CLAUDE.md:78] |
| `qa-classifier` | 지적이 나왔을 때 | [CONFIRMED: ../../../.claude/agents/qa-classifier.md:10] |

**리뷰어 4종 모두 읽기 전용이다** (`tools: Read, Grep, Glob` — [code-reviewer.md:4](../../../.claude/agents/code-reviewer.md#L4) 등). 고치지 않고 지적만 한다.

## Documents read

| document | purpose | required? |
|---|---|---|
| `projects/<이름>/src/**` | 리뷰 대상 | 예 |
| `.claude/rules/*.md` | code-reviewer·ui-reviewer 의 판단 기준 | 예 ([code-reviewer.md:6](../../../.claude/agents/code-reviewer.md#L6)) |
| `projects/<이름>/docs/design/design-rules.md` | ui-reviewer 의 판단 기준 | UI 리뷰 시 ([ui-reviewer.md:10](../../../.claude/agents/ui-reviewer.md#L10)) |
| `projects/<이름>/docs/specs/*.md` (approved) | security-reviewer 의 **최우선 검사** — "강제 위치: 서버"인 불변식이 클라이언트에만 구현되지 않았는지 | approved 스펙이 있으면 예 ([security-reviewer.md:6-8](../../../.claude/agents/security-reviewer.md#L6-L8)) |

## Documents written

| document | ownership | consumed by |
|---|---|---|
| `projects/<이름>/workspace/review.md` | review 의 produces ([graph.mjs:85](../../../graph.mjs#L85)) | [graph-stop.mjs:179-188](../../../gates/graph-stop.mjs#L179-L188) `signoffOK` |

이 파일은 **산출물이자 판정 근거**다. 다른 노드들은 산출물을 만들고 게이트가 따로 판정하지만, review 는 산출물 자체가 판정이다.

## Gate

**조건**: `signoff: { marker: "workspace/review.md", require: "status: passed", basis_of: "implement" }` ([graph.mjs:86](../../../graph.mjs#L86))

세 가지를 **전부** 만족해야 clean 이다 ([graph-stop.mjs:179-188](../../../gates/graph-stop.mjs#L179-L188)):

1. 마커 파일이 존재한다 — 없으면 즉시 false ([:181](../../../gates/graph-stop.mjs#L181))
2. 프론트매터에 `status: passed` 가 있다 ([:185](../../../gates/graph-stop.mjs#L185))
3. `basis:` 값이 **implement 의 현재 내용 해시와 같다** ([:187](../../../gates/graph-stop.mjs#L187))

**3번이 이 노드에서 제일 중요한 대목이다.** 다른 모든 판정은 "지금 상태가 조건을 만족하나"를 묻지만, basis 비교는 "**이 승인이 무엇에 대한 승인이었나**"를 묻는다.
구현이 한 글자라도 바뀌면 해시가 달라져 사인오프가 저절로 낡는다 — 리뷰를 다시 해야 한다 ([graph.mjs:81](../../../graph.mjs#L81)).

**사인오프 노드는 변경 감지에서 제외된다** ([graph-stop.mjs:218](../../../gates/graph-stop.mjs#L218)) — 마커 파일을 고쳐도 그것 때문에 dirty 가 되지는 않는다. 낡는 건 오직 basis 가 어긋날 때뿐이다.

## Failure path

- 지적이 나오면 `qa-classifier` 로 레벨 귀속 → impl / design / spec 중 하나를 dirty 로 마크 ([CLAUDE.md:84-87](../../../CLAUDE.md#L84-L87))
- **spec-level 이거나 위험 표면(인증·결제·권한·격리 INV·security)에 닿으면 등급 무관 사용자에게 먼저 보고** ([CLAUDE.md:88](../../../CLAUDE.md#L88))
- 마커를 기록한 뒤 구현을 고치면 basis 가 안 맞아서 review 가 다시 dirty → deploy 도 dirty (전파)
- 리뷰어가 발견이 없으면 "없다고 말한다. 추측 금지" ([code-reviewer.md:12](../../../.claude/agents/code-reviewer.md#L12) · [security-reviewer.md:18](../../../.claude/agents/security-reviewer.md#L18))

## Exit condition

`workspace/review.md` 에 `status: passed` + 현재 implement 해시와 일치하는 `basis` 가 있다 → review clean.
프론티어가 `deploy` 로 이동한다.

## Unverified

- **리뷰어를 실제로 파견했는지 검증하는 장치가 없다.** 마커에 `status: passed` 와 맞는 `basis` 만 있으면 clean 이 된다 — 리뷰어를 한 번도 안 돌리고 손으로 써넣어도 게이트는 구별 못 한다. `[INFERRED]`
- **등급(정식/빠른) 판정이 어디에도 안 남는다.** [CLAUDE.md:41-55](../../../CLAUDE.md#L41-L55) 가 등급을 나누고 파견 규모를 다르게 정하지만, 어느 등급으로 진행했는지 적을 자리가 마커에 없다. 다음 세션은 리뷰가 얼마나 깊었는지 모른다. `[INFERRED]`
- **`basis_of: "implement"` 는 implement 의 produces(`src/**`) 해시다.** 테스트 파일도 `src/**` 에 포함되므로 테스트만 고쳐도 basis 가 바뀌어 재리뷰가 강제되는 것으로 보인다 ([04-implement.md](04-implement.md) 의 같은 항목 참조). 직접 돌려 보지는 않았다. `[INFERRED]`
- **`workspace/review.md` 의 형식 템플릿을 못 찾았다.** 필요한 필드는 `status` 와 `basis` 뿐인 것으로 보이나(정규식이 그 둘만 본다), 무엇을 지적했고 어떻게 해소했는지 기록하는 규약이 있는지 확인 못 했다. `[INFERRED]`
- **`signoffOK` 는 매칭된 첫 파일만 읽는다** ([graph-stop.mjs:182](../../../gates/graph-stop.mjs#L182) `files[0]`). `workspace/review.md` 는 단일 파일이라 문제되지 않지만, 글롭이 여러 파일을 잡는 마커였다면 나머지가 무시된다. 현재 구성에서 문제가 되지 않음만 확인했다. `[INFERRED]`
