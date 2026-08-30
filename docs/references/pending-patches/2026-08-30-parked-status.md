# 패치 — 보류 스펙 상태 `status: parked` 도입 (2026-08-30)

보호 파일 둘을 고쳐야 한다. **붙이기 전에 검사가 실패하고, 붙인 뒤에 통과한다.**

```
node scripts/check-parked-status.mjs
```

붙이기 전 (지금):

```
✗ A 선언  graph.mjs 의 spec.clean_when.frontmatter 에 skip_when 이 없다 — 패치 ①이 아직 안 붙었다
✗ B 통과  parked 스펙이 있는데 spec 노드가 'dirty' 이다 — 패치 ②가 아직 안 붙었다
✓ C 방벽  parked 스펙은 auth 커버로 인정되지 않아 편집이 차단된다
✓ D 범위  draft 스펙은 여전히 spec 을 막는다 (dirty)
```

C·D 는 지금도 통과한다 — **이 패치가 그 둘을 깨뜨리지 않는지** 보는 검사다.
검사는 임시 디렉터리에 킷을 복사해 돌린다. 이 레포의 파일은 하나도 건드리지 않는다.

---

## 무엇을 고치나 (한 줄)

보류 스펙을 `docs/specs/planned/` 폴더로 **옮겨서** 표시하던 것을, 파일 안 `status: parked` 한 줄로 **적어서** 표시하게 바꾼다.

## 왜

`ingestion-ranking.md` 가 `planned/` 에서 나와 활성화됐는데, 그 파일을 가리키던 문장 셋이 안 따라왔다 —
`PRODUCT.md:95` · 스펙 파일 자신의 9줄 · `review.md:34`. 위치로 상태를 표시하면 활성화할 때 파일이
움직이고, 그 위치를 가리키던 문장은 조용히 낡는다. 알려 주는 검사도 없다(게이트가 하위 폴더를 안 본다).

## 이름을 `parked` 로 한 이유 — 중요

백로그가 원래 제안한 이름은 `approved-deferred` 였다. **그 이름이면 방벽이 열린다.**
게이트의 검사식이 `/^\s*status:\s*approved\b/m` 인데, `\b` 가 하이픈을 단어 경계로 인정한다:

```
true   status: approved
true   status: approved-deferred     ← 승인으로 통과한다
false  status: parked
```

즉 `approved-deferred` 스펙이 위험 표면(auth·payment·authz·concurrency)을 덮는다고 주장하면
`risk-surface` 게이트가 그걸 승인된 커버로 인정한다. **`status: approved` 로 시작하는 값은 쓰면 안 된다.**
검사기 A 가 이 조건을 기계로 지킨다.

---

# ① `graph.mjs` — spec 노드 (48~55줄)

## 찾을 것

```js
  spec: {
    depends_on: ["product"],
    produces: ["docs/specs/*.md"],
    clean_when: {
      frontmatter: { path: "docs/specs/*.md", require: "status: approved" },
      gate: ["spec-coverage"], // approved INV 마다 참조 테스트 존재
    },
  },
```

## 바꿀 것

```js
  spec: {
    depends_on: ["product"],
    produces: ["docs/specs/*.md"],
    clean_when: {
      // skip_when: 파일이 "나는 아직 활성 계약이 아니다"라고 스스로 선언하면 이 노드를 막지 않는다.
      //   보류 스펙을 docs/specs/planned/ 로 옮겨 감추던 관례를 대신한다 — 위치로 상태를 표시하면
      //   활성화할 때 파일이 움직이고, 그 위치를 가리키던 문장들이 조용히 낡는다(2026-08-30 실측 3건).
      //   ★ 값이 require 값으로 시작하면 안 된다: 검사식의 \b 가 하이픈을 단어 경계로 봐서
      //     'status: approved-deferred' 가 'status: approved' 검사를 통과한다. 그래서 parked 다.
      //   parked 는 run-gates 의 approvedSurfaces(approved 만 본다)에 안 걸리므로 위험 표면 커버가
      //   되지 못한다 — 위험 스펙을 미루면 그 코드의 편집이 차단된다. 미루기는 도망이 아니라 막다른 길이다.
      frontmatter: { path: "docs/specs/*.md", require: "status: approved", skip_when: "status: parked" },
      gate: ["spec-coverage"], // approved INV 마다 참조 테스트 존재
    },
  },
```

**바뀐 것은 `frontmatter` 줄에 `skip_when: "status: parked"` 하나 추가 + 주석.**

---

# ② `gates/graph-stop.mjs` — `frontmatterOK` (172~184줄)

## 찾을 것

```js
function frontmatterOK(cw) {
  if (!cw?.frontmatter) return true;
  const files = matchProduces([cw.frontmatter.path]);
  if (files.length === 0) return true; // 대상 없음 → 막지 않음
  const [k, v] = cw.frontmatter.require.split(":").map((x) => x.trim());
  // 줄 시작 앵커: status 등은 frontmatter 의 구조화된 필드 — 주석 뒤 같은 토큰을 값으로 오인하지 않게. (retro 2026-08-02)
  const re = new RegExp(`^\\s*${k}:\\s*${v}\\b`, "m");
  return files.every((rel) => {
    const src = readFileSync(join(projDir, rel), "utf-8");
    const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    return fm && re.test(fm[1]);
  });
}
```

## 바꿀 것

```js
function frontmatterOK(cw) {
  if (!cw?.frontmatter) return true;
  const files = matchProduces([cw.frontmatter.path]);
  if (files.length === 0) return true; // 대상 없음 → 막지 않음
  const [k, v] = cw.frontmatter.require.split(":").map((x) => x.trim());
  // 줄 시작 앵커: status 등은 frontmatter 의 구조화된 필드 — 주석 뒤 같은 토큰을 값으로 오인하지 않게. (retro 2026-08-02)
  const re = new RegExp(`^\\s*${k}:\\s*${v}\\b`, "m");
  // skip_when: 파일이 "나는 아직 활성 계약이 아니다"라고 선언하면 그 파일은 이 노드를 막지 않는다.
  // 보류 스펙(status: parked)이 그것이다 — 폴더로 감추는 대신 파일 안에 적는다(graph.mjs 주석 참조).
  // 건너뛰는 것은 '이 노드를 막는가'뿐이다: risk-surface 커버 판정은 run-gates 가 따로 하고
  // approved 만 인정하므로, parked 로는 위험 표면을 통과시킬 수 없다.
  let skipRe = null;
  if (cw.frontmatter.skip_when) {
    const [sk, sv] = cw.frontmatter.skip_when.split(":").map((x) => x.trim());
    skipRe = new RegExp(`^\\s*${sk}:\\s*${sv}\\b`, "m");
  }
  return files.every((rel) => {
    const src = readFileSync(join(projDir, rel), "utf-8");
    const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) return false;
    if (skipRe && skipRe.test(fm[1])) return true; // 보류 선언 → 이 노드를 막지 않는다
    return re.test(fm[1]);
  });
}
```

**바뀐 것**: `skipRe` 를 만드는 5줄 추가 + 마지막 `return fm && re.test(fm[1])` 을 세 줄로 풀어 씀
(`fm` 없으면 false → skip 이면 true → 아니면 원래 검사).

---

## 절반만 붙으면 어떻게 되나

| 붙은 것 | 결과 |
|---|---|
| ① 만 | `skip_when` 선언은 있는데 읽는 쪽이 없다 → 무시된다. **지금과 같음** |
| ② 만 | 읽는 쪽은 있는데 선언이 없다 → `skipRe` 가 null 이라 아무것도 안 건너뛴다. **지금과 같음** |

둘 다 안전한 쪽으로 실패한다. 다만 "고쳤는데 왜 안 되지"가 되므로, 검사기 A·B 가 어느 쪽이 빠졌는지 말한다.

## 붙인 뒤

```
node scripts/check-parked-status.mjs     # 4/4 통과여야 한다
node scripts/check-hooks.mjs             # 보호가 여전히 도는지 (이 패치와 무관하지만 같이 확인)
```
