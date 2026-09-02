# 보류 패치 — docs 경계 검사 a·b (v3.2 · 6단계)

보호 파일(`gates/run-gates.mjs`)을 고치므로 사용자가 직접 붙인다.
판정은 `node scripts/check-docs-boundary.mjs` 가 한다 — 코드를 읽지 않아도 된다.

> **적용 순서**: 이 패치는 `2026-09-02-read-spec-lib.md`(5단계) **다음에** 붙인다.
> 둘 다 `run-gates.mjs` 를 고치는데, 5단계가 `specSurfaces()` 를 지우고 이 패치는
> 새 블록을 더한다. 순서를 바꾸면 충돌 자체는 안 나지만 5단계의 diff 가 읽기 어려워진다.

## 무엇을 지키는가

v3.2 의 완료 상태는 이것이다 — **이전 = `projects/<이름>/docs/` 복사 + `docs/references/docs-contract.md` 전달.**
그러려면 `docs/` 안에 하네스만 아는 것이 없어야 한다. 사람이 매번 눈으로 보면 새어 나간다.

- **검사 a** — `projects/*/docs/specs/*.md` 의 frontmatter 에 `feature`·`status`·`surfaces` 외 필드가 있으면 실패
- **검사 b** — `projects/*/docs/**` 안에 하네스 구현 참조가 있으면 실패

## 검사 b 는 하한선이지 완료 판정이 아니다

문자열만 보므로 **구현 이름이 없는 하네스 서술은 못 잡는다.** 예를 들어

> 커버하지 않는 표면을 적으면 방벽이 그만큼 열린다

는 어느 게이트도 가리키지 않아 통과하는데, 실제로 하네스 이야기인지 프로젝트 규약인지는
문장을 읽어야 안다. **문장 단위 판정은 사람이 하고, 이 검사는 명백한 것만 막는다.**
이 한계는 `docs-contract.md` 에도 적는다.

반대 방향의 판단도 같이 정해져 있다(2026-09-02 사용자 판정): **결정의 근거로 쓰인 서술은 남긴다.**
"승인된 스펙은 불변식마다 테스트가 요구된다"는 프로젝트 지식이고, 그것을 강제하는 게이트의
**이름**이 하네스 사정이다. 그래서 금지 목록에는 이름만 들어간다.

## 금지 목록 (검사 b)

```js
const HARNESS_REFS = [
  { re: /\bgates\//,                                              what: "게이트 경로" },
  { re: /\b(run-gates|graph-stop|spec-coverage|propagate|graph)\.mjs\b/, what: "게이트 파일명" },
  { re: /\b(run-gates|graph-stop|spec-coverage)\b/,               what: "게이트 이름" },
  { re: /\b(BEFORE_UI|NO_INNERHTML|risk-surface)\b/,              what: "게이트 규칙 이름" },
  // 킷 스크립트는 이름으로만 막는다 — `scripts/` 를 통째로 막으면 프로젝트 자기 스크립트가 걸린다.
  { re: /\b(briefing|scaffold|preview|apply-migrations|build-explorer|extract-harness|remap-doc-refs|check-[\w-]+)\.mjs\b/, what: "킷 스크립트 이름" },
  { re: /(^|[\s(`"'])\.claude\//,                                 what: "하네스 설정 경로" },
  { re: /\bworkspace\//,                                          what: "과정 기록 경로" },
  { re: /^[ \t]*basis:/,                                          what: "사인오프 해시 필드" },
];
```

원 지시에서 두 개를 바꿨다.

- **`surfaces:` 를 뺐다.** 2026-09-02 판정 ① 로 `surfaces` 는 스펙 frontmatter 에 남는다 —
  하네스를 바꿔도 살아남아야 하는, 사람이 비준한 판단이기 때문이다. 금지하면 자기 문서가 걸린다.
- **`basis:` 를 줄 맨 앞 앵커로 좁혔다.** 넓게 두면 CSS 의 `flex-basis: 100%` 가 걸린다
  (실측: mockup HTML 2건). 사인오프 필드는 항상 줄 맨 앞이다.

## `run-gates.mjs` 에 더할 블록

기존 위험 표면 블록 뒤, `isNextProject()` 앞에 넣는다.

```js
// ── 1''''') docs 경계: 프로젝트 docs/ 는 하네스를 몰라야 한다 ─────────────────
//   v3.2 목표 — 이전이 projects/<이름>/docs/ 복사 + docs-contract.md 전달로 끝나야 한다.
//   그러려면 docs/ 안에 하네스만 아는 필드도, 하네스 구현을 가리키는 문장도 없어야 한다.
//
//   **이 검사는 하한선이다.** 문자열만 보므로 구현 이름이 없는 하네스 서술("적으면 방벽이
//   그만큼 열린다")은 못 잡는다. 문장 단위 판정은 사람이 한다 — docs-contract.md 참조.
//   반대로 결정의 근거로 쓰인 서술("승인된 스펙은 불변식마다 테스트가 요구된다")은
//   프로젝트 지식이라 일부러 통과시킨다. 금지하는 것은 구현의 '이름'뿐이다.
const SPEC_FM_FIELDS = ["feature", "status", "surfaces"];
const HARNESS_REFS = [
  { re: /\bgates\//, what: "게이트 경로" },
  { re: /\b(run-gates|graph-stop|spec-coverage|propagate|graph)\.mjs\b/, what: "게이트 파일명" },
  { re: /\b(run-gates|graph-stop|spec-coverage)\b/, what: "게이트 이름" },
  { re: /\b(BEFORE_UI|NO_INNERHTML|risk-surface)\b/, what: "게이트 규칙 이름" },
  { re: /(^|[\s(`"'])\.claude\//, what: "하네스 설정 경로" },
  { re: /\bworkspace\//, what: "과정 기록 경로" },
  // 줄 맨 앞 앵커 — 넓게 두면 CSS 의 flex-basis 가 걸린다(mockup 실측 2건).
  { re: /^[ \t]*basis:/, what: "사인오프 해시 필드" },
];

for (const projDir of projectDirs) {
  const docsDir = join(projDir, "docs");
  if (!existsSync(docsDir)) continue;
  for (const f of walk(docsDir)) {
    if (!/\.(md|html|css|txt|json|ya?ml)$/i.test(f)) continue;
    const rel = relative(ROOT, f);
    const src = readFileSync(f, "utf-8");

    // 검사 b — 하네스 구현 참조
    src.split("\n").forEach((line, i) => {
      for (const { re, what } of HARNESS_REFS) {
        if (!re.test(line)) continue;
        errors.push(
          `[docs-boundary/HARNESS_REF] ${rel}:${i + 1} — ${what}이 프로젝트 docs 에 있다. ` +
            `docs/ 는 하네스를 바꿔도 그대로 넘어가는 폴더다 — 하네스 사정은 킷(docs/LESSONS.md · ` +
            `docs/references/)으로 옮기고, 결정의 근거로 필요하면 구현 이름 없이 무슨 일이 ` +
            `일어나는지로 적는다.`,
        );
        break;   // 한 줄에 여러 패턴이 걸려도 한 번만 신고한다
      }
    });

    // 검사 a — 스펙 frontmatter 필드 화이트리스트
    if (!/[\\/]docs[\\/]specs[\\/][^\\/]+\.md$/.test(rel)) continue;
    const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) continue;
    for (const line of fm[1].split("\n")) {
      // 줄 맨 앞에서 시작하는 것만 필드다 — 들여쓴 줄과 `#` 주석은 값의 연속이다.
      const m = line.match(/^([A-Za-z_][\w-]*):/);
      if (!m || SPEC_FM_FIELDS.includes(m[1])) continue;
      errors.push(
        `[docs-boundary/FRONTMATTER_FIELD] ${rel} — frontmatter 에 '${m[1]}' 필드가 있다. ` +
          `허용된 것은 ${SPEC_FM_FIELDS.join("·")} 뿐이다(docs/references/docs-contract.md). ` +
          `기계가 읽는 값을 늘리려면 그 문서에 먼저 등재한다.`,
      );
    }
  }
}
```

`graph.mjs` 의 `GATE_KIND` 에 카테고리를 더할 필요는 없다 — 이 검사는 노드를 막는 게 아니라
편집을 막는 것이고, `docs-boundary` 는 어느 노드의 `clean_when.gate` 에도 안 들어간다.
(넣고 싶으면 `spec` 노드에 붙이는 것이 자연스럽지만, 그러면 `docs/DECISIONS.md` 위반이
`spec` 노드를 dirty 로 만든다 — 관계가 없어 혼란스럽다. 지금은 넣지 않는다)

## 붙인 뒤 확인

```
node scripts/check-docs-boundary.mjs   # S1·S2·A~E 전부 통과여야 한다
node gates/run-gates.mjs               # 기준선과 같아야 한다
```

붙기 전 상태에서는 S1·S2 가 실패하고 A~E 가 통과한다 (2026-09-02 실측: 5/7).

## 부분 적용

이 패치는 파일 하나(`run-gates.mjs`)에 블록 하나를 더한다. 쪼개서 붙을 여지가 없다 —
블록을 반만 붙이면 문법 오류로 게이트가 통째로 죽는다(요란하게 실패한다). 조합 표가 필요 없는
유일한 경우다.

다만 **5단계 패치와 함께 놓고 보면 조합이 넷이다.**

| 5단계 | 6단계 | 그 상태 | 안전한가 |
|---|---|---|---|
| X | X | 지금 | ○ |
| O | X | 파서만 한 자리로. 판정 동등(diff 0건) | ○ |
| X | O | 경계 검사만. 파서는 그대로 | ○ |
| O | O | 완성 | ○ |

두 패치가 같은 파일의 다른 자리를 고치고 서로를 참조하지 않아, 어느 조합에서도 판정이
바뀌지 않는다. 확인은 각자의 검사 스크립트가 한다.
