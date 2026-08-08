# 11. qa-classifier — 실패를 어느 층에 귀속시킬 것인가

## Purpose
검증 실패를 `spec / design / impl` 중 한 레벨로 귀속한다. **라우팅하지 않는다** — "어느 노드를 dirty 로 마크할지"만 정하고, 재작업 범위는 전파가 파생한다 [(qa-classifier.md:6-7)](.claude/agents/qa-classifier.md#L6-L7).

## Entry condition
qa(테스트·spec-coverage) 또는 review(리뷰어 지적)가 실패했을 때. 그래프에는 `on_fail_diagnose: "qa-classifier"` 로 선언돼 있고, 이건 "어디로 갈지"가 아니라 "무엇을 진단할지"다 [(graph.mjs:73-76)](graph.mjs#L73-L76).
graph-stop 이 신호만 출력한다 — 파견은 모델·사용자의 행동이다 [(graph-stop.mjs:252-256)](gates/graph-stop.mjs#L252-L256).

## What it does
아래에서 위로 올라가는 **충실성 사다리**를 타고, 처음으로 상류에 불충실한 층에서 멈춘다 [(qa-classifier.md:14-27)](.claude/agents/qa-classifier.md#L14-L27).
1. 코드가 spec·design 에 충실한가? 아니면 → **impl-level**.
2. (코드 무죄) 설계가 요구를 충족하는가? 아니면 → **design-level**.
3. (설계 무죄) 요구/스펙 자체가 정합한가? 아니면 → **spec-level**.

출력은 세 필드 고정 [(qa-classifier.md:34-40)](.claude/agents/qa-classifier.md#L34-L40):
```
{ level: <spec-level | design-level | impl-level>,
  reason: <한 문장>,
  evidence: <근거 파일:라인> }
```

## Skills and tools
| name | when | evidence |
|---|---|---|
| `qa-classifier` 서브에이전트 | 검증 실패 직후 | [CONFIRMED: .claude/agents/qa-classifier.md:1-4] |
| `node gates/graph-stop.mjs --mark <node>` | 파일 변경 없이 강제 dirty (저수준 프리미티브) | [CONFIRMED: .claude/agents/qa-classifier.md:70-71] |
| 프론트매터 '거부' | 게이트 통과 노드에 dirty 를 지속시키는 방법 | [CONFIRMED: .claude/agents/qa-classifier.md:58-67] |

도구는 `Read, Grep, Glob` 뿐 — 판정만 하고 아무것도 고치지 않는다 [(qa-classifier.md:4)](.claude/agents/qa-classifier.md#L4).

## Documents read
| document | purpose | required? |
|---|---|---|
| 실패 로그 원문 | 판정 입력 | 예 |
| 변경 diff (마지막 clean 이후) | 무엇이 바뀌어 깨졌는지 | 예 |
| `docs/specs/*.md` 의 INV | 코드가 상류를 지켰는지 | 스펙이 있을 때 |
| `docs/design/design-rules.md` · 시안 | 설계 충실성 | UI 실패일 때 |
| 지목된 `src/**` | evidence 위치 | 예 |

## Documents written
| document | ownership | consumed by |
|---|---|---|
| (없음 — 판정 결과는 반환값) | 분류기는 Write 권한이 없다 | 본체가 레벨별 행동을 수행 |
| (판정 후 본체가) `docs/specs/<기능>.md` frontmatter → `status: draft` | spec-level 거부 | spec 노드 dirty 유지 |
| (판정 후 본체가) `docs/design/design-rules.md` frontmatter → `status: draft` | design-level 거부 | design 노드 dirty 유지 |

## Gate
이 단계는 게이트가 아니다. 다만 **강제 승격** 규칙이 하나 걸린다: `spec-level` 이거나 evidence 가 위험 표면(인증·결제·권한·격리 INV·security)에 닿으면 등급과 무관하게 사용자에게 먼저 보고한다 [(qa-classifier.md:42-46)](.claude/agents/qa-classifier.md#L42-L46), [(CLAUDE.md:87-88)](CLAUDE.md#L87-L88).

## Failure path
- 판정이 틀렸을 경우의 복구 장치는 "수렴"이다 — 남은 문제는 재실행 후 다음 검증이 다시 잡는다 [(qa-classifier.md:27)](.claude/agents/qa-classifier.md#L27).
- `--mark` 만으로는 게이트가 통과하는 노드에서 dirty 가 유지되지 않는다. 그래서 레벨별로 프론트매터 '거부'를 쓴다 [(qa-classifier.md:58-61)](.claude/agents/qa-classifier.md#L58-L61).

## Exit condition
`{level, reason, evidence}` 가 반환되고, 본체가 그 레벨에 맞는 행동(코드 수정 또는 승인 취소)을 수행한 상태.

## Unverified
- **파견 시점** — 스크립트는 신호만 출력한다. 실제로 파견됐는지, 몇 번 파견됐는지는 어디에도 기록되지 않는다. [INFERRED]
- **판정 정확도** — 사다리 논리는 프롬프트로 고정돼 있으나 검증 수단이 없다. [INFERRED]
- **예시 evidence 경로 2건이 이 레포에 없다** — `supabase/migrations/0007_exam.sql`, `docs/specs/auth-isolation.md` (findings F5). 예시임이 문맥상 분명하나, 신규 프로젝트에서 흉내낼 여지는 남는다. [CONFIRMED: 부재]
- **거부가 실제로 되돌려졌는지 추적** — `status: draft` 로 되돌린 이력은 git 밖에 남지 않는다. [INFERRED]
