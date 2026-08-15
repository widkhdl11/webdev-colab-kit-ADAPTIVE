# 02. spec

`product` 에서만 파생되는 두 노드 중 하나. `design` 과 **직교**다 — 서로 의존하지 않는다 ([graph.mjs:47](../../../graph.mjs#L47)).

## Purpose

어기면 사고가 나는 기능의 불변식을 **테스트가 참조할 수 있는 ID 형태로** 못 박는다.
없으면 깨지는 것: `spec-coverage` 게이트가 검사할 대상이 사라지고, 위험 기능이 "구현했으니 됐다"로 통과한다.
산문 명세를 금지하는 이유가 여기 있다 — [spec/SKILL.md:34](../../../.claude/skills/spec/SKILL.md#L34) "ID 없는 불변식은 테스트가 참조할 수 없다".

## Entry condition

| 조건 | 어디서 막나 |
|---|---|
| `product` 가 clean | [graph.mjs:49](../../../graph.mjs#L49) `depends_on: ["product"]` · [graph-stop.mjs:235](../../../gates/graph-stop.mjs#L235) 이 상류 clean 아니면 판정 자체를 건너뜀 |
| 기능이 결제·인증·권한·동시성이거나 시변·파생 상태 | [CLAUDE.md:60](../../../CLAUDE.md#L60) · [spec/SKILL.md:3](../../../.claude/skills/spec/SKILL.md#L3) |

**단순 UI/콘텐츠 기능에는 들어가지 않는다** ([spec/SKILL.md:3](../../../.claude/skills/spec/SKILL.md#L3)).
그런데 그 판단을 강제하는 게이트는 없다 — 위험 기능인지 아닌지는 사람이 정한다. `[INFERRED]`

## What it does

1. 템플릿 정본 [docs/references/spec-template.md](../../references/spec-template.md) 를 프로젝트로 복사해 `projects/<이름>/docs/specs/<기능>.md` 를 만든다 ([spec/SKILL.md:7-9](../../../.claude/skills/spec/SKILL.md#L7-L9))
2. "어기면 사고"를 사용자와 나열 → 각각을 불변식 문장으로. 데이터 모델 기능이면 [modeling-checklist.md](../../references/modeling-checklist.md) 를 **깊게** 훑는다 (kickoff 은 얕게 — 깊이가 단계를 가른다) ([spec/SKILL.md:12-15](../../../.claude/skills/spec/SKILL.md#L12-L15))
3. 불변식마다 4개 체크: 참/거짓 판정 가능한가 · 위반 시 무슨 일이 나는지 · 신뢰 경계 · 강제 위치 ([spec/SKILL.md:16-17](../../../.claude/skills/spec/SKILL.md#L16-L17))
4. 시나리오는 Given/When/Then + INV ID 참조 필수, 불변식마다 실패 경로 1개 이상 ([spec/SKILL.md:18](../../../.claude/skills/spec/SKILL.md#L18))
5. `status: draft` 로 저장 → 사용자 승인 → `status: approved` ([spec/SKILL.md:19-20](../../../.claude/skills/spec/SKILL.md#L19-L20))
6. approved 후 [rules/tdd.md](../../../.claude/rules/tdd.md) 에 따라 **테스트 먼저** ([spec/SKILL.md:21](../../../.claude/skills/spec/SKILL.md#L21))

## Skills and tools

| name | when | evidence |
|---|---|---|
| `spec` | 위험 기능·시변 상태 구현 **전** | [CONFIRMED: ../../../.claude/skills/spec/SKILL.md:3] |
| `spec-auditor` 서브에이전트 | "있으면 감사" — **이 레포에 없다** | [CONFIRMED: ../../../.claude/skills/spec/SKILL.md:19] 가 조건부로 언급 · [CONFIRMED: ../reference/subagents.md] 7개 목록에 부재 |
| `modeling-checklist` 참고 | 데이터 모델 기능이면 깊게 | [CONFIRMED: ../../../.claude/skills/spec/SKILL.md:14] |
| `qa-classifier` | 검증 실패가 spec-level 로 귀속되면 이 노드를 dirty 로 | [CONFIRMED: ../../../.claude/agents/qa-classifier.md:3] |

## Documents read

| document | purpose | required? |
|---|---|---|
| `projects/<이름>/docs/PRODUCT.md` | 어느 기능이 위험 표면인지 | 예 (상류 산출물) |
| [docs/references/spec-template.md](../../references/spec-template.md) | 형식 정본 | 예 — 프로젝트에 `_TEMPLATE.md` 가 없으면 복사 |
| [docs/references/modeling-checklist.md](../../references/modeling-checklist.md) | 필드 단위 불변식 도출 | 데이터 모델 기능일 때만 |

## Documents written

| document | ownership | consumed by |
|---|---|---|
| `projects/<이름>/docs/specs/*.md` | spec 노드의 produces ([graph.mjs:50](../../../graph.mjs#L50)) | [spec-coverage.mjs:30-37](../../../gates/spec-coverage.mjs#L30-L37) · test-auditor · security-reviewer · qa-classifier |
| `projects/<이름>/docs/specs/planned/*.md` | 보류 스펙 (draft 고정) | **아무도** — 글롭이 비재귀라 게이트가 못 본다 |
| `projects/<이름>/docs/specs/_TEMPLATE.md` | 프로젝트 로컬 템플릿 | spec 스킬 |

## Gate

**조건 두 개를 모두 만족해야 한다** ([graph.mjs:51-54](../../../graph.mjs#L51-L54)):

1. `frontmatter: { path: "docs/specs/*.md", require: "status: approved" }` — 매칭되는 **모든** 파일이 approved 여야 한다 ([graph-stop.mjs:157](../../../gates/graph-stop.mjs#L157) `files.every`)
2. `gate: ["spec-coverage"]` — approved 스펙의 모든 `INV-*` 를 참조하는 테스트가 있어야 한다 ([spec-coverage.mjs:56-60](../../../gates/spec-coverage.mjs#L56-L60))

**글롭이 무엇을 잡는지가 중요하다.** `docs/specs/*.md` 는 [graph-stop.mjs:38](../../../gates/graph-stop.mjs#L38) 에서 `[^/]*` 로 번역되어 **비재귀**다 → `planned/` 하위는 안 잡힌다.
또 [graph-stop.mjs:58](../../../gates/graph-stop.mjs#L58) 이 `_` 로 시작하는 파일을 걸러내므로 `_TEMPLATE.md` 도 제외된다. 이 두 장치가 없으면 템플릿과 보류 스펙이 spec 국면을 영구히 막는다.

**실패 경로**: draft 가 하나라도 있으면 spec 이 dirty → implement·qa·review·deploy 전부 dirty.
[spec/SKILL.md:30-31](../../../.claude/skills/spec/SKILL.md#L30-L31) 이 경고하는 대로, **완성된 슬라이스의 리뷰 사인오프조차 막힌다.**

> ⚠ **검사할 파일이 없으면 그냥 통과한다.** `docs/specs/` 에 파일이 하나도 없으면 [graph-stop.mjs:153](../../../gates/graph-stop.mjs#L153) 이 `true` 를 반환해 spec 이 clean 이 된다. 스펙을 한 장도 안 쓴 프로젝트와, 다 쓰고 승인받은 프로젝트가 게이트에서 **구별되지 않는다** ([findings F-03](../findings.md)).

## Failure path

- 여러 스펙을 한꺼번에 approved 하면 all-or-nothing 으로 막힌다 → 구현 가능한 단위로 쪼개 하나씩 ([spec/SKILL.md:23-27](../../../.claude/skills/spec/SKILL.md#L23-L27))
- 미준비 스펙은 `planned/` 에 draft 로 내려 국면을 막지 않게 한다 ([spec/SKILL.md:28-31](../../../.claude/skills/spec/SKILL.md#L28-L31))
- 검증 실패가 **spec-level** 로 귀속되면 해당 스펙을 `status: draft` 로 내린다(거부). 재작업+재승인 전까지 dirty 유지 ([CLAUDE.md:85-87](../../../CLAUDE.md#L85-L87))
- spec-level 판정은 **등급 무관 사용자에게 먼저 보고**해야 한다 ([CLAUDE.md:88](../../../CLAUDE.md#L88))

## Exit condition

`docs/specs/*.md`(비재귀, `_` 제외) 가 전부 `status: approved` **이고** approved 스펙의 모든 INV 를 참조하는 테스트가 존재한다
→ spec clean. `design` 도 clean 이면 프론티어가 `implement` 로 이동한다 ([graph.mjs:78](../../../graph.mjs#L78)).

## Unverified

- **`spec-auditor` 서브에이전트가 이 레포에 없다.** [spec/SKILL.md:19](../../../.claude/skills/spec/SKILL.md#L19) 가 "있으면 감사"라는 조건부로 언급하지만 `.claude/agents/` 7개에 없다. 조건부 표현이라 [findings](../findings.md) 의 "유령 참조"로 올리지는 않았다 — 판단 기준을 어디에 두느냐에 따라 갈릴 자리다. `[INFERRED]`
- **`INV-` 라는 ID 규약이 어디서 정의되는지 확인 못 했다.** [spec-coverage.mjs:36](../../../gates/spec-coverage.mjs#L36) 의 정규식 `\bINV-[A-Z0-9]+\b` 가 사실상 유일한 정의다. `spec-template.md` 를 읽지 않아 형식 명세가 따로 있는지 모른다. `[INFERRED]`
- **`status: approved` 로 바꾸는 행위에 승인 흔적이 남지 않는다.** [spec/SKILL.md:35](../../../.claude/skills/spec/SKILL.md#L35) 가 "사용자 승인 없이 approved 로 변경 금지"라고 쓰지만, 누가 언제 승인했는지 파일에 남기는 규칙은 못 찾았다. `[INFERRED]`
- **spec-coverage 는 활성 프로젝트만이 아니라 전 프로젝트를 훑는다** ([spec-coverage.mjs:9-14](../../../gates/spec-coverage.mjs#L9-L14)). 반면 graph-stop 은 활성 프로젝트만 본다 ([graph-stop.mjs:24](../../../gates/graph-stop.mjs#L24)). 비활성 프로젝트의 INV 누락이 활성 프로젝트의 spec 노드를 막는지 — 코드상 [graph-stop.mjs:141](../../../gates/graph-stop.mjs#L141) 이 다른 프로젝트 에러를 무시하므로 막지 않을 것으로 보이나, 직접 돌려 보지는 않았다. `[INFERRED]`
