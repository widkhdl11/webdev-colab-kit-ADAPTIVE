#!/usr/bin/env node
// @check-role: on-change
// @check-guards: scripts/run-loop.mjs, scripts/check-wrapup.mjs, scripts/loop-rehearsal.mjs, scripts/loop-item-prompt.md, scripts/lib/loop-model.mjs, scripts/lib/loop-files.mjs, scripts/lib/wrapup-checks.mjs, scripts/lib/request-model.mjs, scripts/report-decision.mjs, .claude/skills/report-dashboard/assets/render.mjs, .claude/skills/wrap-up/SKILL.md
//
// check-run-loop.mjs — 자율 실행 루프가 멈춰야 할 때 멈추고, 넘어가야 할 때 넘어가는지 본다.
//
// 진짜 claude 를 부르지 않는다. 임시 git 레포를 만들고, 설정의 claude_cmd 자리에 가짜 프로세스를
// 끼운다. 가짜는 항목마다 정해진 대로(끝냄·안 끝냄·카드 열기·멈춤 요청·커밋 빠뜨림) 파일을 고치고
// stream-json 을 낸다. 루프가 보는 것은 파일뿐이라, 파일을 같은 모양으로 남기면 같은 판정이 나와야 한다.
//
// 보는 것 (docs/references/run-loop.md 7절의 완성 판정과 번호를 맞췄다):
//   J2 항목 끝 검사 여덟 개에 위반을 하나씩 심으면 그것만 잡힌다(check-wrapup --probe) ·
//      루프에서 끝 검사가 실패하면 한 번 재시도하고 멈춘다
//   J3 카드가 항목 하나를 막으면 그 항목을 건너뛰고 다른 항목으로 간다 · 전부 막히면 「결정 대기」
//   J4 멈춤 요청 · 회차 상한 · 시간 상한이 각각 멈추고, 잠금이 걷힌다 · 남은 잠금은 --stop 이 정리한다
//   J6 리허설이 불일치면 멈추고, 일치하면 지나간다 · 입력이 상한을 넘으면 표시한다
//   J7 자동 시작 판정(설정이 꺼지면 언제나 아니다)
//   J8 대시보드 한 줄
//   +  의존(deps)은 앞 항목만 · 시작 뒤 못 바꾼다
//
// 사용: node scripts/check-run-loop.mjs [--keep]

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { runLoop, stopLoop } from "./run-loop.mjs";
import { probeWrapup } from "./check-wrapup.mjs";
import { runRehearsal, compareAnswer, handoffFrontier } from "./loop-rehearsal.mjs";
import { loopNotice, pickNextItem, shouldAutostart, mergeLoopConfig, limitReason, roundFailureSummary } from "./lib/loop-model.mjs";
import { validateRequest, frozenItemsErrors } from "./lib/request-model.mjs";
import { loopPaths } from "./lib/loop-files.mjs";

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KEEP = process.argv.includes("--keep");
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail });

// ── 가짜 claude ─────────────────────────────────────────────────────────
// 시나리오 파일(<root>/fake-scenario.json)의 항목별 동작을 따른다. 동작 어휘:
//   done      항목을 제대로 끝낸다(통과 줄·done·PROGRESS·HANDOFF·커밋)
//   nocommit  done 까지 하고 커밋을 빠뜨린다 → 끝 검사 B1 실패
//   undone    아무것도 안 하고 끝난다
//   card      그 항목을 막는 카드를 열고 항목은 그대로 둔다(커밋까지)
//   done+stop 끝내고, 사람이 그 사이 멈춤을 누른 것처럼 멈춤 파일을 남긴다
const FAKE = String.raw`
import { readFileSync, writeFileSync, appendFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
const root = process.cwd();
const sc = JSON.parse(readFileSync(join(root, "fake-scenario.json"), "utf-8"));
const prompt = readFileSync(0, "utf-8");
if (prompt.startsWith("다음은 어떤 작업의 인수인계")) {
  console.log(JSON.stringify({ type: "result", result: JSON.stringify(sc.rehearsal ?? {}) }));
  process.exit(0);
}
const item = process.env.KIT_LOOP_ITEM;
const seen = sc.seen ?? {}; seen[item] = (seen[item] ?? 0) + 1; sc.seen = seen;
writeFileSync(join(root, "fake-scenario.json"), JSON.stringify(sc));
const acts = sc.items[item] ?? ["undone"];
const act = acts[Math.min(seen[item] - 1, acts.length - 1)];
const rep = join(root, "projects", "x", "report");
const req = JSON.parse(readFileSync(join(rep, "request.json"), "utf-8"));
const it = req.items.find((i) => i.id === item);
const now = () => new Date().toISOString();
const row = (o) => appendFileSync(join(rep, "transitions.jsonl"), JSON.stringify({ at: now(), from_node: null, to_node: "implement", task: req.task, now: "가짜", blockers: [], ...o }) + "\n");
const handoff = join(root, "projects", "x", "workspace", "HANDOFF.md");
const touch = () => { const t = new Date(Date.now() + 1000); utimesSync(handoff, t, t); };
const commit = () => execSync("git add -A && git -c user.email=f@x -c user.name=f commit -qm fake --allow-empty", { cwd: root, stdio: "ignore", shell: true });
if (act === "done" || act === "nocommit" || act === "done+stop") {
  row({ item: it.label, result: null });
  row({ item: it.label, result: "통과" });
  it.done = true;
  writeFileSync(join(rep, "request.json"), JSON.stringify(req, null, 2));
  touch();
  // 재시도 회차면 무엇이 틀렸는지 오늘 날짜로 백로그에 남긴다(끝 검사 B8 이 요구한다).
  if (seen[item] > 1) {
    const d = new Date(); const p2 = (n) => String(n).padStart(2, "0");
    appendFileSync(join(root, "projects", "x", "docs", "BACKLOG.md"), "- [ ] **앞 회차 실패** (" + d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + ") — 가짜\n");
  }
  if (act !== "nocommit") commit(); else writeFileSync(join(root, "stray.txt"), "빠뜨린 변경");
  if (act === "done+stop") writeFileSync(join(rep, "loop", "stop-requested"), now());
} else if (act === "card") {
  row({ item: it.label, result: null });
  writeFileSync(join(rep, "decision.json"), JSON.stringify({
    id: "x-20260924-1-d1", task: req.task, asked_at: now(), answer_options: ["메일로", "아니"],
    what: "알림을 어디로 보낼지 정한다", why: "외부로 나가는 일이라 사람이 정한다", visible_change: "실패하면 알림이 온다",
    risk_and_guard: "보내는 데 돈이 든다", not_doing: "이번엔 실제로 안 보낸다", also_fixing: null,
    done_when: ["보낼 곳이 정해진다", "비용이 정해진다"], details_ref: "자세히", item, starts_loop: false,
    status: "대기", answer: null, answered_at: null }, null, 2));
  touch(); commit();
}
console.log(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "git commit -m fake" } }] } }));
console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, num_turns: 3, session_id: "fake-" + process.pid,
  permission_denials: act === "undone" ? [{ tool_name: "Write", tool_input: { file_path: "a" } }] : [] }));
`;

function makeRepo(label, { items, scenario, config = {}, extraItemsFields = {} }) {
  const root = mkdtempSync(join(tmpdir(), `run-loop-${label}-`));
  const rep = join(root, "projects", "x", "report");
  const ws = join(root, "projects", "x", "workspace");
  mkdirSync(join(rep, "loop"), { recursive: true });
  mkdirSync(ws, { recursive: true });
  mkdirSync(join(root, "projects", "x", "docs"), { recursive: true });
  writeFileSync(join(root, "projects", "x", "docs", "BACKLOG.md"), "# BACKLOG\n");
  writeFileSync(join(root, "fake-claude.mjs"), FAKE);
  writeFileSync(join(root, "fake-scenario.json"), JSON.stringify(scenario));
  writeFileSync(join(root, ".gitignore"), "projects/*/report/loop/*\n!projects/*/report/loop/config.json\nprojects/*/report/loop.lock\nprojects/*/report/*.jsonl\nprojects/*/report/request.json\nprojects/*/report/decision.json\nfake-scenario.json\n");
  const request = {
    task: "fail-alert", title: null, request: "실패 알림 만들기", goal: null, source: "manual", spec_path: null,
    items: items.map((label, i) => ({ id: `I${i + 1}`, label, done: false, ...(extraItemsFields[`I${i + 1}`] ?? {}) })),
    status: "진행 중", status_reason: null, started_at: new Date(Date.now() - 60000).toISOString(), ended_at: null,
  };
  writeFileSync(join(rep, "request.json"), JSON.stringify(request, null, 2));
  writeFileSync(join(rep, "transitions.jsonl"), "");
  writeFileSync(join(ws, "HANDOFF.md"), "# HANDOFF\n# 프론티어(지금 작업할 노드, 파생값): implement\n");
  writeFileSync(join(ws, "PROGRESS.md"), "# PROGRESS\n\n## 현재 상태\n\n- fail-alert 진행 중\n");
  writeFileSync(join(rep, "loop", "config.json"), JSON.stringify({
    claude_cmd: [process.execPath, join(root, "fake-claude.mjs")],
    gates_cmd: [process.execPath, "-e", "0"], rehearsal: false, ...config,
  }));
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf-8" });
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.email=f@x", "-c", "user.name=f", "commit", "-qm", "init");
  return root;
}
const quiet = () => {};
const readState = (root) => JSON.parse(readFileSync(loopPaths(root, "x").state, "utf-8"));
const readReq = (root) => JSON.parse(readFileSync(join(root, "projects", "x", "report", "request.json"), "utf-8"));
const lockGone = (root) => !existsSync(loopPaths(root, "x").lock);
const roots = [];
const repo = (...a) => { const r = makeRepo(...a); roots.push(r); return r; };

try {
  // ── J2 · 끝 검사 여덟 개 프로브 ─────────────────────────────────────
  for (const [name, ok, detail] of probeWrapup()) check(`J2 ${name}`, ok, detail);

  // ── J1 모양 · 세 항목이 끝까지, 회차마다 새 프로세스 ────────────────
  {
    const root = repo("all", { items: ["리포트 필드", "대시보드 표시", "메일 발송"], scenario: { items: { I1: ["done"], I2: ["done"], I3: ["done"] } } });
    const st = runLoop({ root, slug: "x", log: quiet });
    const rounds = [1, 2, 3].map((n) => JSON.parse(readFileSync(loopPaths(root, "x").round(n), "utf-8")));
    const pids = new Set(rounds.map((r) => r.pid));
    check("J1 세 항목이 다 끝나면 「요청 완료」로 멈춘다", st.status === "요청 완료" && st.done === 3, `${st.status} ${st.done}/3`);
    check("J1 회차마다 다른 프로세스였다(회차 기록의 프로세스 id)", pids.size === 3 && !pids.has(null), [...pids].join(","));
    check("F  끝난 회차의 실패 요약은 비어 있다(null)", rounds.every((r) => "failure_summary" in r && r.failure_summary === null), rounds.map((r) => r.failure_summary).join(" | "));
    check("J4 끝나면 잠금이 걷힌다", lockGone(root));
    const perm = JSON.parse(readFileSync(loopPaths(root, "x").permissions, "utf-8"));
    check("G  쓴 도구를 허용 목록 재료로 센다", perm.used["Bash(git:*)"] === 3, JSON.stringify(perm.used));
  }

  // ── J2 · 루프에서 끝 검사 실패 → 한 번 재시도 → 멈춤 ────────────────
  {
    const root = repo("retry", { items: ["리포트 필드", "대시보드 표시"], scenario: { items: { I1: ["nocommit", "nocommit"] } } });
    const st = runLoop({ root, slug: "x", log: quiet });
    const sc = JSON.parse(readFileSync(join(root, "fake-scenario.json"), "utf-8"));
    const w2 = JSON.parse(readFileSync(loopPaths(root, "x").wrapup(2), "utf-8"));
    check("J2 커밋을 빠뜨리면 B1 로 잡혀 같은 항목을 한 번 더 돌린다", sc.seen.I1 === 2, `I1 ${sc.seen.I1}회`);
    check("J2 재시도도 실패하면 「항목 실패」로 멈춘다", st.status === "항목 실패", st.status);
    check("J2 재시도 회차에도 커밋을 빠뜨리면 B1, 커밋 안 된 발견 기록이라 B8 도 잡힌다", w2.failed.join(",") === "B1,B8", w2.failed.join(","));
    check("J2 멈춘 뒤 다음 항목은 손대지 않았다", sc.seen.I2 === undefined);
    const r2 = JSON.parse(readFileSync(loopPaths(root, "x").round(2), "utf-8"));
    check("F  실패 회차 기록에 실패 요약 한 줄 — 끝 검사 id 와 그 사유", /^B1 커밋 안 된 변경/.test(r2.failure_summary ?? "") && /B8 /.test(r2.failure_summary), r2.failure_summary);
    check("F  멈춘 상태의 마지막 결과에도 같은 요약", st.last_result?.failure_summary === r2.failure_summary, st.last_result?.failure_summary);
    check("J4 멈춰도 잠금이 걷힌다", lockGone(root));
  }
  {
    const root = repo("retry-ok", { items: ["리포트 필드"], scenario: { items: { I1: ["undone", "done"] } } });
    const st = runLoop({ root, slug: "x", log: quiet });
    check("J2 한 번 실패하고 재시도에서 끝내면 계속 간다", st.status === "요청 완료", st.status);
    const perm = JSON.parse(readFileSync(loopPaths(root, "x").permissions, "utf-8"));
    check("G  권한 거부를 따로 센다", perm.denied.Write === 1, JSON.stringify(perm.denied));
    const r1 = JSON.parse(readFileSync(loopPaths(root, "x").round(1), "utf-8"));
    check("F  안 끝낸 회차 요약에 권한 거부와 「항목이 닫히지 않았다」", /권한 거부 1건\(Write\)/.test(r1.failure_summary ?? "") && /항목이 닫히지 않았다/.test(r1.failure_summary), r1.failure_summary);
  }

  // ── J3 · 카드 하나가 항목 하나를 막으면 건너뛴다 · 전부 걸리면 멈춘다 ───
  {
    // I3 은 I1 에만 의존한다(I2 가 카드에 걸려도 진행 가능).
    const root = repo("skip", {
      items: ["리포트 필드", "메일 발송", "대시보드 표시"], extraItemsFields: { I3: { deps: ["I1"] } },
      scenario: { items: { I1: ["done"], I2: ["card"], I3: ["done"] } },
    });
    const st = runLoop({ root, slug: "x", log: quiet });
    const req = readReq(root);
    check("J3 카드를 연 항목을 건너뛰고 다른 항목(I3)을 끝낸다", req.items.find((i) => i.id === "I3").done === true);
    check("J3 남은 항목이 전부 카드에 걸리면 「결정 대기」로 멈춘다", st.status === "결정 대기" && /1개/.test(st.stop_detail ?? ""), `${st.status} · ${st.stop_detail}`);
  }
  {
    // 기본 의존(앞 항목)이면 I2 가 걸리는 순간 I3 도 못 간다.
    const root = repo("chain", { items: ["리포트 필드", "메일 발송", "대시보드 표시"], scenario: { items: { I1: ["done"], I2: ["card"], I3: ["done"] } } });
    const st = runLoop({ root, slug: "x", log: quiet });
    const sc = JSON.parse(readFileSync(join(root, "fake-scenario.json"), "utf-8"));
    check("J3 앞 항목이 걸리면 뒤 항목도 안 간다(기본 의존)", st.status === "결정 대기" && sc.seen.I3 === undefined, `${st.status} I3=${sc.seen.I3}`);
  }
  {
    const items = [{ id: "I1", label: "a", done: false }, { id: "I2", label: "b", done: false }];
    const noItemCard = { status: "대기", id: "c-d1" };
    check("J3 어느 항목인지 없는 카드는 전부를 막는다", pickNextItem({ items }, noItemCard).status === "결정 대기");
  }

  // ── J4 · 멈춤 요청 · 회차 상한 · 시간 상한 · 남은 잠금 ─────────────────
  {
    const root = repo("stop", { items: ["a", "b", "c"], scenario: { items: { I1: ["done+stop"], I2: ["done"], I3: ["done"] } } });
    const st = runLoop({ root, slug: "x", log: quiet });
    const req = readReq(root);
    check("J4 멈춤 요청은 지금 항목을 끝내고 멈춘다", st.status === "정지 요청" && req.items[0].done && !req.items[1].done, `${st.status}`);
    check("J4 멈춤 뒤 잠금·멈춤 파일이 걷힌다", lockGone(root) && !existsSync(loopPaths(root, "x").stop));
  }
  {
    const root = repo("cap", { items: ["a", "b", "c"], scenario: { items: { I1: ["done"], I2: ["done"], I3: ["done"] } }, config: { max_rounds: 2 } });
    const st = runLoop({ root, slug: "x", log: quiet });
    check("J4 회차 상한(2)에 닿으면 멈춘다", st.status === "상한 도달" && st.round === 2 && /회차/.test(st.stop_detail), `${st.status} ${st.round} ${st.stop_detail}`);
  }
  {
    const root = repo("time", { items: ["a", "b", "c"], scenario: { items: { I1: ["done"], I2: ["done"], I3: ["done"] } }, config: { max_minutes: 5 } });
    // 회차 하나가 끝날 때마다 4분이 흐른 시계. 가짜가 돈 횟수로 센다.
    const t0 = Date.now();
    const now = () => {
      const sc = JSON.parse(readFileSync(join(root, "fake-scenario.json"), "utf-8"));
      const ran = Object.values(sc.seen ?? {}).reduce((a, b) => a + b, 0);
      return t0 + ran * 4 * 60000 + (ran >= 2 ? 1 : 0);
    };
    const st = runLoop({ root, slug: "x", log: quiet, now });
    check("J4 시간 상한에 닿으면 새 회차를 열지 않는다", st.status === "상한 도달" && /시간/.test(st.stop_detail) && st.done === 2 && st.total === 3, `${st.status} ${st.stop_detail} ${st.done}`);
  }
  {
    const root = repo("stale", { items: ["a"], scenario: { items: { I1: ["done"] } } });
    writeFileSync(loopPaths(root, "x").lock, JSON.stringify({ pid: 999999, started_at: new Date().toISOString() }));
    let refused = false;
    try { runLoop({ root, slug: "x", log: quiet }); } catch (e) { refused = /남은 잠금/.test(e.message); }
    check("J4 비정상 종료로 남은 잠금이 있으면 시작을 거부한다", refused);
    const msg = stopLoop({ root, slug: "x" });
    check("J4 --stop 이 남은 잠금을 정리한다", lockGone(root) && /정리/.test(msg), msg);
    check("J4 정리 뒤에는 다시 시작된다", runLoop({ root, slug: "x", log: quiet }).status === "요청 완료");
  }
  {
    const root = repo("nostop", { items: ["a"], scenario: { items: {} } });
    check("J4 도는 루프가 없으면 --stop 은 아무것도 안 한다", /없다/.test(stopLoop({ root, slug: "x" })));
  }

  // ── J6 · 리허설 ──────────────────────────────────────────────────────
  {
    const good = { now_node: "implement", next_item_id: "I1", open_decision_id: null, cautions: ["없음"] };
    const root = repo("reh-ok", { items: ["a"], scenario: { items: { I1: ["done"] }, rehearsal: good }, config: { rehearsal: true } });
    const st = runLoop({ root, slug: "x", log: quiet });
    check("J6 리허설이 파일과 일치하면 지나간다", st.status === "요청 완료" && st.rehearsal?.ok === true, JSON.stringify(st.rehearsal));
    const bad = repo("reh-bad", { items: ["a"], scenario: { items: { I1: ["done"] }, rehearsal: { ...good, next_item_id: "I2" } }, config: { rehearsal: true } });
    const st2 = runLoop({ root: bad, slug: "x", log: quiet });
    const sc = JSON.parse(readFileSync(join(bad, "fake-scenario.json"), "utf-8"));
    check("J6 리허설이 어긋나면 「리허설 실패」로 멈추고 회차를 안 연다", st2.status === "리허설 실패" && sc.seen === undefined, `${st2.status} ${st2.stop_detail}`);
    const big = repo("reh-big", { items: ["a"], scenario: { items: {}, rehearsal: good }, config: { rehearsal: true, rehearsal_token_limit: 10 } });
    const out = runRehearsal({ root: big, slug: "x" });
    check("J6 입력이 상한을 넘으면 표시한다", out.over_limit === true && out.ok === true, `${out.input_tokens_estimate}`);
    const none = compareAnswer({ now_node: null, next_item_id: "I1", open_decision_id: null }, { now_node: "없음 — 전부 clean", next_item_id: "I1", open_decision_id: "없음" });
    check("J6 「없음 — 전부 clean」 같은 없음 표기는 없음으로 읽는다", none.length === 0, none.join(" / "));
    const word = compareAnswer({ now_node: null, next_item_id: null, open_decision_id: null }, { now_node: "nullable", next_item_id: null, open_decision_id: null });
    check("J6 「없음」으로 시작하는 게 아닌 낱말은 값으로 읽는다(nullable)", word.length === 1, word.join(" / "));
    check("J6 HANDOFF 의 「없음 — 전부 clean」 프론티어는 노드 없음이다", handoffFrontier("# 프론티어(지금 작업할 노드, 파생값): 없음 — 전부 clean") === null && handoffFrontier("# 프론티어(지금 작업할 노드, 파생값): review") === "review");
  }

  // ── J7 · 자동 시작 판정 ──────────────────────────────────────────────
  {
    const card = { starts_loop: true, answer_options: ["착수해", "아니"] };
    const on = { autostart: true };
    check("J7 설정이 꺼져 있으면 승인 답에도 안 띄운다", !shouldAutostart({ card, answer: "착수해", loopState: null, lockAlive: false, config: { autostart: false } }));
    check("J7 켜져 있고 루프 카드의 첫 선택지면 띄운다", shouldAutostart({ card, answer: "착수해", loopState: null, lockAlive: false, config: on }));
    check("J7 다른 선택지면 안 띄운다", !shouldAutostart({ card, answer: "아니", loopState: null, lockAlive: false, config: on }));
    check("J7 루프 카드가 아니면 안 띄운다", !shouldAutostart({ card: { ...card, starts_loop: false }, answer: "착수해", loopState: null, lockAlive: false, config: on }));
    check("J7 결정 대기로 멈춘 루프는 답이 오면 다시 띄운다", shouldAutostart({ card: {}, answer: "메일로", loopState: { status: "결정 대기" }, lockAlive: false, config: on }));
    check("J7 이미 도는 루프가 있으면 안 띄운다", !shouldAutostart({ card, answer: "착수해", loopState: null, lockAlive: true, config: on }));
    check("J7 기본 설정은 자동 시작 꺼짐", mergeLoopConfig({}).config.autostart === false);
    check("   설정에서 권한 확인 끄기(bypassPermissions)는 거부한다", mergeLoopConfig({ permission_mode: "bypassPermissions" }).errors.length === 1);
  }

  // ── J8 · 대시보드 한 줄 ─────────────────────────────────────────────
  {
    const run = loopNotice({ status: "실행 중", done: 1, total: 3, round: 2 });
    const req = loopNotice({ status: "실행 중", done: 1, total: 3, round: 2, stop_requested: true });
    const wait = loopNotice({ status: "결정 대기", stop_detail: "결정 카드 답 대기 — 남은 항목 2개가 걸려 있다", done: 1, total: 3, round: 2 });
    check("J8 도는 중이면 항목 n/m · 회차가 보인다", run.tone === "info" && run.text === "루프 실행 중 · 항목 1/3 · 2회차", run.text);
    check("J8 멈춤 요청이 보인다", /멈춤 요청됨 — 지금 항목이 끝나면 정지/.test(req.text), req.text);
    check("J8 멈춤은 종류와 사유가 경고로 보인다", wait.tone === "warn" && wait.text.startsWith("루프 멈춤 — 결정 대기 (결정 카드 답 대기"), wait.text);
    check("J8 기록이 없으면 줄이 없다", loopNotice(null) === null);
    const big = loopNotice({ status: "실행 중", done: 0, total: 3, round: 1, rehearsal: { tokens: 58045, over_limit: true } });
    check("J6 리허설 입력이 기준을 넘으면 대시보드 줄에 붙는다", /리허설 입력 약 58k 토큰/.test(big.text), big.text);
    // 실패 표시(fail-alert I2): 마지막 회차의 failure_summary 가 줄 끝에 붙고, 도는 중이어도 경고로 오른다.
    const failed = { round: 3, item: "I2", outcome: "항목 미완", failure_summary: "항목이 닫히지 않았다 · B1 커밋 안 된 변경 2건" };
    const stopFail = loopNotice({ status: "항목 실패", stop_detail: "I2 가 재시도 뒤에도 안 끝났다", done: 1, total: 3, round: 3, last_result: failed });
    check("I2 멈춘 루프 줄에 마지막 실패 요약이 회차·항목과 함께 붙는다",
      stopFail.tone === "warn" && stopFail.text.endsWith(" · 실패: 3회차 I2 — 항목이 닫히지 않았다 · B1 커밋 안 된 변경 2건"), stopFail.text);
    const retry = loopNotice({ status: "실행 중", done: 1, total: 3, round: 4, last_result: failed });
    check("I2 재시도로 도는 중이면 경고로 오르고 요약이 붙는다", retry.tone === "warn" && /실패: 3회차 I2 — /.test(retry.text), JSON.stringify(retry));
    const okLast = loopNotice({ status: "실행 중", done: 2, total: 3, round: 4, last_result: { round: 3, item: "I2", outcome: "항목 완료", failure_summary: null } });
    check("I2 마지막 회차가 성공이면 실패 표시가 없다", okLast.tone === "info" && !/실패:/.test(okLast.text), okLast.text);
    // 화면(render.mjs)은 scripts/lib 를 못 읽어 같은 계산을 한 벌 더 둔다. 두 벌이 같은 답을 내는지 본다.
    const render = await import(pathToFileURL(join(KIT, ".claude", "skills", "report-dashboard", "assets", "render.mjs")).href);
    const samples = [null, { status: "모름" }, { status: "실행 중", done: 0, total: 2, round: 1 },
      { status: "실행 중", done: 1, total: 2, round: 2, stop_requested: true }, { status: "요청 완료", done: 2, total: 2, round: 2 },
      { status: "실행 중", done: 0, total: 3, round: 1, rehearsal: { ok: true, tokens: 58045, over_limit: true } },
      ...["결정 대기", "항목 실패", "상한 도달", "리허설 실패", "정지 요청"].map((s, i) => ({ status: s, stop_detail: i % 2 ? `사유 ${i}` : null, done: i, total: 5, round: i + 1 })),
      ...["실행 중", "항목 실패", "요청 완료"].map((s) => ({ status: s, done: 1, total: 3, round: 3, last_result: { round: 2, item: "I2", failure_summary: "종료 코드 1 · B6 게이트 실패" } })),
      { status: "항목 실패", done: 1, total: 3, round: 3, last_result: { failure_summary: "원인 기록만 있다" } }];
    const diff = samples.filter((x) => JSON.stringify(render.loopRow(x)) !== JSON.stringify(loopNotice(x)));
    check("J8 화면의 루프 줄과 스크립트의 루프 줄이 같은 답을 낸다", diff.length === 0, JSON.stringify(diff));
    const rows = render.noticeRows({ loop: { status: "결정 대기", stop_detail: "결정 카드 답 대기 — 남은 항목 1개가 걸려 있다", done: 2, total: 3, round: 3 } }, Date.now());
    const r10 = rows.find((r) => r.code === 10);
    check("J8 특이사항에 루프 줄이 경고로 뜬다", r10?.label === "자동 실행 루프" && r10?.tone === "warn" && r10.value.includes("항목 2/3 · 3회차"), JSON.stringify(r10));
    const f10 = render.noticeRows({ loop: { status: "실행 중", done: 1, total: 3, round: 4, last_result: failed } }, Date.now()).find((r) => r.code === 10);
    check("I2 특이사항 화면에 실패 요약이 경고로 뜬다", f10?.tone === "warn" && f10.value.includes("실패: 3회차 I2 — 항목이 닫히지 않았다"), JSON.stringify(f10));
    const at = new Date().toISOString();
    check("E  항목 경계의 대화 길이 경고가 특이사항에 뜬다", render.noticeRows({ sessionWarning: { at, tokens: 131000, boundary: true } }, Date.now()).some((r) => r.code === 11 && /새 세션 권장/.test(r.value)));
    check("E  항목 중간의 경고는 특이사항에 안 띄운다", !render.noticeRows({ sessionWarning: { at, tokens: 131000, boundary: false } }, Date.now()).some((r) => r.code === 11));
  }

  // ── F · 실패 요약 판정(순수 함수) ──────────────────────────────────
  {
    const ok = { subtype: "success", is_error: false, permission_denials: [] };
    check("F  카드를 열고 넘어간 회차는 요약이 없다", roundFailureSummary({ outcome: "결정 카드를 열고 넘어감", exit: 0, result: ok }) === null);
    const spawn = roundFailureSummary({ outcome: "항목 미완", spawnError: "spawn claude ENOENT", exit: null, result: null, checks: [{ id: "B3", ok: false, detail: "이 회차에 전환 기록이 한 줄도 없다" }] });
    check("F  프로세스를 못 띄웠으면 그것이 맨 앞이다", /^프로세스를 못 띄웠다: spawn claude ENOENT · 항목이 닫히지 않았다 · B3 /.test(spawn), spawn);
    const crash = roundFailureSummary({ outcome: "항목 미완", exit: 1, result: { ...ok, is_error: true, subtype: "error_max_turns" }, itemDone: true, checks: [{ id: "B1", ok: false, detail: "x".repeat(200) }] });
    check("F  종료 코드·오류 결과를 적고 긴 사유는 자른다", /^종료 코드 1 · 결과가 오류로 끝났다\(error_max_turns\) · B1 x+…$/.test(crash) && crash.length < 160 && !/닫히지/.test(crash), crash);
    const bare = roundFailureSummary({ outcome: "항목 미완", exit: 0, result: ok, itemDone: true, checks: [{ id: "B6", ok: true }] });
    check("F  원인을 못 찾아도 빈 문자열이 아니다", bare === "항목 미완 — 원인 기록 없음", bare);
  }

  // ── 의존과 상한 판정 ────────────────────────────────────────────────
  {
    const base = { task: "t", request: "r", goal: null, source: "manual", spec_path: null, status: "진행 중", status_reason: null, started_at: new Date().toISOString(), ended_at: null };
    const fwd = validateRequest({ ...base, items: [{ id: "I1", label: "a", done: false, deps: ["I2"] }, { id: "I2", label: "b", done: false }] });
    check("   의존은 앞 항목만 가리킬 수 있다", fwd.some((e) => /앞 항목만/.test(e)), fwd.join(" / "));
    const frozen = frozenItemsErrors([{ id: "I1", label: "a" }, { id: "I2", label: "b", deps: [] }], [{ id: "I1", label: "a" }, { id: "I2", label: "b" }]);
    check("   의존은 시작 뒤 못 바꾼다", frozen.some((e) => /deps/.test(e)), frozen.join(" / "));
    check("   상한은 회차를 열기 전에만 본다", limitReason({ roundsDone: 1, startedMs: 0, nowMs: 60000, config: { max_rounds: 2, max_minutes: 5 } }) === null);
  }
} finally {
  if (!KEEP) for (const r of roots) rmSync(r, { recursive: true, force: true });
  else console.log(`임시 레포 남김:\n${roots.join("\n")}`);
}

for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${!r.ok && r.detail ? ` — ${r.detail}` : ""}`);
const bad = results.filter((r) => !r.ok).length;
console.log(bad ? `실패 ${bad}/${results.length}` : `${results.length}/${results.length} 통과`);
process.exit(bad ? 1 : 0);
