# 07. review — 사람이 판단하는 층의 사인오프

## Purpose
자동 게이트가 잡지 못하는 것(도메인 로직 위치, 신뢰 경계, 디자인 일관성, 테스트가 진짜 검증인지)을 리뷰어가 본다. 결과는 마커 파일로 남고, 구현이 바뀌면 자동으로 낡는다 [(graph.mjs:79-87)](graph.mjs#L79-L87).

## Entry condition
qa 가 clean 이고 review 가 dirty 일 때 [(graph.mjs:84)](graph.mjs#L84).
파견 시점은 매 턴이 아니라 **기능 완성 마일스톤** 이다 — 개발 중에는 dirty 가 "리뷰 빚"으로 프론티어에 남는다 [(graph.mjs:82)](graph.mjs#L82).

## What it does
1. 등급에 맞는 리뷰어를 파견한다 [(CLAUDE.md:74-79)](CLAUDE.md#L74-L79).
   - 정식 경로: `code-reviewer` + `security-reviewer` + (UI면) `ui-reviewer`, 테스트를 썼으면 `test-auditor`.
   - 빠른 경로: `code-reviewer` 1개(UI 작업이면 `ui-reviewer`). 보안 표면이 실제로 닿을 때만 `security-reviewer` 추가.
2. 리뷰어는 읽기 전용이다 — 넷 다 `tools: Read, Grep, Glob` [(code-reviewer.md:4)](.claude/agents/code-reviewer.md#L4).
3. 지적이 나오면 고치고 다시 돌린다. 지적의 귀속이 애매하면 `qa-classifier` 를 파견한다 [(CLAUDE.md:82-83)](CLAUDE.md#L82-L83).
4. 통과하면 `workspace/review.md` 에 `status: passed` + `basis: <구현 해시>` 를 기록한다. 해시 값은 graph-stop 출력이 알려준다 [(graph-stop.mjs:259-263)](gates/graph-stop.mjs#L259-L263).

## Skills and tools
| name | when | evidence |
|---|---|---|
| `code-reviewer` | 기능 완성 시 (모든 등급) | [CONFIRMED: CLAUDE.md:75,78] |
| `security-reviewer` | 정식 경로 전부 / 빠른 경로는 보안 표면이 닿을 때만 | [CONFIRMED: CLAUDE.md:78-79] |
| `ui-reviewer` | UI 작업일 때 | [CONFIRMED: CLAUDE.md:75,78] |
| `test-auditor` | 테스트 작성 후 (정식 경로) | [CONFIRMED: CLAUDE.md:76-77] |
| `qa-classifier` | 리뷰 지적의 레벨 귀속 | [CONFIRMED: .claude/agents/qa-classifier.md:10] |

## Documents read
| document | purpose | required? |
|---|---|---|
| `projects/<이름>/src/**` | 리뷰 대상 | 예 |
| `.claude/rules/*.md` | 판정 기준 — "문서에 없는 취향은 지적하지 않는다" | 예 [(code-reviewer.md:6-7)](.claude/agents/code-reviewer.md#L6-L7) |
| `docs/design/design-rules.md` | UI 일관성 기준 | UI 리뷰일 때 |
| `docs/specs/*.md` | 불변식 대조 | 스펙이 있을 때 |

## Documents written
| document | ownership | consumed by |
|---|---|---|
| `projects/<이름>/workspace/review.md` | 본체 (리뷰어는 Write 권한이 없다) | review 노드 clean 판정 · deploy 의 선행 조건 |

## Gate
`clean_when: { signoff: { marker: "workspace/review.md", require: "status: passed", basis_of: "implement" } }` [(graph.mjs:86)](graph.mjs#L86).
판정은 [graph-stop.mjs:179-188](gates/graph-stop.mjs#L179-L188):
1. 마커 파일이 있어야 하고,
2. 프론트매터에 `status: passed` 가 있어야 하고,
3. `basis:` 값이 **현재 `src/**` 해시와 같아야** 한다.

셋 중 하나라도 어긋나면 dirty. 사인오프 노드는 해시 변경 감지 대상에서 제외되므로 [(graph-stop.mjs:218)](gates/graph-stop.mjs#L218) 마커 자체를 고쳐도 다른 노드를 흔들지 않는다.

## Failure path
- 리뷰어 지적 → `qa-classifier` 판정 → impl/design/spec 레벨별 행동 [(CLAUDE.md:84-86)](CLAUDE.md#L84-L86).
- 구현을 고치면 `src/**` 해시가 바뀌어 `basis` 가 어긋나고 review 가 **자동으로 낡는다**(재리뷰 강제) [(graph-engine.md:97-103)](docs/references/graph-engine.md#L97-L103).
- review 가 dirty 인 동안 deploy 는 차단된다 [(CLAUDE.md:74)](CLAUDE.md#L74).

## Exit condition
`workspace/review.md` 가 `status: passed` 이고 `basis` 가 현재 구현 해시와 일치. 그때 프론티어는 deploy 로 내려간다.

## Unverified
- **리뷰어가 실제로 파견됐는지** — 마커는 결과만 기록한다. 어떤 리뷰어가 몇 개 돌았는지는 파일에 남지 않는다. [INFERRED]
- **basis 값을 사람이 직접 적는다** — graph-stop 이 값을 알려주지만 기록은 수동이라, 리뷰 없이 해시만 베껴 넣으면 통과한다. [INFERRED]
- **빠른 경로의 "보안 표면이 닿는가" 판단** — 모델의 재량이고 기록되지 않는다. [INFERRED]
