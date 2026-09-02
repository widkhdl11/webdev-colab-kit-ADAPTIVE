# 보류 패치 — 스펙 frontmatter 를 읽는 자리를 `gates/lib/` 하나로 모은다 (v3.2 · 5단계)

보호 파일(`gates/`)을 고치므로 사용자가 직접 붙인다.
붙었는지·판정이 그대로인지는 `node scripts/check-read-spec.mjs` 가 판정한다 — 코드를 읽지 않아도 된다.

## 지금 무엇이 문제인가

frontmatter 블록을 떼고 필드를 읽는 코드가 네 곳에 복붙돼 있다.

| 자리 | 읽는 것 | 방식 |
|---|---|---|
| `gates/spec-coverage.mjs:34-35` | 스펙 status | `^\s*status:\s*approved\b` 를 `test()` |
| `gates/run-gates.mjs` `specSurfaces()` | 스펙 surfaces | `^[ \t]*surfaces:` 를 `match()` |
| `gates/run-gates.mjs` `designApproved()` | design-rules status | 자체 정규식 |
| `gates/graph-stop.mjs` `frontmatterOK()`·`fmList()` | graph.mjs 가 지정한 임의 키 | 자체 정규식 |

`test()` 와 `match()` 의 차이가 사고를 냈다 — status 는 **한 줄이라도** approved 면 승인으로 읽고
surfaces 는 **첫 줄만** 읽는다. 2026-08-31 에 `ingestion-ranking.md` 아래쪽의 `surfaces: [concurrency]`
를 위에 넣은 `surfaces: []` 가 덮었고 아무 신호도 없었다. 그 차이를 한자리에서 볼 수 있는 곳이 없었다.

## 무엇을 바꾸는가 — 두 층

- **`gates/lib/frontmatter.mjs`** — frontmatter 블록 떼기와 필드 읽기. 지금 네 곳에 복붙된 정규식이
  여기 하나가 된다.
- **`gates/lib/read-spec.mjs`** — 스펙 전용. `readSpec(file)` → `{ slug, feature, status, surfaces, problems }`.
  어휘를 검증하고, 모르는 값은 **더 엄격한 쪽**으로 떨어뜨린다.

**범용 소비자는 `frontmatter.mjs` 만 쓰고 자기 로직을 유지한다.** `graph-stop` 의 `frontmatterOK()` 는
`graph.mjs` 의 `clean_when.frontmatter: {path, require, skip_when}` 를 그대로 실행하는 범용 함수라
`spec` 노드와 `design/page-designer` 노드가 같이 쓴다. 여기에 `readSpec(slug)` 을 밀어넣으면 그
범용성이 깨진다. 그래서 `graph.mjs` 설정이 만드는 `status: approved` 검사식은 남는다 — 없애려면
graph.mjs 의 노드 스키마를 바꿔야 하고 그건 이 패치의 범위 밖이다.

## 어휘와 실패 방향 (이 패치의 핵심)

```
status   : draft · approved · parked        → 모르는 값이면 draft 로 본다
surfaces : auth · payment · authz · concurrency → 모르는 값은 커버로 인정하지 않는다
```

**어휘 검증 실패는 throw 하지 않는다.** 스펙 단위 오류로 모아 `problems` 에 담고 진행한다.
오타 하나가 게이트 전체를 죽이면 사람이 그 스펙을 지워서 우회하게 된다.

두 방향 모두 **더 엄격한 쪽**이라는 점이 중요하다. 미등재 표면을 "일단 인정"하면 방벽이 조용히
열리고, 미등재 status 를 approved 로 읽으면 승인 안 된 스펙이 구현을 허가한다. 막히는 것은
시끄럽지만 안전하다.

**현행 코드도 이미 이 두 방향으로 떨어진다** (`check-read-spec` 의 D·E 가 붙기 전에도 통과한다).
그러니 이 패치가 새로 만드는 성질이 아니라 **깨뜨리면 안 되는 성질**이다.

## 부분 적용 — 순서를 지키면 어느 조합에서도 안전하다

이 패치는 파일 넷을 고친다(신규 2 + 수정 2). **반드시 이 순서로 붙인다.**

1. `gates/lib/frontmatter.mjs` (신규)
2. `gates/lib/read-spec.mjs` (신규)
3. `gates/spec-coverage.mjs` (수정)
4. `gates/run-gates.mjs` (수정)

| 어디까지 붙었나 | 그 상태의 동작 | 안전한가 |
|---|---|---|
| 1만 | 아무도 안 쓰는 파일 하나. 동작 변화 0 | ○ |
| 1–2 | 위와 같다 | ○ |
| 1–3 | spec-coverage 만 새 파서. run-gates 는 구 파서. 두 파서의 판정이 같으므로(G 검사) 동작 변화 0 | ○ |
| 1–4 | 완성 | ○ |
| **3 또는 4 먼저** | `import` 실패로 게이트가 통째로 죽는다 | **✗ (그러나 조용하지 않다)** |

역순은 `Cannot find module` 로 요란하게 죽는다 — 조용한 오작동이 아니라 즉시 보이는 실패라
사고로 이어지지 않는다. 그래도 순서를 지키는 편이 낫다.

**절반만 붙은 상태(1–3)가 안전한 근거는 G 검사다** — 현행 스펙 8건 전부에서 구 파서와 신 파서의
`{status, surfaces}` 가 같다는 것이 실측으로 확인됐다(2026-09-02, 차이 0건). 스펙이 추가되면
붙이기 전에 `node scripts/check-read-spec.mjs --diff` 를 다시 돌린다.

## 신규 파일 둘은 완성본이 레포에 있다 — 복사만 하면 된다

```
docs/references/pending-patches/v3.2-gates-lib/frontmatter.mjs  →  gates/lib/frontmatter.mjs
docs/references/pending-patches/v3.2-gates-lib/read-spec.mjs    →  gates/lib/read-spec.mjs
```

**터미널(Claude Code 밖)에서:**

```bash
mkdir -p gates/lib
cp docs/references/pending-patches/v3.2-gates-lib/frontmatter.mjs gates/lib/
cp docs/references/pending-patches/v3.2-gates-lib/read-spec.mjs   gates/lib/
```

Claude Code 안에서는 안 된다 — protect-files 훅이 `gates/` 로 쓰는 명령을 막는다.
그게 이 패치를 사람이 붙이는 이유다. 아래 두 절은 그 파일들의 내용이니 대조용으로만 보면 된다.

## 파일 1 — `gates/lib/frontmatter.mjs` (신규)

```js
// frontmatter 를 읽는 한 자리. 게이트 넷이 각자 들고 있던 정규식을 여기로 모았다.
//
// 왜 한 자리인가 (2026-08-31): 같은 frontmatter 를 test() 로 읽는 곳과 match() 로 읽는 곳이
// 달라서, 같은 키가 두 줄일 때 어느 줄이 이기는지가 키마다 달랐다. 복붙이라 한 곳을 고쳐도
// 나머지가 안 따라왔고, 그 차이를 한자리에서 볼 수 있는 곳이 없었다.

/** `---` 블록 안의 텍스트. 없으면 null. */
export function frontmatterText(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}

/** `key: 값` 의 값. 값 뒤 주석(`# …`)은 잘라낸다. 필드가 없으면 null(빈 값과 구분한다). */
export function fmField(fmText, key) {
  const m = fmText.match(new RegExp(`^[ \\t]*${key}:[ \\t]*(.*)$`, "m"));
  if (!m) return null;
  return m[1].split("#")[0].trim();
}

/** 목록 필드. 인라인 `key: [a, b]` 와 블록 `key:` 다음 줄부터의 `- a` 둘 다 받는다. */
export function fmList(fmText, key) {
  const m = fmText.match(new RegExp(`^[ \\t]*${key}:[ \\t]*(.*)$`, "m"));
  if (!m) return null;
  const clean = (s) => s.split(",").map((x) => x.trim().replace(/['"]/g, "")).filter(Boolean);
  const inline = m[1].trim();
  const br = inline.match(/^\[([^\]]*)\]/);
  if (br) return clean(br[1]);
  if (inline && !inline.startsWith("#")) return clean(inline.split("#")[0]);
  const rest = fmText.slice(fmText.indexOf(m[0]) + m[0].length).split("\n").slice(1);
  const out = [];
  for (const line of rest) {
    const li = line.match(/^[ \t]*-[ \t]*([A-Za-z][\w-]*)/);
    if (!li) break;
    out.push(li[1]);
  }
  return out;
}

/** 같은 키가 두 번 이상 나오면 그 키 목록. 어느 줄을 읽었는지 모르는 상태를 잡는다. */
export function dupKeys(fmText) {
  const seen = new Map();
  for (const line of fmText.split("\n")) {
    const m = line.match(/^[ \t]*([A-Za-z_][\w-]*):/);
    if (m) seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([k]) => k);
}
```

## 파일 2 — `gates/lib/read-spec.mjs` (신규)

```js
// 스펙 frontmatter 의 유일한 읽기 경로. 어휘는 docs/references/docs-contract.md 가 정본이다.
//
// 실패 방향이 이 파일의 요점이다 — 모르는 값은 항상 더 엄격한 쪽으로 떨어진다.
//   status   모르는 값 → draft      (승인 안 된 것으로 본다)
//   surfaces 모르는 값 → 버린다      (그 표면을 커버하지 않는 것으로 본다)
// throw 하지 않는다. 오타 하나로 게이트가 죽으면 사람이 그 스펙을 지워서 우회한다.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { frontmatterText, fmField, fmList } from "./frontmatter.mjs";

export const SPEC_STATUS = ["draft", "approved", "parked"];
export const SPEC_SURFACES = ["auth", "payment", "authz", "concurrency"];

/** 파일 내용에서 읽는다. 테스트·대조용으로 따로 열어 둔다. */
export function readSpecText(src, slug = "") {
  const fmText = frontmatterText(src);
  const problems = [];
  if (fmText === null) return { slug, feature: "", status: "draft", surfaces: [], problems: ["frontmatter 없음 → draft 로 본다"] };

  const feature = fmField(fmText, "feature") ?? "";

  const rawStatus = fmField(fmText, "status") ?? "";
  let status = "draft";
  if (rawStatus === "") problems.push("status 필드가 없다 → draft 로 본다");
  else if (SPEC_STATUS.includes(rawStatus)) status = rawStatus;
  else problems.push(`status 값 '${rawStatus}' 은 등재된 어휘가 아니다 → draft 로 본다`);

  const surfaces = [];
  for (const t of fmList(fmText, "surfaces") ?? []) {
    if (SPEC_SURFACES.includes(t)) surfaces.push(t);
    else problems.push(`surfaces 값 '${t}' 은 등재된 어휘가 아니다 → 커버로 인정하지 않는다`);
  }

  return { slug, feature, status, surfaces, problems };
}

/** 파일 경로에서 읽는다. */
export function readSpec(file) {
  return readSpecText(readFileSync(file, "utf-8"), basename(file).replace(/\.md$/, ""));
}
```

## 파일 3 — `gates/spec-coverage.mjs` (수정)

**① 5번째 줄 `import { join, relative } from "node:path";` 바로 아래에 한 줄 넣는다.**

```js
import { readSpec } from "./lib/read-spec.mjs";
```

**② 아래 다섯 줄(현재 30~35줄쯤, `const invToSpec = new Map();` 다음 블록)을 찾아서**

```js
for (const f of specDirs.flatMap(walk).filter((f) => f.endsWith(".md"))) {
  const src = readFileSync(f, "utf-8");
  // status 는 frontmatter 의 구조화된 필드다 — 줄 시작 앵커로 값만 본다.
  // (주석 뒤에 등장하는 'approved' 글자를 값으로 오인하지 않게. retro 2026-08-02)
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm || !/^\s*status:\s*approved\b/m.test(fm[1])) continue;
```

**이렇게 바꾼다:**

```js
for (const f of specDirs.flatMap(walk).filter((f) => f.endsWith(".md"))) {
  const src = readFileSync(f, "utf-8");
  // status·surfaces 는 lib/read-spec.mjs 한 자리에서 읽는다. 어휘를 벗어난 값은
  // 더 엄격한 쪽(draft)으로 떨어지고, throw 하지 않고 경고만 남긴다.
  const spec = readSpec(f);
  for (const p of spec.problems) console.error(`⚠ [spec/VOCAB] ${relative(ROOT, f)} — ${p}`);
  if (spec.status !== "approved") continue;
```

그다음 줄(`for (const m of src.matchAll(...)` 로 시작하는 INV 정의 앵커 카운팅)은 **그대로 둔다** —
`docs-contract.md` 에 등재된 정식 규약이다.

## 파일 4 — `gates/run-gates.mjs` (수정)

**① 파일 맨 위 import 줄들 아래에 한 줄 넣는다.**

```js
import { readSpec } from "./lib/read-spec.mjs";
```

**② `function specSurfaces(fmText) { … }` 를 통째로 지운다.** 바로 위의 주석 두 줄
(`// 스펙 frontmatter 의 surfaces 를 읽는다. …`)도 같이 지운다. 현재 255~274줄쯤이고,
`const SURFACE_KEYS = Object.keys(RISK_SURFACES);` 다음부터 `function approvedSurfaces` 앞까지다.

**③ `approvedSurfaces()` 안의 두 줄을 바꾼다.** 찾을 것:

```js
    const fm = readFileSync(p, "utf-8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm || !/^\s*status:\s*approved\b/m.test(fm[1])) continue;
    for (const s of specSurfaces(fm[1])) if (!covered.has(s)) covered.set(s, relative(ROOT, p));
```

바꿀 것:

```js
    const spec = readSpec(p);
    for (const q of spec.problems) riskWarnings.push(`⚠ [spec/VOCAB] ${relative(ROOT, p)} — ${q}`);
    if (spec.status !== "approved") continue;
    for (const s of spec.surfaces) if (!covered.has(s)) covered.set(s, relative(ROOT, p));
```

`readFileSync` 를 더 이상 안 쓰지만 그 위의 `statSync` 검사와 `_` 접두 건너뛰기는 **그대로 둔다** —
비재귀 범위와 템플릿 제외는 그래프의 `spec` 노드 글롭과 맞춘 것이라 이 패치의 범위가 아니다.

> `riskWarnings` 가 그 시점에 선언돼 있는지 확인할 것. 안 돼 있으면 `console.error` 로 바꿔도 된다 —
> 판정은 안 바뀌고 경고를 어디에 싣느냐만 다르다.

`designApproved()` 는 스펙이 아니므로 `readSpec` 을 쓰지 않는다. 그대로 둔다.

## 붙인 뒤 확인

```
node scripts/check-read-spec.mjs          # A~G 전부 통과여야 한다
node scripts/check-read-spec.mjs --diff   # 차이 0건이어야 한다
node gates/run-gates.mjs                  # 기준선과 같아야 한다
```

붙기 전 상태에서는 A·B·C 가 실패하고 S·D·E·F·G 가 통과한다 (2026-09-02 실측: 5/8).
