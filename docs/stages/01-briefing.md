# 01. 세션 브리핑 (briefing)

## Purpose
세션이 시작될 때 사람과 모델이 같은 좌표에서 출발하게 한다. 이 단계가 없으면 프론티어(지금 작업할 노드)를 모른 채 임의의 노드부터 손대게 되고, 상류가 dirty인 채로 하류를 고치는 낭비가 생긴다.

## Entry condition
Claude Code 의 `SessionStart` 이벤트. 훅 선언은 [.claude/settings.json:10-12](.claude/settings.json#L10-L12) — `node scripts/briefing.mjs`.
활성 프로젝트 전제: 루트 `ACTIVE` 파일에 이름 한 줄 + `projects/<이름>/` 존재. 둘 중 하나라도 없으면 안내만 출력하고 정상 종료한다 [(scripts/briefing.mjs:15-21)](scripts/briefing.mjs#L15-L21).

## What it does
1. `ACTIVE` 를 읽어 활성 프로젝트를 정한다 [(briefing.mjs:15-16)](scripts/briefing.mjs#L15-L16).
2. `docs/specs/*.md` 를 훑어 `status: draft` 인 스펙을 "대기 중인 결정"으로 모은다 [(briefing.mjs:29-35)](scripts/briefing.mjs#L29-L35).
3. `PROGRESS.md` 의 "대기 중인 결정" 줄을 같은 목록에 합친다 [(briefing.mjs:36-38)](scripts/briefing.mjs#L36-L38).
4. `run-gates --quick` 를 돌려 게이트 신호등(통과/실패)을 만든다 [(briefing.mjs:41-42)](scripts/briefing.mjs#L41-L42).
5. `PROGRESS.md` 에서 "멈춘 지점"·"다음 할 일"을 파싱한다 [(briefing.mjs:45-46)](scripts/briefing.mjs#L45-L46).
6. 원칙 가드: "다음 할 일"의 1순위가 데이터 계층인데 화면 대안이 함께 있으면 순서 경보를 붙인다 [(briefing.mjs:48-58)](scripts/briefing.mjs#L48-L58).
7. `PRODUCT.md` 의 `- [x]`/`- [ ]` 개수로 필수 기능 진행률을 센다 [(briefing.mjs:61-63)](scripts/briefing.mjs#L61-L63).
8. `harness-backlog.md` 의 미결 항목 수를 센다 [(briefing.mjs:66-67)](scripts/briefing.mjs#L66-L67).
9. `HANDOFF.md` 의 JSON 상태를 읽어 **프론티어**(dirty이면서 상류가 전부 clean인 노드)를 파생한다 [(briefing.mjs:69-81)](scripts/briefing.mjs#L69-L81).
10. 위 항목을 8줄 이내로 출력한다 [(briefing.mjs:83-91)](scripts/briefing.mjs#L83-L91).

## Skills and tools
| name | when | evidence |
|---|---|---|
| `scripts/briefing.mjs` | SessionStart 훅이 자동 실행 | [CONFIRMED: .claude/settings.json:11] |
| `status` 스킬 (`/status`) | 세션 중 브리핑을 다시 보고 싶을 때 (사용자 슬래시 전용) | [CONFIRMED: .claude/skills/status/SKILL.md:1-11] |
| `gates/run-gates.mjs --quick` | 신호등 계산용으로 브리핑이 직접 호출 | [CONFIRMED: scripts/briefing.mjs:41] |
| `gates/propagate.mjs` (`topoSort`) | 프론티어 파생 | [CONFIRMED: scripts/briefing.mjs:7,76] |

## Documents read
| document | purpose | required? |
|---|---|---|
| `ACTIVE` | 활성 프로젝트 이름 | 예 — 없으면 브리핑이 안내만 하고 끝난다 |
| `projects/<이름>/workspace/HANDOFF.md` | dirty/clean 상태 → 프론티어 | 아니오 — 없거나 깨지면 프론티어 줄만 생략 |
| `projects/<이름>/workspace/PROGRESS.md` | 멈춘 지점 · 다음 할 일 · 대기 결정 | 아니오 — 없으면 "(기록 없음)" |
| `projects/<이름>/docs/PRODUCT.md` | 필수 기능 진행률 | 아니오 — 체크박스가 없으면 줄 자체를 생략 |
| `projects/<이름>/docs/specs/*.md` | `status: draft` = 승인 대기 | 아니오 |
| `docs/references/harness-backlog.md` | 보류된 하네스 승격 건수 | 아니오 — 0건이면 침묵 |

## Documents written
| document | ownership | consumed by |
|---|---|---|
| (없음) | 브리핑은 읽기 전용이다 — 출력은 stdout 뿐 | 세션 컨텍스트(모델·사람) |

## Gate
이 단계 자체는 게이트가 아니다. 다만 `run-gates --quick` 의 종료코드를 읽어 신호등만 표시한다 [(briefing.mjs:41-42)](scripts/briefing.mjs#L41-L42).
- 통과: `● 게이트: 통과`
- 실패: `● 게이트: 실패 — 새 작업 전에 복구 필요` (브리핑은 차단하지 않는다. 실제 차단은 PostToolUse·Stop 훅이 한다)

## Failure path
- `ACTIVE` 없음 / `projects/<이름>/` 없음 → "활성 프로젝트 없음 — kickoff로 시작하세요" 출력 후 `exit 0` [(briefing.mjs:17-21)](scripts/briefing.mjs#L17-L21). 세션은 정상 진행되고, 다음 단계는 `product`(kickoff)가 된다.
- `HANDOFF.md` 의 JSON 이 손상 → `catch` 로 무시하고 프론티어 줄만 빠진다 [(briefing.mjs:80)](scripts/briefing.mjs#L80). 다음 Stop 훅에서 `graph-stop` 이 백필로 재부트스트랩한다 [(gates/graph-stop.mjs:95-99)](gates/graph-stop.mjs#L95-L99).
- `run-gates` 가 실패해도 브리핑은 계속된다 — 신호등만 "실패"로 바뀐다.

## Exit condition
프론티어 노드(또는 "전부 clean")가 출력되고, 그 노드가 이번 턴의 작업 대상이 된다. 프로젝트가 없으면 대신 kickoff 가 다음 행동이다.

## Unverified
- **모델이 실제로 프론티어를 따르는지** — 브리핑은 텍스트를 출력할 뿐이고, "프론티어부터 작업하라"는 강제는 [CLAUDE.md:11](CLAUDE.md#L11) 의 서술뿐이다. 훅이나 게이트가 이를 검사하지 않는다. [INFERRED]
- **브리핑 출력이 컨텍스트에 주입되는 형태** — SessionStart 훅의 stdout 이 모델에게 어떤 형식으로 전달되는지는 이 레포 파일로 확인할 수 없다. [INFERRED]
- **원칙 가드(6번)의 실제 발화 빈도와 오탐률** — 정규식 기반이라 "다음 할 일" 문장 표현에 따라 갈린다. 실행 로그 없이는 확인 불가. [INFERRED]
- **`/status` 가 브리핑과 동일한 출력을 내는지** — 스킬 문서는 `briefing.mjs` 실행을 지시하지만, 인자·환경 차이는 실행해봐야 안다. [INFERRED]
