# 10. graph-stop — 턴 종료 오케스트레이터

## Purpose
매 턴 끝에 "무엇이 바뀌었고 그래서 무엇이 다시 dirty 인가"를 계산해 HANDOFF.md 에 남긴다. 재작업 범위를 사람이 선언하지 않고 전파에서 파생시키는 것이 이 단계의 존재 이유다 [(graph-stop.mjs:1-12)](../../gates/graph-stop.mjs#L1-L12).

## Entry condition
`Stop` 훅 [(.claude/settings.json:31-33)](../../.claude/settings.json#L31-L33). 활성 프로젝트가 없으면 안내 후 exit 0 [(graph-stop.mjs:22-28)](../../gates/graph-stop.mjs#L22-L28).
수동 진입도 셋 있다: `--mark <노드> "<사유>"`(강제 dirty — 지금 clean 인 노드면 rework) [(graph-stop.mjs:258-282)](../../gates/graph-stop.mjs#L258-L282), `--na <노드> "<사유>"`(이번 작업엔 해당 없음 — 사유 필수, review 는 거부) [(graph-stop.mjs:283-299)](../../gates/graph-stop.mjs#L283-L299), `--na-clear <노드>`(n/a 해제 → dirty) [(graph-stop.mjs:300-313)](../../gates/graph-stop.mjs#L300-L313).

## What it does
1. **게이트**: `run-gates` 전체를 자식 프로세스로 돌리고 에러를 `{cat, relPath, whole}` 로 파싱한다 [(graph-stop.mjs:316-317, 153-171)](../../gates/graph-stop.mjs#L316-L317).
2. **상태 로드**: HANDOFF.md 의 ```json 블록을 읽고, 그래프에 있는데 상태에 없는 노드/자식을 dirty 로 백필한다 [(graph-stop.mjs:88-114)](../../gates/graph-stop.mjs#L88-L114).
3. **sync**: 각 단위의 `produces` 내용 해시(sha256 앞 12자)를 계산해 이전과 다르면 dirty 로 마크하고 전파한다. 사인오프 노드는 제외 [(graph-stop.mjs:65-72, 331-338)](../../gates/graph-stop.mjs#L65-L72).
4. **release**: 위상정렬 순서로, 상류가 전부 clean(또는 n/a)이고 프론트매터·exists_nonempty 를 만족하며 해당 카테고리 게이트 에러가 0건인 dirty 단위를 clean 으로 내린다 [(graph-stop.mjs:340-362)](../../gates/graph-stop.mjs#L340-L362).
5. **집계**: 병렬 부모(design)는 자식 처리 직후 즉시 확정한다 — 하류가 그 값을 보고 판정하기 때문이다 [(graph-stop.mjs:359-362)](../../gates/graph-stop.mjs#L359-L362).
6. **n/a 자동 취소**: `risk-surface` 게이트 에러가 있으면 spec 을 dirty 로 되돌리고 그 사실을 stderr 에 명시한다. n/a 였다면 사유까지 같이 찍는다 — 생략 판단은 모델이 하고 생략이 틀렸다는 감지는 기계가 한다 [(graph-stop.mjs:364-380)](../../gates/graph-stop.mjs#L364-L380).
7. **persist**: 프론티어·rework(사유)·n/a(사유)를 주석 줄에, 상태를 JSON 블록에 써서 HANDOFF.md 를 갱신한다 [(graph-stop.mjs:115-131)](../../gates/graph-stop.mjs#L115-L131).
7. **안내**: qa 실패면 분류기 필요 신호, 사인오프 노드가 프론티어면 basis 해시를 알려준다 [(graph-stop.mjs:384-409)](../../gates/graph-stop.mjs#L384-L409).
9. **차단 판정**: run-gates 가 exit 2 였으면 남은 에러를 카테고리별로 본다. `graph.mjs` 의 `GATE_KIND` 기준으로 **그래프가 지금 처방한 상태에서 비롯된 실패**(completion 은 owner 가 dirty/rework 일 때, precondition 은 owner 가 rework 일 때)면 안내로 낮추고, 하나라도 그 밖의 카테고리가 남으면 예전처럼 exit 2 로 차단한다. 낮춘 것도 매 턴 `⚠ [graph/EXPECTED]` 로 찍는다 [(graph-stop.mjs:420-448)](../../gates/graph-stop.mjs#L420-L448).

## Skills and tools
| name | when | evidence |
|---|---|---|
| `gates/run-gates.mjs` | 1단계에서 spawnSync | [CONFIRMED: gates/graph-stop.mjs:210] |
| `gates/propagate.mjs` | topoSort · propagate · descendants · markDirty · recomputeParents | [CONFIRMED: gates/graph-stop.mjs:18] |
| `graph.mjs` | 토폴로지(순수 리터럴) | [CONFIRMED: gates/graph-stop.mjs:17] |

## Documents read
| document | purpose | required? |
|---|---|---|
| `ACTIVE` | 활성 프로젝트 | 예 |
| `graph.mjs` | 노드·의존·clean_when | 예 |
| `projects/<이름>/workspace/HANDOFF.md` | 이전 상태·해시 | 아니오 — 없으면 전부 dirty 로 부트스트랩 |
| 각 노드의 `produces` 매칭 파일 | 내용 해시 | 예 |
| `workspace/review.md`, `workspace/deploy.md` | 사인오프 마커 | 사인오프 노드 판정 시 |

## Documents written
| document | ownership | consumed by |
|---|---|---|
| `projects/<이름>/workspace/HANDOFF.md` | graph-stop 전용 (손으로 편집 금지 — 파일 헤더에 명시) | 다음 세션의 briefing · 다음 턴의 graph-stop |

## Gate
graph-stop 자체는 판정하지 않고 run-gates 의 결과를 **귀속**시킨다.
- 경로 있는 에러 → produces 글롭에 매칭되는 노드만 차단 [(graph-stop.mjs:191-198)](../../gates/graph-stop.mjs#L191-L198)
- 프로젝트 통째 에러 → `whole: true` 로 해당 카테고리를 요구하는 노드 전부 차단
- 사인오프 노드 → 마커 + basis 해시 [(graph-stop.mjs:179-188)](../../gates/graph-stop.mjs#L179-L188)

## Failure path
- run-gates 실패가 남아 있으면 exit 2 로 턴을 차단한다 — 단 남은 실패가 전부 `GATE_KIND` 기준 '처방된 것'이면 차단하지 않고 안내만 한다. 그런 실패를 막으면 푸는 유일한 길(사용자 승인·다음 세션 구현)이 턴을 끝내야 도달하는데 그 턴이 안 끝난다(2026-08-06·08-10·08-11 관찰 3회).
- HANDOFF.md 의 JSON 이 깨지면 `catch` 후 빈 상태에서 재부트스트랩한다 [(graph-stop.mjs:91-93)](../../gates/graph-stop.mjs#L91-L93).
- `--mark` 는 게이트가 통과하는 노드에서는 다음 Stop 에 도로 clean 된다 — 지속시키려면 프론트매터 '거부'를 쓴다 [(qa-classifier.md:58-71)](../../.claude/agents/qa-classifier.md#L58-L71).

## Exit condition
HANDOFF.md 가 갱신되고 프론티어가 출력된 상태. 게이트 에러가 없으면 exit 0.

## Unverified
- **`_` 접두 파일 제외 규칙** — `_TEMPLATE.md` 같은 파일을 해시 대상에서 빼는 필터가 있는데 [(graph-stop.mjs:55-58)](../../gates/graph-stop.mjs#L55-L58), 이 규칙이 다른 산출물에 의도치 않게 걸리는지는 확인하지 않았다. [INFERRED]
- **Stop 훅이 매 턴 실제로 실행되는지** — 설정에는 있으나 실행 로그로 확인하지 않았다. [INFERRED]
- **여러 프로젝트 동시 운용** — graph-stop 은 ACTIVE 하나만 본다. 다른 프로젝트의 dirty 는 추적되지 않는다. [CONFIRMED: graph-stop.mjs:23-24 / 영향은 INFERRED]
