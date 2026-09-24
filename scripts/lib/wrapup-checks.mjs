// wrapup-checks.mjs — 항목 하나가 끝난 상태를 판정하는 여덟 가지. 순수 함수다.
//
// 무엇을 푸는가:
//   wrap-up 은 산문 체크리스트였고, 산문은 빠뜨린다. 스킬이 "끝났다"고 말하는 대신
//   이 판정이 파일을 보고 끝났는지를 정한다. 스킬은 무엇을 하는지만 적는다.
//
// 읽는 쪽(check-wrapup.mjs)이 파일·git·게이트 결과를 모아 넘긴다. 여기서는 아무것도 안 읽는다 —
// 그래야 각 항목에 위반을 하나씩 심어서 잡히는지를 파일 없이 볼 수 있다.
//
// 정본 규약: docs/references/run-loop.md 3절

import { recordViolations, progressResidue } from "./record-rules.mjs";
import { validateDecision } from "./decision-model.mjs";

export const WRAPUP_CHECKS = [
  ["B1", "커밋 안 된 변경이 없다"],
  ["B2", "항목이 닫혔고 통과 전환 줄과 쌍이다"],
  ["B3", "HANDOFF 가 이 회차 마지막 전환 뒤에 갱신됐다"],
  ["B4", "PROGRESS 현재 상태에 이 요청이 보인다"],
  ["B5", "열린 결정 카드가 규약을 지킨다"],
  ["B6", "게이트가 잡은 위반이 없다"],
  ["B7", "요청 밖 작업을 숨기지 않았다"],
  ["B8", "실패·반려가 있었으면 같은 날 발견 기록이 있다"],
];

const t = (v) => Date.parse(v ?? "");

/**
 * @param input.gitDirty        `git status --porcelain` 의 줄들
 * @param input.request         request.json (없으면 null)
 * @param input.transitions     transitions.jsonl 의 줄들
 * @param input.handoffMtimeMs  HANDOFF.md 의 수정 시각(ms). 파일이 없으면 null
 * @param input.progressText    PROGRESS.md 전문
 * @param input.decision        decision.json (없으면 null)
 * @param input.vocab           결정 카드 금지 표현 표(없으면 null)
 * @param input.gates           { exit, out } — 게이트 실행 결과
 * @param input.itemId          이번 회차 항목 id. 세션 랩업이면 null
 * @param input.sinceMs         이번 회차(또는 세션) 시작 시각
 * @param input.hadFailure      이 회차 전에 같은 항목이 실패했나(재시도 회차)
 * @param input.addedLines      회차 시작 뒤 발견 기록 파일(백로그·LESSONS)에 더해진 줄들
 * @param input.today           "YYYY-MM-DD"
 * @returns [{ id, name, ok, detail }]
 */
export function wrapupChecks(input) {
  const {
    gitDirty = [], request = null, transitions = [], handoffMtimeMs = null, progressText = "",
    decision = null, vocab = null, gates = { exit: 0, out: "" }, itemId = null, sinceMs = 0,
    hadFailure = false, addedLines = [], today = "",
  } = input ?? {};
  const out = [];
  const add = (id, ok, detail) => out.push({ id, name: WRAPUP_CHECKS.find((c) => c[0] === id)[1], ok, detail });
  const rows = transitions.filter((r) => t(r?.at) >= sinceMs);
  const items = Array.isArray(request?.items) ? request.items : [];
  const labels = new Set(items.map((i) => i.label));

  // B1 — 커밋 규약대로 커밋했으면 남은 변경이 없다.
  add("B1", gitDirty.length === 0, gitDirty.length === 0 ? "" : `커밋 안 된 변경 ${gitDirty.length}건: ${gitDirty.slice(0, 5).join(" · ")}`);

  // B2 — 항목 done + 통과 줄. 쌍 판정 자체는 기존 기록 규약(record-rules)을 그대로 쓴다.
  //      같은 규칙이 두 벌이면 게이트와 이 검사가 다른 답을 낸다.
  {
    const pair = recordViolations({ transitions, request }).filter((v) => v.code.startsWith("PAIR_"));
    const it = itemId ? items.find((i) => i.id === itemId) : null;
    const problems = [];
    // 결정 카드를 열고 멈춘 항목은 done 이 아닌 것이 정상이다 — 카드가 그 항목을 막고 있을 때만 그렇다.
    const parked = it && !it.done && decision && (decision.item === itemId || decision.item == null);
    if (itemId && !it) problems.push(`요청에 항목 ${itemId} 가 없다`);
    else if (it && !it.done && !parked) problems.push(`항목 ${itemId}(${it.label}) 가 done 이 아니고, 그 항목을 막는 결정 카드도 없다`);
    problems.push(...pair.map((v) => v.line));
    add("B2", problems.length === 0, problems.join(" / "));
  }

  // B3 — HANDOFF 는 턴마다 훅이 쓴다. 이 회차의 마지막 전환보다 늦게 쓰였어야 지금 상태다.
  {
    const lastAt = Math.max(-Infinity, ...rows.map((r) => t(r.at)).filter(Number.isFinite));
    if (handoffMtimeMs === null) add("B3", false, "HANDOFF.md 가 없다");
    else if (!Number.isFinite(lastAt)) add("B3", false, "이 회차에 전환 기록이 한 줄도 없다 — 무엇을 했는지 남지 않았다");
    else add("B3", handoffMtimeMs >= lastAt, handoffMtimeMs >= lastAt ? "" :
      `HANDOFF 가 마지막 전환(${new Date(lastAt).toISOString()})보다 먼저 쓰였다 — node gates/graph-stop.mjs 로 갱신한다`);
  }

  // B4 — 앞 요청의 랩업이 그대로 남아 있지 않다. 판정은 기존 --finish 잔재 검사와 같다.
  if (!request) add("B4", true, "열린 요청 없음");
  else {
    const residue = progressResidue(progressText, request);
    add("B4", residue === null, residue ?? "");
  }

  // B5 — 열린 카드가 있으면 스키마를 지킨다. 대기 중인 카드만 본다.
  if (!decision) add("B5", true, "열린 카드 없음");
  else {
    const errs = validateDecision(decision, vocab);
    if (typeof decision.item === "string" && !items.some((i) => i.id === decision.item)) {
      errs.push(`카드의 item(${decision.item}) 이 요청 항목에 없다`);
    }
    add("B5", errs.length === 0, errs.join(" / "));
  }

  // B6 — 게이트 결과. 끝난 상태에서 게이트가 막는 것이 남아 있으면 다음 회차가 그 위반 위에서 시작한다.
  add("B6", gates.exit === 0, gates.exit === 0 ? "" : `게이트 실패(exit ${gates.exit}): ${String(gates.out ?? "").trim().split(/\r?\n/).slice(0, 3).join(" / ")}`);

  // B7 — 요청 밖 작업은 items 밖 이름으로 기록한다. 요청이 열려 있는데 item 이 빈 줄은
  //      「밖」이 아니라 「안 적었다」다 — 그 시간은 어디에도 안 잡힌다.
  if (!request) add("B7", true, "열린 요청 없음");
  else {
    const hidden = rows.filter((r) => r?.to_node !== null && r?.to_node !== undefined && (r?.item ?? null) === null);
    const outside = [...new Set(rows.map((r) => r?.item).filter((x) => x != null && !labels.has(x)))];
    add("B7", hidden.length === 0,
      hidden.length === 0 ? (outside.length ? `요청 밖으로 기록된 작업: ${outside.join(" · ")}` : "")
        : `항목 이름 없이 기록된 전환 ${hidden.length}줄 — 요청 밖이면 items 에 없는 이름을 적는다`);
  }

  // B8 — 실패·반려는 같은 날의 발견 기록과 쌍이다. 재시도 회차도 실패가 있었던 회차다.
  {
    const failed = rows.filter((r) => r?.result === "반려" || r?.result === "실패");
    const needs = failed.length > 0 || hadFailure;
    const dated = addedLines.filter((l) => today && l.includes(today));
    add("B8", !needs || dated.length > 0, !needs ? "" : dated.length > 0 ? "" :
      `실패·반려가 있었는데(${failed.length}줄${hadFailure ? " · 재시도 회차" : ""}) 오늘(${today}) 날짜로 백로그나 LESSONS 에 더한 줄이 없다`);
  }

  return out;
}

/** 여덟 개 중 실패한 것들의 id. 빈 배열이면 통과. */
export const failedIds = (checks) => checks.filter((c) => !c.ok).map((c) => c.id);
