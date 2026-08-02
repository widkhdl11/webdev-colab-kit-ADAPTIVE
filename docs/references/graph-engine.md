# 그래프 실행 엔진 — 트레이스와 사용법

`spec→design→implement→qa→review→deploy`를 **고정 순차 dispatch**가 아니라
**의존성 그래프 + dirty 전파**로 돌린다. 재작업 경로는 규칙으로 선언하지 않고 전파에서 **파생**된다.

## 유일한 규칙
> 상류가 dirty → 그에 의존하는 하류가 전부 dirty. 실행기는 dirty 노드를 상류부터 재실행하고,
> 완료 게이트가 통과하면 dirty를 해제한다. "다음에 어디로"는 어디에도 없다.

## 파일
| 파일 | 역할 |
|---|---|
| `graph.mjs` | 토폴로지 선언(순수 리터럴). depends_on·produces·clean_when. 라우팅 없음 |
| `gates/propagate.mjs` | 전파 엔진: propagate·topoSort·descendants·cycle 검출 |
| `gates/graph-stop.mjs` | Stop 오케스트레이터: 게이트→sync(해시감지·전파)→release(dirty해제)→HANDOFF. `--mark <node>` 수동 마크 |
| `.claude/agents/qa-classifier.md` | 검증 실패를 spec/design/impl로 귀속(판정만, 라우팅 X) |
| `projects/<이름>/workspace/HANDOFF.md` | 런타임 상태(dirty·hash). 자동 생성 |
| `scripts/briefing.mjs` | 세션 시작 시 프론티어(지금 작업할 노드) 표시 |

## 토폴로지
```
product ─┬→ spec ─────────┐
         └→ design ────────┴→ implement → qa → review → deploy
              (page-designer ∥ schema-designer; 둘 다 clean ⟺ design clean)
```
- spec·design은 직교(서로 무의존). implement에서 합류.
- qa=얕은 결정론 게이트(자동 clean). review=깊은 리뷰어 사인오프(마커+basis, 마일스톤에 수행).
- deploy.depends_on=[review] → review dirty면 배포 차단.

---

## 검증 트레이스 (실제 실행 출력)

### 전파 규칙 하나에서 A~D 파생 — `node gates/propagate.mjs --selftest`
```
● topoSort (상류→하류): product → spec → design → implement → qa → review → deploy
● 전파 시나리오 (규칙 하나에서 전부 파생, 개별 라우팅 0):
   A 구현만        mark(implement) → 하류 dirty: qa, review, deploy            ✓
   B 디자인        mark(design)    → 하류 dirty: implement, qa, review, deploy  ✓
   C 스펙          mark(spec)      → 하류 dirty: implement, qa, review, deploy  ✓
     (루트)product mark(product)   → 하류 dirty: spec, design, implement, qa, review, deploy ✓
● 순환 검출(합성 a↔b): ✓ 거부 — 방문 불가 노드: a, b
● D 병렬 집계: design 자식 하나만 dirty 여도 design dirty: ✓
```
개별 라우팅 규칙 0개 — 세 시나리오가 전파 함수 하나에서 나온다.

### 부트스트랩·변경감지·release — `node gates/graph-stop.mjs`
| 사건 | 결과 |
|---|---|
| 초록 레포 부트스트랩 | 전부 clean, 프론티어 없음 (게이트 깨짐만 추적, 기능 미완성 아님) |
| 게이트 안 깨는 변경(주석) | 같은 턴에 도로 clean (재빌드 성공=clean) |
| 게이트 깨는 변경(tsc 에러) | implement **dirty 잔존** → qa 전파 → 프론티어=implement |
| 원복 | 다시 전부 clean |

### E — 검증 실패 분류 루프 (design-level)
분류기가 design-level 판정 → design-rules.md `status: approved→draft`(거부):
```
design 거부 후:  design=dirty implement=dirty qa=dirty review=dirty deploy=dirty  프론티어=design
재승인 후:       design=clean implement=clean qa=clean  (review·deploy는 마커 없어 dirty)
```
거부는 승인 취소라 **재작업+재승인 전까지 sticky** — 기존 프론트매터 machinery 재사용.

### review 사인오프 + basis staleness
```
① 마커(status:passed + basis=구현해시) 작성 → review=clean, 프론티어=deploy
② src 변경 → basis 불일치 → review=dirty(자동 낡음), 프론티어=review
③ 원복 → review dirty(마커 없음) 정직 상태
```
"옛날 리뷰가 새 변경을 통과"시키는 구멍이 basis 해시로 자동 차단.

---

## 사용법
- **지금 어디 작업?** 세션 브리핑의 `◆ 지금 작업할 노드(프론티어)` 또는 `graph-stop` 출력.
- **QA/리뷰 실패 원인 귀속**: `qa-classifier` 서브에이전트 파견 → `{level, reason, evidence}`.
  - impl-level → 코드 수정(qa/review가 이미 dirty).
  - design-level → design-rules `status: draft`(거부).
  - spec-level → 해당 스펙 `status: draft`(거부).
  - 강제 승격: spec-level이거나 위험 표면(인증·결제·권한·격리 INV·security)이면 사용자에게 보고 후.
- **리뷰 통과 기록**: `workspace/review.md`에 `status: passed` + `basis: <graph-stop이 안내한 해시>`.
- **강제 dirty(파일 변경 없이)**: `node gates/graph-stop.mjs --mark <node>` (게이트 통과 노드엔 비지속 — 거부를 쓸 것).

## 배선
- `PostToolUse`: `run-gates --quick` (편집 즉시 위반 차단) — 유지.
- `Stop`: `graph-stop`(내부에서 run-gates 전체 호출, 위반 시 exit 2 차단 유지 + sync/release/HANDOFF).
- `SessionStart`: `briefing`(프론티어 포함).
