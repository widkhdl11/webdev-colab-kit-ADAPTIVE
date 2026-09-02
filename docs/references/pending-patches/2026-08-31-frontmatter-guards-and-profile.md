# 패치 — 프론트매터 중복 키 거부 · 외래 사인오프 마커 거부 · 요약 줄에 스택 판정 (2026-08-31)

보호 파일 **하나**(`gates/run-gates.mjs`)에 훅 **둘**을 붙인다. 서로 독립이고 검사기도 따로다.
**붙이기 전에 검사가 실패하고, 붙인 뒤에 통과한다.**

```
node scripts/check-frontmatter-guards.mjs     # 훅 A — 붙기 전 2/5, 붙인 뒤 5/5
node scripts/check-profile-summary.mjs        # 훅 B — 붙기 전 1/2, 붙인 뒤 2/2
```

두 검사기는 임시 디렉터리에 킷을 복사해 **실제로 게이트를 돌린다** — 소스 문자열 대조가 아니고,
이 레포의 파일은 하나도 건드리지 않는다. 붙이기 전에 후보를 미리 확인하려면 `--gate <파일>`.

## 붙이기 전 (지금 이 레포에서 실측)

```
✗ A 중복 키 감지   surfaces 가 두 줄인데 통과했다 (종료 0)
✗ B 외래 마커 감지 다른 프로젝트의 사인오프가 그대로 통과했다 (종료 0)
✗ C 귀속 미기재    귀속이 안 적힌 마커가 통과했다 (종료 0)
✓ D 과차단 없음    중복 없는 스펙·design-rules 는 통과한다
✓ E 자기 마커      project: probe 마커는 통과한다              → 2/5

요약 줄: 게이트 통과 (2개 파일, 2개 프로젝트, quick — tsc·test 는 안 돌림)
✗ F 프로파일 표시  요약 줄에 프로젝트별 스택 판정이 없다
✓ G 기존 정보 보존 파일 수·프로젝트 수·quick 표기가 그대로다   → 1/2
```

## 붙인 뒤 (후보를 끼워 미리 실측한 값)

```
✓ A · ✓ B · ✓ C · ✓ D · ✓ E                                   → 5/5

요약 줄: 게이트 통과 (2개 파일, 2개 프로젝트: probe-next=nextjs-fsd, probe-vite=vite-fsd, quick — …)
✓ F · ✓ G                                                      → 2/2
```

지금도 통과하는 `D`·`E`·`G` 는 **이 패치가 멀쩡한 것까지 막지 않는지** 보는 검사다.
이 패치는 게이트를 **조이는** 방향이라 실패 방향이 과차단이다 — 멀쩡한 파일이 매 턴 걸리면
값싼 우회(파일을 지우기)가 생기고, 그게 이 패치가 막으려던 일이다.

## 부분 적용 조합 (CLAUDE.md 규칙 — 한쪽만 붙은 상태를 하나씩 확인했다)

| 붙은 것 | `check-frontmatter-guards` | `check-profile-summary` |
|---|---|---|
| 없음 | 2/5 | 1/2 |
| 훅 A 만 | **5/5** | 1/2 |
| 훅 B 만 | 2/5 | **2/2** |
| 둘 다 | **5/5** | **2/2** |

**어느 조합에서도 한쪽이 다른 쪽을 무력화하지 않는다.** 훅 A는 `errors.push` 만 하고 훅 B는
통과 요약 줄만 고친다 — 훅 A가 에러를 내면 그 줄은 애초에 안 찍히므로 순서 문제가 없다.
한쪽만 붙으면 **그쪽 검사기만 통과하고 다른 쪽은 그대로 실패로 남는다**(위 표) — 아무도 안 보는
상태가 생기지 않는다.

## 줄 참조 — 이 패치로 밀리는 것은 없다

`gates/run-gates.mjs` 를 가리키는 문서 참조는 37개이고 **가장 아래가 L504** 다
(`node scripts/check-doc-refs.mjs --file gates/run-gates.mjs`). 훅 A는 L557 뒤에, 훅 B는 L577 근처에
들어가므로 참조 하나도 안 밀린다. 그래서 훅 A를 `specSurfaces` 옆이 아니라 파일 끝쪽에 뒀다.

붙인 뒤 확인만 한 번:

```
node scripts/check-doc-refs.mjs --file gates/run-gates.mjs   # 참조 37개 · 의심 2건(패치 전과 같음)
```

---

## 무엇이 문제인가

### ① 프론트매터에 같은 키가 두 번 있으면 게이트가 조용히 하나를 고른다

게이트는 프론트매터를 정규식 한 줄로 읽는다. 그런데 키가 두 번 나오면 **어느 줄을 읽는지가
키마다 다르고**, 어느 줄을 읽었는지는 아무 데도 안 나온다. 게이트 소스의 판정식
(`run-gates.mjs:258` · `spec-coverage.mjs:36`)을 그대로 옮겨 돌린 결과다:

```
프론트매터:  status: draft
             surfaces: []
             # 이력
             status: approved   # 2026-08-02 승인 (옛 프로젝트)
             surfaces: [concurrency]

status approved 로 읽히나: true          ← draft 가 먼저 있어도 승인으로 읽는다
surfaces 로 읽는 줄     : surfaces: []   ← 아래 [concurrency] 는 버려진다
```

`status` 는 `.test()` 라 **한 줄이라도** approved 면 승인이다(순서 무관 — 방벽이 열리는 방향).
`surfaces` 는 `.match()` 라 **첫 줄만** 읽는다(선언이 조용히 버려지는 방향).

**실제로 났다.** 2026-08-31 세션에 `ingestion-ranking.md` 아래쪽에 이미 `surfaces: [concurrency]` 가
있는데 위에 `surfaces: []` 를 더 넣었고, 빈 값이 원래 선언을 덮고 있었다. 아무 신호도 없었다.

같은 원인의 기록이 백로그에 하나 더 있다 — "포매터가 프론트매터 `status` 를 접어 게이트를
조용히 무력화한다"(2026-08-06). 프론트매터를 정규식 한 줄로 읽는 방식 전체가 이 모양이다.

**왜 거부가 맞나.** YAML 사양에서도 중복 키는 오류다. 이 훅은 판정을 바꾸지 않는다 —
"어느 줄을 읽었는지 모르는 상태"를 통과시키지 않을 뿐이다. 느슨해지는 방향이 아니다.

**과차단 실측**: 지금 레포의 판정 대상 파일 8개(스펙 6 · design-rules 2)에 돌리면 **0건**이다.

### ② 사인오프 마커가 프로젝트를 넘어 이사한다

`workspace/review.md` 는 "이 프로젝트의 이 코드를 리뷰했다"는 기록인데, **파일 안에 어느
프로젝트인지가 없다.** 그래서 `workspace/` 를 복사하면 남의 사인오프가 그대로 따라온다.

2026-08-31 에 실제로 났다 — signal2 를 열면서 다른 프로젝트의 `review.md`
(`status: passed`, basis `b853ea0606f5`, reviewers 목록, 720줄)와 `deploy.md` 가 통째로 들어왔다.
signal2 에는 리뷰한 코드도 배포한 것도 없었다.

그때 막은 것은 basis 불일치였다. **그런데 basis 는 graph-stop 이 매 턴 화면에 찍어주는 값이다** —
그 줄만 베껴 넣으면 리뷰 없이 통과한다. 백로그의 "신고만으로 넘어가는 자리"가 적어둔 모양이고,
그 항목의 승격 트리거("승인 없이 approved 로 넘어간 사례가 1회라도 관찰되면")가 충족됐다.

**대조할 출처가 여기엔 있다 — 파일이 놓인 경로다.** 백로그가 이 계열을 미뤄둔 이유는
"사용자가 승인했다를 기계가 볼 방법이 없다"였는데, 이 훅은 그걸 보지 않는다.
**"이 기록이 이 프로젝트 것인가"만 본다.**

**한계(정직하게)**: 같은 프로젝트 안에서 지어낸 사인오프는 여전히 못 잡는다. 이건 이사만 잡는다.

**도입 비용**: 앞으로 사인오프 마커에 `project: <이름>` 한 줄이 더 필요하다. 지금 레포에는
`review.md`·`deploy.md` 가 **하나도 없어서**(2026-08-31 에 지웠다) 고쳐야 할 기존 파일이 없다.
게이트 메시지가 무엇을 적어야 하는지 그대로 말해 준다.

**차단 성격**: 두 카테고리 다 `GATE_KIND` 에 없으므로 **턴을 막는다**(기본값). 그래프가 처방한
상태에서 비롯된 실패가 아니라 파일이 모호하거나 남의 것인 상태고, 고치는 값이 한 줄이라
차단이 맞다.

### ③ 게이트가 어느 스택으로 판정했는지 안 보인다

게이트는 `isNextProject()`(= `next.config.*` 존재)로 스택을 판정하고 분기한다 —
`design/BEFORE_UI` 가 `src/app/**/page.*` 를 화면으로 볼지가 여기서 갈린다.
그런데 판정 결과가 아무 데도 안 찍혀서, 잘못 판정해도 조용히 지나간다.

2026-08-31 에 `scripts/scaffold.mjs` 에 **두 번째 판정 지점**(`resolveProfile()`)이 생겼고
근거가 다르다(새 프로젝트는 `next.config.*` 가 아직 없어서 `docs/tech-stack.md` 의
`architectures/<이름>.md` 링크를 1순위로 본다). 백로그 항목 "스택 판정을 `projectProfile()`
하나로 모으기"의 승격 트리거가 이걸로 발동했다.

**통합은 이번에 안 한다.** 지금 어긋남은 scaffold 가 "문서와 디스크가 다르면 멈춘다"로 막고
있고(`scripts/check-scaffold-profile.mjs` 29/29), 통합은 `gates/` 와 `scripts/` 를 같이 고치는
패치라 부분 적용 조합이 생긴다. 이번엔 **가정을 매 실행마다 보이게** 하는 절반만 한다.

**이 줄이 보장하지 않는 것**: 찍히는 건 게이트의 판정 하나다. scaffold 의 판정과 일치하는지는
여기서 안 본다 — 그건 통합 항목으로 백로그에 남는다.

---

## 훅 A — 프론트매터 중복 키 · 외래 사인오프 마커

**넣을 자리**: 이 줄 **바로 위**(`gates/run-gates.mjs`, 지금 L558).

```js
// 위험 표면 예외는 통과시키되 매번 보이게 남긴다 — 예외가 쌓여 아무도 모르게 방벽이 사라지는 걸 막는다.
```

`if (!QUICK) { … }` 블록이 닫힌 **뒤**여야 한다 — 편집 즉시(`--quick`) 걸려야 하는 검사다.

```js
// ── 프론트매터를 근거로 판정하는 파일: 모호한 입력과 외래 마커를 거부한다 ────────
//
// 게이트는 프론트매터를 정규식 한 줄로 읽는다. 같은 키가 두 번 나오면 해석이 키마다 갈린다:
//   status   → `/^\s*status:\s*approved\b/m.test()` 라 **한 줄이라도** approved 면 승인으로 읽는다(순서 무관).
//   surfaces → `fmText.match()` 라 **첫 줄만** 읽고 나머지는 버린다.
// 2026-08-31 에 실제로 났다 — ingestion-ranking.md 아래쪽의 `surfaces: [concurrency]` 를
// 위에 넣은 `surfaces: []` 가 덮었고 아무 신호도 없었다. YAML 사양에서도 중복 키는 오류다.
// 판정을 바꾸는 게 아니라 '어느 줄을 읽었는지 모르는 상태'를 통과시키지 않는다.
//
// 사인오프 마커(review·deploy)는 "이 프로젝트의 이 코드를 봤다"는 기록인데 파일 안에 어느
// 프로젝트인지가 없다. 그래서 workspace/ 를 복사하면 남의 사인오프가 그대로 따라온다
// (2026-08-31 signal2: status: passed · basis · reviewers 720줄이 통째로 이사 왔다).
// 대조할 출처는 있다 — 파일이 놓인 경로다. 같은 프로젝트 안에서 지어낸 사인오프는 여전히 못 잡는다.
function frontmatterOf(file) {
  try {
    return readFileSync(file, "utf-8").match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? null;
  } catch {
    return null;
  }
}
function dupKeys(fmText) {
  const seen = new Map();
  for (const line of fmText.split("\n")) {
    const m = line.match(/^[ \t]*([A-Za-z_][\w-]*):/);
    if (m) seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  }
  return [...seen].filter(([, c]) => c > 1).map(([k, c]) => `${k}(${c}줄)`);
}
for (const projDir of projectDirs) {
  const projName = relative(PROJECTS, projDir);
  const judged = [];
  const specDir = join(projDir, "docs", "specs");
  try {
    for (const f of readdirSync(specDir))
      if (f.endsWith(".md") && !f.startsWith("_") && statSync(join(specDir, f)).isFile())
        judged.push(join(specDir, f));
  } catch {}
  for (const rel of [["docs", "design", "design-rules.md"], ["workspace", "review.md"], ["workspace", "deploy.md"]]) {
    const f = join(projDir, ...rel);
    if (existsSync(f)) judged.push(f);
  }
  for (const f of judged) {
    const fm = frontmatterOf(f);
    if (fm === null) continue; // frontmatter 부재는 여기서 안 본다 — 그래프(graph-stop)가 판정한다
    const dup = dupKeys(fm);
    if (dup.length)
      errors.push(
        `[frontmatter/DUPLICATE_KEY] ${relative(ROOT, f)} — 같은 키가 두 줄 이상이다: ${dup.join(", ")}. ` +
          `게이트는 한 줄만 읽는데 어느 줄인지가 키마다 다르다(status 는 한 줄이라도 approved 면 승인, surfaces 는 첫 줄만). ` +
          `한 줄만 남기고 나머지는 지우거나 frontmatter 밖 이력으로 옮겨라.`,
      );
    if (!/[\\/]workspace[\\/](review|deploy)\.md$/.test(f)) continue;
    const owner = fm.match(/^[ \t]*project:[ \t]*(\S+)/m)?.[1];
    if (owner !== projName)
      errors.push(
        `[signoff/FOREIGN_MARKER] ${relative(ROOT, f)} — ` +
          (owner ? `project: ${owner} 라고 적혀 있는데 ` : "project: 가 없는데 ") +
          `이 마커는 ${projName} 의 것이다. 사인오프는 이 프로젝트의 이 코드를 봤다는 기록이라 ` +
          `다른 프로젝트에서 복사해 오면 안 된다. 여기서 실제로 리뷰/배포했으면 'project: ${projName}' 을 ` +
          `적고, 아니면 파일을 지워라.`,
      );
  }
}

```

**판정 범위를 왜 이렇게 잡았나**

- 스펙은 `docs/specs/*.md` **비재귀**, `_` 접두 제외 — `approvedSurfaces()` 와 같은 범위다.
  범위가 다르면 게이트가 읽는 파일과 검사하는 파일이 갈린다.
- `frontmatter` 자체가 없는 파일은 여기서 판정하지 않는다. 그건 `graph-stop` 의 `frontmatterOK`
  가 이미 보는 것이고, 여기서 또 막으면 같은 사실로 두 군데서 걸린다.
- 중첩 키까지 센다(`^[ \t]*키:`) — 게이트들이 `^\s*키:` 로 읽기 때문이다. 세는 방식이 읽는
  방식과 다르면 "검사는 통과했는데 게이트는 다른 줄을 읽는" 자리가 생긴다.

## 훅 B — 통과 요약 줄에 스택 판정

**바꿀 자리**: `gates/run-gates.mjs` 끝(지금 L577~579).

찾기:

```js
const n = projectDirs.length;
console.log(
  `게이트 통과 (${fileCount}개 파일, ${n}개 프로젝트` +
```

바꾸기:

```js
const n = projectDirs.length;
// 스택 판정도 같이 찍는다 — 게이트가 무엇을 가정하고 돌았는지 안 보이면 오판정이 조용히 지나간다.
// 여기 찍히는 건 게이트의 판정(next.config.* 존재) 하나다. scaffold 는 docs/tech-stack.md 의
// architectures/<이름>.md 링크로 따로 판정하므로, 이 줄이 둘의 일치까지 보장하지는 않는다.
const profiles = projectDirs.map((p) => `${relative(PROJECTS, p)}=${isNextProject(p) ? "nextjs-fsd" : "vite-fsd"}`);
console.log(
  `게이트 통과 (${fileCount}개 파일, ${n}개 프로젝트: ${profiles.join(", ")}` +
```

붙이면 이 레포에서 이렇게 찍힌다(후보로 실측):

```
게이트 통과 (38개 파일, 2개 프로젝트: signal2=nextjs-fsd, wama=vite-fsd, quick — tsc·test 는 안 돌림)
```

---

## 붙인 뒤 할 것

```
node scripts/check-frontmatter-guards.mjs     # 5/5
node scripts/check-profile-summary.mjs        # 2/2
node gates/run-gates.mjs --quick              # 이 레포가 그대로 통과하는지 (실측: exit 0)
node scripts/check-doc-refs.mjs --file gates/run-gates.mjs   # 참조 37개 · 의심 2건 (패치 전과 같음)
```

후보 판정기로 이 레포 전체에 미리 돌려본 결과는 **exit 0** 이었다 — 새로 막히는 파일이 없다.

## `docs/LESSONS.md` 에 남길 기록 (보호 파일 — 사용자가 붙인다)

```markdown
## 2026-08-31 — 게이트가 한 줄만 읽는데 파일에는 여러 줄이 있을 수 있다

- 증상: 두 가지가 같은 모양으로 났다. ① 프론트매터에 `surfaces:` 를 두 줄 두자 게이트는 위의
  빈 선언만 읽고 아래의 `[concurrency]` 를 버렸다. 같은 파일의 `status:` 는 반대로 **한 줄이라도**
  approved 면 승인으로 읽는다(`.test()` 라 순서 무관) — 승인 안 한 스펙이 승인으로 읽히는 방향이다.
  두 키가 서로 반대 규칙인데 그게 선언된 적이 없고, 어느 줄을 읽었는지도 안 찍힌다.
  ② 다른 프로젝트의 `workspace/review.md`(`status: passed` · basis · reviewers)가 파일 복사로
  따라 들어왔다. 사인오프는 "이 프로젝트의 이 코드를 봤다"는 기록인데 파일 안에 프로젝트가 없다.
- 교훈: **판정 근거를 한 줄에서 뽑는 검사는, 그 줄이 하나뿐이라는 것을 스스로 확인해야 한다.**
  중복을 만난 자리에서 조용히 하나를 고르면 사람은 자기가 쓴 줄이 읽혔다고 믿는다. 그리고
  **기록이 무엇에 붙는 것인지는 기록 안에 적혀 있어야 한다** — 안 적혀 있으면 복사해 온 것과
  제 손으로 쓴 것이 구별되지 않는다. 승인 자체를 기계가 볼 방법은 여전히 없지만, 귀속은 볼 수 있다.
- 근거: 각 1회(2026-08-31 signal2 개설 세션). 앞의 것은 백로그 "포매터가 status 를 접어 게이트를
  무력화한다"(2026-08-06)와 원인이 같아 계열 2번째다.
- 반영 위치: gates/run-gates.mjs `frontmatter/DUPLICATE_KEY` · `signoff/FOREIGN_MARKER` (② 게이트 계열).
  검사: scripts/check-frontmatter-guards.mjs — 임시 킷에서 실제로 게이트를 돌린다(붙기 전 2/5, 후 5/5).
```
