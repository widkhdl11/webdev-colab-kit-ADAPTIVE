#!/usr/bin/env node
// @check-role: on-change
// @check-guards: scripts/session-sync.mjs
//
// check-session-sync.mjs — 세션이 멈춰 있는 동안 다른 곳에서 레포가 바뀌면 다음 턴 시작에
// 경고가 뜨는지, 그 훅이 settings.json 에 실제로 걸려 있는지 검사한다.
//
// 왜 있나 (2026-10-22): 이 세션이 하루 멈춰 있는 동안 다른 세션이 커밋 38개를 쌓았고, 돌아온 사용자에게
// 이미 끝난 결정 둘을 다시 물었다. scripts/session-sync.mjs 가 그것을 막는다.
//
// 두 겹이다:
//   ① 실행: 임시 git 레포에서 세션 기록 → 바깥 커밋을 심어 → 다음 턴 경고에 그 커밋이 잡히는지(프로브),
//      내 턴 안의 커밋은 안 잡히는지, 같은 경고가 두 번 안 뜨는지, 다른 세션 활동이 잡히는지.
//   ② 등록: .claude/settings.json 의 SessionStart·UserPromptSubmit·Stop 에 각 단계가 절대 경로로 걸렸는지.
//      ②가 비면 ①이 통과해도 훅은 불리지 않는다 — settings.json 을 붙이기 전에는 ②가 실패한다.
//
// 사용: node scripts/check-session-sync.mjs   (실패 시 exit 2)

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = join(KIT, "scripts", "session-sync.mjs");
const results = [];
const record = (ok, name, detail = "") => results.push({ ok, name, detail });

// ── ① 실행 ──────────────────────────────────────────────────────
const repo = mkdtempSync(join(tmpdir(), "session-sync-"));
const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
let clock = Date.parse("2026-10-21T22:00:00+09:00");
const run = (mode, session, input) => {
  const r = spawnSync(process.execPath, [HOOK, mode], {
    input: input ?? JSON.stringify({ session_id: session }),
    encoding: "utf-8",
    env: { ...process.env, SESSION_SYNC_ROOT: repo, SESSION_SYNC_NOW: String(clock) },
  });
  let ctx = "";
  try { ctx = r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : ""; } catch { ctx = `(JSON 아님) ${r.stdout}`; }
  return { code: r.status, ctx };
};
const commit = (msg) => {
  writeFileSync(join(repo, "f.txt"), msg);
  git("add", "-A");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", msg);
};

try {
  git("init", "-q");
  writeFileSync(join(repo, "ACTIVE"), "demo\n");
  mkdirSync(join(repo, "projects", "demo", "workspace"), { recursive: true });
  writeFileSync(join(repo, "projects", "demo", "workspace", "PROGRESS.md"), "대기: d105\n");
  commit("처음");

  let r = run("start", "A");
  record(r.code === 0 && r.ctx === "", "혼자 시작하면 조용하다", r.ctx);
  run("prompt", "A");
  commit("A 가 만든 커밋");
  r = run("stop", "A");
  clock += 60_000;
  r = run("prompt", "A");
  record(r.code === 0 && r.ctx === "", "내 턴 안에서 만든 커밋은 경고하지 않는다", r.ctx);
  run("stop", "A");

  // 프로브: A 가 멈춘 사이 바깥(다른 세션)에서 커밋을 심는다
  clock += 18 * 60 * 60_000;
  commit("d105 승인 — 다른 세션이 만든 커밋");
  r = run("prompt", "A");
  record(r.code === 0 && r.ctx.includes("커밋 1개") && r.ctx.includes("d105 승인 — 다른 세션이 만든 커밋") && r.ctx.includes("PROGRESS.md"),
    "프로브: 멈춘 사이 심은 바깥 커밋이 다음 턴 경고에 잡힌다", r.ctx.slice(0, 120));
  run("stop", "A");
  r = run("prompt", "A");
  record(r.ctx === "", "같은 바깥 커밋을 두 번 경고하지 않는다", r.ctx);
  run("stop", "A");

  // 프로브: 커밋 없이 PROGRESS 만 바깥에서 고친다
  writeFileSync(join(repo, "projects", "demo", "workspace", "PROGRESS.md"), "대기: d112\n");
  r = run("prompt", "A");
  record(r.ctx.includes("PROGRESS.md 가 이 세션 밖에서 바뀌었다"), "프로브: 커밋 없는 PROGRESS 변경도 잡힌다", r.ctx.slice(0, 120));
  run("stop", "A");

  // 프로브: 다른 세션 B 가 지금 활동 중
  clock += 5 * 60_000;
  run("prompt", "B");
  clock += 60_000;
  r = run("prompt", "A");
  record(r.ctx.includes("다른 세션 1개가 이 레포에서 활동 중"), "프로브: 지금 활동 중인 다른 세션이 잡힌다", r.ctx.slice(0, 120));
  r = run("start", "C");
  record(r.ctx.includes("다른 세션 2개가 최근 이 레포에서 일했다"), "프로브: 새 세션 시작 때 최근 활동한 다른 세션이 잡힌다", r.ctx.slice(0, 120));
  record(r.ctx.includes("사용자에게 묻지 말고 직접 확인한다") && !r.ctx.includes("사용자에게 다른 세션에서 진행 중인지"),
    "시작 경고는 사용자에게 되묻지 않고 직접 확인하라고 한다", r.ctx.slice(0, 160));

  // 프로브: C 창에서 /clear → 새 세션 D. 직전 세션 C 는 같은 창이라 세지 않는다(A·B 만)
  clock += 60_000;
  run("stop", "C");
  clock += 30_000;
  r = run("start", "D", JSON.stringify({ session_id: "D", source: "clear" }));
  record(r.ctx.includes("다른 세션 2개가") && !r.ctx.includes("3개"), "프로브: /clear 직후에는 같은 창의 이전 세션을 세지 않는다", r.ctx.slice(0, 120));
  r = run("start", "E", JSON.stringify({ session_id: "E", source: "startup" }));
  record(r.ctx.includes("다른 세션 3개가"), "새 창(startup)은 이전 세션을 닫지 않는다(A·B·D)", r.ctx.slice(0, 120));
  // 닫힌 C 가 실제로는 살아 있던 다른 창이었다면 다음 턴에 다시 잡힌다
  clock += 60_000;
  run("prompt", "C");
  r = run("prompt", "D");
  record(/다른 세션 [3-9]개가 이 레포에서 활동 중/.test(r.ctx), "닫혔던 세션이 다시 돌면 다시 활동 중으로 잡힌다", r.ctx.slice(-120));

  // 오래된 세션은 「활동 중」이 아니다
  clock += 2 * 60 * 60_000;
  run("stop", "A");
  r = run("prompt", "A");
  record(!r.ctx.includes("활동 중"), "두 시간 전 세션은 활동 중으로 세지 않는다", r.ctx);

  // 입력이 망가져도 턴을 막지 않는다
  const bad = [run("prompt", "A", "not json"), run("prompt", "A", JSON.stringify({ session_id: "../../x" })), run("bogus", "A")];
  record(bad.every((b) => b.code === 0 && b.ctx === ""), "망가진 입력·모르는 단계는 종료 코드 0 으로 조용히 끝난다",
    bad.map((b) => b.code).join(","));
} catch (e) {
  record(false, "실행 검사 도중 예외", String(e?.message ?? e).slice(0, 120));
} finally {
  rmSync(repo, { recursive: true, force: true });
}

// ── ② 등록 ──────────────────────────────────────────────────────
let settings = null;
try { settings = JSON.parse(readFileSync(join(KIT, ".claude", "settings.json"), "utf-8")); } catch { /* 아래에서 실패로 기록 */ }
for (const [event, mode] of [["SessionStart", "start"], ["UserPromptSubmit", "prompt"], ["Stop", "stop"]]) {
  const cmds = (settings?.hooks?.[event] ?? []).flatMap((g) => g.hooks ?? []).map((h) => String(h.command ?? ""));
  const hit = cmds.find((c) => c.includes("scripts/session-sync.mjs") && new RegExp(`session-sync\\.mjs"?\\s+${mode}\\b`).test(c));
  const absolute = hit && /node\s+"?([A-Za-z]:\/|\/)/.test(hit);
  record(Boolean(hit && absolute), `settings.json ${event} 에 session-sync.mjs ${mode} 가 절대 경로로 걸려 있다`,
    hit ? (absolute ? "" : "상대 경로 — 다른 폴더에서 열면 훅이 죽는다") : "등록 없음");
}

// ── 보고 ────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${!r.ok && r.detail ? ` — ${r.detail}` : ""}`);
console.log(failed.length ? `\n실패 ${failed.length}/${results.length}` : `\n통과 ${results.length}/${results.length}`);
process.exit(failed.length ? 2 : 0);
