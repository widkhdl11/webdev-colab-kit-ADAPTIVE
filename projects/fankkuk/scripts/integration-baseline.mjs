#!/usr/bin/env node
// 통합 시험 실패 기준선 검사 — 사인오프 때 통합 시험 전체 결과를 tests/integration/known-failures.json 과 대조한다.
//
// 기준선은 빨간불을 숨기는 자리가 아니라 「아직 못 고친 실패의 고칠 날짜」를 적는 자리다. 그래서 이렇게 판정한다.
//   - 기준선에 없는 실패 → 새 실패. 실패.
//   - 기준선 항목에 실패 이유·처음 발견한 날(found)·고칠 기한(due)이 없거나, 기한이 발견일로부터 14일을 넘게 잡혔으면 실패.
//   - 오늘이 기한을 넘겼으면 실패 — 발견하고 2주 넘게 남은 실패는 사인오프를 막는다.
//   - 기준선 항목이 이번 실행에서 통과했거나 이름이 바뀌어 없으면 실패 — 지우거나 고쳐 적는다(낡은 항목이 새 실패를 덮지 않게).
//   - 시험 파일이 통째로 못 돈 경우(불러오기 오류·전역 준비 실패)도 실패.
//
// 사용:
//   node scripts/integration-baseline.mjs --run            통합 시험 전체를 돌리고 대조한다(1시간 반쯤)
//   node scripts/integration-baseline.mjs <결과.json>      이미 돌린 vitest JSON 결과(--reporter=json --outputFile)와 대조한다
//   --today YYYY-MM-DD · --baseline <파일> 은 오늘 날짜와 기준선 파일을 바꾼다(이 검사를 시험할 때만).
// 기준선 항목의 열쇠는 「tests/integration/파일 > describe > it」 전체 이름이다.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const argv = process.argv.slice(2);
const option = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const VALUE_OPTIONS = ["--today", "--baseline"];
const baselinePath = resolve(option("--baseline") ?? join(projectRoot, "tests", "integration", "known-failures.json"));

/** 한국 시각 기준 오늘 YYYY-MM-DD */
function todayKst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const today = option("--today") ?? todayKst();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const days = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

// ---------- 결과 얻기 ----------

function runAll() {
  const out = join(mkdtempSync(join(tmpdir(), "fk-integration-")), "result.json");
  spawnSync("npx", ["vitest", "run", "--config", "vitest.integration.config.mts", "--reporter=dot", "--reporter=json", `--outputFile=${out}`], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return out;
}

const resultPath = argv.includes("--run") ? runAll() : argv.find((a, i) => !a.startsWith("--") && !VALUE_OPTIONS.includes(argv[i - 1]));
if (!resultPath) {
  console.error("사용: node scripts/integration-baseline.mjs --run | <vitest JSON 결과>");
  process.exit(2);
}
if (!existsSync(resultPath)) {
  console.error(`결과 파일이 없다: ${resultPath} — 시험이 끝까지 돌지 못했다.`);
  process.exit(1);
}

const result = JSON.parse(readFileSync(resultPath, "utf8"));
const problems = [];

// ---------- 실행 결과 정리 ----------

const outcomes = new Map(); // 열쇠 → "passed" | "failed" | 그 밖(skipped 등)
for (const file of result.testResults ?? []) {
  const rel = relative(projectRoot, file.name).replace(/\\/g, "/");
  const assertions = file.assertionResults ?? [];
  if (file.status === "failed" && assertions.every((a) => a.status !== "failed")) {
    // 시험 하나도 실패하지 않았는데 파일이 실패 = 불러오기·beforeAll 단계에서 죽었다.
    problems.push(`파일이 통째로 못 돌았다: ${rel} — ${(file.message ?? "").split("\n")[0]}`);
  }
  for (const a of assertions) outcomes.set(`${rel} > ${a.fullName}`, a.status);
}
if ((result.numTotalTests ?? 0) === 0 || outcomes.size === 0) {
  problems.push("시험이 하나도 돌지 않았다 — 전역 준비(globalSetup) 단계에서 멈췄는지 본다.");
}
if (result.success === false && (result.numFailedTests ?? 0) === 0 && (result.numFailedTestSuites ?? 0) === 0) {
  problems.push("실패한 시험은 없는데 실행이 실패로 끝났다 — 처리되지 않은 오류가 있었다(로그를 본다).");
}

// ---------- 기준선 읽기·검사 ----------

const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : { entries: [] };
const entries = baseline.entries ?? [];
const known = new Map();
for (const e of entries) {
  const label = e.test ?? "(test 칸 없음)";
  if (known.has(label)) problems.push(`기준선에 같은 시험이 두 번: ${label}`);
  known.set(label, e);
  if (!e.reason || !String(e.reason).trim()) problems.push(`기준선 항목에 실패 이유가 없다: ${label}`);
  if (!DATE.test(e.found ?? "")) problems.push(`기준선 항목에 처음 발견한 날(found)이 없다: ${label}`);
  if (!DATE.test(e.due ?? "")) problems.push(`기준선 항목에 고칠 기한(due)이 없다: ${label}`);
  if (!DATE.test(e.found ?? "") || !DATE.test(e.due ?? "")) continue;
  if (days(e.found, e.due) > MAX_DAYS) {
    problems.push(`고칠 기한이 발견일로부터 ${MAX_DAYS}일을 넘게 잡혔다(${e.found} → ${e.due}): ${label}`);
  }
  if (days(e.found, today) > MAX_DAYS || today > e.due) {
    problems.push(`기한이 지났다(발견 ${e.found}, 기한 ${e.due}, 오늘 ${today}) — 고치거나 사용자에게 올린다: ${label}`);
  }
  const outcome = outcomes.get(label);
  if (outcome === undefined) problems.push(`기준선 시험을 이번 실행에서 못 찾았다(이름이 바뀌었거나 지워짐): ${label}`);
  else if (outcome === "passed") problems.push(`기준선 시험이 이제 통과한다 — 기준선에서 뺀다: ${label}`);
}

const newFailures = [...outcomes].filter(([key, status]) => status === "failed" && !known.has(key)).map(([key]) => key);
for (const key of newFailures) problems.push(`새 실패: ${key}`);

// ---------- 보고 ----------

const failed = [...outcomes.values()].filter((s) => s === "failed").length;
const passed = [...outcomes.values()].filter((s) => s === "passed").length;
console.log(`통합 시험 ${outcomes.size}개 — 통과 ${passed} · 실패 ${failed}(기준선 ${failed - newFailures.length} · 새 실패 ${newFailures.length}) · 기준선 항목 ${entries.length} · 오늘 ${today}`);
if (problems.length === 0) {
  console.log("기준선 검사 통과");
  process.exit(0);
}
console.log(`기준선 검사 실패 ${problems.length}건`);
for (const p of problems) console.log(`  - ${p}`);
process.exit(1);
