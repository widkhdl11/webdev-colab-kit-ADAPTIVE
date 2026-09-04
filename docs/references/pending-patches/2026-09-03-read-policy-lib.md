# 보류 패치 — 결정 규칙 frontmatter 를 읽는 자리를 `gates/lib/` 하나로 만든다 (v3.3 · A단계)

보호 파일(`gates/`)을 만드므로 사용자가 직접 붙인다.
붙었는지·판정이 계약대로인지는 `node scripts/check-read-policy.mjs` 가 판정한다 — 코드를 읽지 않아도 된다.

## 무엇을 하는 패치인가

**새 파일 하나를 만든다.** 기존 파일은 하나도 고치지 않는다.

```
gates/lib/read-policy.mjs   (신규)
```

**파일이 하나뿐이라 부분 적용 조합이 없다.** 붙었거나 안 붙었거나 둘뿐이고, 안 붙은 상태는
`check-read-policy` 의 A 항목이 실패로 알린다. (파일 둘 이상을 고치는 패치였다면 여기에
조합별 판정표가 있어야 한다.)

## 지금 붙여도 되는가 — 소비자가 아직 없다

**없다. 그게 의도다.** A단계는 에이전트 규약만 바꾸고 게이트·훅은 건드리지 않으므로, 이 단계에서
규칙을 읽는 것은 사람(에이전트)이지 코드가 아니다. 이 파일의 첫 소비자는 B단계에서 온다.

그런데도 지금 내는 이유는 v3.2 에서 배운 것 때문이다 — frontmatter 를 읽는 정규식이 네 곳에
복붙돼 있었고, `test()` 와 `match()` 의 차이가 사고를 냈다. **읽는 자리가 하나로 정해지기 전에
소비자가 먼저 생기면 각자 정규식을 만든다.** 그래서 자리를 먼저 만들어 둔다.

지금 붙여도 아무 동작이 바뀌지 않는다(아무도 import 하지 않는다). 안 붙여도 A단계는 돌아간다 —
`check-read-policy` 가 A 만 실패하고 나머지 판정은 자기 사본으로 계속 돈다.

## 이 파일의 요점은 파싱이 아니라 실패 방향이다

`read-spec.mjs` 는 "모르는 값은 더 엄격한 쪽으로 떨어뜨린다"가 요점이었다. **정책은 그 논리가
그대로 옮겨지지 않는다.**

| | 스펙 | 정책 |
|---|---|---|
| 모르는 값을 **버리면** | 승인 안 된 것으로 취급 → 방벽이 닫힌다 (안전) | 근거 없이 auto-decide 가 돈다 (위험) |
| 모르는 값을 **살리면** | 승인된 것으로 취급 → 방벽이 열린다 (위험) | 틀린 근거로 결정한다 (위험) |

정책은 양쪽이 다 나쁘다. 그래서 **버리는 것과 사람에게 올리는 것을 묶는다.**

> 못 읽는 규칙은 버린다. 그리고 그 규칙의 `scope` 에 속하는 결정을 사람에게 올린다.
> 근거 없이 진행하지도, 틀린 근거로 진행하지도 않는다.

`scope` 를 알 수 없는 경우(frontmatter 자체가 없거나 남은 `scope` 가 하나도 없을 때)는 올릴 자리가
없으므로 그냥 버린다. 그 규칙은 애초에 어느 결정에도 주입되지 않았을 것이라 손실이 없다.

throw 하지 않는 것은 `read-spec` 과 같다 — 오타 하나로 게이트가 죽으면 사람이 그 파일을 지워서
우회한다.

## 어휘

정본은 `docs/references/docs-contract.md` 7절이다. 이 파일의 배열 둘이 그 목록의 사본이다.

```
status : confirmed · provisional
scope  : ui · data-model · api · copy
```

## 붙일 파일

`gates/lib/read-policy.mjs` 를 아래 내용으로 새로 만든다.

```js
// 결정 규칙 frontmatter 의 유일한 읽기 경로. 어휘는 docs/references/docs-contract.md 7절이 정본이다.
//
// 실패 방향이 이 파일의 요점이고, 스펙과 다르다.
//   스펙은 "모르면 승인 안 된 것으로 본다"가 항상 방벽을 닫는 쪽이다.
//   정책은 버리면 근거 없이 결정하고, 살리면 틀린 근거로 결정한다 — 양쪽이 다 나쁘다.
//
//   그래서 둘을 묶는다: 못 읽는 규칙은 **버리고**, 그 규칙의 scope 를 **사람에게 올린다**.
//   scope 조차 알 수 없으면 올릴 자리가 없으므로 그냥 버린다(어차피 아무 데도 안 주입됐다).
//
// throw 하지 않는다. 오타 하나로 게이트가 죽으면 사람이 그 파일을 지워서 우회한다.
//
// 본문은 파싱하지 않는다. 통째로 넘긴다 — 본문에서 값을 긁으면 숨은 스키마가 된다(v3.2 교훈).

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { frontmatterText, fmField, fmList, dupKeys } from "./frontmatter.mjs";

export const POLICY_STATUS = ["confirmed", "provisional"];
export const POLICY_SCOPES = ["ui", "data-model", "api", "copy"];

/**
 * 파일 내용에서 읽는다. 테스트·대조용으로 따로 열어 둔다.
 * 반환: { id, scope, status, lastApplied, body, dropped, escalate, problems }
 *   dropped  이 규칙을 근거로 쓸 수 없다
 *   escalate 이 규칙 때문에 사람에게 올려야 하는 scope 목록(버려졌을 때만 채워진다)
 */
export function readPolicyText(src, slug = "") {
  const problems = [];
  const drop = (why, escalate) => ({
    id: slug, scope: [], status: null, lastApplied: "", body: "",
    dropped: true, escalate, problems: [...problems, why],
  });

  const fmText = frontmatterText(src);
  if (fmText === null)
    return drop("frontmatter 가 없다 → 버린다(어느 scope 인지 알 수 없어 올릴 자리도 없다)", []);

  // scope 를 먼저 읽는다 — 뒤에서 버리게 되더라도 '어디를 올릴지'는 알아야 한다.
  const scope = [];
  for (const t of fmList(fmText, "scope") ?? []) {
    if (POLICY_SCOPES.includes(t)) scope.push(t);
    else problems.push(`scope 값 '${t}' 은 등재된 어휘가 아니다 → 그 값만 버린다`);
  }

  const dups = dupKeys(fmText);
  if (dups.length > 0)
    return drop(`같은 키가 두 번 있다(${dups.join("·")}) → 어느 줄을 읽었는지 모르므로 버리고 올린다`, scope);

  const id = fmField(fmText, "id") ?? "";
  if (slug !== "" && id !== slug)
    return drop(`id '${id}' 가 파일명 '${slug}' 과 다르다 → 버리고 올린다`, scope);

  const status = fmField(fmText, "status") ?? "";
  if (!POLICY_STATUS.includes(status))
    return drop(`status 값 '${status}' 은 등재된 어휘가 아니다 → 버리고 올린다`, scope);

  if (scope.length === 0) return drop("남은 scope 가 없다 → 버린다", []);

  const end = src.indexOf("\n---", src.indexOf("---") + 3);
  const body = end === -1 ? "" : src.slice(src.indexOf("\n", end + 1) + 1);

  return {
    id, scope, status,
    lastApplied: fmField(fmText, "last_applied") ?? "",
    body, dropped: false, escalate: [], problems,
  };
}

/** 파일 경로에서 읽는다. 파일명이 곧 slug 다(스펙과 같은 규약). */
export function readPolicy(file) {
  return readPolicyText(readFileSync(file, "utf-8"), basename(file).replace(/\.md$/, ""));
}
```

## 붙은 뒤 확인

```
node scripts/check-read-policy.mjs
```

붙기 전은 **8/9**(A 만 실패), 붙은 뒤는 **9/9** 여야 한다. 그 밖의 숫자가 나오면 붙이다 만 것이다.

검사 항목 중 둘이 각도가 다른 그물이다.

- **S** 는 잘못된 값을 잡는지 본다 — 어휘 밖 `status` 를 심으면 규칙이 버려지고 `scope` 가 올라가고,
  지우면 다시 읽힌다. 심은 것이 잡히고 지우면 통과하는 것까지 봐야 검사가 살아 있다는 근거가 된다.
- **G** 는 잡지 말아야 할 것을 안 잡는지 본다 — 본문에 `status: nonsense` 같은 줄이 있어도 판정이
  안 바뀐다. **이 방향은 신고를 늘리지 않고 조용히 판정만 바꾸므로 S 로는 영영 안 잡힌다.**
  본문이 파싱에 새어 들어오면 여기서만 드러난다.

기존 검사도 그대로여야 한다: `check-read-spec` 8/8, `check-docs-boundary` 7/7,
`check-handover-rehearsal` 3/3, `check-mirror-sync` 5/5, 그리고 `run-gates` 통과.
