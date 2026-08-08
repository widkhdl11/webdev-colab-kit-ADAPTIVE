# 03. spec — 어기면 사고 나는 것의 불변식

## Purpose
결제·인증·권한·동시성·시변 상태처럼 어기면 사고가 나는 기능의 약속을 테스트가 참조할 수 있는 ID 붙은 불변식으로 고정한다. 없으면 "무엇을 지켜야 하는가"가 코드 리뷰어의 기억에만 남는다.

## Entry condition
product 가 clean 이고 spec 이 dirty 일 때 프론티어가 된다 [(graph.mjs:32-33)](../../graph.mjs#L32-L33). design 과는 직교라 서로를 기다리지 않는다.
착수 신호는 두 가지: PRODUCT.md 에 "(스펙 필요: …)" 플래그가 있거나 [(kickoff/SKILL.md:27-29)](../../.claude/skills/kickoff/SKILL.md#L27-L29), 위험 기능 구현 직전이거나 [(CLAUDE.md:60)](../../CLAUDE.md#L60).

## What it does
1. `docs/specs/_TEMPLATE.md` 형식으로 `docs/specs/<기능명>.md` 를 만든다. 프로젝트에 템플릿이 없으면 킷 정본 `docs/references/spec-template.md` 를 복사한다 [(spec/SKILL.md:7-9)](../../.claude/skills/spec/SKILL.md#L7-L9).
2. "어기면 사고"를 나열해 각각 불변식 문장으로 바꾼다. 데이터 모델 기능이면 `modeling-checklist.md` 를 **깊게** 훑는다 [(spec/SKILL.md:12-15)](../../.claude/skills/spec/SKILL.md#L12-L15).
3. 불변식마다 검증: 참/거짓 판정 가능 · 위반 시 무슨 일 · 신뢰 경계 · 강제 위치 [(spec/SKILL.md:16-17)](../../.claude/skills/spec/SKILL.md#L16-L17).
4. 시나리오는 Given/When/Then + INV ID 참조, 불변식마다 실패 경로 1개 이상 [(spec/SKILL.md:18)](../../.claude/skills/spec/SKILL.md#L18).
5. `status: draft` 로 저장 → 사용자 승인 → `status: approved` [(spec/SKILL.md:19-20)](../../.claude/skills/spec/SKILL.md#L19-L20).
6. **구현 가능한 단위로 하나씩** approved. 아직 못 하는 것은 `docs/specs/planned/` 에 draft 로 내려둔다 [(spec/SKILL.md:23-31)](../../.claude/skills/spec/SKILL.md#L23-L31).

## Skills and tools
| name | when | evidence |
|---|---|---|
| `spec` 스킬 (`/spec <기능명>`) | 위험 기능 구현 전 | [CONFIRMED: .claude/skills/spec/SKILL.md:1-5] |
| `gates/spec-coverage.mjs` | approved 스펙의 INV마다 참조 테스트 존재 검사 | [CONFIRMED: graph.mjs:37] |
| `.claude/rules/tdd.md` | approved 이후 테스트 먼저 | [CONFIRMED: .claude/rules/tdd.md:7-8] |
| `spec-auditor` 서브에이전트 | 있으면 감사 — **이 레포에는 없다** | [CONFIRMED: .claude/agents/ 에 부재] |

## Documents read
| document | purpose | required? |
|---|---|---|
| `projects/<이름>/docs/PRODUCT.md` | 어느 기능이 위험한지 | 예 |
| `docs/references/spec-template.md` | 템플릿 정본 | 프로젝트에 `_TEMPLATE.md` 가 없을 때만 |
| `docs/references/modeling-checklist.md` | 데이터 모델 불변식 도출 | 데이터 모델 기능일 때만 |

## Documents written
| document | ownership | consumed by |
|---|---|---|
| `projects/<이름>/docs/specs/<기능>.md` | spec 스킬 (승인은 사용자) | spec 노드 clean 판정 · spec-coverage · tdd 규칙 · qa-classifier |
| `projects/<이름>/docs/specs/planned/*.md` | spec 스킬 — 합의됐으나 미구현 | 사람. spec 노드 글롭이 비재귀라 판정에서 제외된다 |

## Gate
두 조건이 **모두** 걸린다 [(graph.mjs:35-38)](../../graph.mjs#L35-L38):
1. `frontmatter: docs/specs/*.md 가 status: approved` — 구현은 [graph-stop.mjs:150-162](../../gates/graph-stop.mjs#L150-L162), 줄 시작 앵커로 프론트매터 블록만 본다.
2. `gate: ["spec-coverage"]` — approved 스펙의 모든 `INV-*` 를 참조하는 테스트가 있어야 한다 [(spec-coverage.mjs:29-60)](../../gates/spec-coverage.mjs#L29-L60).

- 통과: spec clean → implement 로 합류 가능.
- 실패: `[spec-coverage/MISSING_TEST] <스펙경로> — INV-xx를 검증하는 테스트가 없다` 가 뜨고 spec dirty 유지.

주의: draft 스펙은 spec-coverage 가 무시한다 [(spec-coverage.mjs:35)](../../gates/spec-coverage.mjs#L35). 그래서 `planned/` 의 미준비 스펙이 게이트를 막지 않는다.

## Failure path
- INV 커버리지 실패 → 테스트를 먼저 쓴다(tdd 규칙). 이건 qa 실패가 아니라 spec 노드 자신의 게이트다.
- 검증 실패가 "요구 자체의 모순"으로 판정되면(qa-classifier 가 `spec-level`) 해당 스펙을 `status: draft` 로 되돌린다 — 승인 취소라 재작업+재승인 전까지 dirty 가 유지된다 [(qa-classifier.md:62-63)](../../.claude/agents/qa-classifier.md#L62-L63).
- `spec-level` 판정은 등급과 무관하게 사용자에게 먼저 보고한다 [(CLAUDE.md:88)](../../CLAUDE.md#L88).

## Exit condition
`docs/specs/*.md`(비재귀)의 모든 파일이 `status: approved` 이고, 그 INV를 참조하는 테스트가 하나 이상 있어 spec-coverage 가 0건인 상태.

## Unverified
- **불변식 품질** — 게이트는 "INV ID 를 참조하는 테스트가 존재하는가"만 본다. 그 테스트가 실제로 그 불변식을 검증하는지는 `test-auditor` 서브에이전트의 판단이고 자동 판정이 없다. [INFERRED]
- **draft→approved 전환에 사용자 승인이 실제로 있었는지** — 프론트매터 값만 남고 승인 이력은 남지 않는다. [INFERRED]
- **`planned/` 승격 절차** — 파일을 옮기라는 서술만 있고 이를 돕거나 검사하는 도구가 없다. [INFERRED]
