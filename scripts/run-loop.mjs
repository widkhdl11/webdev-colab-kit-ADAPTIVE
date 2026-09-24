#!/usr/bin/env node
//
// run-loop.mjs — 열린 요청의 항목을 하나씩, 매번 새 대화(claude -p)로 처리한다.
//
// 대화가 길어져 앞 내용이 흐려지는 것을 감시해서 비우는 대신, 대화를 항목 하나 크기로 잘라
// 커질 틈을 안 준다. 항목 사이의 상태는 전부 파일에 있다(request.json·transitions·HANDOFF·
// PROGRESS·백로그) — 새 대화는 그 파일에서 시작한다.
//
// 사용:
//   node scripts/run-loop.mjs [--project <slug>] [--root <경로>]   루프 시작
//   node scripts/run-loop.mjs --stop                                지금 항목이 끝나면 멈춘다
//   node scripts/run-loop.mjs --status                              state.json 을 한 줄로
//
// 멈추는 경우(state.json 의 status): 요청 완료 · 결정 대기 · 항목 실패 · 상한 도달 · 리허설 실패 · 정지 요청
// 설정: projects/<slug>/report/loop/config.json (없는 칸은 scripts/lib/loop-model.mjs 의 기본값)
//
// 하지 않는 것: 항목 중간에 프로세스를 죽이지 않는다(기록이 반쪽이 된다) · 항목을 쪼개거나 합치지 않는다 ·
//               사람 답을 대신 채우지 않는다 · 스스로 루프를 띄우지 않는다(사람 답이 유일한 방아쇠).
//
// 정본 규약: docs/references/run-loop.md

import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  LOOP_RUNNING, fillItemPrompt, limitReason, parseStreamJson, pickNextItem, blockedByDecision, roundFailureSummary,
} from "./lib/loop-model.mjs";
import { lockStatus, loopPaths, loadLoopConfig, nextRoundNumber, readJson } from "./lib/loop-files.mjs";
import { validateRequest } from "./lib/request-model.mjs";
import { isRequestOpen } from "./lib/record-rules.mjs";
import { runWrapup } from "./check-wrapup.mjs";
import { runRehearsal, handoffFrontier } from "./loop-rehearsal.mjs";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const readText = (p) => { try { return readFileSync(p, "utf-8"); } catch { return ""; } };
const writeJson = (p, v) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`); };

function headSha(root) {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf-8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** 허용 목록의 재료: 쓴 도구와 거부된 도구를 회차를 넘어 센다. */
function tallyPermissions(path, round, parsed) {
  const cur = readJson(path) ?? { used: {}, denied: {}, rounds: [] };
  for (const k of parsed.tools) cur.used[k] = (cur.used[k] ?? 0) + 1;
  for (const k of parsed.result?.permission_denials ?? []) cur.denied[k] = (cur.denied[k] ?? 0) + 1;
  cur.rounds.push(round);
  writeJson(path, cur);
}

export function stopLoop({ root, slug }) {
  const p = loopPaths(root, slug);
  const { lock, alive } = lockStatus(root, slug);
  if (!lock) return "도는 루프가 없다.";
  if (alive) {
    mkdirSync(p.dir, { recursive: true });
    writeFileSync(p.stop, `${new Date().toISOString()}\n`);
    const st = readJson(p.state);
    if (st) writeJson(p.state, { ...st, stop_requested: true, updated_at: new Date().toISOString() });
    return `멈춤 요청됨 — 지금 항목(${lock.item ?? "?"})이 끝나면 정지한다. 프로세스를 죽이지 않는다.`;
  }
  // 비정상 종료로 잠금만 남았다. 잠금을 걷고 상태를 정지로 적는다.
  rmSync(p.lock, { force: true });
  rmSync(p.stop, { force: true });
  const st = readJson(p.state) ?? {};
  writeJson(p.state, { ...st, status: "정지 요청", stop_detail: "비정상 종료로 남은 잠금을 정리했다", stop_requested: false, updated_at: new Date().toISOString() });
  return `남은 잠금을 정리했다 (프로세스 ${lock.pid} 는 이미 없다).`;
}

/**
 * 루프 한 번(여러 회차). 반환: 마지막 state.
 * `now` 는 테스트가 시계를 바꿔 끼우는 자리다(시간 상한 시험).
 */
export function runLoop({ root = KIT_ROOT, slug, now = () => Date.now(), log = console.log }) {
  const p = loopPaths(root, slug);
  const { config, errors } = loadLoopConfig(root, slug);
  if (errors.length) throw new Error(`루프 설정 오류:\n- ${errors.join("\n- ")}`);

  const { lock, alive } = lockStatus(root, slug);
  if (lock && alive) throw new Error(`이미 도는 루프가 있다 (프로세스 ${lock.pid}).`);
  if (lock && !alive) throw new Error("남은 잠금이 있다 — 앞 루프가 비정상 종료했다. node scripts/run-loop.mjs --stop 으로 정리하고 다시 시작한다.");

  const reqPath = join(p.report, "request.json");
  const request0 = readJson(reqPath);
  if (!isRequestOpen(request0)) throw new Error("열린 요청이 없다. 루프는 열린 요청의 항목을 처리한다.");
  const reqErrors = validateRequest(request0);
  if (reqErrors.length) throw new Error(`request.json 이 규약을 어겼다:\n- ${reqErrors.join("\n- ")}`);

  mkdirSync(p.dir, { recursive: true });
  rmSync(p.stop, { force: true });
  const startedMs = now();
  const startedAt = new Date(startedMs).toISOString();
  const template = readFileSync(join(KIT_ROOT, "scripts", "loop-item-prompt.md"), "utf-8");

  let state = {
    status: LOOP_RUNNING, stop_detail: null, stop_requested: false,
    task: request0.task, round: 0, max_rounds: config.max_rounds,
    started_at: startedAt, updated_at: startedAt, pid: process.pid,
    current_item: null, done: request0.items.filter((i) => i.done).length, total: request0.items.length,
    last_result: null,
  };
  const save = (patch) => { state = { ...state, ...patch, updated_at: new Date(now()).toISOString() }; writeJson(p.state, state); };
  const setLock = (patch) => writeJson(p.lock, { pid: process.pid, started_at: startedAt, ...patch });
  // 멈출 때 완료 개수를 다시 센다. 마지막 회차가 항목을 닫은 뒤 곧바로 상한·멈춤 요청에 걸리면
  // 회차 시작 때 센 숫자가 한 박자 늦은 채로 화면에 남는다.
  const stop = (status, detail) => {
    const r = readJson(reqPath);
    const counts = Array.isArray(r?.items) ? { done: r.items.filter((i) => i.done).length, total: r.items.length } : {};
    save({ status, stop_detail: detail ?? null, current_item: null, stop_requested: false, ...counts });
    log(`루프 멈춤 — ${status}${detail ? ` (${detail})` : ""}`);
  };

  setLock({ round: 0, item: null });
  save({});
  try {
    // C. 인수인계 리허설 — 루프 시작 직전 한 번.
    if (config.rehearsal) {
      const reh = runRehearsal({ root, slug, config });
      save({ rehearsal: { ok: reh.ok, diffs: reh.diffs, tokens: reh.input_tokens_estimate, over_limit: reh.over_limit } });
      if (!reh.ok) { stop("리허설 실패", `HANDOFF 보강 필요 — ${reh.diffs.join(" · ")}`); return state; }
    }

    const attempts = new Map();
    const gaveUp = new Set();
    // 재시도는 **같은 항목을 강제로** 다시 돈다. 다시 고르게 두면 안 된다 — 커밋만 빠뜨린 항목은
    // 이미 done 이라, 고르기에 맡기면 다음 항목으로 넘어가면서 반쪽 기록을 그대로 남긴다(2026-09-24 시험에서 잡힘).
    let retryItem = null;
    for (;;) {
      if (existsSync(p.stop)) { stop("정지 요청", "사람이 멈춤을 요청했다"); return state; }
      const limit = limitReason({ roundsDone: state.round, startedMs, nowMs: now(), config });
      if (limit) { stop("상한 도달", limit); return state; }

      const request = readJson(reqPath);
      const decisionRaw = readJson(join(p.report, "decision.json"));
      const decision = decisionRaw && decisionRaw.status === "대기" ? decisionRaw : null;
      const pick = retryItem ? { kind: "item", item: request.items.find((i) => i.id === retryItem) } : pickNextItem(request, decision, gaveUp);
      retryItem = null;
      save({ done: request.items.filter((i) => i.done).length, total: request.items.length });
      if (pick.kind === "stop") {
        stop(pick.status, pick.status === "결정 대기" ? `결정 카드 답 대기 — 남은 항목 ${pick.waiting}개가 걸려 있다` : null);
        return state;
      }

      const item = pick.item;
      const tries = attempts.get(item.id) ?? 0;
      const n = nextRoundNumber(p.dir);
      const roundStart = new Date(now()).toISOString();
      const baseSha = headSha(root);
      const handoffText = readText(join(root, "projects", slug, "workspace", "HANDOFF.md"));
      const prompt = fillItemPrompt(template, {
        round: n, item_id: item.id, item_label: item.label, task: request.task, slug,
        node: handoffFrontier(handoffText) ?? "implement", today: localDate(new Date(now())), since: roundStart,
        rehearsal_note: tries > 0 ? `- **재시도 회차다.** 앞 회차의 항목 끝 검사 결과: projects/${slug}/report/loop/${n - 1}.wrapup.json — 실패한 항목부터 고친다.` : "",
      });

      setLock({ round: n, item: item.id });
      save({ round: state.round + 1, current_item: { id: item.id, label: item.label }, log_round: n });
      log(`${n}회차 — 항목 ${item.id} 「${item.label}」${tries > 0 ? " (재시도)" : ""}`);

      const [cmd, ...pre] = config.claude_cmd ?? ["claude"];
      const args = [...pre, "-p", "--output-format", "stream-json", "--verbose", "--permission-mode", config.permission_mode];
      if (config.max_turns) args.push("--max-turns", String(config.max_turns));
      const fd = openSync(p.log(n), "w");
      let r;
      try {
        r = spawnSync(cmd, args, {
          cwd: root, input: prompt, stdio: ["pipe", fd, fd], windowsHide: true,
          env: { ...process.env, KIT_RUN_LOOP: "1", KIT_LOOP_ROUND: String(n), KIT_LOOP_ITEM: item.id },
        });
      } finally { closeSync(fd); }
      if (r.error) appendFileSync(p.log(n), `\n[run-loop] 프로세스를 못 띄웠다: ${r.error.message}\n`);

      const parsed = parseStreamJson(readText(p.log(n)));
      tallyPermissions(p.permissions, n, parsed);
      const wr = runWrapup({ root, slug, itemId: item.id, sinceIso: roundStart, baseSha, hadFailure: tries > 0, config });
      writeJson(p.wrapup(n), { round: n, at: new Date(now()).toISOString(), passed: wr.failed.length === 0, failed: wr.failed, checks: wr.checks });

      const after = readJson(reqPath);
      const afterDecisionRaw = readJson(join(p.report, "decision.json"));
      const afterDecision = afterDecisionRaw && afterDecisionRaw.status === "대기" ? afterDecisionRaw : null;
      const doneNow = after?.items?.find((i) => i.id === item.id)?.done === true;
      const parkedOnCard = !doneNow && blockedByDecision(after?.items ?? [], afterDecision).has(item.id);
      const passed = wr.failed.length === 0;
      const outcome = passed && doneNow ? "항목 완료" : passed && parkedOnCard ? "결정 카드를 열고 넘어감" : "항목 미완";
      const failureSummary = roundFailureSummary({
        outcome, spawnError: r.error?.message ?? null, exit: r.status, result: parsed.result, checks: wr.checks, itemDone: doneNow,
      });

      writeJson(p.round(n), {
        round: n, item: item.id, attempt: tries + 1, started_at: roundStart, ended_at: new Date(now()).toISOString(),
        pid: r.pid ?? null, exit: r.status, session_id: parsed.result?.session_id ?? null,
        num_turns: parsed.result?.num_turns ?? null, cost_usd: parsed.result?.total_cost_usd ?? null,
        permission_denials: parsed.result?.permission_denials ?? [], wrapup_failed: wr.failed, outcome,
        failure_summary: failureSummary,
      });
      save({ last_result: { round: n, item: item.id, outcome, wrapup_failed: wr.failed, denials: (parsed.result?.permission_denials ?? []).length, failure_summary: failureSummary } });
      log(`  → ${outcome}${wr.failed.length ? ` · 끝 검사 실패 ${wr.failed.join(",")}` : ""}${parsed.result?.permission_denials?.length ? ` · 권한 거부 ${parsed.result.permission_denials.length}건` : ""}`);

      if (outcome !== "항목 미완") { attempts.delete(item.id); continue; }
      if (tries < config.retries_per_item) { attempts.set(item.id, tries + 1); retryItem = item.id; continue; }
      stop("항목 실패", `${item.id} 「${item.label}」 — 재시도까지 끝 검사 실패: ${wr.failed.join(", ") || "항목이 닫히지 않음"}`);
      return state;
    }
  } finally {
    rmSync(p.lock, { force: true });
    rmSync(p.stop, { force: true });
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const argv = process.argv.slice(2);
  const arg = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
  const root = resolve(arg("root") ?? KIT_ROOT);
  const slug = (arg("project") ?? readText(join(root, "ACTIVE"))).trim();
  if (!slug) { console.error("프로젝트를 못 정했다."); process.exit(2); }
  try {
    if (argv.includes("--stop")) { console.log(stopLoop({ root, slug })); process.exit(0); }
    if (argv.includes("--status")) {
      const st = readJson(loopPaths(root, slug).state);
      console.log(st ? `${st.status}${st.stop_detail ? ` — ${st.stop_detail}` : ""} · 항목 ${st.done}/${st.total} · ${st.round}회차` : "루프 기록 없음");
      process.exit(0);
    }
    const st = runLoop({ root, slug });
    process.exit(st.status === "요청 완료" ? 0 : 1);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
