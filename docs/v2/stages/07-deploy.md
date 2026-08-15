# 07. deploy

그래프의 종착 노드. 하류가 없다 ([graph.mjs:126-132](../../../graph.mjs#L126-L132)).
`review` 와 같은 `signoff` 방식으로 clean 되는 두 노드 중 나머지다.

**이 레포의 현재 프론티어가 여기다** — [projects/signal/workspace/PROGRESS.md:7](../../../projects/signal/workspace/PROGRESS.md#L7) 이 "`deploy` 는 아직 손대지 않았다(`workspace/deploy.md` 없음)"라고 기록하고 있다.

## Purpose

배포를 **review 뒤에 강제로 세운다.** [graph.mjs:126-127](../../../graph.mjs#L126-L127) 이 목적을 직접 적어 놓았다 — "review 에 의존 → review dirty 면 배포 차단(강제 마감)".
없으면 깨지는 것: 리뷰를 건너뛴 코드가 배포될 수 있다. 이 노드의 존재 이유는 자기가 무엇을 하느냐가 아니라 **무엇을 막느냐**다.

## Entry condition

| 조건 | 어디서 막나 |
|---|---|
| `review` 가 clean | [graph.mjs:129](../../../graph.mjs#L129) `depends_on: ["review"]` · [graph-stop.mjs:235](../../../gates/graph-stop.mjs#L235) |

review 가 dirty 인 동안은 프론티어에 오르지도 못한다. 그리고 review 는 implement 해시가 바뀌면 저절로 낡으므로,
**배포 직전에 코드를 한 줄 고치면 배포가 다시 막힌다.** 이게 이 그래프에서 유일하게 강제되는 마감이다.

## What it does

**절차 문서가 없다.** 확인된 것은 두 가지뿐이다:

1. graph-stop 이 프론티어 안내에서 **무엇을 써야 하는지** 출력한다 ([graph-stop.mjs:259-262](../../../gates/graph-stop.mjs#L259-L262)):
   `deploy 사인오프 대기: workspace/deploy.md 에 'status: deployed' + 'basis: <해시>' 기록 시 clean`
2. 배포 대상(안 함 / 정적 호스팅 / Vercel)은 kickoff 의 기술 질문에서 정해져 PRODUCT.md 에 기록된다 ([kickoff/SKILL.md:20-21](../../../.claude/skills/kickoff/SKILL.md#L20-L21))

그 사이 — 실제로 무엇을 어떻게 배포하고, 배포 성공을 어떻게 확인하는지 — 를 안내하는 스킬·규칙·스크립트를 못 찾았다. 아래 `Gate` 와 `Unverified` 참조.

## Skills and tools

| name | when | evidence |
|---|---|---|
| 스킬 | **없음** | [CONFIRMED: ../reference/skills.md] 10개 중 deploy 를 트리거로 삼는 항목 0건 |
| 서브에이전트 | **없음** | [CONFIRMED: ../reference/subagents.md] 7개 중 deploy 를 언급하는 항목 0건 |
| 스크립트 | **없음** — `scripts/` 5개 중 배포 관련 없음 (`apply-migrations.mjs` 는 DB 마이그레이션) | [CONFIRMED: ../reference/inventory.json] |
| 유일한 안내 | graph-stop 의 런타임 출력 | [CONFIRMED: ../../../gates/graph-stop.mjs:262] |

## Documents read

| document | purpose | required? |
|---|---|---|
| `projects/<이름>/workspace/HANDOFF.md` | 현재 basis 해시 (graph-stop 이 출력해 줌) | 예 |
| `projects/<이름>/docs/PRODUCT.md` | 배포 대상 결정 | 예 (`Unverified` — 강제하는 곳 없음) |

## Documents written

| document | ownership | consumed by |
|---|---|---|
| `projects/<이름>/workspace/deploy.md` | deploy 의 produces ([graph.mjs:130](../../../graph.mjs#L130)) | [graph-stop.mjs:179-188](../../../gates/graph-stop.mjs#L179-L188) `signoffOK` — **이것뿐이다** |

**이 파일은 현재 어느 프로젝트에도 존재하지 않는다.** 그래프가 요구하는 유일한 산출물인데 아직 한 번도 만들어진 적이 없다.

## Gate

**조건**: `signoff: { marker: "workspace/deploy.md", require: "status: deployed", basis_of: "implement" }` ([graph.mjs:131](../../../graph.mjs#L131))

판정 로직은 review 와 **완전히 같은 함수**를 쓴다 ([graph-stop.mjs:179-188](../../../gates/graph-stop.mjs#L179-L188)) — 마커 존재 + 프론트매터 문자열 + basis 해시 일치.
다른 것은 `require` 값(`status: deployed`)과 마커 경로뿐이다.

> ⚠ **`status: deployed` 를 언제 어떻게 기록하는지 설명하는 문서가 이 레포에 없다.**
> `deployed` 라는 문자열을 `CLAUDE.md` · `.claude/` · `docs/references/` · `gates/` · `scripts/` 전체에서 찾으면 **0건**이다.
> 대비되게 review 쪽은 [CLAUDE.md:72-73](../../../CLAUDE.md#L72-L73) 과 [graph-engine.md:114](../../references/graph-engine.md#L114) 에 절차가 있다.
> 이것이 [findings F-02](../findings.md) 다 (심각도 **중간** — graph-stop 의 런타임 안내가 있어 완전히 막히지는 않는다).

**basis 가 implement 를 가리킨다.** 배포한 것은 빌드 산출물인데 사인오프의 근거는 소스 해시다 — 둘 사이의 대응을 검증하는 장치는 없다.

## Failure path

- `review` 가 dirty 가 되면 deploy 도 dirty 로 전파된다 ([propagate.mjs:87-92](../../../gates/propagate.mjs#L87-L92)) — 배포 후 코드를 고치면 사인오프가 무효가 된다
- 배포에 실패했을 때 무엇을 하는지, 롤백을 어디에 기록하는지 정해진 곳이 없다. 그래프에는 실패 상태가 없다 — `deploy` 는 clean 이거나 dirty 뿐이다
- `--mark deploy` 로 수동 dirty 는 가능하다 ([graph-stop.mjs:193-206](../../../gates/graph-stop.mjs#L193-L206))

## Exit condition

`workspace/deploy.md` 에 `status: deployed` + 현재 implement 해시와 일치하는 `basis` → deploy clean.
**전 노드가 clean 이 되고 프론티어가 "없음 — 전부 clean" 이 된다** ([graph-stop.mjs:113](../../../gates/graph-stop.mjs#L113)).

## Unverified

- **배포 절차 전체가 미확인이다.** 무엇을 빌드하고, 어디에 올리고, 성공을 어떻게 확인하는지 — 어느 파일에서도 못 찾았다. 이 문서의 `What it does` 가 2줄인 것은 요약이 아니라 **정말로 그것뿐**이기 때문이다. `[INFERRED]`
- **배포 사인오프를 누가 하는지 정해져 있지 않다.** review 는 [CLAUDE.md:77-80](../../../CLAUDE.md#L77-L80) 이 리뷰어 파견 규칙으로 "누가"를 정하지만, deploy 에는 대응하는 규칙이 없다.
- **빌드 산출물과 basis 의 대응이 검증되지 않는다.** `basis_of: "implement"` 는 `src/**` 해시다. 그 소스로 만든 번들이 실제로 배포됐는지 확인하는 장치는 없다. `[INFERRED]`
- **`scripts/apply-migrations.mjs` 가 배포 파이프라인의 일부인지 확인 안 했다.** 파일을 읽지 않았고, 어느 노드의 produces 도 아니며 훅에도 등록돼 있지 않다. `[INFERRED]`
- **롤백·재배포 상태가 그래프에 없다.** deploy 는 이진 상태(clean/dirty)다. 배포 실패와 미배포가 구별되지 않는다. `[INFERRED]`
- **`workspace/deploy.md` 의 형식**을 정한 템플릿이 없다. 정규식이 보는 것은 `status` 와 `basis` 두 필드뿐이므로 나머지는 자유인 것으로 보이나, 규약이 있어야 하는지는 판단하지 않았다.
