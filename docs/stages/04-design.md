# 04. design — 시각 방향과 데이터 구조 (집계 노드)

## Purpose
화면의 시각 언어와 데이터 스키마를 코드보다 먼저 확정한다. 이 노드는 자체 산출물이 없는 **집계 노드**로, 자식 둘(`page-designer`·`schema-designer`)이 모두 clean 이라야 clean 이다 [(graph.mjs:44-58)](../../graph.mjs#L44-L58).

## Entry condition
product 가 clean 이고 design 이 dirty 일 때 [(graph.mjs:44)](../../graph.mjs#L44). spec 과 직교라 병행 가능하다.
UI 작업 자체를 시작하려면 게이트가 먼저 막는다 — `design/BEFORE_UI` 는 승인된 design-rules.md 없이 `pages`/`widgets`(Next 프로젝트면 두 번째 `page.*`)에 파일이 생기면 에러를 낸다 [(run-gates.mjs:182-226)](../../gates/run-gates.mjs#L182-L226).

## What it does
**page-designer 쪽 (새 시각 방향일 때 — 정식 경로)** [(rules/design-drafting.md:20-45)](../../.claude/rules/design-drafting.md#L20-L45)
1. `design-interview` 스킬로 취향 상담 — 빈 질문 대신 선택지가 채워진 양식을 반복 갱신 [(design-interview/SKILL.md:17-23)](../../.claude/skills/design-interview/SKILL.md#L17-L23).
2. 레퍼런스 URL 이 있고 Playwright 가 연결됐으면 `style-scout` 파견 (미연결이면 위임 금지, 스크린샷 요청) [(style-scout.md:13-17)](../../.claude/agents/style-scout.md#L13-L17).
3. `design-drafter` 가 `docs/design/mockups/<화면>.html` 정적 시안을 만든다 [(design-drafter.md:29)](../../.claude/agents/design-drafter.md#L29).
4. 본체가 직접 브라우저로 열어 **대비 4.5:1 을 실측**하고 스크린샷을 확인한다 [(rules/design-drafting.md:33-36)](../../.claude/rules/design-drafting.md#L33-L36).
5. `checkpoint` 로 승인 → 확정 기준을 `design-rules.md` 에 한 블록 추가하고 프론트매터를 `status: approved` 로 [(checkpoint/SKILL.md:12-13)](../../.claude/skills/checkpoint/SKILL.md#L12-L13).

**이미 승인된 방향의 반복 화면이면** 시안을 건너뛰고 design-rules.md 를 근거로 바로 구현한다 [(rules/design-drafting.md:10-12)](../../.claude/rules/design-drafting.md#L10-L12).

**schema-designer 쪽**: `supabase/migrations/*.sql` 과 `src/entities/*/model.ts` 를 만든다. 판정은 fsd·security 게이트 [(graph.mjs:53-57)](../../graph.mjs#L53-L57).

## Skills and tools
| name | when | evidence |
|---|---|---|
| `design-interview` 스킬 | 새 시각 방향 상담 (반복 화면엔 쓰지 않음) | [CONFIRMED: .claude/skills/design-interview/SKILL.md:12-15] |
| `style-scout` 서브에이전트 | 레퍼런스 URL + Playwright 연결 시에만 | [CONFIRMED: .claude/agents/style-scout.md:3] |
| `design-drafter` 서브에이전트 | 정적 HTML 시안 생성 (Write 보유) | [CONFIRMED: .claude/agents/design-drafter.md:4] |
| `checkpoint` 스킬 | 시안 승인 → design-rules 기록 | [CONFIRMED: .claude/rules/design-drafting.md:37-42] |
| `ui-reviewer` 서브에이전트 | 구현물의 디자인 일관성·접근성 검토 (design 이 아니라 review 단계) | [CONFIRMED: CLAUDE.md:78-79] |

## Documents read
| document | purpose | required? |
|---|---|---|
| `projects/<이름>/docs/design/design-rules.md` | 누적된 승인 기준 — drafter 의 최우선 근거 | 첫 방향이면 없는 게 정상 |
| `projects/<이름>/docs/design/INTERVIEW.md` | 첫 방향일 때의 근거 | 첫 방향에서만 |
| style-scout 프로필 (보고 형태) | 가져올 것/버릴 것 | 아니오 |

## Documents written
| document | ownership | consumed by |
|---|---|---|
| `docs/design/design-rules.md` | 본체 (checkpoint 승인 후) — drafter 는 쓰지 않는다 | design 노드 clean 판정 · `design/BEFORE_UI` 게이트 · ui-layers 규칙 |
| `docs/design/mockups/*.html` | design-drafter | 사람(승인) · 구현의 시각 스펙 |
| `docs/design/INTERVIEW.md` | design-interview 스킬 | design-drafter ⚠ 그래프 밖 (findings F8) |
| `supabase/migrations/*.sql`, `src/entities/*/model.ts` | schema-designer 쪽 산출물 | implement · security 게이트 |
| `docs/design/refs/*.png` | style-scout (스크린샷 파일만) | 사람 |

## Gate
자식 둘이 각각 판정되고, 부모는 자식이 전부 clean 일 때만 clean 이다 [(graph-stop.mjs:243-247)](../../gates/graph-stop.mjs#L243-L247).
- `page-designer`: `design-rules.md` 프론트매터가 `status: approved`.
- `schema-designer`: `fsd`·`security` 게이트 에러 0건.
- 별도로 `design/BEFORE_UI` 가 implement 쪽에서 UI 착수를 막는다 [(run-gates.mjs:213-226)](../../gates/run-gates.mjs#L213-L226).

## Failure path
- 리뷰/테스트 실패가 `design-level` 로 판정되면 `design-rules.md` 를 `status: draft` 로 되돌린다(설계 거부) → design 이 dirty 로 남고 하류 전부 전파 [(qa-classifier.md:64-65)](../../.claude/agents/qa-classifier.md#L64-L65).
- 시안 단계 피드백은 코드가 아니라 시안을 버리며 반복한다 [(rules/design-drafting.md:37-39)](../../.claude/rules/design-drafting.md#L37-L39).
- Playwright 미연결이면 style-scout 을 위임하지 않고 사용자에게 스크린샷을 요청한다.

## Exit condition
`design-rules.md` 가 `status: approved` 이고, 스키마 쪽 산출물에 fsd·security 에러가 0건. 그때 design 이 clean 이 되어 implement 가 spec 과 함께 합류 조건을 갖춘다.

## Unverified
- **schema-designer 판정의 공회전** — 현재 프로젝트(signal)엔 `supabase/migrations/*.sql` 도 `src/entities/*/model.ts` 도 없어 매칭 파일이 0개다. 이 경우 게이트가 막을 대상이 없어 항상 clean 이다 (findings F9). [CONFIRMED: HANDOFF.md:24-27 / 판정 로직 graph-stop.mjs:169-176]
- **대비 4.5:1 실측이 실제로 수행되는지** — 규칙에 절차는 있으나 자동 검사가 없다. [INFERRED]
- **checkpoint 가 시안 승인인지 코드 승인인지** — 스킬 본문과 규칙 파일의 서술이 갈린다 (findings F12). [INFERRED]
