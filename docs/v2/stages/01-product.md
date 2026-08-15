# 01. product

그래프의 루트 노드. 다른 모든 노드가 직간접으로 여기에 의존한다 ([graph.mjs:42](../../../graph.mjs#L42) `depends_on: []`).

## Purpose

무엇을 만들지를 한 파일에 못 박아, 나머지 단계가 "이게 범위 안인가"를 매번 다시 협상하지 않게 한다.
없으면 깨지는 것: 비범위 판정의 근거가 사라지고([CLAUDE.md:16](../../../CLAUDE.md#L16) "PRODUCT.md의 비범위 기능은 요청받아도 먼저 지적"),
`product` 가 영원히 dirty 라서 **하류 6개 노드 전부가 dirty 로 남는다** — 프론티어가 product 에서 움직이지 않는다.

## Entry condition

| 조건 | 어디서 막나 |
|---|---|
| 루트 `ACTIVE` 가 프로젝트 이름 한 줄을 담고 있고 `projects/<이름>/` 이 존재 | [gates/graph-stop.mjs:23-28](../../../gates/graph-stop.mjs#L23-L28) — 없으면 graph-stop 이 `skip` 하고 exit 0 |
| `PRODUCT.md` 가 없거나 비어 있음 | [CLAUDE.md:9](../../../CLAUDE.md#L9) — "PRODUCT.md가 비어 있거나 활성 프로젝트가 없으면 kickoff 스킬로 시작한다" |

강제 수준의 차이에 주의: 첫 줄은 **스크립트가 검사**하고, 둘째 줄은 **문서가 지시**할 뿐이다.
PRODUCT.md 없이 구현을 시작하는 것을 막는 게이트는 없다 — 금지는 [kickoff/SKILL.md:35](../../../.claude/skills/kickoff/SKILL.md#L35) 의 문장뿐이다. `[INFERRED]`

## What it does

1. 프로젝트 이름을 정하고(소문자·숫자·하이픈) `projects/<이름>/` 을 만든 뒤 루트 `ACTIVE` 에 한 줄 기록 ([kickoff/SKILL.md:13](../../../.claude/skills/kickoff/SKILL.md#L13))
2. **인터뷰보다 파일이 먼저다.** 이름과 한 줄 정의만 받아 `PRODUCT.md` 를 즉시 만든다. 그 전에 목적·기능·페이지를 묻는 것은 금지 ([kickoff/SKILL.md:36](../../../.claude/skills/kickoff/SKILL.md#L36))
3. 영역 순서대로 질문한다 — 목적/대상 → 필수·비범위 → 페이지 → 기술 → 디자인. 한 번에 3개 이하, 선택지 제시 ([kickoff/SKILL.md:16-17](../../../.claude/skills/kickoff/SKILL.md#L16-L17))
4. 기술 영역은 **묻는 범위가 정해져 있다.** 언어(TS)·아키텍처(FSD)·검증 체계는 하네스 전제라 고지만 하고, 렌더링·데이터 계층·배포만 묻는다 ([kickoff/SKILL.md:18-21](../../../.claude/skills/kickoff/SKILL.md#L18-L21))
5. 답이 나올 때마다 파일을 갱신하고 변경분을 보여준다 ([kickoff/SKILL.md:22](../../../.claude/skills/kickoff/SKILL.md#L22))
6. 엔티티가 도출되면 [modeling-checklist.md](../../references/modeling-checklist.md) 를 **얕게** 훑어 플래그만 찍는다. 시변·파생 상태에 걸린 필드는 "(스펙 필요: …)" 로 표시 ([kickoff/SKILL.md:25-29](../../../.claude/skills/kickoff/SKILL.md#L25-L29))
7. 요약 → "이대로 시작할까요?" → 동의 후 setup 스킬 제안 ([kickoff/SKILL.md:30](../../../.claude/skills/kickoff/SKILL.md#L30))

## Skills and tools

| name | when | evidence |
|---|---|---|
| `kickoff` | 새로 만들고 싶다는 말 + 활성 프로젝트 없음 / PRODUCT.md 비어 있음 | [CONFIRMED: ../../../.claude/skills/kickoff/SKILL.md:3] |
| `setup` | PRODUCT.md 승인 **직후** — 하네스 구성 제안 후 스캐폴딩 | [CONFIRMED: ../../../.claude/skills/setup/SKILL.md:3] |
| `goal` | 진행 중 요청이 PRODUCT.md 와 어긋나는지 대조 (사용자 호출 전용) | [CONFIRMED: ../../../.claude/skills/goal/SKILL.md:16] |
| `modeling-checklist` 참고 | 엔티티 도출 시 얕게 | [CONFIRMED: ../../../.claude/skills/kickoff/SKILL.md:25] |
| 서브에이전트 | **없음** — 이 단계에 파견되는 에이전트는 적혀 있지 않다 | [CONFIRMED: ../reference/subagents.md 전수 — product 를 언급하는 항목 0건] |

## Documents read

| document | purpose | required? |
|---|---|---|
| `ACTIVE` | 활성 프로젝트 이름 | 예 — 없으면 graph-stop 이 skip |
| [CLAUDE.md](../../../CLAUDE.md) | 진입 규칙·비범위 원칙 | 예 (항상 로드) |
| [docs/references/modeling-checklist.md](../../references/modeling-checklist.md) | 엔티티 위험 플래그 | 아니오 — 엔티티가 나올 때만 |

## Documents written

| document | ownership | consumed by |
|---|---|---|
| `projects/<이름>/docs/PRODUCT.md` | product 노드의 유일한 produces ([graph.mjs:43](../../../graph.mjs#L43)) | spec · design (둘 다 `depends_on: ["product"]`) · goal 스킬 · setup 스킬 |
| 루트 `ACTIVE` | kickoff 0단계 | [briefing.mjs:15](../../../scripts/briefing.mjs#L15) · [graph-stop.mjs:23](../../../gates/graph-stop.mjs#L23) · run-gates |
| `projects/<이름>/workspace/DECISIONS.md` | 트레이드오프가 있던 결정만 한 줄 ([kickoff/SKILL.md:24](../../../.claude/skills/kickoff/SKILL.md#L24)) | 사람 (그래프 노드 아님) |

## Gate

**조건**: `clean_when: { exists_nonempty: "docs/PRODUCT.md" }` ([graph.mjs:44](../../../graph.mjs#L44))

**통과 경로**: 파일이 존재하고 `.trim().length > 0` 이면 clean ([graph-stop.mjs:164-168](../../../gates/graph-stop.mjs#L164-L168)).
빈 파일은 통과하지 못한다 — 이 판정은 대상이 0개일 때 **거짓**을 반환한다. (같은 파일의 `frontmatterOK` 는 반대로 참을 반환한다 — [findings F-03](../findings.md))

**실패 경로**: clean 이 안 내려가면 product 가 dirty 로 남고, 프론티어는 계속 product 다.
하류는 [graph-stop.mjs:235](../../../gates/graph-stop.mjs#L235) 에서 `depends_on` 이 clean 이 아니라 아예 판정 대상이 되지 않는다.

**내용 심사는 없다.** 게이트는 "비어 있지 않음"만 본다 — 필수/비범위가 채워졌는지, 기술 결정이 기록됐는지는 검사하지 않는다.

## Failure path

- 인터뷰가 끝나지 않으면 파일이 비어 있고 → product dirty → 하류 전부 dirty. 정지가 아니라 **정체**다.
- `ACTIVE` 가 가리키는 디렉터리가 없으면 graph-stop 이 통째로 skip 한다 ([graph-stop.mjs:25-28](../../../gates/graph-stop.mjs#L25-L28)) — 이 경우 그래프 상태 자체가 갱신되지 않는다. 게이트 실패와 다른 종류의 침묵이다.
- 질문 총량 10개를 넘기면 남은 것은 가정 처리 후 기록 ([kickoff/SKILL.md:34](../../../.claude/skills/kickoff/SKILL.md#L34)).
- **product 를 나중에 고치면** 전파 규칙에 따라 spec·design·implement·qa·review·deploy 가 전부 dirty 가 된다 ([graph.mjs:6](../../../graph.mjs#L6), [propagate.mjs:87-92](../../../gates/propagate.mjs#L87-L92)).

## Exit condition

`projects/<active>/docs/PRODUCT.md` 가 존재하고 공백이 아니다 → 다음 턴 Stop 훅에서 product 가 clean 이 되고,
프론티어가 `spec` 과 `design` 으로 **동시에** 이동한다(둘 다 product 에만 의존하므로 — [graph.mjs:49](../../../graph.mjs#L49), [:60](../../../graph.mjs#L60)).

## Unverified

- **"PRODUCT.md 승인"이라는 상태는 그래프에 없다.** [kickoff/SKILL.md:30](../../../.claude/skills/kickoff/SKILL.md#L30) 이 "이대로 시작할까요?"로 동의를 받지만, 그 동의는 파일 어디에도 안 남는다. 게이트는 파일이 비었는지만 본다. `[INFERRED]` — 승인의 흔적을 못 찾았다.
- **PRODUCT.md 의 내부 구조**(필수·비범위·페이지·기술 결정 절)를 강제하는 스키마나 템플릿을 못 찾았다. `docs/references/` 에 `spec-template.md` 는 있으나 product 용 템플릿은 없다. `[INFERRED]`
- **setup 스킬로 넘어가는 전이가 그래프에 없다.** setup 은 스캐폴딩(파일 생성)을 하지만 어떤 노드의 produces 도 아니다 — 그래프 밖 절차다. 어느 노드가 setup 완료를 요구하는지 파일에서 확인 못 했다. `[INFERRED]`
- kickoff 이 `projects/<이름>/` 을 만든 뒤 `ACTIVE` 를 쓰는 순서가 실제로 강제되는지(스크립트 검사) 확인 못 했다. [kickoff/SKILL.md:13](../../../.claude/skills/kickoff/SKILL.md#L13) 의 서술뿐이다. `[INFERRED]`
- 두 프로젝트(`signal`·`wama`)가 동시에 존재하지만 `ACTIVE` 는 하나만 가리킨다. 비활성 프로젝트의 product 노드가 어떻게 다뤄지는지 — graph-stop 은 활성 프로젝트만 본다([graph-stop.mjs:24](../../../gates/graph-stop.mjs#L24))는 것까지는 확인했으나, 비활성 프로젝트의 게이트 에러가 무시되는 근거([graph-stop.mjs:141](../../../gates/graph-stop.mjs#L141))와 spec-coverage 가 **전 프로젝트**를 훑는 것([spec-coverage.mjs:9-14](../../../gates/spec-coverage.mjs#L9-L14))이 서로 다른 방침이다. 이 비대칭이 의도인지 확인 못 했다. `[INFERRED]`
