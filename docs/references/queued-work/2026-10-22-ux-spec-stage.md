# 대기 작업 — 하네스에 UX 명세 단계 추가 (2026-10-22, 사용자 지시)

상태: **A단계(변경 계획 표) 제시 전.** 승인 전에는 아래 B~K 파일을 만들지 않는다.
원본 지시문을 2026-10-22 세션에서 레포와 대조해 고쳤다(점검 결과 1~7 + 추가 셋, 사용자 「1~7 다 반영」).
고친 곳은 `[고침 n]` 으로 표시했다.

시작 전 확인: 다른 세션이 이 표의 파일을 만지고 있지 않은지 `git status`·`git log` 로 본다
(2026-10-22 확인 시 다른 세션은 팬꾹 문서와 session-sync 킷 패치를 고치고 있었고, 아래 대상 파일 중
최근 1시간에 바뀐 것은 `docs/references/harness-backlog.md` 하나 — 커밋된 상태였다).

---

## 결정 사항 (이 작업의 범위)
1. 화면 작업 표면에 "페이지 브리프 → UX 명세 → 승인" 단계를 design-drafting.md의 판단보다 앞에 붙인다.
2. ux-reviewer 리뷰어를 추가하고, 파견 순서를 ui-reviewer보다 앞에 둔다.
3. 그래프 노드·게이트는 바꾸지 않는다. 새 단계는 `design/page-designer` 노드 안에서 일어나고, 강제 게이트는 만들지 않는다(문서 보고만). 게이트 승격은 harness-backlog.md에 트리거와 함께 적어 둔다.
4. `docs/references/harness-design.md`는 정본이라 모델이 고치지 않는다. 반영할 변경은 작업 끝에 "사람이 harness-design.md에 적을 것"으로 따로 보고한다.
5. docs/ux/ 기준 문서(principles·<유형>-pages·states)가 **하나라도 없는** 프로젝트에서는 "UX 기준 문서 없음: <경로>"를 보고하고 사용자에게 묻는다. 막지 않는다. `[고침 6]` signal·study-mate·wama 는 docs/ux/ 자체가 없고, fankkuk 도 `states.md`(시범 세 화면만)와 진단 문서뿐이라 principles·유형 문서가 없다 — 지금은 네 프로젝트 모두 이 경로로 간다.

## 바꾸지 않을 것
1. design-interview → design-drafter → checkpoint → design-rules.md `status: approved` → design/BEFORE_UI 게이트. 어느 단계도 빼거나 순서를 바꾸지 않는다.
2. ui-reviewer, code-reviewer, security-reviewer, qa-classifier, test-auditor, style-scout의 역할과 파견 조건.
3. gates/ 아래 파일 전부. run-gates.mjs의 design/BEFORE_UI 판정도 그대로.
4. docs-contract.md의 스펙 frontmatter 화이트리스트, 불변식 앵커, design-rules 승인 판정.
5. 그래프(product→spec·design→implement→qa→review→deploy)와 graph-stop.mjs.

## 작업 순서
A. 아래 B~K의 변경 계획을 "파일 / 추가·수정 / 핵심 내용 3줄" 표로 먼저 보여준다. 승인 전에는 파일을 만들지 않는다.
B~K. 승인 후 순서대로 작성한다.
L. 검증을 돌리고 보고한다.

## B. 규칙 파일 `.claude/rules/ux-spec.md` (신규)
design-drafting.md와 같은 형식. `[고침 5]` frontmatter `paths:`는 design-drafting.md의 4개 + `projects/*/docs/ux/**` 하나 — 브리프를 쓰는 순간 건드리는 파일이 docs/ux/pages 라서, 4개만이면 그 단계에서 규칙이 안 읽힌다.
1. 적용 조건: 새 화면 / 새 흐름 / 요소가 보이는 조건(상태)의 변경 / 입력 항목·단계 수의 변경 / 여러 화면 동시 변경. 색·간격·radius·카드 모양만 바꾸는 diff에는 켜지지 않는다. 애매하면 켠다(브리프 8줄은 싸다).
2. 산출물: `projects/<이름>/docs/ux/pages/<경로슬러그>.md` 한 파일. 경로슬러그는 라우트 경로의 `/`를 `-`로(`/guide/fan` → `guide-fan`, `/` → `home`). frontmatter는 `status: draft | approved` 하나. 기계는 아직 읽지 않는다.
3. 파일 구조:
   - `## 페이지 브리프` 8줄: 목적 / 주 사용자·부 사용자 / 사용자가 와서 하려는 일 / 방문 빈도 / 페이지 유형(문서형·목록형·작업형·상세형·관리형 중 하나, 둘이면 주·부) / 같은 유형의 다른 페이지 / 이 페이지만의 특이점 / 바꾸면 안 되는 것
   - `## 상태표`: 상태 이름(코드 식별자 + 화면 표기) / 조건 / 보이는 요소 / 가능한 동작 / 다음 상태. 이름은 `docs/ux/states.md`에 있는 것을 쓰고, 없으면 "제안"으로 표시.
   - `## 요소 목록`: 요소 / 보이는 상태 / 정상 경로·예외 경로 / 근거(유형 규칙 번호)
   - `## 적용한 규칙`: principles.md·<유형>-pages.md 에서 적용한 항목 번호와, 벗어난 항목과 이유
   - `## 스펙 참조`: 기능 규칙은 다시 쓰지 않고 `docs/specs/<slug>.md`의 INV·S 번호로. 스펙 없는 기능은 "스펙 없음".
4. 판정 기준 문서: `docs/ux/principles.md`, `docs/ux/<유형>-pages.md`, `docs/ux/states.md`. 하나라도 없으면 멈추지 말고 "UX 기준 문서 없음: <경로>"를 보고하고 작성 여부를 묻는다.
5. 승인 게이트: 브리프·상태표·요소 목록을 보여주고 승인받은 뒤 `status: approved`. 그 다음에야 design-drafting.md의 "판단"으로 넘어간다.
6. 기존 화면 수정: 슬러그 파일이 있으면 그 파일 기준으로 차이만 적고 갱신. 없으면 코드를 읽고 현재 상태를 먼저 쓴 뒤(역진단) 바꿀 것을 적는다.
7. design-drafting.md와의 관계: 이 규칙이 먼저다. 이 규칙의 승인 없이 시안을 만들지 않는다.

## C. `.claude/rules/design-drafting.md` (수정)
"## 판단 — 이 화면은 새 방향인가, 반복인가" 절 맨 앞에 한 문단:
"이 판단 전에 `.claude/rules/ux-spec.md`의 적용 조건을 먼저 본다. 켜지면 UX 명세(`docs/ux/pages/<슬러그>.md`, `status: approved`)가 있어야 여기로 온다. 규칙 로드 순서에 기대지 않고 여기서 직접 확인한다."
"## 새 방향일 때의 시안 루프" 0번 앞에: "입력에 승인된 UX 명세를 포함한다. 시안은 명세의 상태표에 있는 상태마다 한 장이다."
다른 줄은 바꾸지 않는다.

## D. 에이전트 `ux-reviewer` (신규, `.claude/agents/ux-reviewer.md` + `.codex/agents/ux-reviewer.toml`)
ui-reviewer.md의 frontmatter·문체·tools(Read, Grep, Glob)를 따른다. toml은 ui-reviewer.toml과 같은 필드.
description: "승인된 UX 명세(docs/ux/pages)와 UX 기준 문서에서 벗어난 곳을 찾는다 — 기본 상태에 예외 경로 요소가 있는지, 명세의 상태가 코드에 다 있는지. 상태·노출·입력 구조가 바뀐 diff에 파견한다. 승인된 명세 안에서 반복되는 화면에는 지적할 것이 거의 없다."
본문:
- 읽을 것: `projects/<이름>/docs/ux/principles.md`, 해당 유형 문서, `docs/ux/states.md`, 해당 화면의 `docs/ux/pages/<슬러그>.md`. 넷이 판정 기준. 문서에 없는 취향은 지적하지 않는다.
- 관점 5개: 1. 명세의 기본 상태에 없는 요소가 코드의 기본 상태에 있는가 2. 명세 상태표의 상태 중 코드에 분기가 없는 것 3. 코드에 있는데 명세 요소 목록에 없는 요소 4. 현재 역할·상태에서 실행 불가능한 동작이 보이는가 5. 입력란에 이유 문구가 없는가
- 출력: severity, 파일:라인, 위반한 기준 항목(문서·번호), 수정 제안. ui-reviewer와 같은 형식.
- 명세 파일이 없는 화면은 "UX 명세 없음 — 리뷰 불가" 한 줄로 끝낸다. 코드를 보고 명세를 지어내지 않는다.
- `[추가 3]` 새 에이전트는 세션 시작 때 등록되므로 이번 세션에서는 파견하지 않는다. **실제 파견 확인은 그다음 세션**에서 한다(PROGRESS 다음 할 일에 적는다).

## E. 에이전트 `design-drafter` (수정, `.md`와 `.toml` 둘 다)
"## 입력"에 추가: "`projects/<이름>/docs/ux/pages/<슬러그>.md` (status: approved) — 상태표와 요소 목록. 있으면 design-rules.md와 같은 지위의 근거다."
"## 규칙" 산출물 줄 수정 `[추가 2]`: "UX 명세가 있으면 상태표의 상태마다 `mockups/<화면명>--<상태식별자>.html` 한 파일(대시 둘 — 비교안 `-a`·`-b` 와 구분). 없으면 지금처럼 `<화면명>.html` 한 파일."
"## 보고 형식"에 추가: "명세 상태표의 상태 N개 중 시안으로 만든 것 N개. 빠진 상태가 있으면 이유."
다른 줄은 바꾸지 않는다.

## F. 스킬 `page-brief` (신규, `.claude/skills/page-brief/SKILL.md` + `.agents/skills/page-brief/`)
`.agents/skills/` 는 복사본이다(심볼릭 링크 아님, 2026-10-22 확인) — 같은 내용을 복사한다.
description: "화면 하나의 목적·사용자·상태·요소를 사용자와 함께 양식으로 채워 UX 명세(docs/ux/pages)를 만드는 절차. 신호는 새 화면·새 흐름·상태 변경. design-interview보다 앞이고, 시각 취향은 다루지 않는다. 색·간격만 바꾸는 작업에는 쓰지 않는다."
절차(design-interview 방식 — 빈 질문 금지, 선택지·추천값이 채워진 양식):
1. B-3 구조로 초안. 유형은 추천 + 근거 한 줄. 상태표는 states.md와 코드(있으면)에서.
2. 보여주고 틀린 칸을 고쳐 달라고 한다. 2회차부터 "이 정도면 시안·구현에 충분합니다. 승인할까요?" 명시.
3. 승인되면 `status: approved`. "제안" 상태가 있으면 states.md 갱신을 같은 턴에 제안.
4. 기능 규칙은 명세에 쓰지 않고 "스펙 참조"에 번호만. 스펙이 없으면 /spec 먼저 권한다.
금지: 시각 취향(색·톤·밀도) 질문 — design-interview의 몫.

## G. `docs/references/node-skills.json` (수정)
`[고침 1·2]` bindings에 추가:
`{"node": "design/page-designer", "skill": "page-brief", "contract": "none: 산출물이 사람이 승인하는 문서이고 기계가 읽지 않는다 — 게이트 승격은 harness-backlog 「ux-spec 게이트 승격」"}`
- `pending:` 으로 두면 안 되는 이유: ① 새 스킬 폴더가 생기는 이 턴이 「pending 스킬을 고친 턴」으로 잡혀 `[registry/PENDING-TOUCHED]` 로 막힌다 ② 원래 값 「UX 명세 status 검사」는 백로그 제목과 글자가 달라 어휘 검사에도 걸린다.
형식은 docs-contract.md 8절. 기존 항목은 건드리지 않는다.

## H. `docs/references/docs-contract.md` (수정)
4절 경로 규약 표에 두 줄:
`projects/<이름>/docs/ux/pages/<슬러그>.md` | UX 명세. frontmatter `status`. **기계가 아직 읽지 않는다**
`projects/<이름>/docs/ux/{principles,states,<유형>-pages}.md` | UX 기준 문서. **기계가 읽지 않는다**
5절 "여기 없는 것"에 한 줄: "`docs/ux/` 는 리뷰어와 스킬이 읽고 게이트는 읽지 않는다. 게이트 승격은 harness-backlog.md."
9절 등재 이력에 날짜와 한 줄. 다른 절은 건드리지 않는다.

## I. `docs/references/review-signoff.md` (수정)
"## 표면별 리뷰어" 표에 행: `ux-reviewer` | 상태·노출·입력 구조가 바뀐 diff에 (UX 명세가 있는 화면만). 파견 순서는 ui-reviewer 앞 — 없어질 요소의 시각 기준을 재는 일을 막는다.
`reviewers:` 규약에 ux-reviewer도 "실제로 돌렸으면 적는다" 한 줄. risk-surface 게이트의 security-reviewer 필수 판정은 바꾸지 않는다.

## J. `AGENTS.md` **와 `CLAUDE.md`** (수정) `[고침 3]`
두 파일은 줄바꿈을 빼면 경로 표기 7줄만 다르다(`.Codex` ↔ `.claude`, 2026-10-22 확인). 아래 넷은 전부 공통 부분이라 **둘 다에** 넣고, 경로 표기는 각 파일의 기존 표기를 따른다.
1. "## 표면별 판단" 표에 행(새 시각 방향 행 바로 위):
   `새 화면·새 흐름·상태(노출 조건)·입력 구조 변경` | `page-brief → UX 명세 승인 → (아래 두 행 중 해당하는 것) → 구현 → ux-reviewer` | `무엇이 언제 보이는지는 시안이 정하지 않는다. 시안은 상태 하나만 담는다 — 정하지 않으면 모든 요소가 항상 보이는 화면이 나온다`
2. "승인된 방향의 반복 UI" 행 절차 칸을 `바로 구현 + ui-reviewer (상태·노출이 바뀌면 ux-reviewer 먼저)`로.
3. "## 필요할 때만 읽는 문서 (라우팅)"에: "새 화면·흐름·상태 변경 시작 전: `.claude/rules/ux-spec.md` — 브리프·명세 먼저(page-brief 스킬이 진입점). 기준 문서는 `projects/<이름>/docs/ux/`."
4. "## 기능 완성 시 — review 노드 사인오프"에 ux-reviewer가 ui-reviewer보다 앞이라는 한 줄.

## K. 그 외
1. `docs/references/subagent-brief.md` 칸 목록에 선택 칸: `UX 명세: docs/ux/pages/<슬러그>.md (status: approved) — 화면 작업이면 필수, 아니면 비움`.
2. `docs/references/harness-backlog.md` 미결에 항목(기존 형식): **ux-spec 게이트 승격** — 트리거: UX 명세 없이 구현된 화면이 ux-reviewer에서 2회 이상 잡히면. 판정: `src/widgets`·라우트 화면 편집 시 해당 슬러그의 `docs/ux/pages/*.md` status: approved 요구, design/BEFORE_UI와 같은 자리.
   `[추가 1]` 같은 항목에 한 줄: "`docs/ux/` 는 어느 노드의 산출물도 아니라, 승인된 명세가 바뀌어도 implement 가 dirty 로 잡히지 않는다(재작업 미전파) — 승격할 때 page-designer 산출물에 넣을지 같이 본다."
   이 항목 제목 「ux-spec 게이트 승격」은 G의 사유가 가리키는 글자다 — 바꾸면 G도 같이.
3. 템플릿 `docs/references/ux-page-template.md`(B-3 빈 양식)와 `docs/references/ux-type-rules-template.md`(원칙 번호 목록 + 진단 기준 번호 목록 + 항목마다 예시 한 줄 칸). spec-template.md와 같은 위치·문체.

## L. 검증 (작성 후, 보고 전)
1. `[고침 4]` 이번에 **새로 만든 쌍과 고친 쌍만** diff 로 확인한다: ux-reviewer(.md↔.toml), design-drafter(.md↔.toml, 이번 추가 줄이 양쪽에 다 있는지), page-brief(.claude/skills↔.agents/skills).
   원래 있던 차이(ui-reviewer.toml 의 레이아웃 줄 없음, retro·report-dashboard 스킬 쌍 불일치 등)는 실패로 치지 않고 목록으로만 보고한다.
2. 레포의 기존 검사(package.json scripts, gates/run-gates.mjs, `node scripts/check-registry.mjs`, `node scripts/check-report.mjs`)를 작업 전·후로 돌려 결과가 같음을 확인. 바뀌면 그 자체가 위반이다. **심은 위반 하나**: page-brief 바인딩을 잠시 `pending: 없는 글자` 로 바꿔 어휘 검사가 잡는 것을 보고 되돌린다.
3. 가상 요청 추적 `[고침 7]` — **"팬꾹 팔로우한 크리에이터 목록(`/me/following`)에 정렬 탭 추가해 줘"**: 켜지는 규칙 순서, 호출 스킬, 만들어지는 파일 경로, 승인 게이트 위치, 리뷰어 순서를 번호 목록으로. 만들지는 않는다. ux-spec.md가 design-drafting.md 판단보다 먼저 확인되는지, 그 보장이 규칙 로드 순서가 아니라 C의 문단(+ B의 5번째 경로)에서 오는지 명시. 팬꾹은 principles·유형 문서가 없어 「UX 기준 문서 없음」에서 묻게 되는 것까지 적는다.
   (원래 예시 「크리에이터 정산 내역」은 PRODUCT.md에 없고 payment.md 가 정산을 「세무사 확인 후」로 미뤄서 비범위·결제 표면에서 먼저 멈춰 순서 확인이 안 된다)
4. "크리에이터 카드 hover 그림자를 tokens 값으로 바꿔 줘" — ux-spec.md가 켜지지 않고 기존 경로(바로 구현 + ui-reviewer)로 가는지.
5. study-mate(docs/ux 없음)에서 새 화면 요청 — "UX 기준 문서 없음" 보고 후 묻고 멈추는지, 게이트가 막지 않는지.

## 보고 형식
1. 만든·고친 파일 목록(경로, 추가·수정, 줄 수)
2. L-3·4·5 추적 결과
3. 사람이 `harness-design.md`에 적을 것 — 3줄 이내
4. 판단이 애매해서 내가 정한 것 — 각각 한 줄과 대안
5. 커밋은 commit-policy.md대로 묶고 해시를 적는다
