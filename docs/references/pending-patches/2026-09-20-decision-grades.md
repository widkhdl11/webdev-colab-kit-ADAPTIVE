# 2026-09-20 — 결정 등급표를 코드로 (살림 판단 = 자동 결정)

보호 파일 **하나**를 고친다: `gates/lib/cycle-policy.mjs` 에 등급표와 판정 함수를 더한다.
검사 스크립트(`scripts/check-decision-grade.mjs`)는 보호 파일이 아니라 이미 붙어 있다.

## 왜

등급 기준이 `docs/references/decision-layer.md` 산문에만 있었다. 산문은 읽는 사람마다 경계가
달라지고, 어긋나도 아무 데도 안 걸린다. 실제로 **커밋을 언제 끊을지·push 할지·폴더를 어떻게
정리할지가 매번 사용자에게 올라갔다** — 되돌리는 비용이 거의 0인 것들인데도.

종료 판정(`closeVerdict`)과 승격 판정(`promotionPending`)이 이미 이 파일에 있다. 등급도
같은 자리에 둔다 — 게이트·훅·검사가 전부 같은 값을 본다.

## 적용 전 판정 (지금 돌리면 실패한다)

```
node scripts/check-decision-grade.mjs
```

지금은 이렇게 나온다:

```
✗ A1 등급표      cycle-policy.mjs 가 DECISION_GRADES 와 gradeOf 를 내놓는다
✗ A2 살림 판단   일곱이 자동 결정 쪽에 있다
✗ A3 올림 영역   되돌리기 비싼 열이 올림 쪽에 있다
✗ A4 실패 방향   모르는 영역은 올림 쪽으로 떨어진다
✓ S1 S2 S3 B
check-decision-grade: 4/8 통과  (A* 실패 = 패치 미적용)
```

붙이고 나면 **8/8 통과**다. 코드를 읽지 않아도 이 숫자로 판정된다.

**S1~S3 는 붙기 전에도 통과한다.** 그게 이 검사의 요점이다 — 검사 자체가 도는지를 보는
항목이라, 살림 판단 하나를 일부러 빼고(S1) · 같은 영역을 양쪽에 심고(S2) · 실패 방향을
뒤집어서(S3) 잡히는 것을 확인한 뒤 되돌린다. 「위반 0건」과 「검사가 안 돌았다」가 겉이 같아지는
자리를 그 셋이 막는다.

## 붙일 것 — `gates/lib/cycle-policy.mjs`

파일 맨 끝에 아래를 덧붙인다. **기존 내용은 한 줄도 안 고친다.**

```js
// ── 결정 등급 ──────────────────────────────────────────────────────────────
// 되돌리기 비용으로 가른다. 산문 정의는 docs/references/decision-layer.md 2절이고,
// 어느 영역이 어느 등급인지의 정본은 이 표다.
//
// **살림 판단이 auto-decide 인 이유**: 이것들을 물어서 정하면 개입 횟수가 작업 내용과
// 무관하게 늘어난다. 같은 기능을 만들어도 커밋을 세 번 끊으면 질문이 세 번 늘고, 늘어난
// 질문은 판단이 아니라 통보다. 되돌리는 비용도 거의 0이다.
//
// **실패 방향은 올리는 쪽이다.** 표에 없는 영역은 escalate 로 떨어진다 — 올려도 실행은
// 멈추지 않으므로(보류 방식) 올리는 쪽이 싸고, 모르는 것을 자동으로 정하면 근거 없는
// 결정이 로그에 근거 있는 것처럼 남는다.

export const DECISION_GRADES = {
  "auto-decide": [
    { id: "screen-detail",     what: "간격·정렬·기본값 같은 화면 잔결정" },
    { id: "commit-split",      what: "커밋을 언제 끊고 어떻게 나눌지" },
    { id: "push",              what: "원격에 올리기" },
    { id: "archive-cleanup",   what: "아카이브와 폴더 정리" },
    { id: "file-place-name",   what: "파일을 어디에 어떤 이름으로 둘지" },
    { id: "wording",           what: "문구" },
    { id: "check-composition", what: "검사 항목을 어떻게 구성할지" },
    { id: "impl-within-deps",  what: "이미 들어와 있는 의존성 안에서의 구현 선택" },
  ],
  escalate: [
    { id: "data-model",        what: "데이터 모델·DB 스키마 변경" },
    { id: "auth-method",       what: "인증 방식" },
    { id: "new-dependency",    what: "새 의존성을 들이는 것" },
    { id: "external-service",  what: "외부 서비스 선택" },
    { id: "sealed-invariant",  what: "봉인된 불변식에 닿는 것" },
    { id: "cost",              what: "비용·과금에 영향이 있는 것" },
    { id: "visual-direction",  what: "새 시각 방향" },
    { id: "human-approval",    what: "사람 승인이 요구되는 상태 변경 — 스펙 승인·사인오프·checkpoint" },
    { id: "history-rewrite",   what: "push 된 커밋의 amend·이력 재작성·force push" },
    { id: "unreadable-rule",   what: "못 읽는 규칙이 걸린 영역" },
  ],
};

/**
 * 영역 이름 하나의 등급. 표에 없으면 escalate 로 떨어뜨리고 `known: false` 로 표시한다 —
 * 「표에 있어서 올린 것」과 「몰라서 올린 것」이 구별돼야 표를 늘릴 자리가 보인다.
 */
export function gradeOf(area) {
  const key = String(area ?? "").trim();
  for (const [grade, list] of Object.entries(DECISION_GRADES))
    if (list.some((a) => a.id === key)) return { grade, known: true, area: key };
  return { grade: "escalate", known: false, area: key };
}
```

## 적용 후 판정

```
node scripts/check-decision-grade.mjs     # 8/8 통과
node gates/run-gates.mjs                  # 게이트 통과 (기존 그대로)
```

## 부분 적용

고치는 보호 파일이 하나뿐이라 조합이 없다. 검사 스크립트는 이미 붙어 있고, 패치가 안 붙은
상태에서 돌리면 `A*` 넷이 실패하면서 **미적용이라고 이름을 붙여 알린다** — 조용히 통과하지
않는다.

덧붙이기만 하고 기존 함수를 안 고치므로, 이 패치가 없던 동작을 바꾸는 경로는 없다.
`closeVerdict`·`promotionPending`·`readLogCitations` 는 그대로다.
