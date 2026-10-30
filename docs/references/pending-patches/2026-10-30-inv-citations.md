# 붙이는 법 — 스펙 INV 를 고치면 그 번호를 인용하는 다른 문서를 경고로 띄운다 (2026-10-30 retro ④)

`gates/run-gates.mjs` 는 보호 파일이라 사용자가 직접 붙인다. 동작이 바뀌는 파일은 **이것 하나**다
(맨 끝의 `docs/LESSONS.md` 기록은 문서라 판정에 영향이 없고, 어느 쪽을 먼저 붙여도 된다).
판정은 `scripts/check-inv-citations.mjs`(보호 파일 아님, 이미 있음)가 하고, 게이트는 그 스크립트를 불러
`⚠ [inv-cite/…]` 줄을 stderr 로 옮겨 적기만 한다. **실패 목록(errors)에는 넣지 않는다** — 막지 않는다.

## 붙이기 전에 — 실패하는지 본다

```
node scripts/check-inv-citations.mjs --wired
```

지금은 `FAIL 게이트가 인용 경고를 띄운다` · `배선 확인 실패 1/2` 가 나온다(게이트가 아직 안 부른다).

## 붙일 것

`gates/run-gates.mjs` 에서 아래 줄을 찾는다(720줄 근처).

```js
for (const w of riskWarnings) console.error(w);
```

그 줄 **바로 아래**에 다음을 넣는다.

```js
// ── INV 인용 경고: 스펙의 INV 를 고치면, 그 번호를 인용하는 다른 스펙·화면 명세의 파일:줄을 알린다. (막지 않음)
//    판정은 scripts/check-inv-citations.mjs 한 자리에 있다 — 여기서 로직을 베끼지 않고 그것을 돌린다.
//    --quick 에서도 돈다. 스펙을 고치는 그 편집에서 보여야 쓸모가 있고, git diff 한 번이라 빠르다.
//    스크립트 위치는 이 게이트 파일 기준으로 찾는다 — 작업 위치(cwd)가 다른 폴더여도 같은 스크립트를 쓴다.
//    검사기가 없거나 못 돌면 ⚠ 로 건너뛴다. 어느 경우에도 errors 에 넣지 않는다.
{
  const citeCheck = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "check-inv-citations.mjs");
  if (!existsSync(citeCheck)) {
    console.error("⚠ [inv-cite/SKIP] scripts/check-inv-citations.mjs 가 없다 — INV 인용 경고를 건너뛴다.");
  } else {
    const cr = spawnSync(process.execPath, [citeCheck, "--root", ROOT], { cwd: ROOT, encoding: "utf-8" });
    if (cr.status === null || cr.status !== 0) {
      console.error("⚠ [inv-cite/SKIP] INV 인용 검사가 실행되지 않았다 — 나머지 게이트는 그대로 판정한다.");
    } else {
      for (const line of (cr.stdout ?? "").split("\n")) if (line.startsWith("⚠ [inv-cite/")) console.error(line);
    }
  }
}
```

그리고 파일 맨 위 import 에 `fileURLToPath` 가 없으면 더한다.

```js
import { fileURLToPath } from "node:url";
```

(지금 `gates/run-gates.mjs` 의 import 는 `node:child_process`·`node:fs`·`node:path`·`./lib/read-spec.mjs` 넷이다.
`dirname`·`join`·`existsSync`·`spawnSync` 는 이미 가져와 있다.)

## 붙인 뒤에 — 통과하는지 본다

```
node scripts/check-inv-citations.mjs --wired
node gates/run-gates.mjs --quick
```

첫 줄은 `ok 게이트가 인용 경고를 띄운다` · `ok 경고가 실패 목록에 섞이지 않는다` · `배선 확인 통과`.
둘째 줄은 지금처럼 통과해야 한다(스펙을 고치고 있지 않으면 경고 줄도 없다).

`--wired` 는 임시 레포에 스펙 둘(INV-A1 정의, 그것을 인용하는 다른 스펙)을 심고, 정의 본문의 168시간을 720시간으로
고친 뒤, 그 레포를 작업 위치로 **실제 게이트**를 돌려 경고 줄이 나오는지 본다. 위반을 심어 잡히는 것을 보는 검사다.

붙인 뒤 내가 할 일(보호 파일 아님): `scripts/check-inv-citations.mjs` 맨 위 `@check-role: pending` 을 `standing` 으로,
`@check-backlog` 줄을 지운다. 지금 pending 인 이유는, 게이트가 부르기 전에 standing 이라고 적으면 검사 등록부가
「부르는 곳이 없다」로 게이트 전체 실행을 막기 때문이다.

## 부분 적용 조합

고치는 보호 파일은 하나지만 조각이 둘(import 한 줄, 본문 블록)이다.

| 상태 | 결과 |
|---|---|
| 둘 다 안 붙임(지금) | 경고 없음. 게이트 동작 그대로. `--wired` 실패 |
| 본문 블록만 붙이고 import 를 빠뜨림 | `fileURLToPath is not defined` 로 **게이트가 매 편집마다 죽는다** — 위험한 조합. 붙인 뒤 `node gates/run-gates.mjs --quick` 을 꼭 돌린다. 죽으면 import 줄을 더한다 |
| import 만 붙임 | 쓰지 않는 import 하나. 동작 그대로 |
| 둘 다 붙임 | 경고가 뜬다. 실패 목록에는 안 들어간다. `--wired` 통과 |
| 둘 다 붙였는데 `scripts/check-inv-citations.mjs` 가 지워짐 | `⚠ [inv-cite/SKIP]` 한 줄, 나머지 판정 그대로 |

import 를 빠뜨린 조합을 없애려면 `fileURLToPath` 대신 `new URL("../scripts/check-inv-citations.mjs", import.meta.url)` 을
`spawnSync` 에 바로 넘기는 방법도 있지만, Windows 에서 `/C:/…` 꼴 경로가 되어 `existsSync` 가 실패한다. 그래서 import 를 쓰고
위 표에 위험 조합을 밝힌다.

---

# 같이 붙일 것 — `docs/LESSONS.md` 맨 끝

## 2026-10-30 — 규칙 값을 바꾸면 옛 값이 다른 자리에 남는다 (fankkuk)

- 증상: 같은 규칙이 SQL 함수·시험 기대값·스펙 문장·화면 문구에 따로 적혀 있어, 한 곳을 고치면 나머지가 아무 신호 없이
  옛 규칙으로 남았다. 10-15 가입 닉네임(옛 기대값 3건) · 10-21 기한 168→720시간(시험 10여 건, 일부는 10-30 까지 빨간불) ·
  10-29 승인 서명 연결 필수(시험용 크리에이터 도우미가 연결을 안 걸어 통합 시험 48건) · 10-30 알림 묶음(29건).
  통합 시험 전체가 1시간 반이라 규칙을 바꿀 때 전부 안 돌렸고, 늘 있는 실패가 새 실패를 묻었다.
- 교훈: **규칙 값을 바꾸는 결정에는 「이 값이 또 어디 적혀 있나」를 묻는 자리가 있어야 한다.** 사람의 기억으로는 세 번 다 놓쳤다.
  옛 값이 무엇인지는 뜻을 알아야 고를 수 있어(168시간은 승인 기한 7일에도 쓰인다) 막는 게이트가 아니라 찾는 명령 + 절차로 둔다.
  INV 인용처럼 기계로 판정할 수 있는 부분만 게이트 경고로 올린다.
- 반영 위치: ③ `.claude/rules/rule-change.md` · `scripts/find-old-values.mjs` · `.claude/rules/tdd.md` 한 줄.
  ④ `scripts/check-inv-citations.mjs` + `gates/run-gates.mjs` 경고 배선(이 패치). 프로젝트 쪽: fankkuk `npm run test:related`(관련 시험 고르기)·
  `npm run test:integration:signoff`(실패 기준선, 2주 기한).
