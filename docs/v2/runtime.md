# runtime — 그래프를 실제로 굴리는 것들

[stages/](stages/) 7장은 **그래프 노드**를 설명한다. 이 문서는 그 노드들을 **밀고 가는 쪽** — 훅 · 게이트 · 분류기 — 을 설명한다.

둘을 나눈 이유가 있다. [graph.mjs](../../graph.mjs) 는 그냥 객체 하나라서 **아무것도 실행하지 않는다** ([graph.mjs:29-31](../../graph.mjs#L29-L31)).
거기엔 "무엇이 무엇에 기대는지"만 적혀 있고, 그걸 읽어서 상태를 실제로 바꾸는 건 전부 여기 나오는 스크립트다.

## 한눈에

| 언제 | 무엇이 | 하는 일 | 막을 수 있나 |
|---|---|---|---|
| 세션 시작 | [briefing.mjs](../../scripts/briefing.mjs) | 대기 결정 · 게이트 · 프론티어 · 멈춘 지점을 출력 | 아니오 (읽기만) |
| 도구 쓰기 **전** | 보호 훅 3개 | 시크릿 · 보호 파일 · 위험 명령 차단 | **예 (exit 2)** |
| 편집한 **직후** | [run-gates.mjs](../../gates/run-gates.mjs) `--quick` | fsd · security · design 을 즉시 검사 | **예** |
| 턴 끝날 때 | [graph-stop.mjs](../../gates/graph-stop.mjs) | 게이트 전량 → 해시 비교 → 전파 → clean → HANDOFF 기록 | **예** |
| 검증 실패했을 때 | [qa-classifier](../../.claude/agents/qa-classifier.md) | 실패를 spec/design/impl 중 하나로 귀속 | 아니오 (판단만) |

등록은 전부 [.claude/settings.json](../../.claude/settings.json) 에 있다. 훅 6개고, 등록 안 된 스크립트는 없다.

---

## 1. 세션 시작 — `scripts/briefing.mjs`

**하는 일**: 사람과 에이전트가 같은 그림을 보고 시작하게 한다 ([briefing.mjs:2](../../scripts/briefing.mjs#L2)).

출력 6줄이 어디서 오나:

| 줄 | 어디서 읽나 |
|---|---|
| 대기 중인 결정 | `docs/specs/*.md` 중 `status: draft` 인 것 + PROGRESS.md 의 `대기 중인 결정:` 줄 ([:29-38](../../scripts/briefing.mjs#L29-L38)) |
| 게이트 | `run-gates.mjs --quick` 을 돌려 본 종료 코드 ([:41-42](../../scripts/briefing.mjs#L41-L42)) |
| 프론티어 | HANDOFF.md 의 JSON 을 읽어 **그 자리에서 다시 계산** ([:69-81](../../scripts/briefing.mjs#L69-L81)) |
| 멈춘 지점 · 다음 할 일 | PROGRESS.md 에서 정규식으로 뽑음 ([:45-46](../../scripts/briefing.mjs#L45-L46)) |
| 필수 기능 진행 | PRODUCT.md 의 `- [x]` 와 `- [ ]` 개수 ([:61-63](../../scripts/briefing.mjs#L61-L63)) |
| 보류된 하네스 승격 | `harness-backlog.md` 의 `- [ ]` 개수 ([:66-67](../../scripts/briefing.mjs#L66-L67)) |

**눈여겨볼 것 — 순서 경고** ([:48-58](../../scripts/briefing.mjs#L48-L58)).
"다음 할 일"의 **맨 앞 항목**이 데이터 계층인데 화면 얘기도 같이 적혀 있으면 이렇게 경고한다:
> ⚠ 순서 점검: '다음 할 일' 1순위가 데이터 계층인데 화면 대안이 함께 있음 — 원칙은 화면(디자인) 먼저.

DB 말고 다른 선택지가 없으면 안 뜬다. **순서만 보고 화면 작업이 끝났는지는 안 따진다** — 그래서 경고가 뜨면 사람이 확인해야 한다.
이건 게이트가 아니라 **글자 맞춰 보기**다: "다음 할 일" 문장을 `또는`·`→`·`then` 으로 자른 다음 맨 앞 조각만 본다.

활성 프로젝트가 없으면 안내만 하고 **정상 종료(exit 0)** 한다 ([:17-21](../../scripts/briefing.mjs#L17-L21)) — 빈 레포에서 세션마다 에러로 끝나지 않게.

## 2. 도구 쓰기 전 — 보호 훅 3개

셋 다 도구를 쓰기 **전에** 돌고, 걸리면 `exit 2` 로 **막는다.** 에이전트가 우회할 수 없다.

### `protect-secrets.mjs` — 시크릿이 새는 걸 막는다 (17줄)
대상: `Bash|PowerShell` ([settings.json:15-16](../../.claude/settings.json#L15-L16))

| 막는 경우 | 어디 |
|---|---|
| `Read` 도구로 `.env*` 열기 | [:10](../../.claude/hooks/protect-secrets.mjs#L10) |
| `.env` 와 내용 뽑는 명령(`cat`·`grep`·`Get-Content`·`xxd`·`strings` 등 17개)이 한 줄에 같이 있을 때 | [:12-14](../../.claude/hooks/protect-secrets.mjs#L12-L14) |
| `SUPABASE_TOKEN` 을 건드리거나 `printenv`·`ls env:` 로 환경변수를 통째로 뽑을 때 | [:15-17](../../.claude/hooks/protect-secrets.mjs#L15-L17) |

파일 이름만 보는 게 아니라 **`.env` 와 내용 뽑는 명령이 한 줄에 같이 있는지**를 본다.

### `protect-files.mjs` — 손대면 안 되는 파일을 막는다 (26줄)
대상: `Edit|Write|MultiEdit|Bash`

| 보호 대상 | 이유 (파일에 적힌 그대로) |
|---|---|
| `docs/LESSONS.md` | retro 스킬의 사용자 승인 절차로만 갱신 |
| `.claude/settings.json` | 훅/권한 설정은 사용자가 직접 |
| `.claude/hooks/` | **훅으로 훅 우회 차단** |
| `gates/` | 판정 레이어는 제안 후 사용자가 반영 |

Bash 쪽도 막는다 — 리다이렉트(`>`·`>>`), `tee`, `sed -i`, `cp`/`mv` 목적지를 정규식으로 본다 ([:16-21](../../.claude/hooks/protect-files.mjs#L16-L21)). **읽는 건 허용한다.**

> 요점: **게이트를 느슨하게 고쳐서 통과하는 길을 막아 뒀다.** `gates/` 와 `.claude/hooks/` 자체를 보호 대상에 넣었기 때문이다.

### `block-danger.mjs` — 위험한 명령을 막는다 (15줄)
대상: `Bash`. 규칙 4개 ([:4-9](../../.claude/hooks/block-danger.mjs#L4-L9)): `rm -rf` · `git push --force` · `curl|wget … | sh` · `git reset --hard`.

## 3. 편집 직후 / 턴 끝 — `run-gates.mjs`

**두 번 돈다.** 편집할 때마다 `--quick` 으로([settings.json:28](../../.claude/settings.json#L28)), 턴이 끝날 때 graph-stop 이 전량으로([graph-stop.mjs:210](../../gates/graph-stop.mjs#L210)).

| 카테고리 | 무엇을 잡나 | `--quick` 에서 |
|---|---|---|
| `fsd/UPWARD_IMPORT` · `fsd/CROSS_SLICE` | 아래 레이어가 위를 부르거나, 같은 층의 남의 슬라이스를 부르는 것 (`app`·`shared` 는 슬라이스가 없어 교차 검사 제외) ([:124-135](../../gates/run-gates.mjs#L124-L135)) | 돈다 |
| `security/*` 4종 | eval · innerHTML · 코드에 박아 넣은 시크릿 · document.write ([:41-62](../../gates/run-gates.mjs#L41-L62)) | 돈다 |
| `security/DEFINER_SEARCH_PATH` | SQL `security definer` 함수가 `search_path` 를 안 고정한 것 ([:168-172](../../gates/run-gates.mjs#L168-L172)) | 돈다 |
| `design/BEFORE_UI` | 승인 안 받고 화면부터 만드는 것 ([:455-468](../../gates/run-gates.mjs#L455-L468)) | **돈다** — 편집 즉시 막아야 하니까 |
| `tsc/*` | 타입 에러 ([:481-503](../../gates/run-gates.mjs#L481-L503)) | 건너뛴다 |
| `test/FAIL` | `npm test` 실패 ([:510-528](../../gates/run-gates.mjs#L510-L528)) | 건너뛴다 |
| `spec-coverage/MISSING_TEST` | approved 스펙의 INV 에 테스트가 없는 것 ([spec-coverage.mjs:57-60](../../gates/spec-coverage.mjs#L57-L60)) | 건너뛴다 |

**알아 둘 것 셋**

1. **`src/` 가 아직 없으면 통째로 건너뛰고 exit 0** ([:34-39](../../gates/run-gates.mjs#L34-L39)) — 스캐폴드 전 빈 레포에서 같은 실패가 턴마다 다시 뜨는 걸 막으려고
2. **에러는 30건까지만 찍는다** ([:553](../../gates/run-gates.mjs#L553)) — 31건째부터는 소리 없이 잘린다
3. **`design/BEFORE_UI` 의 Next 예외** — 라우트 화면(`page.*`)이 **딱 한 장이면 '워킹 스켈레톤'으로 보고 그냥 넘어간다** ([:439-444](../../gates/run-gates.mjs#L439-L444)). App Router 는 `page.*` 없이는 라우트가 404 라, 이 예외가 없으면 배포 확인용 스켈레톤조차 못 만든다

SQL `DEFINER` 검사는 `create or replace` 를 감안해 **함수 이름별로 마지막 정의만** 본다 ([:141](../../gates/run-gates.mjs#L141)) — 옛날 정의 때문에 헛경고가 뜨지 않게.

## 4. 턴 끝 — `graph-stop.mjs`

턴마다 도는 지휘자. **다섯 단계를 차례로** 한다 ([graph-stop.mjs:5-10](../../gates/graph-stop.mjs#L5-L10)):

```
1) run-gates 전량 실행 → 카테고리별 에러 모으기 (여기선 아직 안 끊는다)
2) 비교  : produces 파일들의 해시가 바뀌었나 → 바뀌었으면 전파 (위가 dirty 면 아래도 전부 dirty)
3) 해제  : 위가 다 clean 이고 조건도 통과한 dirty 노드를 clean 으로 내림
4) 저장  : HANDOFF.md 에 상태 기록 + 프론티어 계산
5) 게이트 에러가 남아 있으면 exit 2 로 차단
```

**조건을 보는 함수가 네 개** 있고, 노드의 `clean_when` 종류에 따라 갈린다:

| 함수 | 무엇을 보나 | 볼 파일이 하나도 없으면 |
|---|---|---|
| `frontmatterOK` [:150](../../gates/graph-stop.mjs#L150) | 찾은 파일이 **전부** `status: <값>` 인가 | **그냥 통과시킨다** ← [findings F-03](findings.md) |
| `existsNonemptyOK` [:164](../../gates/graph-stop.mjs#L164) | 파일이 있고 비어 있지 않은가 | 막는다 |
| `gateBlocked` [:169](../../gates/graph-stop.mjs#L169) | 카테고리가 맞고 에러 경로가 produces 패턴에 걸리나 | 안 막는다 |
| `signoffOK` [:179](../../gates/graph-stop.mjs#L179) | 마커가 있고, 문구가 맞고, **basis 해시가 지금 것과 같은가** | 막는다 |

**파일 찾는 패턴이 판정을 좌우한다.** `globToRegex` ([:32-43](../../gates/graph-stop.mjs#L32-L43)) 가 `**` 는 `.*` 로, `*` 는 `[^/]*` 로 바꾼다.
그리고 `_` 로 시작하는 파일은 아예 후보에서 빠진다 ([:58](../../gates/graph-stop.mjs#L58)) — `_TEMPLATE.md` 가 spec 을 막지 않게.
이 두 장치가 엉뚱하게 걸린 게 [findings F-11](findings.md)(`.test.tsx` 를 못 잡음)과 [F-12](findings.md)(`model.ts` 를 못 잡음)다.

**자식이 있는 노드는 자식을 처리한 바로 그 자리에서 결과를 확정한다** ([:243-246](../../gates/graph-stop.mjs#L243-L246)) — 같은 턴 안에서 아래쪽(implement)이 그 값을 보고 판단하기 때문이다.

**손으로 dirty 찍기**: `node gates/graph-stop.mjs --mark <노드>` ([:190-206](../../gates/graph-stop.mjs#L190-L206)).
파일을 안 고치고도 노드를 dirty 로 만들고 전파시킨다. 분류기 판단을 반영하는 통로다.

**다른 프로젝트의 게이트 에러는 무시한다** ([:141](../../gates/graph-stop.mjs#L141)) — 활성 프로젝트만 본다.
그런데 `spec-coverage` 는 **전 프로젝트**를 훑는다 ([spec-coverage.mjs:9-14](../../gates/spec-coverage.mjs#L9-L14)). 두 방침이 서로 다르다 (아래 참조).

## 5. qa-classifier — 판단만 하고 갈 곳은 안 정한다

**할 일은 하나뿐**: 어느 노드를 dirty 로 찍을지 고르는 것 ([qa-classifier.md:6-7](../../.claude/agents/qa-classifier.md#L6-L7)).
그다음 어디까지 다시 할지는 전파가 알아서 한다. 목적지를 정하지 않는다.

**받는 것** ([:10-12](../../.claude/agents/qa-classifier.md#L10-L12)): 실패 로그(qa 테스트 또는 **리뷰어 지적**) · 마지막 clean 이후 바뀐 diff · 관련 산출물.

**판단하는 순서 — 아래에서 위로 올라간다** ([:14-20](../../.claude/agents/qa-classifier.md#L14-L20)). 레포는 이걸 "충실성 사다리"라고 부른다:

```
1. 코드가 스펙·설계대로 됐나?      아니오 → impl-level
                                예 ↓ (코드 잘못 아님, 한 칸 위로)
2. 설계가 요구를 만족하나?         아니오 → design-level
                                예 ↓
3. 요구·스펙 자체가 모순이거나 빠졌나? → spec-level
```

**위쪽 말을 안 지킨 첫 칸에서 멈춘다. 여러 칸이 의심돼도 하나만 고른다.**

고른 뒤에 할 일 ([CLAUDE.md:85-87](../../CLAUDE.md#L85-L87)):

| 판단 | 하는 일 |
|---|---|
| impl | 지목된 위치의 코드를 고친다 (실패한 qa/review 가 이미 dirty 로 잡고 있다) |
| design | `design-rules.md` 를 `status: draft` 로 내린다 (거부) |
| spec | 해당 스펙을 `status: draft` 로 내린다 (거부) |

**바로 보고해야 하는 경우**: `spec-level` 이거나 위험한 데(인증·결제·권한·격리 INV·security)에 닿으면 **등급과 상관없이 사용자에게 먼저 알린다** ([CLAUDE.md:88](../../CLAUDE.md#L88)).

파견은 자동이 아니다. graph-stop 이 **알려 주기만 한다** ([graph-stop.mjs:254-256](../../gates/graph-stop.mjs#L254-L256)):
> ↩ qa dirty + 검증 실패 — 분류기(qa-classifier) 필요

## 파일에서 확인 못 한 것

- **분류기가 *왜* 그렇게 판단했는지 아무 데도 안 남는다.** `--mark` 는 HANDOFF 의 상태값만 바꾼다 ([graph-stop.mjs:200-202](../../gates/graph-stop.mjs#L200-L202)). 다음 세션은 dirty 라는 것만 알고 이유는 모른다. `[INFERRED]`
- **활성 프로젝트를 다루는 방침이 갈린다.** graph-stop 은 활성만 보고([:24](../../gates/graph-stop.mjs#L24)) 게이트 에러도 활성 것만 거르는데([:141](../../gates/graph-stop.mjs#L141)) `spec-coverage` 는 전 프로젝트를 훑는다. 안 쓰는 프로젝트의 INV 누락이 지금 프로젝트를 막는지 직접 돌려 보지 않았다. `[INFERRED]`
- **`briefing.mjs` 의 순서 경고는 글자를 맞춰 보는 방식이다.** "다음 할 일" 문장을 `또는`·`→`·`then` 으로 자르고 맨 앞만 본다 ([:52](../../scripts/briefing.mjs#L52)). 말 순서가 다르면 헛경고가 뜨거나 놓치는지 확인 안 했다. `[INFERRED]`
- **`protect-files.mjs` 를 우회할 수 있는지 확인 안 했다.** 리다이렉트·`tee`·`sed -i`·`cp`/`mv` 는 잡지만 `python -c`·`node -e` 로 파일을 쓰는 건 규칙에 없다. `[INFERRED]`
- **훅 자체가 죽으면 어떻게 되는지 확인 안 했다.** 셋 다 걸리면 `exit 2` 로 막지만, 훅 스크립트가 잘못된 입력으로 크래시하면 막는 쪽인지 통과시키는 쪽인지 파일만 봐서는 알 수 없었다. `[INFERRED]`
- **`run-gates` 의 30건 자르기**([:553](../../gates/run-gates.mjs#L553))**가 실제로 일어난 적 있는지** 확인 안 했다. 일어나면 31건째부터의 위반이 소리 없이 사라진다. `[INFERRED]`
