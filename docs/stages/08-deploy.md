# 08. deploy — 배포 사인오프 (현재 진입 경로 없음)

## Purpose
배포를 그래프의 마지막 노드로 두어, 리뷰가 낡은 상태에서는 배포가 불가능하게 만든다. `depends_on: ["review"]` 자체가 강제 마감 장치다 [(graph.mjs:126-132)](../../graph.mjs#L126-L132).

## Entry condition
review 가 clean 이고 deploy 가 dirty 일 때 프론티어가 된다 [(graph.mjs:129)](../../graph.mjs#L129).
현재 signal 프로젝트가 정확히 이 상태다 — [HANDOFF.md:3](../../projects/signal/workspace/HANDOFF.md#L3) 의 프론티어가 `deploy` 다.

## What it does
파일로 확인할 수 있는 절차가 **없다.** 그래프는 `workspace/deploy.md` 에 `status: deployed` 와 `basis` 를 요구하지만, 그 파일을 만들라고 지시하는 스킬·서브에이전트·규칙·문서가 레포에 하나도 없다 (findings F4).
graph-stop 은 프론티어가 사인오프 노드일 때 필요한 값만 안내한다:
```
↳ deploy 사인오프 대기: workspace/deploy.md 에 'status: deployed' + 'basis: <해시>' 기록 시 clean
```
[(graph-stop.mjs:259-263)](../../gates/graph-stop.mjs#L259-L263)

## Skills and tools
| name | when | evidence |
|---|---|---|
| (없음) | 배포를 수행하는 스킬·에이전트가 정의돼 있지 않다 | [CONFIRMED: .claude/skills/, .claude/agents/ 전수 확인 — findings F4] |
| `gates/graph-stop.mjs` | 마커를 읽어 clean 판정 + basis 안내 | [CONFIRMED: gates/graph-stop.mjs:179-188, 259-263] |

## Documents read
| document | purpose | required? |
|---|---|---|
| `projects/<이름>/workspace/review.md` | 선행 조건 (review clean) | 예 |
| `projects/<이름>/workspace/deploy.md` | 사인오프 마커 | 예 — 없으면 영원히 dirty |

## Documents written
| document | ownership | consumed by |
|---|---|---|
| `projects/<이름>/workspace/deploy.md` | **주인 없음** — 어떤 절차도 이 파일을 만들지 않는다 | deploy 노드 clean 판정 |

## Gate
`clean_when: { signoff: { marker: "workspace/deploy.md", require: "status: deployed", basis_of: "implement" } }` [(graph.mjs:131)](../../graph.mjs#L131).
review 와 같은 판정 로직을 쓴다 — 마커 존재 + 문구 일치 + basis 해시가 현재 `src/**` 와 동일 [(graph-stop.mjs:179-188)](../../gates/graph-stop.mjs#L179-L188).

## Failure path
- review 가 dirty 면 deploy 는 상류 조건에서 걸려 release 자체가 시도되지 않는다 [(graph-stop.mjs:235)](../../gates/graph-stop.mjs#L235).
- 구현이 바뀌면 basis 불일치로 deploy 도 낡는다(재배포 강제).
- 배포 실패 자체를 기록하는 자리는 없다.

## Exit condition
`workspace/deploy.md` 가 `status: deployed` + 현재 구현 해시와 같은 `basis` 를 가진 상태. 그러면 전 노드가 clean 이 되고 프론티어가 비어 있게 된다.

## Unverified
- **진입 절차 전체** — 누가 언제 무엇을 배포하고 마커를 쓰는지가 어디에도 없다. 이 단계 문서에서 [INFERRED] 로 채울 수도 없어 비워 둔다. 실제 배포 방식(정적 호스팅/Vercel 등)은 프로젝트의 `tech-stack.md` 결정에 달려 있고, 그 문서는 그래프 밖이다 (findings F7). [CONFIRMED: 부재]
- **`deployed` 상태의 도달 가능성** — 현재 구조에서 deploy 는 사실상 영구 dirty 다. 이것이 의도된 "미구현"인지 누락인지는 파일로 판단할 수 없다. [INFERRED]
- **배포 후 롤백·재배포 흐름** — 정의돼 있지 않다. [INFERRED]
