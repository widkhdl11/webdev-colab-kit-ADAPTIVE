# 시안 0장인 승인이 design 을 통과시키는 것을 막는다 (보호 파일 1개 · 1자리)

## 무슨 일이 났나

`projects/study-mate/` 에서 **시안을 한 장도 그리지 않고 구현으로 내려갔다.** 사용자가
기대한 순서는 문서 → 시안 → 피드백 → 승인 → DB 설계 → 구현이었고, 그 순서는
CLAUDE.md 의 표면별 판단표와 `.claude/rules/design-drafting.md` 에 이미 적혀 있었다.
signal2(시안 9장)·wama(3장)에서는 지켜졌다. study-mate 에서만 통째로 건너뛰어졌다.

원인은 `design/page-designer` 가 clean 이 되는 조건이 **하나뿐**이라는 것이다.

```js
"page-designer": {
  produces: ["docs/design/design-rules.md", "docs/design/mockups/*.html"],
  clean_when: {
    frontmatter: { path: "docs/design/design-rules.md", require: "status: approved" },
  },
},
```

`mockups/*.html` 은 `produces` 에만 있다. **`produces` 는 해시를 계산하는 목록이지
판정 기준이 아니다.** 조건은 `clean_when` 이고 거기엔 approved 하나만 있다.

실측으로 확인했다. HANDOFF 의 page-designer 해시 `f042ba2c8086` 은 `design-rules.md`
파일 하나만 넣고 다시 계산한 값과 정확히 같다 — 시안이 해시에 기여한 바이트가 0이다.

## 왜 signal2·wama 에서는 안 났나

**`design-rules.md` 가 시안 루프의 결과물일 때만 approved 라는 신호가 맞기 때문이다.**
그 둘은 design 노드에서 작업이 시작됐고, approved 가 붙는 시점엔 이미 시안이 있었다.
조건이 하나여도 우연히 맞았다.

study-mate 는 경로가 달랐다. **들여오기(intake)가 원본 저장소의 디자인 문서를 옮겨
`status: approved` 를 붙였다.** 그 순간 그래프가 보는 유일한 조건이 충족됐고, 시안 0장인
새 프로젝트가 "이미 승인된 방향이 있는 성숙한 프로젝트"로 판정됐다. design 이 clean 이
되니 `implement` 가 열렸고, 프론티어가 spec → implement → qa → review 로 곧장 내려갔다.

**들여오기는 새 프로젝트를 기존 프로젝트처럼 보이게 만든다.** 그게 이 구멍의 방아쇠다.

## 무엇을 고치나

새 판별 기준을 만들지 않는다. **시안이 0장인 승인을 승인으로 치지 않으면** 세 경우가
저절로 갈린다.

| 상황 | 시안 | design 판정 | 결과 |
|---|---|---|---|
| 기존 프로젝트에 기능 추가 | 이미 있음 | clean | 시안 안 그리고 바로 구현 |
| 처음부터 짓는 프로젝트 | 0장 | **dirty** | 프론티어가 시안을 가리킨다 |
| 들여온 프로젝트 | 0장 | **dirty** | 승인이 밖에서 왔어도 안 통한다 |

화면이 아예 없는 프로젝트(백엔드 전용 등)는 `--na` 로 선언한다. 조용히 통과하는 것과
선언하고 통과하는 것은 구분되어야 한다.

판정 로직은 건드리지 않는다 — `existsNonemptyOK` 는 `graph-stop.mjs` 에 이미 있고
`product` 노드가 쓰고 있다. 글롭도 이미 처리한다. **바뀌는 것은 데이터 한 줄이다.**

## 사용자가 붙일 것 — `graph.mjs` 한 자리

`design.parallel["page-designer"].clean_when` 안, `frontmatter:` 줄 **바로 아래**.

찾을 것 (앞뒤 줄 포함):

```js
      "page-designer": {
        produces: ["docs/design/design-rules.md", "docs/design/mockups/*.html"],
        clean_when: {
          // ↓ 이 신호를 기존 design/BEFORE_UI 게이트가 이미 읽어 UI 구현을 허용한다
          frontmatter: { path: "docs/design/design-rules.md", require: "status: approved" },
        },
      },
```

바꿀 것:

```js
      "page-designer": {
        produces: ["docs/design/design-rules.md", "docs/design/mockups/*.html"],
        clean_when: {
          // ↓ 이 신호를 기존 design/BEFORE_UI 게이트가 이미 읽어 UI 구현을 허용한다
          frontmatter: { path: "docs/design/design-rules.md", require: "status: approved" },
          // 시안이 0장인 승인은 승인으로 치지 않는다. approved 하나만으로는 "새 방향인가
          // 반복인가"를 가르지 못한다 — 그 신호는 design-rules.md 가 시안 루프의 결과물일
          // 때만 맞고, 들여오기가 다른 저장소에서 승인을 가져오면 시안 0장인 새 프로젝트가
          // "이미 승인된 방향의 반복"으로 통과한다(2026-09-05 study-mate 에서 실제로 났다).
          // 화면이 없는 프로젝트는 --na 로 선언한다 — 조용히 통과하는 것과 구분되어야 한다.
          exists_nonempty: "docs/design/mockups/*.html",
        },
      },
```

**한 파일 한 자리라 부분 적용 조합이 없다.** 붙거나 안 붙거나 둘 중 하나다.

## 붙이기 전후로 돌릴 검사

```
node scripts/check-mockup-required.mjs
```

| | 무엇을 보는가 | 붙기 전 | 붙은 뒤 |
|---|---|---|---|
| A | 승인 + 시안 0장이면 page-designer 가 dirty 다 | **✗ 실패** | ✓ |
| B | 빈 시안 파일로는 못 속인다 (0바이트도 dirty) | **✗ 실패** | ✓ |
| C | 내용 있는 시안이 있으면 지금처럼 clean 이다 | ✓ | ✓ |
| E | 이 레포의 시안 있는 프로젝트는 영향받지 않는다 | ✓ | ✓ |
| D | 패치를 적용한 **사본**에서 A·B 가 통과하고 C 가 유지된다 | ✓ | ✓ |

붙기 전 실측 결과:

```
✗ A 현행     승인 + 시안 0장이면 page-designer 가 dirty 다  — clean 이다 — 시안을 한 장도 안 그렸는데 통과했다
✗ B 심은위반 빈 시안 파일로는 못 속인다  — 빈 파일 하나로 통과했다 — 껍데기로 우회된다
✓ C 회귀 X   내용 있는 시안이 있으면 지금처럼 clean 이다
✓ E 실물     시안이 있는 프로젝트는 영향받지 않는다  — signal2 9장 · study-mate 0장 · wama 3장
             → 이 패치로 dirty 가 되는 것: study-mate
✓ D 패치 확인 패치를 적용한 사본에서 A·B 가 통과하고 C 가 유지된다
             — 시안없음=dirty / 빈파일=dirty / 시안있음=clean
```

**B 가 심은 위반이다.** 이 패치의 고장 방향은 "파일이 있기만 하면 통과"다. A 만 보면
빈 파일 하나로 우회되는 패치도 초록불이 된다. **C·E 는 반대 각도다** — 차단을 더하는
변경이라 과차단이 반대쪽 고장이고, 시안을 제대로 그린 프로젝트까지 막으면 그것도 실패다.

**D 가 핵심이다.** `graph.mjs` 는 보호 파일이라 붙이기 전에는 A·B 를 통과시킬 수 없다.
D 는 패치를 적용한 사본을 임시 폴더에 만들어 거기서 같은 판정을 돌린다. A·B 가 실패하고
D 가 통과하면 "지금은 뚫리고, 이 패치를 붙이면 막힌다"가 코드를 안 읽어도 판정된다.

검사는 전부 임시 디렉터리에서 돈다 — 이 레포의 파일을 하나도 건드리지 않는다.

## 붙인 뒤 일어나는 일

`study-mate` 의 `design/page-designer` 가 dirty 가 되고, 전파로 `implement` · `qa` ·
`review` 가 따라 dirty 가 된다. **그게 지금의 사실이다** — 시안 없이 내려간 것을 되돌리는
것이라 되돌아가는 게 맞다. signal2·wama 는 시안이 있어 그대로 clean 이다.

시안이 승인되면 design 이 다시 clean 이 되고 아래가 순서대로 풀린다.

## 같이 낸 것 (보호 파일 아님 — 이미 적용됨)

`.claude/rules/design-drafting.md` 에 `paths:` 프론트매터를 추가했다. 제목이 처음부터
"경로 조건 규칙"이었는데 조건이 없었다(v2 최초 커밋부터). 같은 폴더의 나머지 규칙 여섯은
전부 갖고 있다. 조건이 없으니 화면 작업을 **시작하는 그 순간에** 도착하지 않고 항상 켜진
배경 문서가 됐다.

## 이 패치가 다루지 않는 것 — 밝혀 둔다

**`design/schema-designer` 에 같은 모양의 구멍이 있다.** HANDOFF 에 `"hash": null` (파일이
하나도 없다는 뜻) 인데 status 는 `clean` 이다. 조건이 `gate: ["fsd","security"]` 뿐이라
검사할 파일이 0개면 에러도 0건이고 그래서 통과한다.

여기에 같은 방식으로 `exists_nonempty` 를 걸지 **않았다.** DB 설계는 시안 승인 뒤에 오는
단계인데, page-designer 와 schema-designer 는 형제(parallel)라 그래프가 그 순서를 표현하지
못한다. 지금 걸면 시안을 그리기도 전에 마이그레이션을 요구하게 되어 순서가 거꾸로 걸린다.

**순서를 표현하려면 토폴로지를 바꿔야 한다**(schema-designer 가 page-designer 에
depends_on). 그건 데이터 한 줄이 아니라 구조 변경이라 따로 낸다. 하네스 백로그로 간다.
