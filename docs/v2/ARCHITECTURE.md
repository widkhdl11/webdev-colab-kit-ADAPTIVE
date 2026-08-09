# 하네스 구조 지도 (2차 — 따로 조사한 판)

1차([docs/ARCHITECTURE.md](../ARCHITECTURE.md))를 안 보고 같은 레포를 다시 조사해 만든 것이다.
다시 쓰는 게 목적이 아니라 **두 번의 답이 어디서 달라지는지 보려고** 그랬다. 답이 갈린 자리가 곧 레포에 쓰여 있어서가 아니라 내가 짐작해서 채운 자리다.
비교한 결과는 [diff-report.md](diff-report.md) 에 있다.

## 먼저 볼 것 — [explorer.html](explorer.html)

노드를 클릭하면 **그 단계가 무엇을 하고, 어떤 파일을 읽고 만드는지**가 옆에 뜬다. 탭 4개다:
실행 경로 · 게이트와 상태(게이트가 뭔지부터 설명) · 문서 하나하나가 무엇인지 · 단계별로 누가 불리나.

만드는 파일 · clean 조건 · 의존 관계는 [graph.mjs](../../graph.mjs) 에서 **직접 읽어 생성**한다
(`node scripts/build-explorer.mjs`). 손으로 베껴 두면 graph.mjs 가 바뀔 때 문서만 조용히 낡기 때문이다.

아래는 같은 내용을 글로 정리한 것이다.

## 이 하네스가 푸는 문제

사람과 에이전트가 같이 웹사이트를 만들 때 제일 비싸게 치르는 실수는 **"어디까지 다시 해야 하나"를 사람이 그때그때 정하는 것**이다.
"디자인을 바꿨으니 구현도 다시 해야지"를 매번 말로 합의하면 빠뜨리거나 필요 이상으로 잡는다.
이 하네스는 그 판단을 사람 손에서 떼어 데이터에 맡겼다 — [graph.mjs](../../graph.mjs) 에는 **무엇이 무엇에 기대는지**만 적혀 있고,
"그다음 어디로 가라"는 말은 한 줄도 없다.

다시 할 범위는 규칙 하나에서 저절로 나온다: *위쪽이 dirty 면 그걸 쓰는 아래쪽이 전부 dirty* ([graph.mjs:6](../../graph.mjs#L6)).
턴이 끝날 때마다 Stop 훅이 파일 내용의 해시를 비교해 상태를 고치고, dirty 인데 위쪽은 다 clean 인 노드를 **프론티어**로 뽑아 준다.
사람이 "다음 할 일"을 고르지 않는다. 그래프에서 나온다.

## 주 실행 경로

**[00-workflow.html](diagrams/00-workflow.html)** ([명세](diagrams/00-workflow.workflow.json)) — 노드 10개, 레이아웃 검사 9/9 통과

```
product ─┬→ spec ────┐
         └→ design ──┴→ implement → qa → review → deploy
                        (게이트)    (게이트)  (마커)   (마커)
```

## 단계

| # | 노드 | 무엇을 보고 clean 을 내리나 | 문서 |
|---|---|---|---|
| 01 | `product` | 파일이 있고 비어 있지 않은가 | [01-product.md](stages/01-product.md) |
| 02 | `spec` | 프론트매터가 `status: approved` 인가 + INV 마다 테스트가 있나 | [02-spec.md](stages/02-spec.md) |
| 03 | `design` | 자식 둘이 다 통과했나 (하나는 프론트매터, 하나는 게이트) | [03-design.md](stages/03-design.md) |
| 04 | `implement` | 게이트 `fsd·security·tsc·design` 에러가 0건인가 | [04-implement.md](stages/04-implement.md) |
| 05 | `qa` | 게이트 `test·spec-coverage` 에러가 0건인가 | [05-qa.md](stages/05-qa.md) |
| 06 | `review` | 마커에 `status: passed` + 맞는 `basis` 해시가 있나 | [06-review.md](stages/06-review.md) |
| 07 | `deploy` | 마커에 `status: deployed` + 맞는 `basis` 해시가 있나 | [07-deploy.md](stages/07-deploy.md) |

**clean 을 내리는 방법은 세 가지뿐이다** — 파일이 있는지 보거나, 게이트를 돌려 보거나, 사람이 마커를 찍거나.
앞의 둘은 턴마다 저절로 내려가고, 마커만 사람 손이 필요하다.
그리고 마커에만 `basis` 가 따라붙어서, **구현이 바뀌면 사인오프가 알아서 낡는다.**

위 7장은 **그래프 노드**를 설명한다. 그 노드들을 실제로 밀고 가는 쪽 — 훅 3개 · 게이트 · graph-stop · 분류기 — 은
[runtime.md](runtime.md) 한 장에 모았다. "게이트가 왜 나를 막았지?"는 거기 있다.

## 다른 그림

네 장 다 PNG·SVG 로 내보낼 수 있다(공유용). 클릭해서 파고드는 건 [explorer.html](explorer.html) 쪽이 낫다.

- **[02-gate.html](diagrams/02-gate.html)** ([명세](diagrams/02-gate.lifecycle.json)) — 노드 하나가 dirty 에서 clean 까지 가는 길과, **되돌아오는 길 세 개**(게이트 에러 · 승인 취소 · 해시 어긋남)
- **[03-doc-flow.html](diagrams/03-doc-flow.html)** ([명세](diagrams/03-doc-flow.dataflow.json)) — 실제로 있는 문서만 그렸다. 프론트매터 승인과 해시 사인오프를 갈라 놓고, 고아·유령도 표시
- **[04-layers.html](diagrams/04-layers.html)** ([명세](diagrams/04-layers.architecture.json)) — **어느 단계에서 누가 불리나.** 스킬 10개·서브에이전트 7개가 어디 붙는지, 그리고 **implement·deploy 에는 아무것도 없다는 것**

## Known gaps — 지금 알고 있는 구멍

[findings.md](findings.md) 에 전부 있다. **1차·2차를 합친 것**으로, 16항목 중 결함이 13건이다.
등급을 매긴 잣대: *정상적으로 일하다 보면 반드시 마주치나 + 뒤에서 받쳐 주는 두 번째 장치가 있나*.

| ID | 무슨 일인가 | 등급 |
|---|---|---|
| **F-01** | [CLAUDE.md:97](../../CLAUDE.md#L97) 이 세션마다 읽으라고 하는 `GLOSSARY.md` 가 레포에 없다 | **높음** — 매번 마주치는데 없다는 걸 알려 주는 장치가 없다 |
| **F-06①** | "새 페이지 만들어줘" 한마디에 `checkpoint` 와 `design-interview` 가 둘 다 걸린다. 순서를 정해 주는 규칙 파일은 자동으로 안 붙는다 | **높음** — 받쳐 줄 장치가 자동으로 안 붙는다 |
| **F-02** | `deploy` 사인오프(`status: deployed`)를 어떻게 쓰는지 알려 주는 문서가 한 곳도 없다. **지금 프론티어가 deploy 다** | 중간 — graph-stop 이 돌면서 알려 준다 |
| **F-03** | 프론트매터 검사가 **검사할 파일이 하나도 없으면 그냥 통과시킨다** ([graph-stop.mjs:153](../../gates/graph-stop.mjs#L153)) → `design-rules.md` 가 아예 없어도 page-designer 가 clean | 중간 — `design/BEFORE_UI` 가 따로 막아 준다 |
| **F-11** | `qa` 가 찾는 패턴 `src/**/*.test.ts` 가 **`.test.tsx` 를 못 잡는다.** signal 테스트 9개 중 3개가 `.tsx` | 중간 — implement 의 `src/**` 가 대신 잡아 전파된다 |
| **F-12** | `design/schema-designer` 가 찾는 파일이 하나도 없어서 **늘 통과한다.** signal 은 `model.ts` 가 아니라 `model/` 폴더를 쓴다 | 중간 — 코드 검사는 implement 에서 한다 |
| **F-13** | `tech-stack.md` 가 어느 노드의 `produces` 에도 없다 → 기술 결정을 바꿔도 다시 할 범위가 안 잡힌다 | 중간 |
| F-05 · F-06② | `spec` 설명이 짧아 잘 안 걸린다 · `wrap-up` 과 `retro` 가 같은 말에 둘 다 걸린다 | 중간 |
| F-04 · F-07 · F-14 · F-15 · F-16 | commands 폴더 없음 · `README.md` 를 아무도 안 읽음 · `execution-graph.html` 을 아무도 안 읽음 · `INTERVIEW.md` 가 그래프 밖 · README 한 줄 말고는 부를 데가 없는 스킬 3개 | 낮음 |

**결함은 아닌데 적어 둔 것**
- **F-08** — 참조만 기계로 훑으면 "아무도 안 읽는 문서"로 잘못 보게 되는 자리 4곳(`paths:` 로 저절로 붙는 규칙 2개, 경로가 아니라 이름으로만 불리는 아키텍처 프로파일 2개)
- **1차가 잘못 잡은 것 1건** — qa-classifier 예시 경로 두 개를 "없다"고 했는데 `projects/wama/` 에 멀쩡히 있다. 프로젝트 안쪽 기준 경로를 레포 맨 위에서 찾아본 탓이다

**F-06 은 고쳐 쓴 항목이다.** 2차 조사가 단어 겹침 수치를 보고 "충돌 없음"이라고 했는데 틀렸다 — 문제는 단어가 아니라 **어떤 말에 걸리느냐**였다. 어쩌다 그랬는지는 [diff-report.md](diff-report.md) D6 에 있다.

## Omissions — 그림에서 뺀 것

전체 목록은 [omissions.md](omissions.md). 요약하면:

- **1차가 뺐던 `거부(status: draft)` 를 이번엔 넣었다.** [graph-stop.mjs:156](../../gates/graph-stop.mjs#L156) 이 `approved` 인지 보니까, 그게 아닌 상태도 게이트가 실제로 겪는 상태다. 빼 놓으면 clean 이 한 방향으로만 흐르는 것처럼 보인다.
- **다시 하러 되돌아가는 화살표는 일부러 안 그렸다.** 되돌아가는 건 화살표가 아니라 규칙이다 — 화살표로 그리면 있지도 않은 경로가 있는 것처럼 보인다.
- 노드 개수 제한과 자리 부족 때문에 뺀 것: `qa-classifier`(00-workflow) · `design` 의 자식 2개(00-workflow) · `design` 의 집계 상태(02-gate, 레인 자리가 3칸뿐) · `PROGRESS.md`·`DECISIONS.md`(03-doc-flow) · `checkpoint`·`style-scout`(04-layers, 옆 노드에 합침).
- **04-layers 는 주제를 바꿨다.** 이전엔 "문서가 언제 컨텍스트에 붙나"였는데 Claude Code 동작 설명에 가까워서, 그 내용은 [runtime.md](runtime.md) 로 옮기고 "내 스킬·에이전트가 어느 단계에서 불리나"로 다시 그렸다.
- **없어서 안 그린 것**: `workspace/deploy.md`(F-02) · `.claude/commands/`(F-04) · MCP 설정. 없는 것을 `[INFERRED]` 로도 채우지 않았다(§R1).

## Unverified claims — 파일에서 확인 못 한 것

단계 문서에 붙인 `[INFERRED]` **35건 전부**를 노드별로 모았다. "틀렸다"가 아니라 **"파일만 봐서는 알 수 없었다"**는 뜻이다.

**product** ([01-product.md](stages/01-product.md)) — PRODUCT.md 없이 구현을 시작하는 걸 막는 게이트가 없다 · "승인했다"는 상태가 그래프에 없다 · PRODUCT.md 형식을 강제하는 템플릿이 없다 · setup 으로 넘어가는 길이 그래프 밖이다 · kickoff 의 생성 순서가 진짜 강제되는지 모른다 · 활성 프로젝트와 비활성 프로젝트를 다루는 방침이 서로 다르다

**spec** ([02-spec.md](stages/02-spec.md)) — 위험한 기능인지 판단하는 걸 강제하는 게이트가 없다 · `spec-auditor` 를 "있으면"이라고 언급하는데 레포에 없다 · `INV-` 규칙이 정규식 한 줄 말고 정의된 데가 없다 · approved 로 바꿀 때 누가 승인했는지 안 남는다 · spec-coverage 가 전 프로젝트를 훑는 게 어떤 영향인지 못 봤다

**design** ([03-design.md](stages/03-design.md)) — schema-designer 를 어떻게 하는지 알려 주는 문서가 없다 · `INTERVIEW.md` 가 어느 노드의 산출물도 아니다 · 대비 4.5:1 을 재라고 하는데 재는 코드가 없다 · `tokens.css` 가 design 이 아니라 implement 해시에 들어간다 · Next 라우트 1장 예외가 실제로 어떻게 작동하는지 못 봤다

**implement** ([04-implement.md](stages/04-implement.md)) — implement 와 qa 가 찾는 파일이 겹친다(테스트만 고쳐도 basis 가 바뀌는지) · `any` 금지를 검사하는 코드가 없다 · 색·radius 하드코딩 금지를 검사하는 게이트가 없다 · FSD 검사가 `@/` 와 `.` 로 시작하는 import 만 읽는다 · 비활성 프로젝트의 위반이 어떤 영향인지 못 봤다

**qa** ([05-qa.md](stages/05-qa.md)) — 테스트 출력이 뒤 800자만 남는다 · `test/FAIL` 을 전역 에러로 치는 게 일부러인지 모른다 · `test-auditor` 를 부르는 게 `clean_when` 에 없다 · 분류기가 **왜** 그렇게 판단했는지 아무 데도 안 남는다 · 테스트 파일 찾는 정규식의 사각지대를 못 봤다

**review** ([06-review.md](stages/06-review.md)) — 리뷰어를 진짜 돌렸는지 확인하는 장치가 없다(손으로 써넣어도 통과한다) · 정식/빠른 중 어느 등급으로 했는지 마커에 안 남는다 · basis 가 테스트 변경에도 반응하는지 못 봤다 · `review.md` 형식 템플릿이 없다 · `signoffOK` 가 파일 하나만 읽는다

**deploy** ([07-deploy.md](stages/07-deploy.md)) — **배포를 어떻게 하는지 전체가 확인 안 됨** · 사인오프를 누가 하는지 안 정해져 있다 · 빌드 결과물과 basis 가 맞는지 확인하는 장치가 없다 · `apply-migrations.mjs` 가 어디 속하는지 모른다 · 롤백·재배포 상태가 그래프에 없다

## 이 문서를 어디까지 믿어도 되나

- **인용은 기계로 검사했다.** `node scripts/check-docs.mjs docs/v2` — 링크마다 ①대상 파일이 있나 ②줄 번호가 파일 안에 있나 ③문서 위치 기준으로 열리나 를 본다. 실행 출력 없이 "확인했다"는 말은 근거로 안 친다(§R5).
- **그림의 `9/9 통과` 는 레이아웃이 안 깨졌다는 뜻이지 내용이 맞다는 뜻이 아니다**(§R4). 내용은 그림마다 노드 태그 5개를 골라 실제 줄을 찍어 봤다.
- **`CONFIRMED` 태그는 "파일에 그렇게 쓰여 있다"까지만 보장한다.** 쓰여 있는 대로 실제로 돌아가는지는 다른 문제고, 그건 직접 돌려 보는 다음 단계에서 확인할 일이다.
