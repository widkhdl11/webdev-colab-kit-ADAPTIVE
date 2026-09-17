#!/usr/bin/env node
// @check-role: on-change
// @check-guards: scripts/turn-transition.mjs
//
// check-turn-transition.mjs — scripts/turn-transition.mjs 의 계약 테스트.
//
// 무엇을 지키는 검사인가:
//   이 도구가 고장 나는 모양은 셋이고 **전부 조용하다**.
//   ① 안 쓴다 → 예전과 똑같이 기록이 안 남는다(고친 게 없는 것과 구별 안 됨)
//   ② 너무 자주 쓴다 → 한 노드의 체류가 0초짜리 여러 줄로 쪼개진다. 화면은 멀쩡해 보인다
//   ③ 틀린 노드를 쓴다 → 「살아 있는데 위치만 틀린 화면」. 처음에 고치려던 그 고장이다
//   그래서 「쓴다」와 「안 쓴다」를 양쪽 다 심어서 본다. 한쪽만 보면 「언제나 쓴다」 또는
//   「언제나 안 쓴다」인 구현이 절반을 통과한다.
//
//   E2E(끝에서 끝까지) 항목은 임시 폴더에 진짜 리포트 폴더를 만들어 실제로 돌린다 —
//   순수 함수만 보면 「판정은 맞는데 아무 파일도 안 건드리는」 구현이 전부 초록이다.
//
// 쓰는 법:
//   node scripts/check-turn-transition.mjs                  (게이트가 부르는 모양)
//   node scripts/check-turn-transition.mjs --require-wiring (패치 적용 판정용)
//
//   종료 코드 0 = 통과, 1 = 실패.
//
// **배선(W1)은 기본으로 막지 않는다.** 배선은 보호 파일(gates/graph-stop.mjs) 패치라
// 사용자만 할 수 있는데, 그것을 게이트 실패로 만들면 패치를 붙일 때까지 다른 모든 작업이
// 막힌다. 대신 「배선 대기」 한 줄로 신고하고 통과한다. 패치 문서가 사라지면 그때는 실패한다 —
// 미루기는 「곧 붙인다는 문서가 살아 있는 동안」만 유효하다.

import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { GRAPH } from "../graph.mjs";
import { deriveWorkflow } from "./lib/report-model.mjs";
import { seed, note } from "./report-note.mjs";
import {
  unitOrder, changedUnits, mainNode, kitEdits, makeReason, decide, shortPath,
  recordTurnTransition, SNAPSHOT_FILE, NO_RECORD,
} from "./turn-transition.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const verdict = (id, ok, what, extra = "") => {
  console.log(`${ok ? "  ok " : "FAIL"} ${id} — ${what}${extra ? `\n       ${extra}` : ""}`);
  if (!ok) failed += 1;
};

const order = unitOrder();

// ── A. 단위 순서 — 「가장 뒤」의 뜻이 정해져 있어야 주 노드가 정해진다 ──
{
  const idx = (n) => order.indexOf(n);
  verdict("A1", idx("spec") >= 0 && idx("implement") > idx("spec"),
    "위상 순서다 — implement 가 spec 보다 뒤", order.join(" → "));
  verdict("A2", idx("implement") > idx("design/page-designer") && idx("implement") > idx("design/schema-designer"),
    "병렬 자식이 부모 자리에 펼쳐지고, 그 뒤가 implement 다");
  verdict("A3", idx("design") === -1, "집계 노드(design)는 단위가 아니다 — 자식만 해시를 갖는다");
  verdict("A4", idx("qa") > idx("implement") && idx("review") > idx("qa"),
    "qa → review 순서가 유지된다");
}

// ── B. 바뀐 단위 — 스냅샷 대조 ─────────────────────────────────────────
{
  verdict("B1", changedUnits({ implement: "h2" }, { implement: "h1" }).join() === "implement",
    "해시가 달라진 단위를 집는다");
  verdict("B2", changedUnits({ implement: "h1" }, { implement: "h1" }).length === 0,
    "같은 해시는 안 집는다");
  verdict("B3", changedUnits({ implement: "h1" }, null).length === 0,
    "직전 스냅샷이 없으면(첫 실행) 아무것도 안 집는다 — 「처음 본 것」은 「방금 바뀐 것」이 아니다");
  verdict("B4", changedUnits({ qa: null }, {}).length === 0,
    "산출물이 없던 단위(null)는 스냅샷에 없어도 안 집는다");
  verdict("B5", changedUnits({ qa: "h" }, {}).join() === "qa",
    "산출물이 새로 생긴 단위는 집는다");

  // ── 심은 위반(대조): 스냅샷 대신 「마지막 clean 해시」를 쓰면 어떻게 되나 ──
  //    dirty 노드의 해시는 null 이라(propagate.mjs 가 비운다) 아무것도 안 고쳐도 매 턴 잡힌다.
  //    이 항목이 없으면 「그냥 graph-stop 의 changed 를 쓰면 되지 않나」가 검사를 통과한다.
  const cleanHash = { implement: null };            // dirty 라서 비어 있는 상태
  verdict("B6", changedUnits({ implement: "h1" }, cleanHash).length === 1,
    "(대조) clean 해시와 대조하면 안 고친 턴도 바뀐 것으로 잡힌다 — 그래서 턴 스냅샷을 따로 둔다");
  verdict("B7", changedUnits({ implement: "h1" }, { implement: "h1" }).length === 0,
    "턴 스냅샷과 대조하면 같은 상황이 안 잡힌다 — B6 과의 차이가 이 설계의 이유다");
}

// ── C. 주 노드 = 위상 순서상 가장 뒤 ───────────────────────────────────
{
  verdict("C1", mainNode(["spec", "implement"], order) === "implement",
    "여러 노드가 바뀌면 하류를 고른다 — 상류를 고르면 지나온 자리에 머무는 것으로 보인다");
  verdict("C2", mainNode(["implement", "spec"], order) === "implement", "목록 순서에 안 흔들린다");
  verdict("C3", mainNode([], order) === null, "바뀐 것이 없으면 null");
  verdict("C4", mainNode(["없는노드"], order) === null, "그래프에 없는 이름은 노드가 되지 못한다");
}

// ── D. 그래프 밖 사유 — 활동 기록에서 뽑는다 ───────────────────────────
{
  const activity = [
    { at: "2026-09-17T01:00:00Z", tool: "Edit", target: `${ROOT}/gates/graph-stop.mjs` },
    { at: "2026-09-17T01:01:00Z", tool: "Read", target: `${ROOT}/scripts/probe.mjs` },
    { at: "2026-09-17T01:02:00Z", tool: "Write", target: `${ROOT}/scripts/turn-transition.mjs` },
    { at: "2026-09-17T00:00:00Z", tool: "Edit", target: `${ROOT}/docs/LESSONS.md` },
    { at: "2026-09-17T01:03:00Z", tool: "Edit", target: `${ROOT}/projects/fx/src/a.ts` },
  ];
  const got = kitEdits(activity, "2026-09-17T00:30:00Z", ROOT);
  verdict("D1", got.length === 2, "편집만 세고 읽기는 안 센다 — 읽은 것은 「무엇을 고쳤나」가 아니다", got.join(", "));
  verdict("D2", !got.some((p) => p.includes("LESSONS")), "스냅샷 시각 이전 편집은 이번 턴이 아니다");
  verdict("D3", !got.some((p) => p.includes("projects/")), "제품 파일은 그래프 안이라 그래프 밖 사유가 되지 못한다");
  verdict("D4", got[0] === "gates/graph-stop.mjs", "레포 기준 상대경로로 적는다 — 파일명만 적으면 어느 파일인지 모른다", got[0]);
  verdict("D5", makeReason(got) === "킷 — gates/graph-stop.mjs 외 1개", "사유 한 줄", makeReason(got));
  verdict("D6", makeReason(["gates/x.mjs"]) === "킷 — gates/x.mjs", "하나면 「외 N개」를 안 붙인다");
  verdict("D7", makeReason([]) === null, "고친 것이 없으면 사유가 없다(부르는 쪽이 「미기재」로 적는다)");
  verdict("D8", shortPath("C:\\밖\\어딘가\\x.mjs", ROOT) === "x.mjs", "레포 밖 경로는 파일명만");
}

// ── E. 결정 — 「쓴다」와 「안 쓴다」를 양쪽 다 심는다 ───────────────────
{
  const state = { current_node: null, task: "measurement", now: "계측 수리" };
  const base = { order, state, lastTransition: { item: "I2" }, kitFiles: [] };

  const writes = decide({ ...base, currentHashes: { implement: "h2" }, prevHashes: { implement: "h1" } });
  verdict("E1", writes?.node === "implement", "산출물이 바뀌면 그 노드를 기록한다");
  verdict("E2", writes?.task === "measurement" && writes?.now === "계측 수리",
    "의미 필드는 손 기록의 현재 값을 그대로 싣는다 — 훅이 지어내지 않는다");
  verdict("E3", writes?.item === "I2", "item 은 state 에 없는 필드라 마지막 전환에서 물려받는다");
  verdict("E4", writes?.result === null, "result(무엇이 끝났나)는 훅이 알 수 없다 — 언제나 null");

  const samePlace = decide({ ...base, state: { ...state, current_node: "implement" }, currentHashes: { implement: "h2" }, prevHashes: { implement: "h1" } });
  verdict("E5", samePlace === null,
    "같은 노드 안에서 또 고치면 줄이 안 는다 — 늘면 그 노드의 체류가 0초 여러 개로 쪼개진다");

  const firstRun = decide({ ...base, currentHashes: { implement: "h1" }, prevHashes: null });
  verdict("E6", firstRun === null, "첫 실행은 기록하지 않는다 — 설치 직후 가짜 전환 한 줄이 생기면 안 된다");

  const quiet = decide({ ...base, state: { ...state, current_node: "implement" }, currentHashes: { implement: "h1" }, prevHashes: { implement: "h1" } });
  verdict("E7", quiet === null, "아무것도 안 고친 턴은 위치가 바뀐 것이 아니다(읽기만 한 턴·질문만 한 턴)");

  const goesOutside = decide({ ...base, state: { ...state, current_node: "implement" }, currentHashes: { implement: "h1" }, prevHashes: { implement: "h1" }, kitFiles: ["gates/x.mjs"] });
  verdict("E8", goesOutside?.node === null && goesOutside?.offGraph === "킷 — gates/x.mjs",
    "제품은 그대로인데 킷만 고쳤으면 그래프 밖으로 기록하고 사유를 채운다");

  // 대상을 못 읽은 편집(활동 기록의 target 이 빈 줄)만 있는 턴. 그래프 밖으로 나온 것은
  // 사실이고 무엇을 고쳤는지만 모른다 — 줄은 남기고 사유 칸을 「미기재」로 둔다.
  const unknownReason = decide({ ...base, state: { ...state, current_node: "implement" }, currentHashes: {}, prevHashes: {}, kitFiles: [""] });
  verdict("E9", unknownReason !== null && unknownReason.node === null && unknownReason.offGraph === "미기재",
    "사유를 못 만들면 줄을 빠뜨리지 않고 「미기재」로 남긴다 — 다음 턴에 게이트가 그 한 줄을 요구한다",
    `사유=${unknownReason?.offGraph}`);

  const noState = decide({ ...base, state: null, currentHashes: { implement: "h2" }, prevHashes: { implement: "h1" } });
  verdict("E10", noState?.task === NO_RECORD.task && noState?.now === NO_RECORD.now,
    "손 기록이 아예 없어도 스키마가 요구하는 두 필드를 빈 값으로 두지 않는다");
}

// ── F. E2E — 진짜 폴더에 진짜로 쓴다 ───────────────────────────────────
//     순수 함수만 보면 「판정은 맞는데 아무 파일도 안 건드리는」 구현이 전부 초록이다.
{
  const tmp = mkdtempSync(join(tmpdir(), "turn-"));
  try {
    const dir = join(tmp, "projects", "fx", "report");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(tmp, "ACTIVE"), "fx", "utf-8");
    writeFileSync(join(dir, "workflow.json"), JSON.stringify(deriveWorkflow(GRAPH)), "utf-8");
    seed(dir, { node: null, task: "fx", now: "시작", offGraph: "킷 작업" });

    const rowCount = () => readFileSync(join(dir, "transitions.jsonl"), "utf-8").trim().split("\n").filter(Boolean).length;
    const where = () => JSON.parse(readFileSync(join(dir, "state.json"), "utf-8")).current_node;
    const run = (h, now) => recordTurnTransition(h, { slug: "fx", root: tmp, now });
    const startCount = rowCount();

    run({ implement: "h1" }, "2026-09-17T01:00:00Z");
    verdict("F1", rowCount() === startCount && existsSync(join(dir, SNAPSHOT_FILE)),
      "첫 실행 — 줄은 안 늘고 스냅샷만 생긴다", `줄=${rowCount()}`);

    run({ implement: "h2" }, "2026-09-17T01:01:00Z");
    verdict("F2", rowCount() === startCount + 1, "산출물이 바뀐 턴에 줄이 하나 는다", `줄=${rowCount()}`);
    verdict("F3", where() === "implement", "state 의 현재 노드가 같은 값으로 바뀐다", `현재=${where()}`);

    const lastRow = JSON.parse(readFileSync(join(dir, "transitions.jsonl"), "utf-8").trim().split("\n").pop());
    verdict("F4", lastRow.to_node === "implement" && lastRow.from_node === null,
      "전환 줄이 이어진다 — from 은 직전 줄의 to 다", `${lastRow.from_node} → ${lastRow.to_node}`);

    run({ implement: "h3" }, "2026-09-17T01:02:00Z");
    verdict("F5", rowCount() === startCount + 1, "같은 노드에서 또 고쳐도 줄이 안 는다", `줄=${rowCount()}`);

    run({ implement: "h3" }, "2026-09-17T01:03:00Z");
    verdict("F6", rowCount() === startCount + 1, "아무것도 안 고친 턴에도 안 는다", `줄=${rowCount()}`);

    // 킷만 고친 턴 — 활동 기록에 편집 한 줄을 넣고 해시는 그대로 둔다
    writeFileSync(join(dir, "activity.jsonl"),
      `${JSON.stringify({ at: "2026-09-17T01:04:30Z", tool: "Edit", target: `${tmp}/gates/graph-stop.mjs` })}\n`, "utf-8");
    run({ implement: "h3" }, "2026-09-17T01:05:00Z");
    const outsideRow = JSON.parse(readFileSync(join(dir, "transitions.jsonl"), "utf-8").trim().split("\n").pop());
    const st = JSON.parse(readFileSync(join(dir, "state.json"), "utf-8"));
    verdict("F7", rowCount() === startCount + 2 && outsideRow.to_node === null,
      "킷 파일만 고친 턴은 그래프 밖으로 기록된다", `줄=${rowCount()} to=${outsideRow.to_node}`);
    verdict("F8", st.off_graph === "킷 — gates/graph-stop.mjs",
      "사유 칸이 활동 기록에서 채워진다 — 「밖에 있었다」와 「안 적었다」가 구별된다", `사유=${st.off_graph}`);

    // 손 기록과 겹치는 턴 — 손이 먼저 qa 로 옮겨 놓았으면 훅은 같은 줄을 또 쓰지 않는다
    note(dir, { node: "qa", task: "fx", now: "손으로 적은 줄", item: "I1" });
    const beforeOverlap = rowCount();
    run({ implement: "h3", qa: "q1" }, "2026-09-17T01:06:00Z");
    verdict("F9", rowCount() === beforeOverlap,
      "같은 턴에 손 기록이 이미 그 노드를 적었으면 훅은 중복 줄을 안 만든다", `줄=${rowCount()}`);

    const snap = JSON.parse(readFileSync(join(dir, SNAPSHOT_FILE), "utf-8"));
    verdict("F10", snap.hashes.qa === "q1",
      "기록을 안 한 턴에도 스냅샷은 갱신된다 — 안 그러면 며칠 전 편집이 계속 이번 턴으로 잡힌다");

    // 심은 위반: 리포트 폴더가 없는 프로젝트에는 아무것도 만들지 않는다
    rmSync(dir, { recursive: true, force: true });
    verdict("F11", run({ implement: "h9" }, "2026-09-17T01:07:00Z") === null && !existsSync(dir),
      "대시보드를 안 깐 프로젝트에는 폴더도 파일도 안 만든다");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ── G. 단일 기록자 규약 — 이 모듈은 state 를 직접 쓰지 않는다 ──────────
{
  const src = readFileSync(join(ROOT, "scripts", "turn-transition.mjs"), "utf-8");
  const badLines = src.split(/\r?\n/).filter((l) => {
    const code = l.split("//")[0];
    return /state\.json/.test(code) && /\b(writeFileSync|appendFileSync|createWriteStream|writeFile)\b/.test(code);
  });
  verdict("G1", badLines.length === 0,
    "state.json 을 직접 쓰지 않는다 — 쓰기는 report-note.mjs 의 note() 하나뿐이다",
    badLines.join(" / "));
  verdict("G2", /\bnote\(/.test(src),
    "그리고 실제로 note() 를 부른다 — 판정만 하고 아무 데도 안 쓰면 예전과 같은 상태다");
  verdict("G3", !/from "\.\.\/gates\//.test(src),
    "gates/ 를 정적 import 하지 않는다 — 샌드박스로 도는 검사들이 한쪽만 복사한다");
}

// ── W. 배선 — 판단이 멀쩡해도 부르는 자리가 없으면 아무것도 안 기록된다 ──
{
  const p = join(ROOT, "gates", "graph-stop.mjs");
  const src = existsSync(p) ? readFileSync(p, "utf-8") : "";
  const calls = /turn-transition\.mjs/.test(src) && /recordTurnTransition/.test(src);
  const wrapped = /try\s*{[^}]*recordTurnTransition[\s\S]{0,400}?catch/.test(src);
  const patchDoc = join(ROOT, "docs", "references", "pending-patches", "2026-09-17-turn-transition.md");
  const deferOk = existsSync(patchDoc);
  const requireWiring = process.argv.includes("--require-wiring");

  if (calls) {
    verdict("W1", true, "gates/graph-stop.mjs 가 턴 끝에 이 도구를 부른다");
    verdict("W2", wrapped,
      "부르는 자리가 try/catch 안에 있다 — 여기서 던지면 훅이 죽고 차단 판정(exit 2)에 영영 도달 못 한다");
    verdict("W3", !/import\s+.*from\s+"\.\.\/scripts\/turn-transition/.test(src),
      "정적 import 가 아니다 — gates/ 만 복사하는 샌드박스에서 훅이 통째로 죽는다(2026-09-17 실측: 게이트 실패 16건)");
  } else if (requireWiring || !deferOk) {
    verdict("W1", false, "gates/graph-stop.mjs 가 턴 끝에 이 도구를 부른다",
      deferOk
        ? "아직 안 붙었다 → docs/references/pending-patches/2026-09-17-turn-transition.md"
        : "안 붙었는데 패치 문서도 없다 — 미루기의 근거가 사라졌다");
  } else {
    console.log(
      [
        "▦ 배선 대기 1건 — gates/graph-stop.mjs 가 아직 이 도구를 안 부른다(보호 파일이라 사용자가 붙인다).",
        "       판단 로직은 위 항목들이 지키고 있고, 실제로 기록되는 것은 패치를 붙인 뒤다.",
        "       붙일 것: docs/references/pending-patches/2026-09-17-turn-transition.md",
        "       적용 판정: node scripts/check-turn-transition.mjs --require-wiring",
      ].join("\n"),
    );
  }
}

console.log(failed === 0 ? "\n계약 테스트 통과" : `\n실패 ${failed}건`);
process.exit(failed === 0 ? 0 : 1);
