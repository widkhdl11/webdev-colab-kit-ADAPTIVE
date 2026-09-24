#!/usr/bin/env node
// @check-role: standing
//
// check-wrapup.mjs — 항목 하나(또는 세션 하나)가 끝난 상태인지 파일로 판정한다.
//
// 부르는 곳: run-loop.mjs 가 회차마다, wrap-up 스킬이 마지막 단계로.
// 판정 여덟 가지는 scripts/lib/wrapup-checks.mjs 에 있고, 여기서는 입력을 모으기만 한다.
//
// 사용:
//   node scripts/check-wrapup.mjs [--project <slug>] [--root <레포 경로>]
//        [--round <n> --item <항목 id> --since <ISO> --base <커밋>] [--had-failure]
//
//   --round 가 있으면 결과를 report/loop/<n>.wrapup.json 에 남긴다.
//   --since 가 없으면 오늘 0시부터의 기록을 본다(세션 랩업).
//   --base 는 회차 시작 때의 커밋이다. 발견 기록(B8)을 "이 회차에 더한 줄"로 좁히는 데 쓴다.
//   없으면(세션 랩업) 그 파일들의 현재 줄 전체에서 오늘 날짜를 찾는다 — 더 느슨하다.
//
// 종료 코드: 통과 0 · 실패 1 · 입력 오류 2
//
// 정본 규약: docs/references/run-loop.md 3절

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { wrapupChecks, failedIds } from "./lib/wrapup-checks.mjs";
import { mergeLoopConfig } from "./lib/loop-model.mjs";
import { parseVocab } from "./lib/decision-model.mjs";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 발견 기록 파일. LESSONS 는 보호 파일이라 무인 루프는 백로그에 쓴다 — 검사는 셋 다 인정한다. */
export const FINDING_FILES = (slug) => [
  `projects/${slug}/docs/BACKLOG.md`,
  "docs/references/harness-backlog.md",
  "docs/LESSONS.md",
];

const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return null; } };
const readText = (p) => { try { return readFileSync(p, "utf-8"); } catch { return ""; } };
const readJsonl = (p) => readText(p).split(/\r?\n/).filter((l) => l.trim())
  .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });

function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function git(root, args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf-8" });
  return { code: r.status ?? 1, out: r.stdout ?? "", err: r.stderr ?? "" };
}

/**
 * 입력을 모아 판정한다. run-loop 가 프로세스를 새로 띄우지 않고 부를 수 있게 함수로 둔다.
 * @returns { checks, failed, input }
 */
export function runWrapup({ root = KIT_ROOT, slug, itemId = null, sinceIso = null, baseSha = null, hadFailure = false, config = null }) {
  const report = join(root, "projects", slug, "report");
  const ws = join(root, "projects", slug, "workspace");
  const cfg = config ?? mergeLoopConfig(readJson(join(report, "loop", "config.json"))).config;

  const status = git(root, ["status", "--porcelain"]);
  const gitDirty = status.code === 0 ? status.out.split(/\r?\n/).filter((l) => l.trim()) : [`git status 실패: ${status.err.trim()}`];

  const handoff = join(ws, "HANDOFF.md");
  const decisionRaw = readJson(join(report, "decision.json"));
  const decision = decisionRaw && decisionRaw.status === "대기" ? decisionRaw : null;

  const [cmd, ...args] = cfg.gates_cmd;
  const g = spawnSync(cmd, args, { cwd: root, encoding: "utf-8" });
  const gates = { exit: g.status ?? 1, out: `${g.stdout ?? ""}${g.stderr ?? ""}` };

  let addedLines;
  const files = FINDING_FILES(slug);
  if (baseSha) {
    const d = git(root, ["diff", baseSha, "HEAD", "--", ...files]);
    addedLines = d.out.split(/\r?\n/).filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));
  } else {
    addedLines = files.flatMap((f) => readText(join(root, f)).split(/\r?\n/));
  }

  const input = {
    gitDirty,
    request: readJson(join(report, "request.json")),
    transitions: readJsonl(join(report, "transitions.jsonl")),
    handoffMtimeMs: existsSync(handoff) ? statSync(handoff).mtimeMs : null,
    progressText: readText(join(ws, "PROGRESS.md")),
    decision,
    vocab: parseVocab(readJson(join(report, "decision-vocab.json"))).vocab,
    gates,
    itemId,
    // --since 가 없으면(세션 랩업) 오늘 0시부터 본다. 0 부터 보면 지난 며칠의 실패 줄 때문에
    // 오늘 발견 기록을 요구하게 된다 — 이미 기록된 실패를 매일 다시 적으라는 뜻이 된다.
    sinceMs: sinceIso ? Date.parse(sinceIso) : new Date(new Date().setHours(0, 0, 0, 0)).getTime(),
    hadFailure,
    addedLines,
    today: localDate(),
  };
  const checks = wrapupChecks(input);
  return { checks, failed: failedIds(checks), input };
}

/**
 * 프로브: 깨끗한 입력에서 여덟 개가 다 통과하고, 항목마다 위반을 **하나씩** 심으면 그 항목만
 * 실패하는지 본다. 「다른 항목이 대신 잡아서 빨간불」이면 그 항목은 아무것도 붙들고 있지 않은 것이라
 * 실패한 id 가 정확히 심은 것 하나인지까지 본다.
 */
export function probeWrapup() {
  const T0 = Date.parse("2026-09-24T10:00:00Z");
  const iso = (m) => new Date(T0 + m * 60000).toISOString();
  const request = {
    task: "probe-task", request: "프로브", goal: null, source: "manual", spec_path: null, status: "진행 중",
    status_reason: null, started_at: iso(0), ended_at: null,
    items: [{ id: "I1", label: "첫 항목", done: true }, { id: "I2", label: "둘째 항목", done: false }],
  };
  const clean = () => ({
    gitDirty: [], request: structuredClone(request),
    transitions: [
      { at: iso(1), to_node: "implement", item: "첫 항목", result: null },
      { at: iso(5), to_node: "implement", item: "첫 항목", result: "통과" },
    ],
    handoffMtimeMs: T0 + 6 * 60000, progressText: "## 현재 상태\n\n- probe-task 첫 항목 끝\n",
    decision: null, vocab: null, gates: { exit: 0, out: "" }, itemId: "I1", sinceMs: T0,
    hadFailure: false, addedLines: [], today: "2026-09-24",
  });
  const card = {
    id: "probe-20260924-1-d1", task: "probe-task", asked_at: iso(2), answer_options: ["예", "아니"],
    what: "발송 수단을 정한다", why: "외부 전송이라 사람이 정한다", visible_change: "알림이 메일로 간다",
    risk_and_guard: "요금이 든다", not_doing: "발송 자체는 안 한다", also_fixing: null,
    done_when: ["수단이 정해진다", "비용이 정해진다"], details_ref: "자세히", item: "I2", status: "대기", answer: null, answered_at: null,
  };
  const plants = [
    ["B1", (x) => { x.gitDirty = [" M scripts/a.mjs"]; }],
    ["B2", (x) => { x.request.items[0].done = false; }],
    ["B3", (x) => { x.handoffMtimeMs = T0 + 2 * 60000; }],
    ["B4", (x) => { x.progressText = "## 현재 상태\n\n- 앞 요청의 랩업이 그대로다\n"; }],
    ["B5", (x) => { x.decision = { ...card, what: "" }; }],
    ["B6", (x) => { x.gates = { exit: 2, out: "[gate] 위반" }; }],
    ["B7", (x) => { x.transitions.splice(1, 0, { at: iso(3), to_node: "implement", item: null, result: null }); }],
    ["B8", (x) => { x.transitions.splice(1, 0, { at: iso(3), to_node: "implement", item: "첫 항목", result: "실패" }); }],
  ];
  const results = [];
  const base = failedIds(wrapupChecks(clean()));
  results.push(["깨끗한 입력은 여덟 개 다 통과", base.length === 0, base.join(",")]);
  const parked = clean(); parked.itemId = "I2"; parked.decision = card;
  const parkedFails = failedIds(wrapupChecks(parked));
  results.push(["카드를 열고 멈춘 항목(done 아님)은 B2 를 통과한다", parkedFails.length === 0, parkedFails.join(",")]);
  const unparked = clean(); unparked.itemId = "I2"; unparked.decision = { ...card, item: "I1" };
  results.push(["다른 항목을 막는 카드로는 안 풀린다", failedIds(wrapupChecks(unparked)).join(",") === "B2", ""]);
  const withCard = clean(); withCard.decision = card;
  const cardFails = failedIds(wrapupChecks(withCard));
  results.push(["규약을 지키는 열린 카드는 통과", cardFails.length === 0, cardFails.join(",")]);
  for (const [id, plant] of plants) {
    const x = clean(); plant(x);
    const f = failedIds(wrapupChecks(x));
    results.push([`${id} 위반을 심으면 ${id} 만 잡힌다`, f.length === 1 && f[0] === id, f.join(",") || "안 잡힘"]);
  }
  // B8 은 실패 줄 대신 재시도 회차로도 켜지고, 오늘 날짜 줄이 더해지면 풀린다 — 양쪽을 다 본다.
  const retry = clean(); retry.hadFailure = true;
  results.push(["B8 재시도 회차도 발견 기록을 요구한다", failedIds(wrapupChecks(retry)).join(",") === "B8", ""]);
  retry.addedLines = ["- [ ] **끝 검사가 B2 로 실패** (2026-09-24) — done 을 빠뜨렸다"];
  results.push(["B8 오늘 날짜 줄이 있으면 풀린다", failedIds(wrapupChecks(retry)).length === 0, ""]);
  const stale = clean(); stale.hadFailure = true; stale.addedLines = ["- [ ] **옛 줄** (2026-09-23)"];
  results.push(["B8 다른 날짜 줄로는 안 풀린다", failedIds(wrapupChecks(stale)).join(",") === "B8", ""]);
  return results;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain && process.argv.includes("--probe")) {
  const results = probeWrapup();
  for (const [name, ok, detail] of results) console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — 실제: ${detail}` : ""}`);
  const bad = results.filter((r) => !r[1]).length;
  console.log(bad ? `프로브 실패 ${bad}건` : `프로브 ${results.length}/${results.length} 통과`);
  process.exit(bad ? 1 : 0);
}
if (isMain && !process.argv.includes("--probe")) {
  const argv = process.argv.slice(2);
  const arg = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
  const root = resolve(arg("root") ?? KIT_ROOT);
  const slug = (arg("project") ?? readText(join(root, "ACTIVE"))).trim();
  if (!slug) { console.error("프로젝트를 못 정했다. --project 로 주거나 루트 ACTIVE 를 채운다."); process.exit(2); }
  const round = arg("round");
  const { checks, failed } = runWrapup({
    root, slug, itemId: arg("item") ?? null, sinceIso: arg("since") ?? null,
    baseSha: arg("base") ?? null, hadFailure: argv.includes("--had-failure"),
  });
  for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.id} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  if (round !== undefined) {
    const dir = join(root, "projects", slug, "report", "loop");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${round}.wrapup.json`), `${JSON.stringify({ round: Number(round), at: new Date().toISOString(), passed: failed.length === 0, failed, checks }, null, 2)}\n`);
  }
  console.log(failed.length === 0 ? "항목 끝 검사 통과" : `항목 끝 검사 실패: ${failed.join(", ")}`);
  process.exit(failed.length === 0 ? 0 : 1);
}
