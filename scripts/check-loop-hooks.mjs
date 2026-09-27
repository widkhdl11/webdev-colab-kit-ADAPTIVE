#!/usr/bin/env node
// @check-role: on-change
// @check-guards: .claude/hooks/loop-lock.mjs, .claude/hooks/session-size.mjs, .claude/settings.json
//   (2026-09-27 패치 적용 확인 22/22 뒤 훅 파일 둘을 더했다.)
//
// check-loop-hooks.mjs — 자율 실행 루프의 보호 파일 패치 둘(잠금 훅·대화 길이 훅)이 붙었고 듣는지 본다.
//
// 기본은 **설치된 훅**(.claude/hooks/)을 본다 — 패치를 붙이기 전에는 실패하고 붙인 뒤에는 통과한다.
// `--staged` 는 붙이기 전에 패치 폴더의 파일로 동작만 먼저 본다(설치·등록 항목은 건너뛴다).
// 패치 폴더 파일을 고친 턴에는 이 검사가 저절로 돌지 않는다(붙이기 전에는 실패가 정상이라 게이트를 막는다) —
// 그때는 --staged 로 직접 돌린다. 붙이는 턴(훅 폴더·설정 파일이 바뀐 턴)에는 등록부가 기본 모드로 돌린다.
//
// 훅을 레포에서 바로 돌리지 않고 임시 폴더에 복사해 돌린다. 훅은 자기 위치에서 레포 루트를 정하므로,
// 복사본은 가짜 프로젝트·가짜 잠금·가짜 대화 파일만 본다 — 진짜 레포에 잠금을 심지 않는다.
// 각 항목은 위반을 심어 잡히는지(막혀야 할 것이 막히는지)와 멀쩡한 것이 통과하는지를 같이 본다.
//
// 사용: node scripts/check-loop-hooks.mjs [--staged]
// 정본: docs/references/run-loop.md · 패치: docs/references/pending-patches/2026-09-24-run-loop.md

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STAGED = process.argv.includes("--staged");
const STAGE_DIR = join(ROOT, "docs", "references", "pending-patches", "2026-09-24-run-loop");
const HOOKS = ["loop-lock.mjs", "session-size.mjs"];
const src = (name) => (STAGED ? join(STAGE_DIR, name) : join(ROOT, ".claude", "hooks", name));
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail });
const norm = (s) => s.replace(/\r\n/g, "\n");

// ── 설치·등록 (기본 모드만) ───────────────────────────────────────────
if (!STAGED) {
  for (const h of HOOKS) {
    const installed = join(ROOT, ".claude", "hooks", h);
    const ok = existsSync(installed) && norm(readFileSync(installed, "utf-8")) === norm(readFileSync(join(STAGE_DIR, h), "utf-8"));
    check(`설치 ${h} 가 패치 폴더의 파일과 같다`, ok, existsSync(installed) ? "내용이 다르다 — 절반만 붙었을 수 있다" : "아직 없다");
  }
  let settings = null;
  try { settings = JSON.parse(readFileSync(join(ROOT, ".claude", "settings.json"), "utf-8")); } catch { /* 아래에서 실패 */ }
  const entries = (ev) => (settings?.hooks?.[ev] ?? []).flatMap((g) => (g.hooks ?? []).map((h) => ({ matcher: g.matcher ?? "", command: h.command ?? "" })));
  const lock = entries("PreToolUse").find((e) => e.command.includes("loop-lock.mjs"));
  const m = lock?.matcher ?? "";
  check("등록 잠금 훅이 PreToolUse 에 있고 편집·셸 도구를 다 덮는다",
    lock && ["Edit", "Write", "MultiEdit", "NotebookEdit", "Bash", "PowerShell"].every((t) => new RegExp(`(^|\\|)${t}(\\||$)`).test(m)),
    lock ? `matcher: ${m}` : "등록 안 됨");
  check("등록 대화 길이 훅이 Stop 에 있다", entries("Stop").some((e) => e.command.includes("session-size.mjs")), "등록 안 됨");
}

// ── 동작: 임시 폴더에서 ──────────────────────────────────────────────
const root = mkdtempSync(join(tmpdir(), "loop-hooks-"));
try {
  mkdirSync(join(root, ".claude", "hooks"), { recursive: true });
  for (const h of HOOKS) if (existsSync(src(h))) copyFileSync(src(h), join(root, ".claude", "hooks", h));
  const rep = join(root, "projects", "x", "report");
  mkdirSync(join(rep, "loop"), { recursive: true });
  writeFileSync(join(root, "ACTIVE"), "x\n");
  const run = (hook, input, env = {}) => {
    const file = join(root, ".claude", "hooks", hook);
    if (!existsSync(file)) return { status: null, out: "", err: "훅 파일이 없다" };
    const e = { ...process.env, ...env };
    if (!("KIT_RUN_LOOP" in env)) delete e.KIT_RUN_LOOP;
    const r = spawnSync(process.execPath, [file], { input: JSON.stringify({ cwd: root, ...input }), encoding: "utf-8", env: e });
    return { status: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
  };
  const lockPath = join(rep, "loop.lock");
  const setLock = (pid) => writeFileSync(lockPath, JSON.stringify({ pid, started_at: new Date().toISOString(), round: 3, item: "I2" }));
  const edit = (p) => ({ tool_name: "Edit", tool_input: { file_path: join(root, p) } });
  const bash = (c) => ({ tool_name: "Bash", tool_input: { command: c } });

  // L — 잠금 훅
  rmSync(lockPath, { force: true });
  // 훅 파일이 없으면 status 가 null 이라 「된다」 항목도 전부 실패한다 — 적용 전에 통과로 읽히지 않게.
  check("L1 잠금이 없으면 제품 파일 편집이 된다", run("loop-lock.mjs", edit("projects/x/src/a.ts")).status === 0);
  setLock(process.pid); // 이 검사 프로세스 = 살아 있는 루프
  const blocked = run("loop-lock.mjs", edit("projects/x/src/a.ts"));
  check("L2 살아 있는 잠금이 있으면 제품 파일 편집이 막힌다(심은 위반)", blocked.status === 2 && /자율 실행 루프가 도는 중/.test(blocked.err), `exit ${blocked.status}`);
  check("L3 프로젝트 docs·workspace·카드 답(report)은 된다",
    ["projects/x/docs/a.md", "projects/x/workspace/PROGRESS.md", "projects/x/report/decision.json"].every((p) => run("loop-lock.mjs", edit(p)).status === 0));
  check("L4 킷 파일은 된다", ["scripts/a.mjs", "docs/references/a.md", ".claude/skills/x/SKILL.md"].every((p) => run("loop-lock.mjs", edit(p)).status === 0));
  check("L5 루프 자신의 회차(KIT_RUN_LOOP)는 막지 않는다", run("loop-lock.mjs", edit("projects/x/src/a.ts"), { KIT_RUN_LOOP: "1" }).status === 0);
  check("L6 셸로 제품 파일에 쓰면 막힌다", run("loop-lock.mjs", bash("echo 1 > projects/x/src/a.ts")).status === 2);
  check("L7 셸로 제품 파일을 읽는 것은 된다", run("loop-lock.mjs", bash("cat projects/x/src/a.ts")).status === 0);
  check("L8 git 커밋은 막힌다(루프 회차의 커밋과 섞인다)", run("loop-lock.mjs", bash("git add -A && git commit -m x")).status === 2);
  check("L9 git 읽기(status·log·diff)는 된다", ["git status", "git log -1", "git diff"].every((c) => run("loop-lock.mjs", bash(c)).status === 0));
  setLock(999999); // 죽은 프로세스
  check("L10 비정상 종료로 남은 잠금은 막지 않는다(풀 방법이 없어진다)", run("loop-lock.mjs", edit("projects/x/src/a.ts")).status === 0);
  rmSync(lockPath, { force: true });

  // S — 대화 길이 훅
  const transcript = join(root, "t.jsonl");
  const writeT = (tokens) => writeFileSync(transcript, [
    JSON.stringify({ type: "user", message: { content: "x" } }),
    JSON.stringify({ type: "assistant", isSidechain: true, message: { usage: { input_tokens: 999999 } } }),
    JSON.stringify({ type: "assistant", isSidechain: false, message: { usage: { input_tokens: 2, cache_read_input_tokens: tokens - 1002, cache_creation_input_tokens: 1000 } } }),
    JSON.stringify({ type: "assistant", isSidechain: true, message: { usage: { input_tokens: 888888 } } }),
  ].join("\n"));
  const stop = (env) => run("session-size.mjs", { hook_event_name: "Stop", transcript_path: transcript, session_id: "s1" }, env);
  const warnFile = join(rep, "session-warning.json");
  const readWarn = () => { try { return JSON.parse(readFileSync(warnFile, "utf-8")); } catch { return null; } };
  const msg = (r) => { try { return JSON.parse(r.out).systemMessage ?? ""; } catch { return ""; } };

  writeT(80000);
  const under = stop();
  check("S1 임계 아래면 아무것도 안 한다", under.status === 0 && under.out.trim() === "" && !existsSync(warnFile), under.out);
  writeT(131000);
  const noReq = stop();
  const w1 = readWarn();
  check("S2 임계를 넘고 열린 요청이 없으면(경계) 새 세션을 권장한다", noReq.status === 0 && /새 세션 권장/.test(msg(noReq)) && w1?.boundary === true && w1?.tokens === 131000, msg(noReq));
  check("S3 서브에이전트 기록(isSidechain)은 세지 않는다", w1?.tokens === 131000, String(w1?.tokens));

  const req = { task: "t", status: "진행 중", items: [{ id: "I1", label: "첫 항목", done: false }] };
  writeFileSync(join(rep, "request.json"), JSON.stringify(req));
  writeFileSync(join(rep, "transitions.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), item: "첫 항목", result: null, to_node: "implement" })}\n`);
  const mid = stop();
  const w2 = readWarn();
  check("S4 항목 중간이면 알리기만 하고 대시보드에 안 띄운다(boundary=false)", mid.status === 0 && !/항목 완료/.test(msg(mid)) && /항목이 끝나면/.test(msg(mid)) && w2?.boundary === false, msg(mid));
  req.items[0].done = true;
  writeFileSync(join(rep, "request.json"), JSON.stringify(req));
  writeFileSync(join(rep, "transitions.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), item: "첫 항목", result: "통과", to_node: "implement" })}\n`);
  const edge = stop();
  check("S5 항목이 통과로 끝난 직후면 경계다", /항목 완료 · 새 세션 권장/.test(msg(edge)) && readWarn()?.boundary === true, msg(edge));
  writeFileSync(join(rep, "loop", "config.json"), JSON.stringify({ session_warn_tokens: 200000 }));
  rmSync(warnFile, { force: true });
  const s6 = stop();
  check("S6 임계는 루프 설정 session_warn_tokens 를 따른다", s6.status === 0 && s6.out.trim() === "" && !existsSync(warnFile));
  rmSync(join(rep, "loop", "config.json"), { force: true });
  const s7 = stop({ KIT_RUN_LOOP: "1" });
  check("S7 루프 회차(KIT_RUN_LOOP)에서는 안 돈다", s7.status === 0 && s7.out.trim() === "");
  check("S8 언제나 턴을 막지 않는다(종료 0)", [under, noReq, mid, edge].every((r) => r.status === 0));
} finally {
  rmSync(root, { recursive: true, force: true });
}

for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${!r.ok && r.detail ? ` — ${r.detail}` : ""}`);
const bad = results.filter((r) => !r.ok).length;
console.log(bad ? `실패 ${bad}/${results.length}${STAGED ? " (패치 폴더 파일)" : ""}` : `${results.length}/${results.length} 통과${STAGED ? " (패치 폴더 파일 — 설치·등록은 안 봤다)" : ""}`);
process.exit(bad ? 1 : 0);
