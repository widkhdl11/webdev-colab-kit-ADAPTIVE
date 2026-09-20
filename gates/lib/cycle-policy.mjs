// 결정층(사이클)의 판정이 사는 한 자리. 게이트·Stop 훅·검사 스크립트가 전부 여기서 읽는다.
//
// 왜 lib 로 빼나: v3.3 을 만들 때 승격 판정과 종료 판정이 검사 스크립트 안에만 있었다.
// 그러면 검사가 자기 사본을 검사한다 — 실제로 도는 코드는 아무도 안 밟는다.
// (승격 후보 대장의 "검사는 그 코드가 실제로 도는 자리에서 돌려 본다")
//
// **파일을 읽지 않는다. 문자열을 받고 판정을 돌려준다.** 픽스처로 프로브하기 위해서다.
// **쓰지 않는다.** 승격도 사이클 마감도 판단이 필요한 쓰기라 사람과 에이전트가 한다 —
// 여기서 하는 일은 "처리 안 된 것이 남아 있다"를 신고하는 데까지다.

import { POLICY_SCOPES } from "./read-policy.mjs";

// 열린 보류 항목 수의 상한. 닿으면 사이클을 조기 종료한다.
// 숫자가 문서 산문에도 적혀 있으면 두 자리가 조용히 어긋난다 — 값은 여기 하나뿐이다.
export const PENDING_CAP = 5;

// 같은 유형이 몇 번 쌓이면 규칙이 되는가. 1회짜리는 우연일 수 있어 승격하지 않는다.
export const PROMOTE_AT = 2;

/**
 * 사이클을 닫을 때인가.
 *   frontier   지금 작업할 노드 목록
 *   blocked    보류 항목이 막는 노드 (Set 또는 배열)
 *   openCount  열린 보류 항목 수
 * 반환 { close, reason }
 */
export function closeVerdict({ frontier = [], blocked = new Set(), openCount = 0 } = {}) {
  const b = blocked instanceof Set ? blocked : new Set(blocked);
  // 조건 1 — 프론티어의 모든 노드가 보류에 막혔다.
  // 프론티어가 비면 여기서 닫지 않는다: 그건 그래프 종단(조건 2)이고 판정하는 자리가 다르다.
  if (frontier.length > 0 && frontier.every((n) => b.has(n)))
    return { close: true, reason: `조건 1 — 프론티어(${frontier.join(", ")})가 전부 보류에 막혔다` };
  // 조건 1' — 보류가 상한에 닿았다. 그쯤 되면 남은 작업 대부분이 곧 보류에 걸리고,
  // 리포트의 보류 목록이 한 화면을 넘으면 비동기 검토가 다시 병목이 된다.
  if (openCount >= PENDING_CAP)
    return { close: true, reason: `조건 1' — 열린 보류가 상한에 닿았다(${openCount}/${PENDING_CAP})` };
  return { close: false, reason: null };
}

/**
 * 승격 후보 대장 읽기. `## 후보` 아래의 항목만 세고, 줄 맨 앞의 scope/seen/no-auto 만 읽는다.
 * 나머지 본문은 파싱하지 않는다.
 */
export function readCandidatesText(src) {
  const items = [];
  let inSection = false, cur = null;
  const flush = () => { if (cur) items.push(cur); cur = null; };
  for (const raw of String(src).replace(/\r\n/g, "\n").split("\n")) {
    const h = raw.match(/^##\s+(.*)$/);
    if (h) { flush(); inSection = h[1].trim() === "후보"; continue; }
    if (!inSection) continue;
    const t = raw.match(/^-\s+\*\*(.+?)\*\*/);
    if (t) { flush(); cur = { title: t[1].trim(), scope: [], badScope: [], seen: [], noAuto: null }; continue; }
    if (!cur) continue;
    const sc = raw.match(/^[ \t]*scope:[ \t]*(.*)$/);
    if (sc) {
      for (const v of sc[1].replace(/^\[|\]$/g, "").split(",").map((x) => x.trim()).filter(Boolean))
        (POLICY_SCOPES.includes(v) ? cur.scope : cur.badScope).push(v);
      continue;
    }
    const se = raw.match(/^[ \t]*seen:[ \t]*(.*)$/);
    if (se) {
      // 횟수는 세지 않고 사이클 이름을 모은다. 같은 사이클이 두 번 적혀도 1회다.
      for (const v of se[1].split(",").map((x) => x.trim()).filter(Boolean))
        if (!cur.seen.includes(v)) cur.seen.push(v);
      continue;
    }
    const na = raw.match(/^[ \t]*no-auto:[ \t]*(.*)$/);
    if (na) { cur.noAuto = na[1].trim() || "(사유 없음)"; continue; }
  }
  flush();
  return { items };
}

/**
 * 처리되지 않은 채 대장에 남은 항목.
 *   mustHandle  승격 조건을 다 갖췄다 — 규칙으로 올리거나 no-auto 사유를 달아야 한다
 *   unreadable  2회 이상인데 scope 를 못 읽어 승격할 수 없다 — 신고만 하고 실패시키지 않는다
 *
 * 실패 방향은 승격하지 않는 쪽이다(잘못 승격된 규칙은 그 뒤 모든 결정의 근거가 되고,
 * 승격이 한 사이클 늦는 것은 그냥 한 사이클 늦는 것이다). 그래서 이 함수는 승격하지 않는다.
 */
export function promotionPending(items) {
  const mustHandle = [], unreadable = [];
  for (const it of items) {
    if (it.seen.length < PROMOTE_AT) continue;   // 1회짜리 — 대장에 그대로 둔다
    if (it.noAuto) continue;                     // 사유가 달렸다 — 처리된 것이다
    if (it.scope.length === 0) unreadable.push(it);
    else mustHandle.push(it);
  }
  return { mustHandle, unreadable };
}

/**
 * 결정 로그의 `근거` 열에서 규칙 id 를 걷는다(표의 마지막 열).
 * `NEW`(커버 규칙 없음)와 `HUMAN`(사람 개입)은 규칙이 아니다.
 */
export function readLogCitations(src) {
  const ids = new Set();
  for (const raw of String(src).replace(/\r\n/g, "\n").split("\n")) {
    if (!raw.startsWith("|")) continue;
    const cells = raw.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    const last = cells[cells.length - 1].split("`").join("").trim();
    if (!last || last === "NEW" || last === "HUMAN" || last === "근거") continue;
    for (const v of last.split(",").map((x) => x.trim()).filter(Boolean))
      if (/^[a-z0-9][a-z0-9-]*$/.test(v)) ids.add(v);
  }
  return ids;
}


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