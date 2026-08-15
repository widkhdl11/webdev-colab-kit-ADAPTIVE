# 09. run-gates — 결정론 판정층

## Purpose
모델이 끌 수 없는 자리에서 위반을 잡는다. 판정이 코드에 있으므로 프롬프트를 어떻게 쓰든 결과가 같다 — 하네스가 "0토큰 강제"라 부르는 층이다.

## Entry condition
두 시점에 자동 실행된다.
- `PostToolUse` (matcher `Edit|Write|MultiEdit`) → `node gates/run-gates.mjs --quick` [(.claude/settings.json:25-30)](../../.claude/settings.json#L25-L30)
- `Stop` → graph-stop 내부에서 전체 실행 [(graph-stop.mjs:210)](../../gates/graph-stop.mjs#L210)
- 그 밖에 `SessionStart` 브리핑이 신호등용으로 `--quick` 을 한 번 더 돌린다 [(briefing.mjs:41)](../../scripts/briefing.mjs#L41).

전제 검사: `projects/<이름>/src` 가 없으면 "검사 대상 없음"으로 skip(exit 0) 한다 — 빈 레포에서 매 턴 실패가 재주입되는 루프를 막는다 [(run-gates.mjs:15-35)](../../gates/run-gates.mjs#L15-L35).

## What it does
1. `projects/*/src` 전체를 순회하며 보안 정규식 4종을 라인 단위로 검사한다 [(run-gates.mjs:37-58, 102-107)](../../gates/run-gates.mjs#L37-L58).
2. import 를 파싱해 FSD 레이어 순위(app>pages>widgets>features>entities>shared)를 위반하는 상향 import 와 같은 레이어 교차 슬라이스 import 를 잡는다 [(run-gates.mjs:109-131)](../../gates/run-gates.mjs#L109-L131).
3. `supabase/**.sql` 에서 `security definer` 함수가 `set search_path = ''` 를 고정했는지 본다. 같은 함수명은 **마지막 정의만** 판정한다 [(run-gates.mjs:135-168)](../../gates/run-gates.mjs#L135-L168).
4. **위험 표면 감지(risk-surface)**: `src/**` 와 `supabase/**.sql` 에서 인증·결제·권한·동시성 패턴을 찾는다. 걸린 표면을 커버하는 approved 스펙(frontmatter `surfaces:`)이 그 프로젝트에 없으면 차단한다. 파일 단위 예외 주석 `risk-surface-exempt: <표면> <사유>` 는 통과시키되 ⚠ 로 남긴다 — 사유 없는 예외는 인정하지 않는다. 예외의 전제가 기계로 검사 가능하면 그것도 본다: authz 예외가 걸린 프로젝트에 쓰기 정책(`create policy … for insert/update/delete`, 또는 `for` 절 없음)이 생기면 `EXPIRED_EXEMPT` 로 차단한다 — 주석을 고쳐 다는 것으로는 통과하지 않고 스펙이 필요하다 [(run-gates.mjs:203-358)](../../gates/run-gates.mjs#L203-L358).
5. UI 착수 감지: `pages`/`widgets` 에 파일이 생기거나 Next 프로젝트에서 `page.*` 가 2장째가 되면, 승인된 design-rules.md 가 없을 때 `design/BEFORE_UI` 를 낸다 [(run-gates.mjs:182-226)](../../gates/run-gates.mjs#L182-L226).
6. `--quick` 이 아니면 추가로 `npx tsc --noEmit`, `npm test --silent`, `spec-coverage.mjs` 를 돌린다 [(run-gates.mjs:228-279)](../../gates/run-gates.mjs#L228-L279).
7. 위험 표면 예외(⚠)를 stderr 로 먼저 남기고, 에러가 있으면 최대 30건을 stderr 로 출력하고 `exit 2` [(run-gates.mjs:281-287)](../../gates/run-gates.mjs#L281-L287).

## Skills and tools
| name | when | evidence |
|---|---|---|
| `npx tsc --noEmit` | full 실행, `tsconfig.json` 이 있을 때 | [CONFIRMED: run-gates.mjs:232-238] |
| `npm test --silent` | full 실행, `package.json` 에 `scripts.test` 가 있을 때 | [CONFIRMED: run-gates.mjs:255-269] |
| `gates/spec-coverage.mjs` | full 실행 3단계 | [CONFIRMED: run-gates.mjs:272-278] |
| `.claude/hooks/protect-files.mjs` | `gates/` 직접 수정을 차단 (제안만 하고 사용자가 반영) | [CONFIRMED: .claude/hooks/protect-files.mjs:8] |

## Documents read
| document | purpose | required? |
|---|---|---|
| `projects/*/src/**` (ts·tsx·js·jsx·html) | FSD·보안 정적 검사 | 예 |
| `projects/*/supabase/**/*.sql` | security definer 검사 | 아니오 |
| `projects/*/docs/design/design-rules.md` | `status: approved` 확인 | UI 파일이 있을 때 |
| `projects/*/package.json`, `tsconfig.json`, `next.config.*` | 실행 대상·스택 판정 | 아니오 |

## Documents written
| document | ownership | consumed by |
|---|---|---|
| (없음) | 출력은 stdout/stderr 뿐 | graph-stop 의 에러 파서 · 모델(차단 메시지) |

## Gate
이 단계 자체가 게이트다. 카테고리 태그는 `[<카테고리>/<규칙>]` 형식이고, graph-stop 이 이걸 파싱해 어느 노드에 귀속시킬지 정한다 [(graph-stop.mjs:130-149)](../../gates/graph-stop.mjs#L130-L149).
실제로 나오는 카테고리는 6종: `fsd` · `security` · `tsc` · `test` · `design` · `spec-coverage`. graph.mjs 의 `clean_when.gate` 가 쓰는 이름과 정확히 대응한다.

## Failure path
- `exit 2` → stderr 가 모델에 주입되고 "새 기능 추가 금지, 아래 위반만 수정" 이 붙는다.
- 경로가 있는 에러는 그 경로를 produces 로 갖는 노드만 막고, 프로젝트 통째 에러(`test/FAIL`, `tsc/FAIL`)는 `whole: true` 로 처리돼 해당 카테고리를 요구하는 노드를 전부 막는다 [(graph-stop.mjs:140-147)](../../gates/graph-stop.mjs#L140-L147).
- 다른 프로젝트의 에러는 활성 프로젝트 그래프와 무관하므로 무시된다 [(graph-stop.mjs:141)](../../gates/graph-stop.mjs#L141).

## Exit condition
에러 0건 → `게이트 통과 (N개 파일, M개 프로젝트)` 출력 후 exit 0.

## Unverified
- **`--quick` 과 full 의 커버리지 차이가 사용자에게 보이는지** — quick 은 tsc·test·spec-coverage 를 건너뛰므로, 편집 직후 통과했다고 최종 통과는 아니다. 이 차이를 알려주는 메시지는 없다. [INFERRED]
- **30건 절단** — 에러가 30건을 넘으면 나머지는 조용히 잘린다 [(run-gates.mjs:284)](../../gates/run-gates.mjs#L284). 잘렸다는 표시가 없다. [CONFIRMED: 코드 / 영향은 INFERRED]
- **보안 정규식의 오탐·미탐률** — 라인 단위 정규식이라 주석·문자열도 잡힌다. 측정된 적 없다. [INFERRED]
