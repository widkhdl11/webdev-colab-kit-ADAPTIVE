#!/usr/bin/env node
// @check-role: on-change
// @check-guards: scripts/measurement-gap.mjs
//
// measurement-gap.mjs — 계측이 멈춘 것을 턴 끝에 한 줄로 신고한다.
//
// 무엇을 푸는가:
//   대시보드의 기록은 두 층이다. **훅이 쓰는 층**(activity.jsonl·subagents.jsonl)은 사람이
//   아무것도 안 해도 쌓이고, **모델이 손으로 치는 층**(transitions.jsonl·state.json, 즉
//   report-note.mjs)은 안 치면 안 쌓인다. 2026-09-15 ~ 09-17 에 실제로 그렇게 됐다 —
//   활동은 수백 줄이 흐르는 동안 전환 줄은 0건이었다.
//
//   그 결과가 「빈 화면」이면 차라리 낫다. 실제로는 **활동 피드가 흐르는 살아 있는 화면이
//   틀린 위치를 보여 준다.** 그리고 노드별 체류 시간이 영영 안 나오는데, 설계도 대기열의
//   착공 신호(③ 왕복 속도·④ 실험 공간·라이프사이클 뷰)가 전부 그 집계다.
//   즉 계측이 멈춰 있으면 **다음 단계를 시작할 신호 자체가 안 생긴다.**
//
// 무엇을 하지 않는가:
//   **막지 않는다.** 그래프 밖 작업이나 문서만 고치는 턴에는 전환이 없는 것이 정상이고,
//   거부로 만들면 정상인 턴까지 막는다. 여기가 하는 일은 「세어서 알리는 것」뿐이다.
//
//   **매 턴 떠들지 않는다.** 한 턴 쉰 것과 계측이 멈춘 것은 다르다. 매 턴 뜨는 알림은
//   신호가 아니라 잡음이 되고, 잡음이 된 알림은 사람이 습관적으로 넘기게 된다
//   (docs/references/harness-backlog.md 의 CRLF 항목과 같은 실패 모양).
//   그래서 임계를 넘을 때만 뜬다.
//
// 쓰는 법 (라이브러리):
//   import { measureGap, gapLine, reportMeasurementGap } from "./measurement-gap.mjs";
//
// 식별자는 ASCII 로 쓴다. 이 파일은 `gates/graph-stop.mjs` 가 부르는데, 보호 파일에 사람이
// 손으로 붙여 넣는 줄에서 한글 이름이 실제로 깨진 적이 있다(2026-09-17).
//
// 쓰는 법 (직접):
//   node scripts/measurement-gap.mjs [프로젝트슬러그]
//
// 계약 테스트: scripts/check-measurement-gap.mjs

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 활동 몇 줄이 쌓이도록 전환이 0건이면 신고하나. 한 턴 분량(수십 줄)보다 넉넉히 위에 둔다. */
export const DEFAULT_THRESHOLD = 60;

/** JSONL 한 덩어리를 객체 배열로. 깨진 줄은 조용히 버린다 — 관측 도구가 관측 대상을 죽이면 안 된다. */
export function jsonl(text) {
  const out = [];
  for (const line of String(text ?? "").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* 깨진 줄은 버린다 */ }
  }
  return out;
}

/**
 * 계측 격차를 센다. **순수 함수다** — 파일도 시계도 안 본다.
 *
 * @param activity     activity.jsonl 의 줄들 (각 줄에 `at`)
 * @param transitions  transitions.jsonl 의 줄들 (각 줄에 `at`)
 * @returns { shouldReport, activityCount, lastTransition }
 *          `activityCount` 는 **마지막 전환 이후** 쌓인 활동 줄 수다. 전환이 한 줄도 없으면 전부.
 */
export function measureGap(activity, transitions, { threshold = DEFAULT_THRESHOLD } = {}) {
  const toTime = (r) => Date.parse(r?.at ?? "");
  const transitionTimes = transitions.map(toTime).filter(Number.isFinite);
  // **마지막 줄이 아니라 제일 늦은 시각을 쓴다.** 줄 순서는 덧붙이기 순서라 정렬이 보장되지
  // 않는데, 마지막 줄을 믿으면 옛 시각 줄 하나가 뒤에 붙는 순간 격차가 통째로 사라진다.
  const lastTransition = transitionTimes.length ? Math.max(...transitionTimes) : null;
  const activityCount = activity.filter((r) => {
    const t = toTime(r);
    if (!Number.isFinite(t)) return false;
    return lastTransition === null ? true : t > lastTransition;
  }).length;
  return { shouldReport: activityCount >= threshold, activityCount, lastTransition };
}

/**
 * 신고 한 줄. 신고할 것이 없으면 `null` 이다 — 부르는 쪽이 `null` 이면 아무것도 안 찍는다.
 *
 * **무엇을 하라고 같이 적는다.** 격차만 알리면 읽는 쪽이 「그래서 뭘 하라고」에서 멈춘다.
 */
export function gapLine(gap) {
  if (!gap?.shouldReport) return null;
  const whenText = gap.lastTransition === null
    ? "전환 줄이 한 번도 없다"
    : `마지막 전환 ${new Date(gap.lastTransition).toISOString().slice(0, 16).replace("T", " ")} 이후`;
  return (
    `✎ 계측 멈춤 — ${whenText} 활동 ${gap.activityCount}줄이 쌓였는데 전환 기록은 0건이다. ` +
    `노드별 체류 시간이 안 나오고, 그 집계가 설계도 대기열(③·④)의 착공 신호다. ` +
    `지금 어디인지 남겨라: node scripts/report-note.mjs --node <노드> --task <식별자> --now "<한 줄>" --item "<항목>"`
  );
}

/**
 * 활동 기록을 **날짜별로 갈라진 파일까지 전부** 읽는다.
 *
 * 훅이 `activity.jsonl` 을 날마다 `activity-YYYY-MM-DD.jsonl` 로 넘긴다. 오늘치만 세면
 * **며칠에 걸친 고장이 하루치로 보인다** — 실제로 2026-09-15~17 의 고장을 넣어 보니
 * 오늘치 45줄만 잡혀 임계에 못 미쳤다. 계측이 오래 멈출수록 안 잡히는 셈이라 정확히
 * 거꾸로다. 격차는 마지막 전환 이후로 세므로 옛 파일을 같이 읽어도 과하게 세지 않는다.
 */
export function readAllActivity(dir) {
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir).filter((n) => /^activity(-\d{4}-\d{2}-\d{2})?\.jsonl$/.test(n));
  return names.flatMap((n) => jsonl(readFileSync(join(dir, n), "utf-8")));
}

/** 활성 프로젝트(또는 넘긴 슬러그)의 기록을 읽어 신고줄을 만든다. 읽을 수 없으면 `null`. */
export function reportMeasurementGap(slug) {
  try {
    const active = slug || (existsSync(join(ROOT, "ACTIVE")) ? readFileSync(join(ROOT, "ACTIVE"), "utf-8").trim() : "");
    if (!active) return null;
    const dir = join(ROOT, "projects", active, "report");
    const readRows = (name) => (existsSync(join(dir, name)) ? jsonl(readFileSync(join(dir, name), "utf-8")) : []);
    const activity = readAllActivity(dir);
    // 기록이 아예 없는 프로젝트(대시보드를 안 깐 곳)에서는 아무 말도 안 한다.
    if (activity.length === 0) return null;
    return gapLine(measureGap(activity, readRows("transitions.jsonl")));
  } catch {
    return null;   // 관측 도구는 관측 대상을 죽이지 않는다
  }
}

// **직접 실행일 때만 찍는다.** 파일 이름 꼬리로 재면 계약 테스트(`check-measurement-gap.mjs`)도
// 같은 꼬리를 가져서, 불러오기만 해도 한 줄이 튀어나온다 — 실제로 그랬다. 경로를 비교한다.
const isDirectRun = Boolean(process.argv[1]) && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const line = reportMeasurementGap(process.argv[2]);
  console.log(line ?? "계측 격차 없음");
}
