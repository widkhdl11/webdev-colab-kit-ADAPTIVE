# webdev-colab-kit 아키텍처

사람이 오케스트레이터로 앉아 Claude와 함께 웹사이트를 만드는 협업 하네스다. 핵심은 "다음에 무엇을 할지"를 프롬프트가 아니라 **의존성 그래프의 dirty 전파**로 정하는 것이다. 노드는 `product → spec·design → implement → qa → review → deploy` 일곱 개뿐이고, 각 노드가 clean 이 되는 조건은 [graph.mjs](../graph.mjs) 에 데이터로만 선언돼 있다(라우팅 코드 없음). 상류가 바뀌면 하류가 자동으로 dirty 가 되고, 지금 작업할 노드(프론티어)는 매 턴 계산돼 나온다. 게이트·훅은 모델이 끌 수 없는 자리에서 FSD 레이어·보안 패턴·타입·테스트·디자인 승인을 강제한다.

## 실행 흐름 한 장

- **[00-workflow.workflow.html](diagrams/00-workflow.workflow.html)** — 노드 11개, 주 경로 + 게이트 레인 + 실패 경로 (IR: [00-workflow.workflow.json](diagrams/00-workflow.workflow.json))
- 공유 카드(1200×630 PNG)는 뷰어 런타임 기능이라 브라우저에서 HTML을 열어 내보낸다. CLI에는 export 명령이 없다(`archify --help` 확인).
- 노드마다 `CONFIRMED <파일:줄>` 또는 `INFERRED` 태그가 붙어 있다.

## 단계 문서

| # | 단계 | 무엇을 정하는가 | 문서 |
|---|---|---|---|
| 01 | 세션 브리핑 | 프론티어·대기 결정·게이트 신호등 | [01-briefing.md](stages/01-briefing.md) |
| 02 | product | 무엇을 만들지 (PRODUCT.md) | [02-product.md](stages/02-product.md) |
| 03 | spec | 어기면 사고 나는 것의 불변식 | [03-spec.md](stages/03-spec.md) |
| 04 | design | 시각 방향 + 데이터 구조 (집계 노드) | [04-design.md](stages/04-design.md) |
| 05 | implement | spec·design 이 합류하는 구현 | [05-implement.md](stages/05-implement.md) |
| 06 | qa | 얕고 결정론적인 검증 | [06-qa.md](stages/06-qa.md) |
| 07 | review | 리뷰어 사인오프 + basis 해시 | [07-review.md](stages/07-review.md) |
| 08 | deploy | 배포 사인오프 (진입 경로 없음) | [08-deploy.md](stages/08-deploy.md) |
| 09 | run-gates | 결정론 판정층 | [09-run-gates.md](stages/09-run-gates.md) |
| 10 | graph-stop | 턴 종료 오케스트레이터 | [10-graph-stop.md](stages/10-graph-stop.md) |
| 11 | qa-classifier | 실패를 어느 층에 귀속시킬지 | [11-qa-classifier.md](stages/11-qa-classifier.md) |

## 다른 그림

- **[02-gate.lifecycle.html](diagrams/02-gate.lifecycle.html)** — 노드 하나가 dirty에서 clean이 되기까지의 상태와, 다시 dirty가 되는 사건들. "왜 이 노드가 아직 dirty지?"에 답한다.
- **[03-doc-flow.dataflow.html](diagrams/03-doc-flow.dataflow.html)** — 문서 12개가 어디서 만들어져 어디서 읽히는지. 고아·유령 문서가 시각적으로 구분돼 있다.
- **[04-layers.architecture.html](diagrams/04-layers.architecture.html)** — 컨텍스트 5층(CLAUDE.md·규칙·스킬·서브에이전트·훅)이 항상 로드되는지 조건부인지, 각 조건부 층의 트리거가 무엇인지.

## Known gaps

전체 목록과 근거는 [findings.md](findings.md). 심각도 높음 4건:

- **F4 `workspace/deploy.md`** — deploy 노드가 요구하는 사인오프 마커를 만드는 절차가 레포에 없다. deploy 는 구조적으로 clean 이 될 수 없고, 지금 프론티어가 deploy 인 이유가 이것이다.
- **F10 qa 글롭이 `.test.tsx` 를 놓친다** — `src/**/*.test.ts` 는 signal 의 테스트 9개 중 `.tsx` 4개를 잡지 못한다. 그 파일만 고치면 qa 해시가 변하지 않는다.
- **F12 checkpoint ↔ design-interview 트리거 충돌** — 두 스킬 설명의 배제 조건이 같아 "새 페이지 만들어줘" 하나에 둘 다 성립한다. 게다가 checkpoint 가 *시안* 승인인지 *코드* 승인인지가 파일마다 다르게 읽힌다.
- **F15 `GLOSSARY.md` 부재** — CLAUDE.md 가 매 세션 읽으라고 지시하는 파일이 레포에 없다.

중간 5건: F6 `execution-graph.html` 참조 0건 · F7 `tech-stack.md` 와 F8 `INTERVIEW.md` 가 그래프 밖 · F9 `design/schema-designer` 가 매칭 파일 0개로 공회전 · F11 약한 트리거 3종(wrap-up·spec·setup).
낮음 5건: 스킬 `goal`·`status`·`scaffold` 가 README 한 줄 외 참조 없음 · qa-classifier 예시 경로 2건 부재 · setup↔scaffold 중복.

## Unverified claims

단계 문서의 `[INFERRED]` 전량. 이 목록이 다음 단계(실측)의 작업 큐다.

**모델 순응 — 코드가 강제하지 않는 규칙**
- 01 모델이 실제로 프론티어를 따르는지 (강제는 CLAUDE.md:11 서술뿐)
- 02 kickoff 이 인터뷰보다 파일을 먼저 만드는지 / tech-stack `approved` 가 scaffold 를 실제로 막는지
- 05 "한 문단 요약 → 동의" 절차 / 작업 등급(빠른·정식) 판정 / 테스트 먼저(red→green) 순서
- 04 대비 4.5:1 실측이 실제로 수행되는지
- 07 빠른 경로의 "보안 표면이 닿는가" 판단

**기록이 남지 않는 것**
- 02 PRODUCT.md 의 "채워짐"과 "합의됨"이 구분되지 않음
- 03 draft→approved 전환에 사용자 승인이 있었는지
- 06 test-auditor 파견 시점 / 분류기가 실제로 파견되는지
- 07 리뷰어가 실제로 파견됐는지 / basis 값을 사람이 손으로 적어 리뷰 없이 통과 가능
- 11 파견 시점·횟수 / 판정 정확도 / 거부(`status: draft`) 이력

**게이트 동작의 실측 필요**
- 01 브리핑 stdout 이 컨텍스트에 주입되는 형태 / 원칙 가드의 오탐률 / `/status` 가 동일 출력인지
- 03 INV 참조 테스트가 그 불변식을 실제로 검증하는지 / `planned/` 승격 절차
- 05 `src/**` 해시가 테스트 파일까지 포함하는 것이 의도인지
- 09 `--quick` 과 full 의 커버리지 차이가 사용자에게 보이는지 / 에러 30건 절단의 영향 / 보안 정규식 오탐·미탐률
- 10 `_` 접두 파일 제외 규칙의 부작용 / Stop 훅이 매 턴 실행되는지 / 다중 프로젝트 미추적의 영향
- 04 checkpoint 의 승인 대상 해석 (F12 와 동일 사안)

**정의가 아예 없는 것**
- 08 배포 진입 절차 전체 / `deployed` 도달 가능성이 의도된 미구현인지 / 롤백·재배포 흐름

## 재생성

```bash
node scripts/extract-harness.mjs        # docs/reference/ 자동 생성 (손으로 고치지 않는다)
node bin/archify.mjs validate <type> docs/diagrams/<file>.json --quality showcase --json
node bin/archify.mjs deliver  <type> docs/diagrams/<file>.json docs/diagrams/<file>.html --quality showcase
```

`docs/reference/` 는 전부 생성물이고, `docs/diagrams/*.json` 이 그림의 소스다(HTML은 산출물). 네 그림 모두 showcase 9/9 검증을 통과한 상태로 커밋된다.
