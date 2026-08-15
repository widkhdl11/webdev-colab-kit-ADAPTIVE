# 07. review — 사람이 판단하는 층의 사인오프

## Purpose
자동 게이트가 잡지 못하는 것(도메인 로직 위치, 신뢰 경계, 디자인 일관성, 테스트가 진짜 검증인지)을 리뷰어가 본다. 결과는 마커 파일로 남고, 구현이 바뀌면 자동으로 낡는다 [(graph.mjs:100-124)](../../graph.mjs#L100-L124).

## Entry condition
qa 가 clean 이고 review 가 dirty 일 때 [(graph.mjs:105)](../../graph.mjs#L105).
파견 시점은 매 턴이 아니라 **기능 완성 마일스톤** 이다 — 개발 중에는 dirty 가 "리뷰 빚"으로 프론티어에 남는다 [(graph.mjs:103)](../../graph.mjs#L103).

## What it does
1. 닿은 표면의 리뷰어를 파견한다 — 개수가 아니라 표면으로 정한다 [(CLAUDE.md:143-150)](../../CLAUDE.md#L143-L150).
   - `security-reviewer`: 사용자 입력·인가·시크릿·세션을 만진 diff. / `ui-reviewer`: 승인된 design-rules에서 벗어나는 시각 변경.
   - `code-reviewer`: 도메인 로직·상태 관리 변경. / `test-auditor`: 스펙 INV 테스트를 새로 썼을 때.
   - 닿지 않은 표면의 리뷰어는 파견하지 않고, 뺀 이유를 한 줄로 알린다.
2. 리뷰어는 읽기 전용이다 — 넷 다 `tools: Read, Grep, Glob` [(code-reviewer.md:4)](../../.claude/agents/code-reviewer.md#L4).
3. 지적이 나오면 고치고 다시 돌린다. 지적의 귀속이 애매하면 `qa-classifier` 를 파견한다 [(CLAUDE.md:82-83)](../../CLAUDE.md#L82-L83).
4. 통과하면 `workspace/review.md` 에 `status: passed` + `basis: <구현 해시>` + `reviewers: [실제로 돌린 리뷰어]` 를 기록한다. 무엇이 모자란지는 graph-stop 이 매 턴 알려준다 [(graph-stop.mjs:365-381)](../../gates/graph-stop.mjs#L365-L381).

## Skills and tools
| name | when | evidence |
|---|---|---|
| `code-reviewer` | 도메인 로직·상태 관리가 바뀐 diff | [CONFIRMED: CLAUDE.md:147,150] |
| `security-reviewer` | 입력·인가·시크릿·세션을 만진 diff. **auth·payment·authz 표면이 코드에 있으면 사인오프가 이 리뷰어를 요구한다** | [CONFIRMED: CLAUDE.md:145 / graph.mjs:121] |
| `ui-reviewer` | 승인된 방향에서 벗어나는 시각 변경 | [CONFIRMED: CLAUDE.md:146,150] |
| `test-auditor` | 스펙 INV 테스트를 새로 썼을 때 | [CONFIRMED: CLAUDE.md:148,150] |
| `qa-classifier` | 리뷰 지적의 레벨 귀속 | [CONFIRMED: .claude/agents/qa-classifier.md:10] |

## Documents read
| document | purpose | required? |
|---|---|---|
| `projects/<이름>/src/**` | 리뷰 대상 | 예 |
| `.claude/rules/*.md` | 판정 기준 — "문서에 없는 취향은 지적하지 않는다" | 예 [(code-reviewer.md:6-7)](../../.claude/agents/code-reviewer.md#L6-L7) |
| `docs/design/design-rules.md` | UI 일관성 기준 | UI 리뷰일 때 |
| `docs/specs/*.md` | 불변식 대조 | 스펙이 있을 때 |

## Documents written
| document | ownership | consumed by |
|---|---|---|
| `projects/<이름>/workspace/review.md` | 본체 (리뷰어는 Write 권한이 없다) | review 노드 clean 판정 · deploy 의 선행 조건 |

## Gate
`clean_when.signoff` 에 marker·require·basis_of + `reviewers_field`·`require_reviewer` 가 선언돼 있다 [(graph.mjs:115-123)](../../graph.mjs#L115-L123).
판정은 [graph-stop.mjs:196-234](../../gates/graph-stop.mjs#L196-L234):
1. 마커 파일이 있어야 하고,
2. 프론트매터에 `status: passed` 가 있어야 하고,
3. `basis:` 값이 **현재 `src/**` 해시와 같아야** 하고,
4. `reviewers:` 필드가 비어 있지 않아야 하고,
5. risk-surface 게이트가 `auth`·`payment`·`authz` 를 코드에서 감지했으면 `reviewers` 에 `security-reviewer` 가 있어야 한다.

4·5 가 있는 이유: basis 해시는 graph-stop 이 화면에 찍어주는 값이라, 그것만 검사하면 **리뷰를 돌린 것과 두 줄을 적은 것이 구분되지 않는다.** 표면 목록은 게이트가 `ℹ [risk-surface/DETECTED]` 로 신고하고 graph-stop 이 활성 프로젝트 것만 읽는다.

셋 중 하나라도 어긋나면 dirty. 사인오프 노드는 해시 변경 감지 대상에서 제외되므로 [(graph-stop.mjs:218)](../../gates/graph-stop.mjs#L218) 마커 자체를 고쳐도 다른 노드를 흔들지 않는다.

## Failure path
- 리뷰어 지적 → `qa-classifier` 판정 → impl/design/spec 레벨별 행동 [(CLAUDE.md:84-86)](../../CLAUDE.md#L84-L86).
- 구현을 고치면 `src/**` 해시가 바뀌어 `basis` 가 어긋나고 review 가 **자동으로 낡는다**(재리뷰 강제) [(graph-engine.md:97-103)](../../docs/references/graph-engine.md#L97-L103).
- review 가 dirty 인 동안 deploy 는 차단된다 [(CLAUDE.md:74)](../../CLAUDE.md#L74).

## Exit condition
`workspace/review.md` 가 `status: passed` 이고 `basis` 가 현재 구현 해시와 일치. 그때 프론티어는 deploy 로 내려간다.

## Unverified
- **리뷰어가 실제로 파견됐는지** — 2026-08-14 부터 `reviewers:` 기록이 필수고 보안 표면은 게이트 감지와 대조된다. 다만 **적힌 이름이 실제 파견을 뜻하는지는 여전히 파일로 확인할 수 없다** — 이름을 적는 것과 돌리는 것 사이가 비어 있다. [INFERRED]
- **code/ui/test-auditor 파견 여부** — 기계가 볼 수 있는 표면 신호가 없어 판단으로 남겼다. 강제되는 것은 security-reviewer 뿐이다. [CONFIRMED: graph.mjs — require_reviewer 에 security-reviewer 만 선언 — graph.mjs:121]
- **"보안 표면이 닿는가" 판단** — risk-surface 게이트가 코드에서 직접 감지하므로 판단 몫이 줄었다. 남은 재량은 감지 범위 밖(`src`·`supabase` 외)뿐이다. [CONFIRMED: run-gates.mjs 의 scanFiles]
