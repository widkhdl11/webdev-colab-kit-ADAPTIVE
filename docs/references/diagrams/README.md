# 하네스 그림 일곱 장 (2026-08-17 세 장 · 2026-08-30 네 장 추가)

브라우저로 `.html` 을 열면 된다. 외부 의존이 없어 파일만 있으면 그대로 뜬다.
각 그림 오른쪽 위에 뷰가 두셋 있다 — 누르면 관련 없는 부분이 흐려진다.

`.json` 이 원본이고 `.html` 은 거기서 렌더한 결과다. 고칠 일이 있으면 `.json` 을 고치고 다시 렌더한다
(archify 스킬, 이 레포 밖에 있다). `.html` 은 `.gitignore` 에 있어 커밋되지 않는다 — 새로 받은 사람은
아래 "다시 렌더하는 법"으로 만들어야 한다.

## 그림보다 먼저 읽을 것

**[../walkthrough.md](../walkthrough.md)** — 요청 하나를 끝까지 따라간 시나리오 둘.
같은 파일을 고치는데 하나는 1턴에 끝나고 하나는 8턴이 걸린다. 턴마다 무엇이 화면에 찍히고
노드 상태가 어떻게 변하는지 적혀 있다. **그림들은 그 이야기의 한 층씩을 확대한 것이다.**

## 어떤 순서로 보면 되나

처음이면 **①→②→③** 순서로 보면 큰 그림이 잡힌다. 나머지 넷은 궁금해질 때 찾아보는 것이다.

| | 파일 | 답하는 질문 |
|---|---|---|
| ① | `feature-path.html` | 기능 하나를 만들 때 누가 무엇을 언제 하나 |
| ② | `depth-decision.html` | 어디까지 다시 할지를 무엇이 정하나 |
| ③ | `graph-judgment.html` | 그래프 일곱 노드가 서로 무엇에 기대나 |
| ④ | `gates.html` | 게이트 다섯이 각각 무엇을 보고 무엇을 막나 |
| ⑤ | `failure-routing.html` | 검증이 실패하면 어디로 되돌아가나 |
| ⑥ | `node-states.html` | 노드 하나의 상태가 어떻게 바뀌나 |
| ⑦ | `harness-turn.html` | 한 턴 안에서 훅과 게이트가 언제 도나 |

---

## ① `feature-path.html` — 기능 하나가 처음부터 끝까지

세션이 열려서 닫힐 때까지 한 번. 참가자는 다섯이다 — 사용자 · 나 · 문서 · 게이트 · 그래프 상태.

- 만들기 전에 반드시 지나는 곳: **무엇을 건드리는지 말하고 동의를 받는다**
- 승인은 대화가 아니라 파일의 `status: approved` 한 줄로 남는다 — 게이트가 그 줄을 읽는다
- 내가 부르지 않는데 도는 것이 둘: 편집할 때마다, 그리고 턴이 끝날 때
- 세션 끝에 남기지 않은 것은 다음 세션에 존재하지 않는다

## ② `depth-decision.html` — 무엇을 건드리는지 보고 그만큼만 다시 한다

**이 킷이 예전 방식과 갈라지는 지점.** 예전엔 작업 하나에 등급을 매겨 등급이 높으면 전 단계가
다시 돌았다. 지금은 이번 수정이 무엇을 건드리는지 열거하고, 건드린 것마다 절차를 따로 붙인다.

- 내가 정하는 자리가 셋 — 무엇을 건드렸나 · 무엇을 건너뛰나 · 리뷰어는 누구
- **그 바로 아래 레인이 그 판단을 되받는 기계다.** 위아래로 짝이 맞는다
- 다시 할 범위는 판단 대상이 아니다 — 바뀐 파일의 해시에서 전파가 계산한다

## ③ `graph-judgment.html` — 그래프와 판단이 들어가는 자리

노드 일곱(`product → spec·design → implement → qa → review → deploy`)과 의존 관계,
그리고 판단이 허용된 세 자리와 자리마다 붙은 되받이.

| 내가 판단 | 되받는 기계 |
|---|---|
| 닿는 표면 고르기 | risk-surface 게이트가 얇게 못 가게 막는다 |
| n/a 선언 | 산출물·상류·risk-surface 로 자동 취소 |
| 리뷰어 구성 | 보안 표면인데 security-reviewer 가 빠지면 사인오프 거부 |

**순서와 재작업 범위는 판단 대상이 아니다** — 프론티어와 dirty 전파가 파생한다.

## ④ `gates.html` — 게이트 다섯이 각각 무엇을 보고 무엇을 막나

언제 도나 → 무엇을 보나 → 그래서 턴이 막히나.

- 무조건 막는 것: `fsd` · `security` · `tsc` · `test` · `risk-surface`
- 낮출 수 있는 것: `design/BEFORE_UI`(선행조건형) · `spec-coverage`·`notrun`(완료형)
- **왜 낮추나**: 승인은 턴을 끝내야 받을 수 있는데, 그 게이트가 턴을 막으면 푸는 유일한 길이 닫힌다
- 낮춰도 노드는 dirty 그대로다 — 진행이 아니라 '턴 종료'만 허용된다

## ⑤ `failure-routing.html` — 검증이 실패했을 때 어디로 되돌아가나

실패한 자리를 고치면 원인이 남아 같은 실패가 다시 난다. 그래서 어느 층 탓인지부터 정한다.

- `spec` 탓 = 규칙이 틀렸다 → 스펙을 `status: draft` 로
- `design` 탓 = 시각 기준이 틀렸다 → design-rules 를 `status: draft` 로
- `impl` 탓 = 코드만 틀렸다 → 그 자리를 고치면 끝(이미 dirty 라 찍을 것 없다)
- **파일만 고치고 끝내면 안 된다** — `--mark <노드> "<사유>"` 까지 찍어야 rework 로 잡힌다

## ⑥ `node-states.html` — 노드 상태 넷의 전이

`dirty` · `clean` · `rework` · `n/a` 사이를 무엇이 옮기는지.

- clean 을 내리는 방법은 셋뿐이다: 게이트 통과 · 프론트매터 `status: approved` · 사인오프 마커.
  내가 "됐다"고 선언해서 내릴 방법은 없다
- 내가 선언하는 것은 둘(`n/a`, `rework`)이고 **둘 다 사유 한 줄이 필요하다**
- `rework` 가 `dirty` 와 다른 점은 하나뿐 — 선행 조건 게이트 실패가 턴을 막지 않는다

## ⑦ `harness-turn.html` — 한 턴이 굴러가는 길

훅이 언제 돌고 게이트가 무엇을 막는지. **기계 층만** 다룬다.

- PreToolUse 셋(`protect-files`·`protect-secrets`·`block-danger`)이 편집이 적용되기 **전에** 돈다
- PostToolUse 가 `run-gates.mjs --quick` 을 부른다 (tsc·테스트만 건너뛰고 risk-surface 는 그대로 돈다)
- Stop 훅(`graph-stop.mjs`)이 같은 게이트를 전체 모드로 다시 부르고, 해시를 비교해 HANDOFF 를 갱신한다
- **상태가 바뀌는 곳은 Stop 훅 하나뿐이다** — 이게 안 돌면 HANDOFF 가 옛 값으로 남는다

---

## 그림보다 표가 나은 것

### 무엇을 건드렸을 때 무슨 절차가 붙나 (CLAUDE.md 표면별 판단)

| 이번 수정이 건드린 것 | 붙는 절차 | 왜 |
|---|---|---|
| 로그인·세션·결제·권한·시크릿 | 구현 전 스펙 + security-reviewer | 틀리면 되돌릴 수 없다. **risk-surface 게이트가 기계로 강제** |
| 동시에 돌거나 시간·다른 값에서 파생되는 상태 | 구현 전 스펙 | 사고가 나중에 조용히 난다 |
| 새 시각 방향 | 상담 → 시안 → checkpoint | 시각은 말로 합의되지 않고, 크게 만든 뒤 뒤집으면 비싸다 |
| 승인된 방향을 물려받는 화면 | 바로 구현 + ui-reviewer | design-rules 가 이미 기준이다 |
| 도메인 로직·상태 관리 | code-reviewer | 게이트는 문법을 보고 이건 의미를 본다 |
| 데이터 모델(엔티티·필드) | modeling-checklist 훑기 → 걸리면 스펙 | 잘못 잡은 모델은 마이그레이션으로만 고쳐진다 |
| 글자·이미지·토큰 값 | 자동 게이트만 | 되돌리는 비용이 거의 0이다 |

**닿지 않은 것의 절차는 걸지 않는다.** 결제 화면의 문구 하나를 고치는 수정은 결제를 건드린 게 아니다.

### 리뷰어 넷은 각각 어디에 붙나

기능이 완성됐을 때만 파견한다(잦은 리뷰 방지). 개수가 아니라 **건드린 것**으로 정한다.

| 리뷰어 | 파견하는 diff |
|---|---|
| `security-reviewer` | 사용자 입력·인가·시크릿·세션을 만졌다 |
| `ui-reviewer` | 승인된 design-rules 에서 벗어나는 시각 변경(새 컴포넌트·레이아웃·토큰) |
| `code-reviewer` | 도메인 로직·상태 관리가 바뀌었다 |
| `test-auditor` | 스펙 INV 를 검증하는 테스트를 새로 썼다 |

돌린 리뷰어는 `workspace/review.md` 의 `reviewers:` 에 적는다. 코드에서 로그인·결제·권한 표면이
감지됐는데 `security-reviewer` 가 목록에 없으면 사인오프가 거부된다. **뺀 리뷰어가 있으면 왜 뺐는지
한 줄로 알린다** — 뺀 판단도 보고 대상이다.

### design 노드는 자기 산출물이 없다

`design` 은 자식 둘을 묶는 집계 노드다.

| 자식 | 만드는 것 | clean 조건 |
|---|---|---|
| `page-designer` | `docs/design/design-rules.md` · `mockups/*.html` | design-rules 의 `status: approved` |
| `schema-designer` | `supabase/migrations/*.sql` · `src/entities/*/model.ts` | `fsd`·`security` 게이트 에러 0건 |

둘 다 만족해야 `design` 이 clean 이 된다. 둘 다 n/a 면 부모도 n/a 다.

---

## 다시 렌더하는 법

`.html` 은 커밋되지 않으므로 새로 받은 레포에서는 직접 만들어야 한다.
archify 스킬 디렉터리(`~/.claude/skills/archify`)에서 돈다.

```
node bin/archify.mjs deliver <종류> <이 폴더>/<이름>.json <이 폴더>/<이름>.html --quality showcase
```

종류는 파일 이름 가운데에 있다 — `feature-path.sequence.json` 이면 `sequence`,
`gates.architecture.json` 이면 `architecture`, 나머지 `.workflow.json` 은 `workflow`,
`node-states.lifecycle.json` 은 `lifecycle`.

## 어디까지 확인했나

일곱 장 모두 좌표·겹침·라벨 간격 검사 9/9 를 통과했다.
2026-08-30 에 만든 넷(`depth-decision`·`feature-path`·`gates`·`failure-routing`)은
브라우저로 열어 **렌더 결과까지 눈으로 확인**했다.
2026-08-17 의 셋(`harness-turn`·`graph-judgment`·`node-states`)은 검사만 통과시켰고 화면은 안 봤다.

## 왜 한 장이 아닌가

처음엔 한 장(`harness-turn`)만 만들었는데 "그래프 + 상황 판단인지 모르겠다"는 지적을 받았다.
맞는 지적이었다 — 그 한 장은 기계 층만 그렸고 그래프도 판단 자리도 없었다.
**한 장이 두 층을 다 담지 못한다는 것 자체가 이 하네스의 구조다.**
그리고 archify 의 workflow 는 열이 여섯으로 고정이라, 한 장에 다 넣으면 글자를 줄이거나 내용을 쳐내야 한다.
