# 하네스 정합성 점검 — 발견 목록

근거: `docs/reference/inventory.json` (스킬 10 · 커맨드 0 · 서브에이전트 7 · 훅 6 · 규칙 7 · 그래프 노드 7)
+ 원본 파일 직접 확인. 수정은 하지 않았다 — 목록만.

점검 시점 기준선: 브랜치 `docs/architecture-map`, 활성 프로젝트 `signal`.

| # | 분류 | 대상 | 심각도 |
|---|---|---|---|
| F1 | 참조 없음 | 스킬 `goal` | 낮음 |
| F2 | 참조 없음 | 스킬 `status` | 낮음 |
| F3 | 참조 없음 | 스킬 `scaffold` | 낮음 |
| F4 | 유령 참조 + 게이트 | `workspace/deploy.md` | **높음** |
| F5 | 유령 참조 | qa-classifier 예시 경로 2건 | 낮음 |
| F15 | 유령 참조 | `GLOSSARY.md` (CLAUDE.md가 지시) | **높음** |
| F6 | 고아 문서 | `execution-graph.html` | 중간 |
| F7 | 그래프 밖 산출물 | `docs/tech-stack.md` | 중간 |
| F8 | 그래프 밖 산출물 | `docs/design/INTERVIEW.md` | 중간 |
| F9 | 게이트 공회전 | `design/schema-designer` | 중간 |
| F10 | 게이트 누락 | `qa` 글롭이 `.test.tsx` 미포함 | **높음** |
| F11 | 약한 트리거 | 설명 30단어 미만 6종 | 중간 |
| F12 | 설명 충돌 | checkpoint ↔ design-interview | **높음** |
| F13 | 설명 충돌 | setup ↔ scaffold | 낮음 |
| F14 | 설명 충돌 | wrap-up ↔ retro | 중간 |
| — | 훅 → 없는 파일 | **해당 없음** (6/6 존재) | — |

---

## 1. 아무것도 참조하지 않는 스킬·서브에이전트·커맨드

### F1. 스킬 `goal` — 진입점이 README 한 줄뿐
- 정의: [.claude/skills/goal/SKILL.md](.claude/skills/goal/SKILL.md)
- 레포 전체에서 이 이름을 언급하는 곳: [README.md:26](README.md#L26) `슬래시 전용: /goal(세션 목표) …` **단 1곳.**
- [CLAUDE.md](CLAUDE.md)에는 등장하지 않는다 — 매 세션 로드되는 문서에 없으니 사용자가 README를 기억하지 못하면 존재를 알 길이 없다.
- `disable-model-invocation: true`라 모델이 자발적으로 부를 수도 없다(설계상 의도).

### F2. 스킬 `status` — 같은 상태
- 정의: [.claude/skills/status/SKILL.md](.claude/skills/status/SKILL.md)
- 언급: [README.md:26](README.md#L26), [scripts/briefing.mjs:2](scripts/briefing.mjs#L2) 주석 (`SessionStart 훅과 /status가 호출`). CLAUDE.md에는 없음.

### F3. 스킬 `scaffold` — 실제로 쓰이는 건 스크립트 쪽
- 정의: [.claude/skills/scaffold/SKILL.md](.claude/skills/scaffold/SKILL.md)
- [.claude/skills/setup/SKILL.md:26](.claude/skills/setup/SKILL.md#L26)은 `node scripts/scaffold.mjs <프로젝트명>` — **스크립트**를 직접 부르지 스킬을 부르지 않는다.
- 따라서 스킬 파일 자체는 사용자가 `/scaffold`를 손으로 칠 때만 진입한다. 언급도 [README.md:26](README.md#L26) 한 줄.

### 참조되고 있는 것들 (대조군)
서브에이전트 7종은 전부 최소 1곳에서 참조된다: `code-reviewer`·`security-reviewer`·`ui-reviewer`·`test-auditor`·`qa-classifier`는 [CLAUDE.md](CLAUDE.md)에서, `design-drafter`·`style-scout`는 [.claude/rules/design-drafting.md](.claude/rules/design-drafting.md)에서.

### 커맨드
`.claude/commands/` 디렉터리 자체가 없다 (`inventory.json` → `commands.dir_exists: false`). 이 분류의 대상이 0건이므로 "참조 없는 커맨드"도 0건이다.

---

## 2. 읽는다고 선언됐지만 아무도 쓰지 않는 문서 (유령 참조)

### F4. `workspace/deploy.md` — 만드는 절차가 어디에도 없다 【높음】
- 요구하는 쪽: [graph.mjs:91-95](graph.mjs#L91-L95)
  ```js
  deploy: { depends_on: ["review"], produces: ["workspace/deploy.md"],
    clean_when: { signoff: { marker: "workspace/deploy.md", require: "status: deployed", basis_of: "implement" } } }
  ```
- 이 파일을 만들라고 지시하는 스킬·서브에이전트·규칙·문서: **0건.** 레포 전체 `deploy.md` 문자열 검색 결과는 위 graph.mjs 2줄, [execution-graph.html:232](execution-graph.html#L232)(그림 라벨), [projects/signal/workspace/PROGRESS.md:7](projects/signal/workspace/PROGRESS.md#L7)(`deploy는 아직 손대지 않았다`)뿐.
- 대조: review 마커는 [CLAUDE.md:71-73](CLAUDE.md#L71-L73)에서 "누가·언제·무엇을 적는지"가 규정돼 있다. deploy에는 그 대응물이 없다.
- 결과: `deploy`는 구조적으로 clean이 될 수 없다. 지금 프론티어가 `deploy`인 것도 이 때문이다([projects/signal/workspace/HANDOFF.md:3](projects/signal/workspace/HANDOFF.md#L3)).

### F15. `GLOSSARY.md` — 매 세션 읽으라고 지시하는데 파일이 없다 【높음】
- 요구하는 쪽: [CLAUDE.md](CLAUDE.md) 마지막 Terminology 절 — "Read GLOSSARY.md at session start to resolve Korean paraphrases to canonical terms."
- 레포 어디에도 `GLOSSARY.md`(대소문자 무관)가 없다. 루트·`docs/`·`projects/*` 전부 확인.
- CLAUDE.md 는 항상 로드되는 문서라, 세션마다 존재하지 않는 파일을 찾는 지시가 실행된다. 용어 해소의 근거가 통째로 비어 있다.
- (이 항목은 A-4 그림 작업 중 "노드 라벨은 GLOSSARY.md 의 정본 용어를 쓸 것"이라는 요구를 이행하려다 발견했다.)

### F5. qa-classifier의 evidence 예시 경로 2건 — 현 레포에 없음 【낮음】
- [.claude/agents/qa-classifier.md:51](.claude/agents/qa-classifier.md#L51) → `supabase/migrations/0007_exam.sql`
- [.claude/agents/qa-classifier.md:56](.claude/agents/qa-classifier.md#L56) → `docs/specs/auth-isolation.md`
- 둘 다 존재하지 않는다(wama 시절 예시로 보인다). 문맥상 "출력 형식 예시"라 오작동으로 이어질 가능성은 낮지만, 신규 프로젝트에서 분류기가 존재하지 않는 파일 이름을 흉내 낼 여지는 남는다.

---

## 3. 쓰이지만 아무도 읽지 않는 문서 (고아)

### F6. `execution-graph.html` — 참조 0건 【중간】
- 15KB, 루트 상주. 레포 전체에서 `execution-graph`를 언급하는 파일: **없음.**
- 같은 내용을 가리키는 유일한 포인터는 [docs/references/graph-engine.md:62](docs/references/graph-engine.md#L62)인데, 이건 로컬 파일이 아니라 claude.ai 아티팩트 ID(`9b1a7269`)를 가리킨다. 즉 문서는 외부 사본을 가리키고, 로컬 사본은 아무도 안 가리킨다.

### F7. `projects/<이름>/docs/tech-stack.md` — 쓰는 곳도 읽는 곳도 setup 하나 【중간】
- 생성: [.claude/skills/setup/SKILL.md:13](.claude/skills/setup/SKILL.md#L13), 소비: 같은 파일 [:19](.claude/skills/setup/SKILL.md#L19), [:27](.claude/skills/setup/SKILL.md#L27).
- [graph.mjs](graph.mjs) 어느 노드의 `produces`에도 없다 → 승인된 기술 결정이 바뀌어도 dirty 전파가 일어나지 않는다. 실제로 signal에는 파일이 있는데([projects/signal/docs/PRODUCT.md](projects/signal/docs/PRODUCT.md)가 참조) 그래프는 그 존재를 모른다.

### F8. `projects/<이름>/docs/design/INTERVIEW.md` — 그래프 밖 【중간】
- 생성: [.claude/skills/design-interview/SKILL.md](.claude/skills/design-interview/SKILL.md), 소비: [.claude/agents/design-drafter.md:23](.claude/agents/design-drafter.md#L23) ("첫 시각 방향이면 이게 근거").
- `design/page-designer`의 produces는 `docs/design/design-rules.md`와 `docs/design/mockups/*.html`뿐([graph.mjs:46-51](graph.mjs#L46-L51)) → INTERVIEW.md만 바뀌면 design 노드는 계속 clean이다.
- F7·F8은 엄밀히는 "아무도 안 읽는 문서"가 아니라 **그래프가 추적하지 않는 승인 산출물**이다. 같은 증상(변경이 재작업을 유발하지 않음)이라 함께 둔다.

### 알려진 예외
이번에 만든 `docs/reference/*`도 현재는 참조 0건이다. 방금 생성했으니 정상이며, 목록에는 넣지 않는다.

---

## 4. 존재하지 않는 파일을 가리키는 훅

**해당 없음.** 훅 6개 전부 `target_exists: true` ([docs/reference/hooks.md](docs/reference/hooks.md)).
SessionStart→`scripts/briefing.mjs`, PreToolUse×3→`.claude/hooks/*.mjs`, PostToolUse→`gates/run-gates.mjs`, Stop→`gates/graph-stop.mjs`. 전부 [.claude/settings.json](.claude/settings.json)에 선언.

---

## 5. 아무도 세팅하지 않는 상태를 참조하는 게이트 조건

### F4(재게)  `deploy.clean_when.signoff`
위 F4와 같은 항목. 게이트 관점에서 보면 "아무도 만들지 않는 마커 파일 + 아무도 쓰지 않는 `status: deployed` 문자열"을 판정 근거로 삼고 있다.

### F9. `design/schema-designer` — 매칭 파일 0개라 판정이 공회전 【중간】
- 조건: [graph.mjs:53-56](graph.mjs#L53-L56) — produces `supabase/migrations/*.sql`, `src/entities/*/model.ts`, clean_when `gate: ["fsd","security"]`.
- signal에는 둘 다 0건이다. `projects/signal/src/entities/article/`에 있는 건 `index.ts`와 `lib/query.ts`이고 `model.ts`는 없다.
- [gates/graph-stop.mjs:66-72](gates/graph-stop.mjs#L66-L72) `hashNode`는 매칭 0이면 `null`을 돌려주고, [:169-176](gates/graph-stop.mjs#L169-L176) `gateBlocked`도 매칭할 경로가 없으니 절대 막지 않는다 → 이 노드는 **무조건 clean**.
- 증거: [projects/signal/workspace/HANDOFF.md:24](projects/signal/workspace/HANDOFF.md#L24) → `"design/schema-designer": { "status": "clean", "hash": null }`.
- 이게 곧바로 사고는 아니다(엔티티가 없는 프로젝트라면 맞는 상태다). 다만 `model.ts`라는 파일명 규약을 쓰지 않는 프로젝트에서는 스키마 설계가 그래프에서 통째로 사라진다.

### F10. `qa` 노드 글롭이 `.test.tsx`를 잡지 못한다 【높음】
- 조건: [graph.mjs:71](graph.mjs#L71) — `produces: ["src/**/*.test.ts", "tests/**"]`.
- [gates/graph-stop.mjs:32-43](gates/graph-stop.mjs#L32-L43)의 `globToRegex`를 그대로 복제해 실측한 결과:
  ```
  src/**/*.test.ts  vs  src/a/b.test.ts                    -> true
  src/**/*.test.ts  vs  src/widgets/feed/ui/x.test.tsx     -> false
  ```
- signal의 테스트 9개 중 4개가 `.tsx`다: `article-body.test.tsx`, `mark-read-on-view.test.tsx`, `article-view.test.tsx`, (그리고 `.ts` 5개).
- 결과: 그 4개만 고치면 qa 해시가 변하지 않아 **qa는 dirty가 되지 않는다.** `src/**`(implement)에는 잡히므로 하류 전파로 qa가 dirty해지긴 하지만, "테스트를 고쳤다"는 사건이 qa 자체의 변경으로 기록되지는 않는다. `tests/**` 디렉터리는 signal에 아예 없다.

### 확인했으나 결함이 아닌 것
`spec`의 `docs/specs/*.md`가 비재귀라 `docs/specs/planned/`를 안 잡는 건 **의도된 설계**다 — [.claude/skills/spec/SKILL.md:29](.claude/skills/spec/SKILL.md#L29)에 "planned/ 는 안 잡혀 spec 국면을 막지 않는다"고 명시돼 있다. 목록에서 뺀다.
게이트 카테고리 이름도 전부 일치한다: `clean_when.gate`가 쓰는 6종(fsd·security·tsc·design·test·spec-coverage)이 [gates/run-gates.mjs](gates/run-gates.mjs)·[gates/spec-coverage.mjs](gates/spec-coverage.mjs)가 실제로 찍는 태그와 정확히 대응한다.

---

## 6. 설명이 30단어 미만인 스킬 (약한 트리거)

단어 수는 공백으로 끊은 어절 기준이다(한국어라 영어 word 수와 직접 비교되지 않는다).

| 스킬 | 어절 | 모델 자동 호출 | 설명 |
|---|---|---|---|
| `goal` | 4 | 불가 (`disable-model-invocation: true`) | 세션 목표를 설정하거나 확인한다 |
| `status` | 6 | 불가 | 현재 프로젝트 상태 브리핑을 다시 본다 |
| `scaffold` | 9 | 불가 | 프로젝트 골격(FSD 6레이어 + tsconfig + 워킹 스켈레톤)을 생성한다 |
| `wrap-up` | 21 | **가능** | 사용자가 "오늘은 여기까지"… 상태를 동결하는 절차 |
| `spec` | 28 | **가능** | 결제·인증·권한·동시성… 단순 UI/콘텐츠 기능에는 사용하지 않는다 |
| `setup` | 29 | **가능** | kickoff로 PRODUCT.md가 승인된 직후 사용… |

- 앞 3개는 사용자 슬래시 전용이라 설명이 트리거가 아니라 메뉴 라벨이다 → 짧은 게 문제가 아니다.
- 실질적으로 트리거가 얇은 건 `wrap-up`(21)·`spec`(28)·`setup`(29) 셋이다. 특히 `spec`은 발화 조건이 "위험 기능"이라는 판단에 통째로 걸려 있는데, 그 판단 기준의 상당 부분이 설명이 아니라 [CLAUDE.md:52-53](CLAUDE.md#L52-L53)에 있다.

---

## 7. 같은 요청에 둘 다 발화할 스킬 쌍

### F12. `checkpoint` ↔ `design-interview` 【높음】
- checkpoint 설명([.claude/skills/checkpoint/SKILL.md:3](.claude/skills/checkpoint/SKILL.md#L3)): "**페이지나 주요 UI 컴포넌트를 처음 만들기 시작할 때** … 이미 승인된 방향의 반복 작업에는 불필요"
- design-interview 설명([.claude/skills/design-interview/SKILL.md:3](.claude/skills/design-interview/SKILL.md#L3)): "**새 시각 방향의 화면을 만들기 전** … 이미 승인된 방향의 반복 화면에는 쓰지 않는다"
- 두 설명이 가진 배제 조건이 **똑같다**("승인된 방향의 반복이면 안 씀"). 서로를 배제하는 문구는 어느 쪽에도 없다. "새 페이지 만들어줘"라는 요청 하나에 둘 다 조건이 성립한다.
- 순서를 정하는 건 설명이 아니라 별도 문서다: [.claude/rules/design-drafting.md:37](.claude/rules/design-drafting.md#L37)이 checkpoint를 **시안 승인 시점**에 놓는다. 그런데 checkpoint 스킬 본문 [:8](.claude/skills/checkpoint/SKILL.md#L8)은 "대표 페이지 1개"를 제출하라고 하고, 같은 규칙 파일 [:49-50](.claude/rules/design-drafting.md#L49-L50)은 그 방식을 "v2 기본"이라며 새 방향에서는 코드 앞으로 당긴다고 적는다. 즉 checkpoint가 **시안을 승인하는 절차인지 코드를 승인하는 절차인지**가 파일마다 다르게 읽힌다.

### F13. `setup` ↔ `scaffold` 【낮음】
- setup 설명 끝: "…스캐폴딩을 실행하는 절차", scaffold 설명: "프로젝트 골격(FSD 6레이어 + tsconfig + 워킹 스켈레톤)을 생성한다".
- "골격 만들어줘" 한 문장에 둘 다 걸린다. 완화 요인: scaffold는 `disable-model-invocation: true`라 모델이 자발적으로 고르지 못한다 → 실제 충돌은 사용자가 직접 `/scaffold`를 칠 때만.

### F14. `wrap-up` ↔ `retro` 【중간】
- wrap-up: "사용자가 '오늘은 여기까지', '정리하자'라고 하거나 세션을 끝내려는 신호를 보일 때"
- retro: "기능 완성 후, 반복 실수가 있을 때, … 또는 사용자가 회고를 요청할 때"
- "오늘 마무리하면서 정리 좀 하자"류 문장은 양쪽 다 성립한다. [CLAUDE.md:66-68](CLAUDE.md#L66-L68)이 "wrap-up 먼저, 큰 진전이면 retro 제안"이라는 순서를 주지만, 그 순서는 설명 안에 없다.
- 참고로 `goal` ↔ `status`도 "지금 뭐 하고 있지?"에 둘 다 걸리지만 양쪽 모두 슬래시 전용이라 자동 발화 충돌은 없다.

---

## 점검 방법 (재현)

```
node scripts/extract-harness.mjs        # docs/reference/ 재생성
```
그 위에서 ① 이름별 역참조 grep(스킬·서브에이전트 17개), ② 훅 target 존재 검사(스크립트 내장),
③ `graph-stop.mjs`의 `globToRegex` 복제 실측(F9·F10), ④ 게이트 태그 대조(`[cat/RULE]` 추출 vs `clean_when.gate`)를 수행했다.
