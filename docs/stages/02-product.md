# 02. product — 무엇을 만들지의 정의

## Purpose
"무엇을 만드는가"를 한 문서로 고정한다. 이 노드가 비어 있으면 그래프의 모든 하류(spec·design·implement·qa·review·deploy)가 dirty로 남아 어떤 작업도 근거를 갖지 못한다.

## Entry condition
`docs/PRODUCT.md` 가 없거나 비어 있으면 product 는 dirty이고, 상류가 없으므로(`depends_on: []`) 곧바로 프론티어가 된다 [(graph.mjs:25-29)](../../graph.mjs#L25-L29).
[CLAUDE.md:9](../../CLAUDE.md#L9) 는 이 상태에서 `kickoff` 스킬로 시작하라고 지시한다.

## What it does
1. 프로젝트 이름을 정하고 `projects/<이름>/` 생성, 루트 `ACTIVE` 에 이름 한 줄을 기록한다 [(kickoff/SKILL.md:13)](../../.claude/skills/kickoff/SKILL.md#L13).
2. 첫 설명만으로 `docs/PRODUCT.md` 초안을 **먼저 만든다** — 인터뷰보다 파일 착수가 앞선다 [(kickoff/SKILL.md:36)](../../.claude/skills/kickoff/SKILL.md#L36).
3. ①목적/대상 ②필수·비범위 ③페이지 ④기술 ⑤디자인 순으로, 한 번에 3개 이하 질문 + 선택지 제시 [(kickoff/SKILL.md:16-17)](../../.claude/skills/kickoff/SKILL.md#L16-L17).
4. 기술 항목은 하네스 전제(TS·FSD·검증)를 고지하고, 프리셋 안의 여지(렌더링·데이터 계층·배포)만 묻는다 [(kickoff/SKILL.md:18-21)](../../.claude/skills/kickoff/SKILL.md#L18-L21).
5. 엔티티가 도출되면 `modeling-checklist.md` 를 **얕게** 훑어 시변·파생 필드에 "(스펙 필요: …)" 플래그만 찍는다 [(kickoff/SKILL.md:25-29)](../../.claude/skills/kickoff/SKILL.md#L25-L29).
6. 요약 → 동의 → `setup` 스킬 제안 [(kickoff/SKILL.md:30)](../../.claude/skills/kickoff/SKILL.md#L30).

## Skills and tools
| name | when | evidence |
|---|---|---|
| `kickoff` 스킬 | 활성 프로젝트가 없거나 PRODUCT.md가 비었을 때 | [CONFIRMED: CLAUDE.md:9] |
| `setup` 스킬 | PRODUCT.md 승인 직후 — 하네스 구성 + tech-stack 합의 + 스캐폴딩 | [CONFIRMED: .claude/skills/setup/SKILL.md:3] |
| `scripts/scaffold.mjs` | setup 6단계에서 골격 생성 | [CONFIRMED: .claude/skills/setup/SKILL.md:26] |
| `docs/references/modeling-checklist.md` | 엔티티가 나올 때 얕게 | [CONFIRMED: .claude/skills/kickoff/SKILL.md:25] |

## Documents read
| document | purpose | required? |
|---|---|---|
| `ACTIVE` | 어느 프로젝트에 쓸지 | 예 (없으면 kickoff 0단계에서 만든다) |
| `docs/references/modeling-checklist.md` | 데이터 모델 위험 플래그 | 아니오 — 엔티티가 나올 때만 |
| `docs/references/architectures/*` | tech-stack 선택지 제시 (setup) | 아니오 |

## Documents written
| document | ownership | consumed by |
|---|---|---|
| `projects/<이름>/docs/PRODUCT.md` | kickoff (스코프 변경 시에만 갱신, 사용자 동의 필수) | product 노드의 clean 판정, briefing 진행률, setup |
| `projects/<이름>/workspace/DECISIONS.md` | kickoff — 트레이드오프가 있던 결정 한 줄 | 사람 (CLAUDE.md 라우팅), setup |
| `projects/<이름>/docs/tech-stack.md` | setup — draft→approved | setup 자신뿐 ⚠ 그래프 밖 (findings F7) |
| `ACTIVE` | kickoff | briefing · graph-stop · run-gates |

## Gate
`clean_when: { exists_nonempty: "docs/PRODUCT.md" }` [(graph.mjs:28)](../../graph.mjs#L28).
판정 구현은 [graph-stop.mjs:164-168](../../gates/graph-stop.mjs#L164-L168) — 파일이 매칭되고 내용이 비어 있지 않으면 clean.
- 통과: product clean → 프론티어가 spec·design 으로 내려간다.
- 실패: product dirty 유지 → 전 하류 dirty [(propagate.mjs)](../../gates/propagate.mjs).

## Failure path
PRODUCT.md 가 잘못됐다는 판정(제품 정의 자체가 틀림)은 자동으로 잡히지 않는다. 수동 프리미티브는 `node gates/graph-stop.mjs --mark product` [(graph-stop.mjs:193-206)](../../gates/graph-stop.mjs#L193-L206) — 자기 + 자식 + 전이 하류가 dirty가 된다.
단, product 는 게이트가 통과하는 노드라 `--mark` 는 다음 Stop에 도로 clean 된다 [(qa-classifier.md:70-71)](../../.claude/agents/qa-classifier.md#L70-L71).

## Exit condition
`docs/PRODUCT.md` 가 존재하고 비어 있지 않으며, 사용자가 "이대로 시작"에 동의한 상태. 그때 프론티어는 spec 또는 design 이 된다.

## Unverified
- **PRODUCT.md 의 "내용이 채워졌다"와 "합의됐다"는 다르다** — 게이트는 비어 있지 않은지만 본다. 승인 여부를 나타내는 프론트매터가 없다. [INFERRED]
- **kickoff 이 실제로 파일부터 만드는지** — 금지 조항([kickoff/SKILL.md:36](../../.claude/skills/kickoff/SKILL.md#L36))은 있으나 강제하는 게이트는 없다. [INFERRED]
- **tech-stack.md 의 approved 가 scaffold 를 실제로 막는지** — "approved 전에는 scaffold 금지"는 산문 규칙이고 훅/게이트 검사가 없다. [INFERRED]
