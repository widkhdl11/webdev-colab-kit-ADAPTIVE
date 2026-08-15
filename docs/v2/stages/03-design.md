# 03. design

`product` 에서만 파생되는 두 노드 중 나머지. **자체 산출물이 없는 집계 노드**다 — 자식 둘이 모두 clean 이라야 clean 이 된다 ([graph.mjs:58](../../../graph.mjs#L58)).

이 그래프에서 `parallel` 을 가진 유일한 노드다.

```
design
 ├─ page-designer    → docs/design/design-rules.md · mockups/*.html   (프론트매터 승인)
 └─ schema-designer  → supabase/migrations/*.sql · src/entities/*/model.ts  (게이트 fsd·security)
```

## Purpose

**시각 언어**와 **데이터 형태**를 구현 전에 확정한다. 둘을 한 노드에 묶은 이유는 판정 방식이 아니라 의존 관계다 — 둘 다 product 에서만 나오고, 둘 다 implement 가 기다린다.
없으면 깨지는 것: 승인 없이 화면을 만들었다가 방향이 바뀌면 **구현물을 버리며 반복**하게 된다. [design-drafting.md:47-49](../../../.claude/rules/design-drafting.md#L47-L49) 가 이 비용을 명시한다.

## Entry condition

| 조건 | 어디서 막나 |
|---|---|
| `product` 가 clean | [graph.mjs:60](../../../graph.mjs#L60) `depends_on: ["product"]` |
| **새 시각 방향**인가 반복인가의 판단 | [design-drafting.md:10-18](../../../.claude/rules/design-drafting.md#L10-L18) — 애매하면 새 방향으로 본다 |

`design-drafting.md` 는 **`paths:` 프론트매터가 없다.** 경로를 편집해도 자동으로 붙지 않고, [CLAUDE.md:23](../../../CLAUDE.md#L23)·[:59](../../../CLAUDE.md#L59) 가 이름을 부를 때만 로드된다. 규칙 7개 중 유일한 예외다 ([04-layers 그림](../diagrams/04-layers.architecture.json) 참조).

## What it does

**page-designer 쪽 (새 방향일 때)** — [design-drafting.md:22-45](../../../.claude/rules/design-drafting.md#L22-L45)

1. `design-interview` 로 **먼저 상담한다.** 빈 질문이 아니라 선택지가 채워진 양식을 `docs/design/INTERVIEW.md` 에 만들어 반복 수렴 ([design-interview/SKILL.md:8-10](../../../.claude/skills/design-interview/SKILL.md#L8-L10))
2. 레퍼런스 URL 이 있고 Playwright 가 붙어 있으면 `style-scout` 파견. 미연결이면 **위임 금지**, 사용자에게 스크린샷 요청 ([design-drafting.md:25-26](../../../.claude/rules/design-drafting.md#L25-L26))
3. `design-drafter` 가 `docs/design/mockups/<화면명>.html` 정적 시안 생성. 비즈니스 로직·API·상태관리 금지 ([design-drafter.md:29-30](../../../.claude/agents/design-drafter.md#L29-L30))
4. **본체가 직접 열어 검증한다** — drafter 보고를 그대로 넘기지 않는다. 대비 4.5:1 을 눈이 아니라 computed style 로 실측 ([design-drafting.md:30-36](../../../.claude/rules/design-drafting.md#L30-L36))
5. `checkpoint` 로 승인 → `design-rules.md` 에 확정 기준 블록 추가 + 프론트매터 `status: approved` ([checkpoint/SKILL.md:12-13](../../../.claude/skills/checkpoint/SKILL.md#L12-L13))
6. 필요하면 `src/shared/ui/tokens.css` 에 토큰 추가 ([design-drafting.md:44](../../../.claude/rules/design-drafting.md#L44))

**schema-designer 쪽** — 마이그레이션과 엔티티 모델. 절차 문서를 못 찾았다 (`Unverified` 참조).

## Skills and tools

| name | when | evidence |
|---|---|---|
| `design-interview` | 새 시각 방향 상담 (첫 칸) | [CONFIRMED: ../../../.claude/skills/design-interview/SKILL.md:3] |
| `style-scout` | 레퍼런스 URL + Playwright 연결 시**만** | [CONFIRMED: ../../../.claude/agents/style-scout.md:3] |
| `design-drafter` | 시안 HTML 생성 위임 | [CONFIRMED: ../../../.claude/agents/design-drafter.md:3] |
| `checkpoint` | 시안 승인 절차 | [CONFIRMED: ../../../.claude/skills/checkpoint/SKILL.md:3] |
| `ui-reviewer` | 구현 후 (이 노드가 아니라 review 쪽 일) | [CONFIRMED: ../../../.claude/agents/ui-reviewer.md:10] 이 design-rules.md 를 판단 기준으로 읽음 |

## Documents read

| document | purpose | required? |
|---|---|---|
| `projects/<이름>/docs/PRODUCT.md` | 페이지 목록·디자인 요구 | 예 (상류) |
| [.claude/rules/design-drafting.md](../../../.claude/rules/design-drafting.md) | 시안 먼저 절차 | 예 — 단 자동 로드 안 됨 |
| `projects/<이름>/docs/design/design-rules.md` | 누적 승인 기준 | 반복 화면이면 예. 첫 방향이면 **없는 게 정상** ([design-drafter.md:21-22](../../../.claude/agents/design-drafter.md#L21-L22)) |
| `projects/<이름>/docs/design/INTERVIEW.md` | 첫 방향일 때 시안의 근거 | 첫 방향일 때만 |

## Documents written

| document | ownership | consumed by |
|---|---|---|
| `docs/design/design-rules.md` | page-designer produces ([graph.mjs:63](../../../graph.mjs#L63)) | [run-gates.mjs:446-454](../../../gates/run-gates.mjs#L446-L454) `designApproved` · [ui-layers.md:9-10](../../../.claude/rules/ui-layers.md#L9-L10) · ui-reviewer |
| `docs/design/mockups/*.html` | page-designer produces | 사람 (checkpoint 확인용) |
| `supabase/migrations/*.sql` · `src/entities/*/model.ts` | schema-designer produces ([graph.mjs:70](../../../graph.mjs#L70)) | run-gates fsd·security · security-reviewer |
| `docs/design/INTERVIEW.md` | 상담 과정 보관 — **produces 가 아니다** | design-drafter |

## Gate

**자식마다 판정 방식이 다르다.**

| 자식 | clean_when | 판정 |
|---|---|---|
| page-designer | `frontmatter: design-rules.md 가 status: approved` ([graph.mjs:66](../../../graph.mjs#L66)) | 문자열 정규식 ([graph-stop.mjs:156](../../../gates/graph-stop.mjs#L156)) |
| schema-designer | `gate: ["fsd", "security"]` ([graph.mjs:71](../../../graph.mjs#L71)) | 정적 검사 에러 0건 |

**부모 집계**: 자식 둘이 다 clean 이라야 design clean. 하나라도 dirty 면 부모 dirty ([graph-stop.mjs:244-246](../../../gates/graph-stop.mjs#L244-L246)).
집계는 자식 처리 **직후** 확정된다 — 하류(implement)가 같은 턴에 이걸 보고 판정하기 때문이다 ([graph-stop.mjs:243](../../../gates/graph-stop.mjs#L243)).

**별도 게이트 `design/BEFORE_UI`**: `src/{pages,widgets}` 에 파일이 생겼는데 design-rules.md 가 approved 가 아니면 차단 ([run-gates.mjs:455-468](../../../gates/run-gates.mjs#L455-L468)).
Next 프로젝트는 `src/app/**/page.*` 를 화면으로 보되, **라우트가 1장이면 워킹 스켈레톤으로 보고 넘어간다** ([run-gates.mjs:439-444](../../../gates/run-gates.mjs#L439-L444)).

> ⚠ **page-designer 는 design-rules.md 가 아예 없어도 clean 이 된다** — 프론트매터 검사가 볼 파일이 하나도 없으면 그냥 통과시키기 때문이다 ([graph-stop.mjs:153](../../../gates/graph-stop.mjs#L153)). 실제 사고를 막는 것은 그래프가 아니라 `design/BEFORE_UI` 게이트다. 그 게이트가 화면 위치를 못 알아보는 스택에서는 강제가 소리 없이 사라진다 — [setup/SKILL.md:22-25](../../../.claude/skills/setup/SKILL.md#L22-L25) 가 이미 경고하는 구멍이다 ([findings F-03](../findings.md)).

## Failure path

- 시안이 어긋나면 **코드가 아니라 시안을 버리며 반복**한다. drafter 에 원문 그대로 재위임 ([design-drafting.md:37-38](../../../.claude/rules/design-drafting.md#L37-L38))
- 검증 실패가 **design-level** 로 귀속되면 `design-rules.md` 를 `status: draft` 로 내린다(거부) → page-designer dirty → design dirty → implement 이하 전부 dirty ([CLAUDE.md:86](../../../CLAUDE.md#L86))
- Playwright 미연결 상태에서 style-scout 을 위임하는 것은 **금지**다 ([style-scout.md:3](../../../.claude/agents/style-scout.md#L3))
- 승인 전에 나머지 화면을 "미리" 만들어두지 않는다 ([checkpoint/SKILL.md:15](../../../.claude/skills/checkpoint/SKILL.md#L15))

## Exit condition

page-designer 의 `design-rules.md` 가 `status: approved` **이고** schema-designer 의 produces 에 fsd·security 에러가 0건
→ 두 자식 clean → design clean. `spec` 도 clean 이면 프론티어가 `implement` 로 이동한다.

## Unverified

- **schema-designer 의 절차 문서를 못 찾았다.** 자식으로 선언되고 produces·clean_when 도 있지만([graph.mjs:69-72](../../../graph.mjs#L69-L72)), 누가 언제 어떻게 마이그레이션과 엔티티 모델을 만드는지 안내하는 스킬·규칙이 없다. page-designer 쪽은 규칙·스킬·에이전트가 4개나 붙어 있는 것과 대조된다. `[INFERRED]`
- **`docs/design/INTERVIEW.md` 는 어느 노드의 produces 도 아니다.** [design-interview/SKILL.md:27](../../../.claude/skills/design-interview/SKILL.md#L27) 이 "과정 보관"이라고 성격을 규정하지만, 그래프가 추적하지 않으므로 이 파일이 바뀌어도 아무 노드가 dirty 가 되지 않는다. 의도인지 누락인지 확인 못 했다. `[INFERRED]`
- **대비 4.5:1 실측을 강제하는 게이트가 없다.** [design-drafting.md:32-34](../../../.claude/rules/design-drafting.md#L32-L34) 가 "안 재면 미달인 채로 승인된다"고 경고하지만, 검사하는 코드는 못 찾았다. `ui-reviewer` 가 읽어서 판단할 뿐이다. `[INFERRED]`
- **`tokens.css` 는 produces 목록에 없다.** [design-drafting.md:44](../../../.claude/rules/design-drafting.md#L44) 가 갱신을 지시하지만 `src/shared/ui/tokens.css` 는 page-designer 의 produces 가 아니라 `implement` 의 `src/**` 에 잡힌다. 디자인 산출물이 구현 노드의 해시에 섞이는 셈인데, 의도인지 확인 못 했다. `[INFERRED]`
- Next 프로젝트의 "라우트 1장 예외"([run-gates.mjs:439-444](../../../gates/run-gates.mjs#L439-L444))가 실제로 어떤 경우에 과차단·과통과를 만드는지 직접 돌려 보지는 않았다. `[INFERRED]`
