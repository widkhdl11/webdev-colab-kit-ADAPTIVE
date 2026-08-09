# findings — 하네스 맞물림성 검사 (1차·2차 병합본)

생성일 2026-08-09 · 대상 커밋 `7ba317b` 기준 작업트리.

**두 번 독립해서 조사한 결과를 합친 것이다.** 2차 조사는 1차 결과물을 입력으로 쓰지 않았고([diff-report.md](diff-report.md) 참조),
대조에서 갈린 항목만 근거를 다시 확인해 판정한 뒤 이 파일로 병합했다.

- `F-01`~`F-10` — 2차 조사에서 나온 항목 (ID 유지)
- `F-11`~`F-16` — 1차 조사에만 있었고 재확인으로 사실이 확정된 항목
- `F-06` — **2차 판정이 틀려 1차 판정으로 정정한 항목**
- 1차의 오탐 1건은 채택하지 않고 아래 §"확인했으나 결함이 아닌 것"에 이유와 함께 남겼다

**이 문서는 목록이다. 수정하지 않고, 추측하지 않는다.** 파일에서 확인되지 않은 것은 `[INFERRED]` 로 표시한다.
심각도는 병합 시 **한 기준으로 다시 매겼다** — 1차와 등급이 다른 항목은 그 자리에 이유를 적었다.

---

## 심각도 기준 (먼저 정의)

> **심각도는 "정상 세션 경로에서 이 결함이 잘못된 산출물이나 진행 불가를 일으키는가"로만 매긴다.**

| 등급 | 조건 |
|---|---|
| **높음** | 정상 경로에서 반드시 닿는다 + 두 번째 안전장치가 없다 → 사람이 알아채지 못하면 그대로 통과한다 |
| **중간** | 정상 경로에서 닿지만 다른 장치가 결과를 막아 준다 (그 장치가 사라지면 높음이 된다) |
| **낮음** | 닿아도 산출물이 틀리지 않는다 (미사용 자산·가독성·유지보수) |

항목마다 **어느 조건에 걸리는지**를 적는다. 심각도만 적고 조건을 안 적은 항목은 없다.

재현 명령은 전부 레포 루트에서 실행한다.

---

## F-01 · 세션마다 읽으라고 지시하는 `GLOSSARY.md` 가 없다

- **어느 검사에서 나왔나**: 유령 참조 (읽는다고 선언됐으나 대상 부재)
- **사실**: [CLAUDE.md:97](../../CLAUDE.md#L97) 이 `Read GLOSSARY.md at session start to resolve Korean paraphrases` 라고 지시한다. 레포에 `GLOSSARY.md` 는 없다.
- **심각도**: **높음** — *정상 경로에서 반드시 닿는다*(모든 세션 시작) + *두 번째 안전장치가 없다*(파일 없다는 걸 알려 주는 훅·게이트가 없어 조용히 건너뛴다).
- **재현**:
  ```
  test -e GLOSSARY.md && echo EXISTS || echo MISSING
  grep -n "GLOSSARY" CLAUDE.md
  ```

## F-02 · `deploy` 사인오프를 어떻게 기록하는지 절차 문서가 없다

- **어느 검사에서 나왔나**: 아무도 세팅하지 않는 상태를 참조하는 게이트 조건
- **사실**: [graph.mjs:94](../../graph.mjs#L94) 가 `deploy` 를 `signoff: { marker: "workspace/deploy.md", require: "status: deployed" }` 로 clean 판정한다. `deployed` 라는 문자열은 `CLAUDE.md`·`.claude/`·`docs/references/`·`gates/`·`scripts/` 어디에도 없다. 대비되게 `review` 쪽은 [CLAUDE.md:72](../../CLAUDE.md#L72) 와 [graph-engine.md:114](../references/graph-engine.md#L114) 에 절차가 있다. **현재 이 레포의 프론티어가 `deploy` 다.**
- **심각도**: **중간** — *다른 장치가 막아 준다*: [gates/graph-stop.mjs:259-262](../../gates/graph-stop.mjs#L259-L262) 가 사인오프 노드가 프론티어일 때 무엇을 쓸지 런타임에 출력한다. 절차 문서는 없지만 완전히 막히지는 않는다.
- **재현**:
  ```
  grep -rn "deployed" CLAUDE.md .claude docs/references gates scripts    # 0건
  grep -rn "workspace/review.md" CLAUDE.md docs/references                # 대비군: 있음
  ```

## F-03 · 볼 파일이 없을 때 `frontmatter` 는 통과시키고 `exists_nonempty` 는 막는다 — 둘이 정반대다

- **어느 검사에서 나왔나**: 아무도 세팅하지 않는 상태를 참조하는 게이트 조건
- **사실**: [gates/graph-stop.mjs:153](../../gates/graph-stop.mjs#L153) `if (files.length === 0) return true; // 대상 없음 → 막지 않음`. 따라서 `design/page-designer` 의 clean 조건([graph.mjs:50](../../graph.mjs#L50))은 `docs/design/design-rules.md` 가 **아예 없을 때도 통과**한다. 같은 파일 [167행](../../gates/graph-stop.mjs#L167)의 `exists_nonempty` 는 반대로 0개면 거짓이다.
- **심각도**: **중간** — *다른 장치가 막아 준다*: [gates/run-gates.mjs:213-225](../../gates/run-gates.mjs#L213-L225) 의 `design/BEFORE_UI` 가 UI 파일 작업을 별도로 차단한다. 그 게이트가 화면 위치를 못 알아보는 스택에서는 등급이 높음으로 올라간다 — 이 위험은 [setup/SKILL.md:22-25](../../.claude/skills/setup/SKILL.md#L22-L25) 가 이미 경고하고 있다("강제가 조용히 사라지거나").
- **재현**:
  ```
  sed -n '150,153p;164,168p' gates/graph-stop.mjs
  sed -n '204,212p' gates/run-gates.mjs
  ```

## F-04 · `.claude/commands/` 디렉터리가 존재하지 않는다

- **어느 검사에서 나왔나**: 아무것도 참조하지 않는 스킬·서브에이전트·커맨드
- **사실**: 커맨드 파일 0개, 디렉터리 자체 부재. 스킬 10개·서브에이전트 7개는 **전부 최소 1개 이상의 파일을 참조한다**(참조 0인 자산 없음).
- **심각도**: **낮음** — *닿아도 산출물이 틀리지 않는다*. 스킬이 슬래시 이름으로 호출되므로 기능 손실이 없다.
- **재현**:
  ```
  test -d .claude/commands && echo EXISTS || echo MISSING
  node -e "const i=require('./docs/v2/reference/inventory.json');console.log([...i.skills,...i.subagents].filter(x=>x.referenced_paths.length===0).length)"
  ```

## F-05 · 설명이 짧아 트리거가 약한 스킬 — 실제로 문제되는 건 3개

- **어느 검사에서 나왔나**: 설명이 30단어 미만인 스킬
- **사실**: 어절 수(공백 분할) 기준 30 미만은 6개다 — goal(4) · status(6) · scaffold(9) · wrap-up(21) · spec(28) · setup(29). 그중 **goal · status · scaffold 는 `disable-model-invocation: true`** 라 모델이 알아서 부르지 않는다([goal/SKILL.md](../../.claude/skills/goal/SKILL.md) · [status/SKILL.md](../../.claude/skills/status/SKILL.md) · [scaffold/SKILL.md](../../.claude/skills/scaffold/SKILL.md)) → 트리거 강도가 따질 필요가 없다. 실제로 문제되는 건 wrap-up · spec · setup.
- **심각도**: **spec 은 중간** — *정상 경로에서 닿고 다른 장치가 있다*: [CLAUDE.md:60](../../CLAUDE.md#L60) 이 위험 기능 앞에서 스펙을 요구하는 별도 규칙을 두고 있어 스킬 설명만으로 호출 여부가 정해지지 않는다. **wrap-up · setup 은 낮음** — 사용자가 명시적으로 부르는 국면이라 산출물이 틀리지 않는다.
- **[INFERRED] 기준 자체의 한계**: "30단어"는 공백 분할 어절 수로 쟀다. 한국어는 조사가 붙어 한 어절에 담기는 정보량이 영어 단어와 다르므로, **이 임계값이 한국어 설명에 그대로 유효한지는 파일에서 확인할 수 없다.** 글자 수를 병기한다(goal 17자 · status 21자 · scaffold 44자 · wrap-up 99자 · spec 128자 · setup 138자).
- **재현**:
  ```
  node -e "const i=require('./docs/v2/reference/inventory.json');i.skills.forEach(s=>console.log(s.description_word_count,s.description.length,s.name))"
  grep -l "disable-model-invocation: true" .claude/skills/*/SKILL.md
  ```

## F-06 · 같은 요청에 둘 다 걸리는 스킬 쌍 3건 【정정된 항목】

> **정정 기록.** 2차 조사는 이 항목을 "0건"으로 판정했다. **틀렸다.**
> 어절 Jaccard 최댓값 0.086을 근거로 삼았는데, **측정 도구가 질문에 맞지 않았다** — 충돌은 어휘가 겹치는 문제가 아니라
> **어떤 말에 걸리느냐가 겹치는** 문제다. 1차 판정을 채택한다. (어쩌다 그랬는지는 [diff-report.md](diff-report.md) D6)

- **어느 검사에서 나왔나**: 겹치는 스킬 설명

**① `checkpoint` ↔ `design-interview` — 심각도 높음**
- [checkpoint/SKILL.md:3](../../.claude/skills/checkpoint/SKILL.md#L3) "페이지나 주요 UI 컴포넌트를 **처음 만들기 시작할 때**"
- [design-interview/SKILL.md:3](../../.claude/skills/design-interview/SKILL.md#L3) "새 시각 방향의 화면을 **만들기 전**"
- 두 설명의 배제 조건이 **똑같다**("이미 승인된 방향의 반복에는 쓰지 않는다"). 서로를 배제하는 문구는 어느 쪽에도 없다 → "새 페이지 만들어줘" 한 문장에 둘 다 성립한다.
- 순서를 정하는 것은 설명이 아니라 [design-drafting.md:37](../../.claude/rules/design-drafting.md#L37)(checkpoint 를 시안 승인 시점에 놓음)인데, **그 파일은 `paths:` 프론트매터가 없어 자동 로드되지 않는다**(F-08 참조). 안전장치가 자동으로 붙지 않는다.
- **심각도 높음** — *정상 경로에서 반드시 닿고*(새 화면 요청은 흔하다), *두 번째 안전장치가 자동으로 작동하지 않는다*.

**② `wrap-up` ↔ `retro` — 심각도 중간**
- [wrap-up/SKILL.md:3](../../.claude/skills/wrap-up/SKILL.md#L3) "'오늘은 여기까지', '정리하자'… 세션을 끝내려는 신호"
- [retro/SKILL.md:3](../../.claude/skills/retro/SKILL.md#L3) "기능 완성 후, 반복 실수가 있을 때… 사용자가 회고를 요청할 때"
- "오늘 마무리하면서 정리 좀 하자"류 문장에 둘 다 성립한다. [CLAUDE.md:67-68](../../CLAUDE.md#L67-L68) 이 "wrap-up 먼저, 큰 진전이면 retro 제안"이라는 순서를 주지만 **그 순서가 설명 안에 없다.**
- **심각도 중간** — 닿지만 CLAUDE.md(항상 로드)가 순서를 잡아 준다.

**③ `setup` ↔ `scaffold` — 심각도 낮음**
- [setup/SKILL.md:3](../../.claude/skills/setup/SKILL.md#L3) 끝 "…스캐폴딩을 실행하는 절차" / [scaffold/SKILL.md:3](../../.claude/skills/scaffold/SKILL.md#L3) "프로젝트 골격…을 생성한다"
- "골격 만들어줘" 한 문장에 둘 다 걸린다. 완화: `scaffold` 는 `disable-model-invocation: true` 라 모델이 알아서 고르지 못한다 → 실제 충돌은 사용자가 직접 `/scaffold` 를 칠 때만.
- **심각도 낮음** — 닿아도 산출물이 틀리지 않는다.

- **재현**: 세 쌍의 description 원문을 나란히 읽는다.
  ```
  for s in checkpoint design-interview wrap-up retro setup scaffold; do sed -n '3p' .claude/skills/$s/SKILL.md; done
  ```
- **[INFERRED] 이 검사는 기계로 재현되지 않는다.** "같은 말에 둘 다 걸리는가"는 문장을 읽고 판정하는 일이다. 어절 겹침 수치(부록 A)는 **보조 지표일 뿐이며, 이 항목에서 실제로 오답을 냈다.**

## F-07 · 루트 `README.md` 를 아무도 참조하지 않는다

- **어느 검사에서 나왔나**: 쓰이지만 아무도 읽지 않는 문서 (고아)
- **사실**: 스킬·서브에이전트·규칙·`CLAUDE.md`·훅/게이트 코드 어디에서도 `README.md`(루트)를 참조하지 않는다. (`docs/references/architectures/README.md` 는 별개 파일이며 [setup/SKILL.md:22](../../.claude/skills/setup/SKILL.md#L22) 가 참조한다.)
- **심각도**: **낮음** — *닿아도 산출물이 틀리지 않는다*. GitHub 관례상 사람용 진입점이다.
- **재현**:
  ```
  grep -rn "README" CLAUDE.md .claude gates scripts | grep -v architectures
  ```

## F-08 · 참조 그래프만 보면 고아로 오판되는 자리 4곳 — 실제로는 고아가 아니다

- **어느 검사에서 나왔나**: 고아 (반증 기록)
- **사실**:
  | 파일 | 문서 참조 | 실제 도달 경로 |
  |---|---|---|
  | [.claude/rules/domain-layers.md](../../.claude/rules/domain-layers.md) | 없음 | `paths:` 프론트매터로 경로 일치 시 자동 로드 |
  | [.claude/rules/shared.md](../../.claude/rules/shared.md) | 없음 | 같음 (`projects/*/src/shared/**`) |
  | [docs/references/architectures/nextjs-fsd.md](../references/architectures/nextjs-fsd.md) | 경로 참조 없음 | [setup/SKILL.md:18](../../.claude/skills/setup/SKILL.md#L18) 이 이름으로 지목 — `(예: vite-fsd·nextjs-fsd)` |
  | [docs/references/architectures/vite-fsd.md](../references/architectures/vite-fsd.md) | 경로 참조 없음 | 같음 |
- **심각도**: **해당 없음 (결함 아님)** — 기록 이유는 **1차와 갈릴 가능성이 큰 자리**라서다. 참조 그래프만 기계로 돌리면 이 4개가 고아로 나온다.
- **재현**:
  ```
  head -4 .claude/rules/domain-layers.md .claude/rules/shared.md
  sed -n '18p' .claude/skills/setup/SKILL.md
  ```

## F-09 · 존재하지 않는 파일을 가리키는 훅 — 0건

- **어느 검사에서 나왔나**: 존재하지 않는 파일을 가리키는 훅
- **사실**: 등록된 훅 6개 전부 대상 파일이 존재한다. `.claude/hooks/` 의 스크립트 3개는 전부 [settings.json](../../.claude/settings.json) 에 등록돼 있다(미등록 0건). 커맨드에 `$CLAUDE_PROJECT_DIR` 류 변수는 쓰이지 않아 경로 판정이 확정적이다.
- **심각도**: **해당 없음 (결함 아님)**
- **재현**:
  ```
  node -e "const i=require('./docs/v2/reference/inventory.json');i.hooks.forEach(h=>console.log(h.event,h.target_resolved,h.target_exists));console.log('미등록:',i.hook_files_unregistered)"
  ```

## F-10 · §R1 — 이 프롬프트가 언급한 이름 중 레포에 없는 것

- **사실**: 실존 확인 결과 — `GLOSSARY.md` **없음**(F-01 과 동일 대상) · `SPEC.md` 없음 · `PLAN.md` 없음 · `_cross-cutting.md` 없음 · `sealed`·`gate-mode` 라는 개념은 `CLAUDE.md`·`.claude/`·`gates/`·`graph.mjs`·`docs/references/` 어디에도 없음. 프롬프트가 산출물로 지시한 `scripts/check-docs.mjs` 는 이번 실행에서 새로 만들었다.
- **심각도**: **해당 없음** — 프롬프트는 이 이름들을 "1차가 사실로 여겼던 후보"로 이미 표시하고 있다. §R1 이 요구한 대로 **없다는 사실 자체를** 기록한다. `GLOSSARY.md` 만은 프롬프트가 아니라 **레포 자신이(CLAUDE.md:97) 참조**하므로 F-01 로 따로 올렸다.
- **재현**:
  ```
  for n in GLOSSARY.md SPEC.md PLAN.md _cross-cutting.md; do test -e $n && echo "$n EXISTS" || echo "$n MISSING"; done
  grep -rni "sealed\|gate-mode" CLAUDE.md .claude gates graph.mjs docs/references
  ```

---

# 1차 조사에만 있었던 항목 (재확인으로 확정)

아래 6건은 2차 조사가 놓쳤다. 전부 **근거를 다시 확인해 사실임을 확정**한 뒤 병합했다.
2차가 놓친 이유는 하나로 모인다 — **검사 대상 목록을 손으로 한정했고, 글롭을 실측하지 않았다.**

## F-11 · `qa` 노드 글롭이 `.test.tsx` 를 잡지 못한다

- **어느 검사에서 나왔나**: 아무도 세팅하지 않는 상태를 참조하는 게이트 조건
- **사실**: [graph.mjs:71](../../graph.mjs#L71) 의 `produces: ["src/**/*.test.ts", "tests/**"]` 를 [graph-stop.mjs:32-43](../../gates/graph-stop.mjs#L32-L43) 의 `globToRegex` 로 변환하면 `/^src\/.*[^/]*\.test\.ts$/` 다. 실측:
  ```
  src/**/*.test.ts  vs  src/entities/article/lib/query.test.ts             -> true
  src/**/*.test.ts  vs  src/features/content-render/ui/article-body.test.tsx -> false
  ```
  signal 의 테스트 9개 중 **3개가 `.tsx`** 다 — `article-body.test.tsx` · `mark-read-on-view.test.tsx` · `article-view.test.tsx`. `tests/` 디렉터리는 signal 에 없다.
- **심각도**: **중간** — *정상 경로에서 닿지만 다른 장치가 막아 준다*. `.tsx` 테스트도 implement 의 `src/**` 에는 잡히므로([graph.mjs:63](../../graph.mjs#L63)) implement 가 dirty → 전파로 qa 도 dirty 가 된다. 결과적으로 재검증은 일어난다. 다만 qa 가 clean 될 때 기록하는 해시가 `.tsx` 를 덮지 않아, **qa 자체의 변경 감지는 영구히 세 파일을 못 본다.**
  > 1차는 이 항목을 **높음**으로 매겼다. 등급을 내린 이유는 위의 `src/**` 전파 경로 때문이다. 사실 관계는 1차와 같다.
- **재현**:
  ```
  node -e "$(sed -n '32,43p' gates/graph-stop.mjs); console.log(globToRegex('src/**/*.test.ts').test('src/a/b.test.tsx'))"
  find projects/signal/src -name '*.test.tsx'
  ```

## F-12 · `design/schema-designer` 가 매칭 파일 0개라 무조건 clean 이 된다

- **어느 검사에서 나왔나**: 아무도 세팅하지 않는 상태를 참조하는 게이트 조건
- **사실**: [graph.mjs:54](../../graph.mjs#L54) 의 produces 는 `supabase/migrations/*.sql` 와 `src/entities/*/model.ts` 다. signal 에는 `supabase/` 디렉터리가 없고, 엔티티는 `src/entities/article/model/types.ts` — **`model.ts` 가 아니라 `model/` 디렉터리**다. 글롭 실측 결과 매칭 0개.
  → [graph-stop.mjs:66-72](../../gates/graph-stop.mjs#L66-L72) `hashNode` 가 `null` 을 돌려주고, [:169-176](../../gates/graph-stop.mjs#L169-L176) `gateBlocked` 도 막을 경로가 없다 → **무조건 clean**.
- **심각도**: **중간** — *다른 장치가 막아 준다*: 엔티티 코드 자체는 implement 의 `src/**` 에서 `fsd`·`security` 게이트로 검사된다. 사라지는 것은 **design 국면의 승인 흐름**이지 코드 검사가 아니다.
- **재현**:
  ```
  find projects/signal -path "*/src/entities/*/model.ts" -o -path "*/supabase/migrations/*.sql"
  ls projects/signal/src/entities/article/
  ```

## F-13 · `tech-stack.md` 가 그래프 밖에 있다

- **어느 검사에서 나왔나**: 쓰이지만 아무도 읽지 않는 문서 (변형 — 그래프가 추적하지 않는 승인 산출물)
- **사실**: [setup/SKILL.md:13](../../.claude/skills/setup/SKILL.md#L13) 이 "스캐폴딩·설치 전에 기술 스택을 **문서로 합의**한다"며 `projects/<이름>/docs/tech-stack.md` 를 만들게 하고, 같은 파일 [:19](../../.claude/skills/setup/SKILL.md#L19)·[:27](../../.claude/skills/setup/SKILL.md#L27) 이 이를 소비한다. 그런데 [graph.mjs](../../graph.mjs) 의 어느 `produces` 에도 없다(grep 0건).
  → **승인된 기술 결정이 바뀌어도 dirty 전파가 일어나지 않는다.**
- **심각도**: **중간** — *정상 경로에서 닿지만*(스택 변경은 드물어도 일어난다) *tsc·fsd 게이트가 결과적으로 잡는 부분이 있다*. 다만 "스택을 바꿨으니 무엇을 다시 하나"는 그래프가 대답하지 못한다.
- **재현**: `grep -n "tech-stack" graph.mjs .claude/skills/setup/SKILL.md`

## F-14 · `execution-graph.html` (루트 15KB) 을 아무도 참조하지 않는다

- **어느 검사에서 나왔나**: 쓰이지만 아무도 읽지 않는 문서 (고아)
- **사실**: 레포의 코드·문서 어디에서도 `execution-graph` 를 언급하지 않는다. 유일한 언급은 1차 조사 산출물 2개뿐이다. [graph-engine.md:62](../references/graph-engine.md#L62) 가 같은 내용을 가리키지만 **로컬 파일이 아니라 외부 아티팩트 ID** 를 가리킨다 — 문서는 외부 사본을 가리키고 로컬 사본은 아무도 안 가리킨다.
- **심각도**: **낮음** — *닿아도 산출물이 틀리지 않는다*. 다만 갱신되지 않은 채 남으면 읽는 사람을 오도할 수 있다.
  > 1차는 **중간**으로 매겼다. 기준의 "산출물이 틀리는가"에 걸리지 않아 낮음으로 내렸다.
- **재현**: `grep -rn "execution-graph" CLAUDE.md .claude gates scripts docs/references graph.mjs`

## F-15 · `INTERVIEW.md` 가 그래프 밖에 있다

- **어느 검사에서 나왔나**: 그래프가 추적하지 않는 승인 산출물
- **사실**: [design-interview/SKILL.md:18](../../.claude/skills/design-interview/SKILL.md#L18) 이 만들고 [design-drafter.md:23](../../.claude/agents/design-drafter.md#L23) 이 "첫 시각 방향이면 이게 근거"라며 읽는다. 그런데 `design/page-designer` 의 produces 는 [graph.mjs:47](../../graph.mjs#L47) 의 `design-rules.md` 와 `mockups/*.html` 뿐이다 → INTERVIEW.md 만 바뀌면 design 노드는 계속 clean 이다.
- **심각도**: **낮음** — *닿아도 산출물이 틀리지 않는다*. [design-interview/SKILL.md:27](../../.claude/skills/design-interview/SKILL.md#L27) 이 이 파일을 "**과정 보관**"으로 성격을 못 박고, 확정 기준은 checkpoint 승인 후 design-rules.md 에 기록된다고 명시한다 → 추적 대상이 아닌 것이 **의도로 보인다.**
  > 1차는 **중간**으로 매겼다. 위 27행의 성격 규정을 근거로 낮음으로 내렸다.
- **재현**: `sed -n '18p;27p' .claude/skills/design-interview/SKILL.md; grep -n "INTERVIEW" graph.mjs`

## F-16 · 도달 경로가 `README.md` 한 줄뿐인 스킬 3개

- **어느 검사에서 나왔나**: 아무것도 참조하지 않는 스킬 — **반대 방향(inbound)** 읽기
- **사실**: `goal` · `status` · `scaffold` 를 이름으로 부르는 곳은 [README.md:31](../../README.md#L31) 한 줄뿐이다. **`CLAUDE.md` 에는 등장하지 않는다** — 매 세션 로드되는 문서에 없으니, 사용자가 README 를 기억하지 못하면 세션 중 존재를 알 길이 없다. 셋 다 `disable-model-invocation: true` 라 모델이 자발적으로 부를 수도 없다.
  (`scaffold` 는 예외적으로 [setup/SKILL.md:26](../../.claude/skills/setup/SKILL.md#L26) 에서 언급되지만, 그건 **스크립트** `node scripts/scaffold.mjs` 를 부르는 것이지 스킬이 아니다.)
- **심각도**: **낮음** — *닿아도 산출물이 틀리지 않는다*. 기능이 사라지는 게 아니라 발견되지 않을 뿐이다.
- **검사 항목 해석이 갈렸던 자리다.** "아무것도 참조하지 않는 스킬"을 1차는 *누가 이 스킬을 부르나*(inbound), 2차는 *이 스킬이 무엇을 참조하나*(outbound, → F-04 의 0건)로 읽었다. **둘 다 참이고 둘 다 담는다.**
- **재현**:
  ```
  for n in goal status scaffold; do grep -rn "/$n\b" CLAUDE.md README.md .claude; done
  ```

---

## 검사 항목 대 결과 (7항목 전부)

| # | 검사 항목 | 결과 |
|---|---|---|
| 1 | 아무것도 참조하지 않는 스킬·서브에이전트·커맨드 | outbound 0건(F-04) · **inbound 3건 — F-16** |
| 2 | 유령 참조 (읽는다 선언 + 대상 부재) | **1건 — F-01** |
| 3 | 고아 문서 | 2건 — F-07, **F-14** · 그래프 밖 산출물 2건 **F-13 · F-15** · 오판 자리 4곳 F-08 |
| 4 | 존재하지 않는 파일을 가리키는 훅 | 0건 (F-09) |
| 5 | 아무도 세팅하지 않는 상태를 참조하는 게이트 조건 | **4건 — F-02, F-03, F-11, F-12** |
| 6 | 설명 30단어 미만 스킬 | 6건 중 실질 3건 (F-05) |
| 7 | 겹치는 스킬 설명 | **3쌍 — F-06** (2차 "0건" 판정을 정정) |

**심각도 분포** — 총 16항목 중 결함 13건

| 등급 | 건수 | 항목 |
|---|---|---|
| **높음** | 2 | F-01(GLOSSARY.md 부재) · F-06①(checkpoint ↔ design-interview) |
| **중간** | 7 | F-02 · F-03 · F-05(spec) · F-06②(wrap-up ↔ retro) · F-11 · F-12 · F-13 |
| **낮음** | 6 | F-04 · F-05(wrap-up·setup) · F-06③(setup ↔ scaffold) · F-07 · F-14 · F-15 · F-16 |
| 결함 아님 | 3 | F-08(오판 자리 기록) · F-09(훅 0건) · F-10(§R1 기록) |

---

## 확인했으나 결함이 아닌 것

**qa-classifier 의 예시 evidence 경로 2건** — 1차 조사는 이 둘을 "레포에 존재하지 않는다"며 유령 참조로 올렸다. **사실이 아니다.**

```
projects/wama/supabase/migrations/0007_exam.sql      EXISTS
projects/wama/docs/specs/auth-isolation.md           EXISTS
```

[qa-classifier.md:51](../../.claude/agents/qa-classifier.md#L51)·[:56](../../.claude/agents/qa-classifier.md#L56) 이 쓴 것은 **프로젝트 기준 상대경로**인데, 1차는 레포 루트에서만 찾아보고 없다고 단정했다.
이 오판은 `scripts/extract-harness.mjs` 의 옛 판정 방식과 **원인이 같다** — 그래서 §R6 역감사에서 그 도구를 고쳤고,
지금 추출기는 이 두 경로를 `kind: project-relative` 로 분류한다(`exists` 를 `false` 로 단정하지 않는다).

**`spec` 의 `docs/specs/*.md` 가 비재귀라 `planned/` 를 안 잡는 것** — 의도된 설계다.
[spec/SKILL.md:29](../../.claude/skills/spec/SKILL.md#L29) 에 "planned/ 는 안 잡혀 spec 국면을 막지 않는다"고 명시돼 있다.

**게이트 카테고리 이름 대조** — `clean_when.gate` 가 쓰는 6종(fsd · security · tsc · design · test · spec-coverage)이
[run-gates.mjs](../../gates/run-gates.mjs)·[spec-coverage.mjs](../../gates/spec-coverage.mjs) 가 실제로 찍는 태그와 정확히 대응한다. 불일치 0건.

---

## 부록 A — F-06 재현 스크립트

```
node -e "
const i=require('./docs/v2/reference/inventory.json');
const t=s=>new Set(s.toLowerCase().replace(/[^\w가-힣\s]/g,' ').split(/\s+/).filter(x=>x.length>1));
const p=[];
for(let a=0;a<i.skills.length;a++)for(let b=a+1;b<i.skills.length;b++){
  const A=t(i.skills[a].description),B=t(i.skills[b].description);
  const inter=[...A].filter(x=>B.has(x));
  p.push([inter.length/new Set([...A,...B]).size,i.skills[a].name,i.skills[b].name,inter.join(' ')]);}
p.sort((x,y)=>y[0]-x[0]).slice(0,5).forEach(r=>console.log(r[0].toFixed(3),r[1],'<->',r[2],'|',r[3]));"
```

## 부록 B — 이 문서의 한계

- **수정 제안 없음.** 원 지시가 "수정 금지, 목록만"이라 고치는 방법은 적지 않았다. 결함을 고칠지는 별개 판단이다.
- **심각도는 병합 시 한 기준으로 다시 매겼다.** 1차와 등급이 다른 항목(F-11 · F-14 · F-15)은 그 자리에 이유를 적었다. 기준 자체는 이 문서 맨 위에 있다.
- **F-05 의 "30단어" 임계값은 `[INFERRED]` 다** — 공백 어절로 잰 값이고, 한국어에 그 임계가 유효한지는 레포 어디에도 근거가 없다.
- **F-06 은 기계로 재현되지 않는다.** 어절 겹침 수치(부록 A)는 보조 지표일 뿐이고, 이 항목에서 실제로 오답을 냈다. 판정은 문장을 읽어야 나온다.
- **두 번 조사해도 못 본 자리가 남아 있을 수 있다.** 이 문서가 잡은 것 중 6건은 한쪽만 봤던 것이다([diff-report.md](diff-report.md) 축2) — 한 번만 조사했다면 그만큼 비어 있었을 것이다.
