#!/usr/bin/env node
// @check-role: standing
// @check-guards: scripts/measurement-gap.mjs, scripts/lib/record-rules.mjs
//
// check-measurement-gap.mjs — 계측 두 층의 검사. 신고(격차)와 **거부**(기록 규약)를 함께 본다.
//
// 역할이 왜 standing 인가:
//   기록은 매 턴의 일이다. on-change 로 두면 **기록이 멈춘 턴에는 아무도 안 본다** — 그 턴에
//   바뀐 것이 기록 코드가 아니기 때문이다. 정확히 그 이유로 2026-09-15~17 의 멈춤이 사흘 동안
//   아무 데도 안 걸렸다. 부르는 자리는 gates/run-gates.mjs 다(전체 실행 전용, --quick 제외).
//
// 무엇을 지키는 검사인가:
//   이 도구가 고장 나는 모양은 둘 다 **조용하다**.
//   ① 계측이 멈췄는데 아무 말도 안 한다 → 사람은 화면이 맞는 줄 안다
//   ② 멀쩡한 턴마다 떠든다 → 알림이 잡음이 되고, 잡음은 습관적으로 넘겨진다
//   그래서 「신고한다」와 「입 다문다」를 **양쪽 다** 심어서 확인한다. 한쪽만 보면
//   「언제나 신고」 또는 「언제나 침묵」인 구현이 절반을 통과한다.
//
//   그리고 마지막 항목(G)은 **패치가 붙었는지**를 본다. 판단 로직이 멀쩡해도 그것을
//   부르는 자리가 없으면 화면에는 아무것도 안 뜬다 — 「검사를 붙인 것과 그 검사가 도는
//   것은 다르다」(LESSONS 2026-09-16)가 정확히 이 자리다.
//
// 쓰는 법:
//   node scripts/check-measurement-gap.mjs                  (게이트가 부르는 모양)
//   node scripts/check-measurement-gap.mjs --require-wiring (패치 적용 판정용)
//
//   종료 코드 0 = 통과, 1 = 실패.
//
// **배선(G1)은 기본으로 막지 않는다.** 배선은 보호 파일(gates/) 패치라 사용자만 할 수 있는데,
// 그것을 게이트 실패로 만들면 패치를 붙일 때까지 **다른 모든 작업이 막힌다**. 그래서 기본
// 실행에서는 레포의 기존 방식대로 「배선 대기」 한 줄로 신고하고 통과한다.
// `--require-wiring` 을 주면 실패로 바뀐다 — 패치 문서의 「적용 전 실패 / 적용 후 통과」가 그것이다.
//
// 대신 **조용해지지는 않는다**: 배선이 없는데 패치 문서까지 사라지면 그때는 그냥 실패한다.
// 미루기는 「곧 붙인다는 문서가 살아 있는 동안」만 유효하다.

import { existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { measureGap, gapLine, jsonl, readAllActivity, DEFAULT_THRESHOLD } from "./measurement-gap.mjs";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { recordViolations, progressResidue, currentStateSection, RESULT_VOCAB, isRequestOpen } from "./lib/record-rules.mjs";
import { mkdirSync } from "node:fs";
import { finish } from "./report-request.mjs";

const startedAt = Date.now();

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const verdict = (id, ok, what, extra = "") => {
  console.log(`${ok ? "  ok " : "FAIL"} ${id} — ${what}${extra ? `\n       ${extra}` : ""}`);
  if (!ok) failed += 1;
};

const minute = (min) => new Date(Date.UTC(2026, 8, 17, 0, min)).toISOString();
const activityRows = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ at: minute(from + i), tool: "Bash" }));

// ── A. 전환이 한 줄도 없고 활동만 잔뜩 — 신고해야 한다 ───────────────────
{
  const g = measureGap(activityRows(DEFAULT_THRESHOLD), []);
  verdict("A1", g.shouldReport === true, "전환 0건 + 활동이 임계만큼 → 신고", `활동수=${g.activityCount}`);
  verdict("A2", g.activityCount === DEFAULT_THRESHOLD, "전환이 없으면 활동 전부를 센다");
  const line = gapLine(g);
  verdict("A3", typeof line === "string" && line.includes("전환 줄이 한 번도 없다"),
    "신고줄이 「한 번도 없다」를 구별해 말한다", String(line).slice(0, 60));
  verdict("A4", String(line).includes("report-note.mjs"),
    "신고줄에 무엇을 하라는지가 들어 있다 — 격차만 알리면 읽는 쪽이 멈춘다");
}

// ── B. 심은 위반: 계측이 멈춘 실제 모양 ──────────────────────────────────
//     전환은 옛날에 몇 줄 있고, 그 뒤로 활동만 흐른다. 2026-09-15~17 에 난 그 모양이다.
{
  const transitions = [{ at: minute(0) }, { at: minute(5) }];
  const g = measureGap(activityRows(DEFAULT_THRESHOLD, 10), transitions);
  verdict("B1", g.shouldReport === true, "마지막 전환 이후 활동이 임계를 넘으면 신고", `활동수=${g.activityCount}`);
  verdict("B2", g.lastTransition === Date.parse(minute(5)), "마지막 전환 시각을 집는다");
  verdict("B3", String(gapLine(g)).includes("2026-09-17 00:05"),
    "신고줄이 언제부터 멈췄는지를 적는다");
}

// ── C. 입 다물어야 하는 경우 — 이 항목이 없으면 「언제나 신고」가 통과한다 ──
{
  const transitions = [{ at: minute(100) }];
  const g = measureGap(activityRows(DEFAULT_THRESHOLD, 101), transitions);   // 활동은 많지만 전환이 방금 찍혔다? → 아니다
  verdict("C1", g.activityCount === DEFAULT_THRESHOLD && g.shouldReport === true,
    "전환 뒤에 쌓인 활동은 그대로 센다 (전환이 최근이어도 그 뒤가 비면 안 된다)");

  const quiet = measureGap(activityRows(5, 101), transitions);
  verdict("C2", quiet.shouldReport === false, "임계 미만이면 신고하지 않는다 — 한 턴 쉰 것과 멈춘 것은 다르다", `활동수=${quiet.activityCount}`);
  verdict("C3", gapLine(quiet) === null, "신고할 것이 없으면 줄 자체를 안 만든다");

  const caughtUp = measureGap(activityRows(DEFAULT_THRESHOLD, 0), [{ at: minute(999) }]);
  verdict("C4", caughtUp.activityCount === 0 && caughtUp.shouldReport === false,
    "전환이 활동보다 뒤면 격차가 0 이다 — 기록이 따라온 상태");
}

// ── D. 줄 순서를 안 믿는다 ─────────────────────────────────────────────
//     덧붙이기 파일이라 정렬이 보장되지 않는다. 마지막 줄만 보는 구현이면 여기서 빨간불이다.
{
  const outOfOrder = [{ at: minute(50) }, { at: minute(3) }];   // 마지막 줄이 더 옛날이다
  const g = measureGap(activityRows(DEFAULT_THRESHOLD, 4), outOfOrder);
  verdict("D1", g.lastTransition === Date.parse(minute(50)),
    "마지막 줄이 아니라 제일 늦은 시각을 쓴다", `집은 시각=${new Date(g.lastTransition).toISOString()}`);
  verdict("D2", g.activityCount < DEFAULT_THRESHOLD, "그래서 옛 줄 하나가 뒤에 붙어도 격차가 사라지지 않는다");
}

// ── E. 깨진 입력에도 안 죽는다 ─────────────────────────────────────────
{
  const rows = jsonl('{"at":"2026-09-17T00:00:00Z"}\n{깨진 줄\n\n{"at":"nope"}\n');
  verdict("E1", rows.length === 2, "깨진 줄은 버리고 나머지는 읽는다", `읽은 줄=${rows.length}`);
  const g = measureGap(rows, []);
  verdict("E2", g.activityCount === 1, "시각을 못 읽는 줄은 안 센다 — 셌다면 없는 활동이 격차를 만든다");
  verdict("E3", measureGap([], []).shouldReport === false, "빈 기록은 신고하지 않는다(대시보드를 안 깐 프로젝트)");
}

// ── F. 임계는 한 턴 분량보다 위에 있어야 한다 ───────────────────────────
{
  verdict("F1", DEFAULT_THRESHOLD >= 40,
    "임계가 한 턴 분량(수십 줄)보다 위다 — 매 턴 뜨면 알림이 잡음이 된다", `임계=${DEFAULT_THRESHOLD}`);
}

// ── H. 날짜별로 갈라진 활동 파일까지 읽는다 ─────────────────────────────
//     오늘치만 읽으면 **계측이 오래 멈출수록 안 잡힌다** — 정확히 거꾸로다.
//     실제로 그랬다: 2026-09-15~17 의 고장을 넣었더니 오늘치 45줄만 잡혀 임계 미달이었다.
{
  const dir = mkdtempSync(join(tmpdir(), "mgap-"));
  try {
    const writeRows = (name, rows) =>
      writeFileSync(join(dir, name), rows.map((r) => JSON.stringify(r)).join("\n"));
    writeRows("activity.jsonl", activityRows(5, 200));
    writeRows("activity-2026-09-15.jsonl", activityRows(100, 0));
    writeFileSync(join(dir, "transitions.jsonl"), "");
    const activity = readAllActivity(dir);
    verdict("H1", activity.length === 105, "오늘치와 넘어간 파일을 함께 읽는다", `읽은 줄=${activity.length}`);
    verdict("H2", measureGap(activity, []).shouldReport === true,
      "그래서 며칠에 걸친 멈춤이 잡힌다 — 오늘치(5줄)만 보면 안 잡혔다");

    // 심은 위반: 넘어간 파일을 안 읽는 구현이면 여기가 빨간불이다
    const todayOnly = jsonl(readFileSync(join(dir, "activity.jsonl"), "utf-8"));
    verdict("H3", measureGap(todayOnly, []).shouldReport === false,
      "(대조) 오늘치만 세면 같은 고장이 안 잡힌다 — H2 가 지키는 것이 이 차이다");

    writeFileSync(join(dir, "activity-something-else.log"), "무시해야 한다");
    verdict("H4", readAllActivity(dir).length === 105, "활동 기록이 아닌 파일은 안 읽는다");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── G. 배선 — 판단 로직이 멀쩡해도 부르는 자리가 없으면 화면엔 안 뜬다 ───
{
  const p = join(ROOT, "gates", "graph-stop.mjs");
  const src = existsSync(p) ? readFileSync(p, "utf-8") : "";
  const callName = /reportMeasurementGap/;
  const calls = /measurement-gap\.mjs/.test(src) && callName.test(src);
  const wrapped = /try\s*{[^}]*reportMeasurementGap[\s\S]{0,400}?catch/.test(src);
  const patchDoc = join(ROOT, "docs", "references", "pending-patches", "2026-09-17-measurement-gap.md");
  const deferOk = existsSync(patchDoc);
  const requireWiring = process.argv.includes("--require-wiring");

  if (calls) {
    verdict("G1", true, "gates/graph-stop.mjs 가 이 도구를 부른다");
    verdict("G2", wrapped,
      "부르는 자리가 try/catch 안에 있다 — 여기서 던지면 훅이 죽고 차단 판정에 영영 도달 못 한다");
  } else if (requireWiring || !deferOk) {
    verdict("G1", false, "gates/graph-stop.mjs 가 이 도구를 부른다",
      deferOk
        ? "아직 안 붙었다 → docs/references/pending-patches/2026-09-17-measurement-gap.md"
        : "안 붙었는데 패치 문서도 없다 — 미루기의 근거가 사라졌다");
  } else {
    console.log(
      [
        "▦ 배선 대기 1건 — gates/graph-stop.mjs 가 아직 이 도구를 안 부른다(보호 파일이라 사용자가 붙인다).",
        "       판단 로직은 위 항목들이 지키고 있고, 화면에 뜨는 것은 패치를 붙인 뒤다.",
        "       붙일 것: docs/references/pending-patches/2026-09-17-measurement-gap.md",
        "       적용 판정: node scripts/check-measurement-gap.mjs --require-wiring",
      ].join("\n"),
    );
  }
}

// ══════════════════════════════════════════════════════════════════════
//  여기부터는 **거부** 쪽이다. 위(A~H)는 신고가 맞는지 보고, 아래는 기록 규약을 어긴
//  것을 실제로 막는다. 둘을 한 파일에 두는 이유는 계측이 한 덩어리이기 때문이다 —
//  신고만 있으면 사람이 넘기고, 거부만 있으면 정상인 턴까지 막힌다.
// ══════════════════════════════════════════════════════════════════════

const makeRequest = (over = {}) => ({
  task: "post-likes",
  status: "진행 중",
  started_at: minute(0),
  items: [{ id: "I1", label: "항목 하나", done: false }],
  ...over,
});

// ── J. result 어휘 — 「통과」만 기록하는 경로가 없어야 한다 ─────────────
{
  verdict("J1", RESULT_VOCAB.includes("통과") && RESULT_VOCAB.includes("반려") && RESULT_VOCAB.includes("실패") && RESULT_VOCAB.length === 3,
    "어휘는 셋뿐이다 — 화면의 지연 진단이 정확히 일치로 센다", RESULT_VOCAB.join("·"));

  const clean = recordViolations({ transitions: [{ at: minute(1), result: "반려", to_node: null, item: null }] });
  verdict("J2", clean.length === 0, "규약 어휘는 통과한다");

  // 심은 위반
  const odd = recordViolations({ transitions: [{ at: minute(1), result: "잘됨", to_node: null, item: null }] });
  verdict("J3", odd.some((v) => v.code === "RESULT_VOCAB"), "어휘 밖의 값은 거부한다", odd[0]?.line?.slice(0, 50));
  verdict("J4", recordViolations({ transitions: [{ at: minute(1), result: null, to_node: null, item: null }] }).length === 0,
    "result 가 null 인 줄(대부분의 줄)은 아무 말도 안 듣는다");
}

// ── K. 통과 ↔ done 은 쌍이다. 반려·실패는 쌍이 아니다 ──────────────────
{
  const transitions = (over) => ({ at: minute(1), to_node: "implement", item: "항목 하나", result: null, ...over });

  const paired = recordViolations({
    request: makeRequest({ items: [{ id: "I1", label: "항목 하나", done: true }] }),
    transitions: [transitions({ result: "통과" })],
  });
  verdict("K1", paired.length === 0, "통과 줄과 done 이 둘 다 있으면 통과");

  // 심은 위반 ①: 통과로 적어 놓고 항목을 안 닫았다
  const halfA = recordViolations({ request: makeRequest(), transitions: [transitions({ result: "통과" })] });
  verdict("K2", halfA.some((v) => v.code === "PAIR_NOT_DONE"),
    "통과만 있고 done 이 없으면 거부", halfA.find((v) => v.code === "PAIR_NOT_DONE")?.line?.slice(0, 46));

  // 심은 위반 ②: 항목을 닫았는데 통과 줄이 없다 (반대 방향 — 한쪽만 보면 이게 통과한다)
  const halfB = recordViolations({
    request: makeRequest({ items: [{ id: "I1", label: "항목 하나", done: true }] }),
    transitions: [transitions({ result: null })],
  });
  verdict("K3", halfB.some((v) => v.code === "PAIR_NO_RESULT"),
    "done 만 있고 통과 줄이 없으면 거부 — 항목마다 줄 하나가 규약이다");

  // 반려·실패는 쌍을 요구하지 않는다. 요구하면 반려를 기록하는 순간 게이트가 막힌다.
  const rejected = recordViolations({ request: makeRequest(), transitions: [transitions({ result: "반려" })] });
  verdict("K4", !rejected.some((v) => v.code.startsWith("PAIR")),
    "반려로 끝난 항목은 닫힌 것이 아니다 — 쌍을 요구하지 않는다");

  // 요청 밖 작업(items 에 없는 이름)은 쌍의 대상이 아니다
  const outside = recordViolations({ request: makeRequest(), transitions: [transitions({ result: "통과", item: "요청 밖 일" })] });
  verdict("K5", !outside.some((v) => v.code.startsWith("PAIR")), "요청 밖 항목은 진행률의 분모가 아니다");

  // 요청이 시작되기 전의 옛 줄은 이번 요청의 근거가 아니다
  const oldRow = recordViolations({
    request: makeRequest({ started_at: minute(50) }),
    transitions: [transitions({ at: minute(1), result: "통과" })],
  });
  verdict("K6", !oldRow.some((v) => v.code === "PAIR_NOT_DONE"), "요청 시작 이전 줄은 안 센다");
}

// ── L. 요청이 열려 있는데 item 이 비었다 ───────────────────────────────
{
  const request = makeRequest();
  const blank = recordViolations({ request, transitions: [{ at: minute(1), to_node: "implement", item: null, result: null }] });
  verdict("L1", blank.some((v) => v.code === "ITEM_NULL"),
    "요청이 열린 동안 그래프 안 전환의 item 이 비면 거부 — null 은 「밖」이 아니라 「잊었다」다");

  const outsideRow = recordViolations({ request, transitions: [{ at: minute(1), to_node: null, item: null, result: null }] });
  verdict("L2", !outsideRow.some((v) => v.code === "ITEM_NULL"),
    "그래프 밖 구간은 원래 item 이 null 이다 — 여기까지 막으면 정상인 턴이 막힌다");

  const closed = recordViolations({
    request: makeRequest({ status: "완료" }),
    transitions: [{ at: minute(1), to_node: "implement", item: null, result: null }],
  });
  verdict("L3", !closed.some((v) => v.code === "ITEM_NULL") && isRequestOpen(makeRequest({ status: "완료" })) === false,
    "열린 요청이 없으면 대조할 상대가 없다 — 있지도 않은 요청을 근거로 막지 않는다");
}

// ── M. 그래프 밖 사유 「미기재」는 다음 턴에 요구한다 ───────────────────
{
  const demand = recordViolations({ state: { off_graph: "미기재" } });
  verdict("M1", demand.some((v) => v.code === "OFFGRAPH_UNKNOWN"),
    "사유가 「미기재」면 한 줄을 요구한다", demand[0]?.line?.slice(0, 40));
  verdict("M2", recordViolations({ state: { off_graph: "킷 — gates/x.mjs" } }).length === 0,
    "사유가 채워져 있으면 아무 말도 안 한다");
  verdict("M3", recordViolations({ state: { current_node: "implement" } }).length === 0,
    "그래프 안에 있을 때는 off_graph 자체가 없다");
  verdict("M4", recordViolations({ request: makeRequest(), state: { off_graph: "미기재" } }).some((v) => v.code === "OFFGRAPH_UNKNOWN"),
    "요청이 열려 있어도 같이 잡힌다 — 두 갈래 중 한쪽에만 넣으면 절반이 조용해진다");
}

// ── N. --finish 잔재 검사 ──────────────────────────────────────────────
//     「마감 내용인가」는 기계가 못 센다. 셀 수 있는 것은 **앞 요청의 랩업이 그대로 남아
//     있나**뿐이고, 이 검사의 목적이 그것이다. 헐거운 대신 거짓 차단이 거의 없다.
{
  const request = makeRequest();
  const updated = ["# PROGRESS", "", "## 현재 상태", "", "- 완료: post-likes 를 닫았다", "", "## 로그", ""].join("\n");
  verdict("N1", progressResidue(updated, request) === null, "요청 식별자가 「현재 상태」에 보이면 통과");

  const byLabel = ["# P", "## 현재 상태", "- 항목 하나 를 닫았다", ""].join("\n");
  verdict("N2", progressResidue(byLabel, request) === null, "항목 label 로도 통과한다");

  // 심은 위반: 앞 요청의 랩업이 그대로 남아 있다
  const residue = ["# P", "## 현재 상태", "- 완료: 대시보드 요약 박스", "## 로그", "- 옛날 post-likes 이야기", ""].join("\n");
  const line = progressResidue(residue, request);
  verdict("N3", typeof line === "string" && line.includes("post-likes"),
    "다른 요청의 마감이 남아 있으면 거부한다", String(line).slice(0, 46));
  verdict("N4", currentStateSection(residue).includes("대시보드") && !currentStateSection(residue).includes("옛날"),
    "「현재 상태」 절만 본다 — 로그의 옛 서사가 근거가 되면 검사가 무효다");
  verdict("N5", progressResidue(["# P", "## 로그", "- 아무것도", ""].join("\n"), request) !== null,
    "「현재 상태」 절이 아예 없으면 거부");
}

// ── O. 지금 이 레포의 실제 기록 — 여기서 나오는 것이 차단 사유다 ────────
{
  const slug = existsSync(join(ROOT, "ACTIVE")) ? readFileSync(join(ROOT, "ACTIVE"), "utf-8").trim() : "";
  const dir = slug ? join(ROOT, "projects", slug, "report") : "";
  const readJsonFile = (name) => {
    try { return JSON.parse(readFileSync(join(dir, name), "utf-8")); } catch { return null; }
  };
  if (!dir || !existsSync(dir)) {
    console.log("  ok  O1 — 대시보드를 안 깐 프로젝트다. 기록 규약을 볼 대상이 없다");
  } else {
    const transitionsPath = join(dir, "transitions.jsonl");
    const violations = recordViolations({
      transitions: jsonl(existsSync(transitionsPath) ? readFileSync(transitionsPath, "utf-8") : ""),
      state: readJsonFile("state.json"),
      request: readJsonFile("request.json"),
    });
    for (const v of violations) console.log(`[record/${v.code}] ${v.line}`);
    verdict("O1", violations.length === 0,
      `${slug} 의 기록이 규약을 지킨다 (전환·상태·요청)`,
      violations.length ? `위반 ${violations.length}건 — 위 [record/...] 줄을 보고 고친다` : "");
  }
}

// ── P. 실행 시간 — 매 턴 도는 검사라 분 단위가 되면 안 된다 ─────────────
{
  const elapsed = Date.now() - startedAt;
  verdict("P1", elapsed < 1000,
    "전체 실행이 1초 이내다 — 매 턴 도는 자리에 붙는다", `${elapsed}ms`);
}

// ── Q. 잔재 검사가 실제로 --finish 를 막는가 (끝에서 끝까지) ────────────
//     판정 함수가 멀쩡해도 부르는 자리가 없으면 요청은 그냥 닫힌다.
{
  const dir = mkdtempSync(join(tmpdir(), "req-"));
  try {
    const rdir = join(dir, "report");
    const wdir = join(dir, "workspace");
    mkdirSync(rdir, { recursive: true });
    mkdirSync(wdir, { recursive: true });
    const request = {
      task: "post-likes", request: "좋아요를 붙인다", goal: null, source: "manual", spec_path: null,
      items: [{ id: "I1", label: "항목 하나", done: true }],
      status: "진행 중", status_reason: null, started_at: minute(0), ended_at: null,
    };
    writeFileSync(join(rdir, "request.json"), JSON.stringify(request), "utf-8");
    writeFileSync(join(rdir, "requests-history.jsonl"), "", "utf-8");

    // 심은 위반: 앞 요청의 랩업이 그대로 남아 있다
    const residue = ["# PROGRESS", "", "## 현재 상태", "", "- 완료: 대시보드 요약 박스", ""].join("\n");
    writeFileSync(join(wdir, "PROGRESS.md"), residue, "utf-8");
    let blocked = false;
    try { finish(rdir, { status: "완료" }); } catch (e) { blocked = /한 글자도 안 보인다/.test(e.message); }
    verdict("Q1", blocked, "PROGRESS 가 앞 요청 내용이면 --finish 가 거부된다");
    verdict("Q2", existsSync(join(rdir, "request.json")),
      "거부됐으면 요청이 그대로 열려 있다 — 반쯤 닫힌 상태가 남으면 안 된다");

    // 해소하면 통과한다
    writeFileSync(join(wdir, "PROGRESS.md"),
      ["# PROGRESS", "", "## 현재 상태", "", "- 완료: post-likes 를 닫았다", ""].join("\n"), "utf-8");
    const done = finish(rdir, { status: "완료" });
    verdict("Q3", done.status === "완료" && !existsSync(join(rdir, "request.json")),
      "마감을 적으면 닫힌다 — 검사가 「언제나 거부」가 아니다");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── W. 거부 쪽 배선 — run-gates 가 매 턴 이 검사를 불러야 실제로 막힌다 ──
{
  const runGatesPath = join(ROOT, "gates", "run-gates.mjs");
  const src2 = existsSync(runGatesPath) ? readFileSync(runGatesPath, "utf-8") : "";
  const calls2 = /check-measurement-gap\.mjs/.test(src2);
  const patchDoc2 = join(ROOT, "docs", "references", "pending-patches", "2026-09-17-turn-transition.md");
  const deferOk2 = existsSync(patchDoc2);
  const requireWiring2 = process.argv.includes("--require-wiring");

  if (calls2) {
    verdict("W1", true, "gates/run-gates.mjs 가 매 턴 이 검사를 부른다");
    verdict("W2", /\[record\//.test(src2),
      "그리고 [record/...] 줄을 게이트 에러로 올린다 — 안 올리면 실패가 조용히 버려진다");
  } else if (requireWiring2 || !deferOk2) {
    verdict("W1", false, "gates/run-gates.mjs 가 매 턴 이 검사를 부른다",
      deferOk2
        ? "아직 안 붙었다 → docs/references/pending-patches/2026-09-17-turn-transition.md"
        : "안 붙었는데 패치 문서도 없다 — 미루기의 근거가 사라졌다");
  } else {
    console.log(
      [
        "▦ 배선 대기 1건 — gates/run-gates.mjs 가 아직 이 검사를 안 부른다(보호 파일이라 사용자가 붙인다).",
        "       판정은 위 J~O 가 지키고 있고, 실제로 막히는 것은 패치를 붙인 뒤다.",
        "       붙일 것: docs/references/pending-patches/2026-09-17-turn-transition.md",
        "       적용 판정: node scripts/check-measurement-gap.mjs --require-wiring",
      ].join("\n"),
    );
  }
}

console.log(failed === 0 ? "\n계약 테스트 통과" : `\n실패 ${failed}건`);
process.exit(failed === 0 ? 0 : 1);
