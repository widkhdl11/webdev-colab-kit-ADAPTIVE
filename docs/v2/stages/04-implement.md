# 04. implement

`spec` 과 `design` 이 **합류하는** 유일한 지점 ([graph.mjs:78](../../../graph.mjs#L78) `depends_on: ["spec", "design"]`).
그래프에서 상류가 둘인 노드는 여기뿐이다.

## Purpose

승인된 불변식과 승인된 시각 기준을 코드로 옮긴다.
없으면 깨지는 것: 이 노드의 내용 해시가 `review`·`deploy` 사인오프의 `basis` 다 ([graph.mjs:119](../../../graph.mjs#L119)·[:131](../../../graph.mjs#L131)) — implement 가 없으면 사인오프가 무엇을 두고 한 승인인지 정해지지 않는다.

## Entry condition

| 조건 | 어디서 막나 |
|---|---|
| `spec` **과** `design` 이 **둘 다** clean | [graph.mjs:78](../../../graph.mjs#L78) · [graph-stop.mjs:235](../../../gates/graph-stop.mjs#L235) `depends_on.every(clean)` |
| approved 스펙이 있으면 **테스트가 먼저** | [tdd.md:7-9](../../../.claude/rules/tdd.md#L7-L9) |
| pages/widgets 를 만들려면 design-rules.md 가 approved | [run-gates.mjs:455-468](../../../gates/run-gates.mjs#L455-L468) `design/BEFORE_UI` |

## What it does

1. approved 스펙이 있으면 **시나리오를 테스트로 먼저** 쓰고, 실행해서 **red 를 출력으로 보여준다** → 구현 → green ([tdd.md:9-10](../../../.claude/rules/tdd.md#L9-L10)). "구현 후 끼워 맞춘 테스트는 알리바이지 검증이 아니다"
2. FSD 6레이어 안에 배치한다 — `app · pages · widgets · features · entities · shared`, import 는 아래 방향만 ([run-gates.mjs:12](../../../gates/run-gates.mjs#L12) · [CLAUDE.md:32](../../../CLAUDE.md#L32))
3. 레이어별 규칙은 **경로를 편집하는 순간 자동으로 붙는다** (`paths:` 프론트매터):
   - [domain-layers.md](../../../.claude/rules/domain-layers.md) → `src/entities/**` · `src/features/**`
   - [ui-layers.md](../../../.claude/rules/ui-layers.md) → `src/app/**` · `src/pages/**` · `src/widgets/**`
   - [shared.md](../../../.claude/rules/shared.md) → `src/shared/**`
   - [tdd.md](../../../.claude/rules/tdd.md) → `src/**` · `tests/**`
   - [supabase.md](../../../.claude/rules/supabase.md) · [supabase-wama.md](../../../.claude/rules/supabase-wama.md)
4. 도메인 규칙은 entities, 유스케이스 조합은 features. 값 객체는 스마트 컨스트럭터로 잘못된 값이 애초에 못 만들어지게 ([domain-layers.md:7-8](../../../.claude/rules/domain-layers.md#L7-L8))
5. UI 레이어에는 비즈니스 규칙 금지 — 판단은 features/entities 에서 가져오고 조합·표시만 ([ui-layers.md:8](../../../.claude/rules/ui-layers.md#L8))
6. 스펙이 있으면 코드 주석에 INV ID 를 참조한다 ([domain-layers.md:11](../../../.claude/rules/domain-layers.md#L11))

## Skills and tools

| name | when | evidence |
|---|---|---|
| 스킬 | **없음** — 이 단계 전용 스킬은 적혀 있지 않다 | [CONFIRMED: ../reference/skills.md] 10개 중 implement 를 트리거로 삼는 항목 0건 |
| `code-reviewer` | 기능 완성 시 (review 노드 쪽 일) | [CONFIRMED: ../../../.claude/agents/code-reviewer.md:6] 이 `src/` 를 읽음 |
| `qa-classifier` | 실패가 impl-level 로 귀속될 때 | [CONFIRMED: ../../../.claude/agents/qa-classifier.md:17] |
| 규칙 자동 로드 | 경로 편집 시 | [CONFIRMED: ../../../.claude/rules/tdd.md:2] `paths:` |

**이 단계에는 인터뷰도 승인 절차도 없다.** 진행은 전적으로 게이트 통과 여부로 판정된다.

## Documents read

| document | purpose | required? |
|---|---|---|
| `projects/<이름>/docs/specs/*.md` | 불변식·시나리오 | approved 스펙이 있는 기능이면 예 |
| `projects/<이름>/docs/design/design-rules.md` | 시각 기준 | UI 작업이면 예 ([ui-layers.md:9](../../../.claude/rules/ui-layers.md#L9)) |
| `.claude/rules/*.md` | 레이어 규칙 | 경로 일치 시 자동 |

## Documents written

| document | ownership | consumed by |
|---|---|---|
| `projects/<이름>/src/**` | implement 의 produces ([graph.mjs:79](../../../graph.mjs#L79)) | qa · review·deploy 의 `basis` 해시 · run-gates · 리뷰어 3종 |

`src/**` 는 글롭이 `.*` 로 번역되어 ([graph-stop.mjs:37](../../../gates/graph-stop.mjs#L37)) **하위 전부**를 잡는다. 테스트 파일(`src/**/*.test.ts`)도 여기에 걸리므로 qa 의 produces 와 겹친다 (`Unverified` 참조).

## Gate

**조건**: `gate: ["fsd", "security", "tsc", "tsc-notrun", "design"]` ([graph.mjs:82](../../../graph.mjs#L82))

| 카테고리 | 무엇을 잡나 | 근거 |
|---|---|---|
| `fsd/UPWARD_IMPORT` | 하위 레이어가 상위를 import | [run-gates.mjs:124-127](../../../gates/run-gates.mjs#L124-L127) |
| `fsd/CROSS_SLICE` | 같은 레이어의 다른 슬라이스 import (`app`·`shared` 제외 — 무슬라이스 레이어) | [run-gates.mjs:128-135](../../../gates/run-gates.mjs#L128-L135) |
| `security/*` | eval · innerHTML · 하드코딩 시크릿 · document.write | [run-gates.mjs:41-62](../../../gates/run-gates.mjs#L41-L62) |
| `security/DEFINER_SEARCH_PATH` | security definer 함수의 `search_path` 미고정 | [run-gates.mjs:168-172](../../../gates/run-gates.mjs#L168-L172) |
| `tsc/*` | 타입 에러 | [run-gates.mjs:481-503](../../../gates/run-gates.mjs#L481-L503) |
| `design/BEFORE_UI` | 미승인 상태의 화면 작업 | [run-gates.mjs:455-468](../../../gates/run-gates.mjs#L455-L468) |

**실행 시점이 두 개다.** 편집마다 PostToolUse 가 `--quick` 으로 돌고([settings.json:28](../../../.claude/settings.json#L28)), 턴 종료 시 graph-stop 이 전량 실행한다([graph-stop.mjs:210](../../../gates/graph-stop.mjs#L210)).
`--quick` 은 tsc·테스트·spec-coverage 를 건너뛰지만 `design/BEFORE_UI` 는 돌린다 — 편집 즉시 차단하기 위해서다 ([run-gates.mjs:418](../../../gates/run-gates.mjs#L418) · [:477](../../../gates/run-gates.mjs#L477)).

**게이트 에러가 어디에 걸리는지가 판정을 가른다.** `gateBlocked` 는 카테고리가 일치하고 **에러 경로가 produces 글롭에 매칭될 때만** 막는다 ([graph-stop.mjs:169-176](../../../gates/graph-stop.mjs#L169-L176)). 프로젝트 경로가 없는 전역 에러는 `whole: true`(전역 에러)로 쳐서 무조건 막는다 ([graph-stop.mjs:145](../../../gates/graph-stop.mjs#L145)).

**실패 경로**: `src/` 가 아직 없으면 run-gates 가 통째로 skip 하고 exit 0 한다 ([run-gates.mjs:34-39](../../../gates/run-gates.mjs#L34-L39)) — 스캐폴드 전 빈 레포에서 같은 실패가 턴마다 다시 뜨는 걸 막으려는 것이다.

## Failure path

- 게이트 실패가 남으면 graph-stop 이 exit 2 로 차단하고 "새 기능 금지, 위반만 수정"을 출력한다 ([graph-stop.mjs:266-269](../../../gates/graph-stop.mjs#L266-L269) · [run-gates.mjs:550-555](../../../gates/run-gates.mjs#L550-L555))
- 에러는 최대 30건까지만 출력된다 ([run-gates.mjs:553](../../../gates/run-gates.mjs#L553)) — 31건째부터는 소리 없이 잘린다
- 검증 실패가 **impl-level** 로 귀속되면 지목된 위치의 코드를 고친다. 이미 실패한 qa/review 가 dirty 로 잡고 있으므로 별도 마크가 필요 없다 ([CLAUDE.md:85](../../../CLAUDE.md#L85))
- **구현이 바뀌면 review·deploy 의 `basis` 가 어긋난다** → 사인오프가 자동으로 낡는다 ([graph-stop.mjs:187](../../../gates/graph-stop.mjs#L187))

## Exit condition

`src/**` 에 걸리는 fsd·security·tsc·design 에러가 0건 → implement clean + 내용 해시 기록 ([graph-stop.mjs:241](../../../gates/graph-stop.mjs#L241)).
프론티어가 `qa` 로 이동한다.

## Unverified

- **implement 와 qa 의 produces 가 겹친다.** implement 는 `src/**`, qa 는 `src/**/*.test.ts` 와 `tests/**` 다 ([graph.mjs:79](../../../graph.mjs#L79)·[:89](../../../graph.mjs#L89)). 테스트 파일 하나를 고치면 두 노드의 해시가 동시에 바뀌어 둘 다 dirty 가 되는 것으로 보이나, 직접 돌려 보지는 않았다. 그 경우 implement 가 dirty 가 되면 basis 도 바뀌어 사인오프가 낡는다 — 테스트만 고쳐도 재리뷰가 강제되는 셈이다. `[INFERRED]`
- **`any` 금지를 검사하는 코드를 못 찾았다.** [CLAUDE.md:32](../../../CLAUDE.md#L32) 가 "TypeScript strict, any 금지"라고 쓰지만 run-gates 에 해당 규칙이 없다. `tsconfig.json` 의 `noImplicitAny` 로 잡히는 범위와 명시적 `any` 는 다르다. `[INFERRED]`
- **`tokens.css` 하드코딩 금지**([ui-layers.md:15](../../../.claude/rules/ui-layers.md#L15))**를 검사하는 게이트가 없다.** 색·radius·shadow 하드코딩은 ui-reviewer 가 읽어서 판단할 뿐이다. `[INFERRED]`
- FSD 검사는 `@/` 와 `.` 로 시작하는 import 만 해석한다 ([run-gates.mjs:94-98](../../../gates/run-gates.mjs#L94-L98)). 절대경로나 tsconfig paths 별칭을 쓰면 레이어 위반이 검사를 빠져나가는지 확인 안 했다. `[INFERRED]`
- run-gates 는 `projects/*/src` 를 **전부** 스캔한다 ([run-gates.mjs:21-33](../../../gates/run-gates.mjs#L21-L33)). 비활성 프로젝트의 위반이 활성 프로젝트의 implement 를 막는지 — [graph-stop.mjs:141](../../../gates/graph-stop.mjs#L141) 이 다른 프로젝트 에러를 걸러내므로 막지 않을 것으로 보이나, 직접 돌려 보지는 않았다. `[INFERRED]`
