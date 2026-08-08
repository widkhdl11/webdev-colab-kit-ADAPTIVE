# 05. implement — spec과 design이 합류하는 곳

## Purpose
승인된 스펙과 승인된 시각 기준을 코드로 옮긴다. 그래프에서 유일하게 상류가 둘인 노드로, 여기서 두 직교 갈래가 만난다 [(graph.mjs:61-65)](../../graph.mjs#L61-L65).

## Entry condition
`depends_on: ["spec", "design"]` — **둘 다 clean** 이어야 프론티어가 된다 [(graph.mjs:62)](../../graph.mjs#L62). release 판정도 상류 clean 을 먼저 확인한다 [(graph-stop.mjs:235)](../../gates/graph-stop.mjs#L235).
UI 레이어에 손대려면 추가로 `design-rules.md` 가 `status: approved` 여야 한다 — 아니면 편집 즉시 `design/BEFORE_UI` 로 막힌다 [(run-gates.mjs:213-226)](../../gates/run-gates.mjs#L213-L226).

## What it does
1. 구현 전 한 문단 요약 → 동의 → 시작 [(CLAUDE.md:16)](../../CLAUDE.md#L16).
2. 작업 등급을 먼저 정한다(빠른 경로 / 정식 경로) [(CLAUDE.md:42-56)](../../CLAUDE.md#L42-L56).
3. approved 스펙이 있는 기능은 **테스트 먼저**, red 출력을 보여준 뒤 구현 [(rules/tdd.md:7-9)](../../.claude/rules/tdd.md#L7-L9).
4. FSD 6레이어 안에서 아래 방향 import 만 [(run-gates.mjs:109-131)](../../gates/run-gates.mjs#L109-L131).
5. UI 레이어는 design-rules.md 기준 + 접근성·토큰 규칙을 따른다 [(rules/ui-layers.md:7-17)](../../.claude/rules/ui-layers.md#L7-L17).
6. 편집할 때마다 PostToolUse 훅이 `run-gates --quick` 를 돌려 위반을 즉시 되돌려준다 [(.claude/settings.json:25-30)](../../.claude/settings.json#L25-L30).

## Skills and tools
| name | when | evidence |
|---|---|---|
| `.claude/rules/*.md` | 편집 경로가 `paths` 에 매칭될 때 자동 로드 | [CONFIRMED: .claude/rules/tdd.md:1-5] |
| `gates/run-gates.mjs --quick` | 매 편집 직후 (PostToolUse) | [CONFIRMED: .claude/settings.json:28] |
| `code-reviewer` 등 리뷰어 | 기능 완성 시 — implement 가 아니라 review 단계 | [CONFIRMED: CLAUDE.md:70-79] |

## Documents read
| document | purpose | required? |
|---|---|---|
| `projects/<이름>/docs/specs/*.md` | 구현할 불변식(INV) | 위험 기능일 때 예 |
| `projects/<이름>/docs/design/design-rules.md` | UI 작업의 시각 기준 | UI 작업이면 예 (게이트가 강제) |
| `docs/design/mockups/*.html` | 승인된 시안을 시각 스펙으로 | 새 방향 화면이면 예 |
| `.claude/rules/*.md` | 레이어별 금지·요구 | 경로 매칭 시 자동 |

## Documents written
| document | ownership | consumed by |
|---|---|---|
| `projects/<이름>/src/**` | implement 노드의 produces | qa · review 의 basis 해시 · run-gates |
| `src/shared/ui/tokens.css` | 디자인 토큰 (design 국면 산출물이지만 src 아래) | UI 구현 |

## Gate
`clean_when: { gate: ["fsd", "security", "tsc", "design"] }` [(graph.mjs:64)](../../graph.mjs#L64) — `src/**` 경로에 그 카테고리 에러가 0건이어야 한다.
- `fsd/UPWARD_IMPORT` — 하위 레이어가 상위를 import [(run-gates.mjs:120-123)](../../gates/run-gates.mjs#L120-L123)
- `fsd/CROSS_SLICE` — 같은 레이어의 다른 슬라이스 import [(run-gates.mjs:124-130)](../../gates/run-gates.mjs#L124-L130)
- `security/*` — eval·innerHTML·하드코딩 시크릿·document.write [(run-gates.mjs:37-58)](../../gates/run-gates.mjs#L37-L58)
- `tsc/*` — `npx tsc --noEmit` [(run-gates.mjs:232-254)](../../gates/run-gates.mjs#L232-L254)
- `design/BEFORE_UI` — 승인 없는 UI 착수 [(run-gates.mjs:221-225)](../../gates/run-gates.mjs#L221-L225)

통과하면 그 턴의 release 에서 clean + 해시 저장 [(graph-stop.mjs:236-241)](../../gates/graph-stop.mjs#L236-L241). 실패하면 Stop 훅이 `exit 2` 로 차단하고 "새 기능 금지, 위반만 수정" 을 주입한다 [(graph-stop.mjs:266-269)](../../gates/graph-stop.mjs#L266-L269).

## Failure path
- 게이트 실패 → 새 기능 추가 금지, 위반만 수정 [(CLAUDE.md:31)](../../CLAUDE.md#L31).
- qa/review 실패가 `impl-level` 로 판정되면 evidence 위치의 코드를 고친다. 별도 마크는 필요 없다 — 실패한 검증이 이미 dirty 를 잡고 있다 [(qa-classifier.md:66-67)](../../.claude/agents/qa-classifier.md#L66-L67).
- `src/**` 가 바뀌면 해시가 달라져 implement + 하류(qa·review·deploy)가 다시 dirty 가 된다 [(graph-stop.mjs:216-222)](../../gates/graph-stop.mjs#L216-L222).

## Exit condition
`src/**` 에 fsd·security·tsc·design 에러가 0건이고, 상류(spec·design)가 clean. 그 순간 implement 가 clean 이 되고 프론티어는 qa 로 내려간다.

## Unverified
- **"한 문단 요약 → 동의" 절차** — 코드로 강제되지 않는 서술 규칙이다. [INFERRED]
- **작업 등급 판정** — 빠른/정식 경로 선택은 모델의 판단이고 기록되지 않는다. [INFERRED]
- **테스트 먼저(red→green) 순서** — tdd 규칙은 문서일 뿐, 게이트는 최종 green 만 본다. [INFERRED]
- **`src/**` 해시가 테스트 파일까지 포함한다** — 테스트를 고쳐도 implement 가 dirty 가 된다. 의도인지 부작용인지는 파일로 판단할 수 없다 (findings F10 과 짝을 이룬다). [INFERRED]
