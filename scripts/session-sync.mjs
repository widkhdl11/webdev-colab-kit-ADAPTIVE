#!/usr/bin/env node
// session-sync.mjs — 이 세션이 마지막으로 본 레포 상태와 지금 레포가 다르면 다음 턴 시작에 알린다.
//
// 왜 필요한가 (2026-10-22): 두 세션이 같은 지점(10-21 밤)에서 출발했다. 한 세션이 결정 둘을 받고
// 커밋 38개를 쌓는 동안 다른 세션은 하루 멈춰 있었다. 사용자가 그 세션으로 돌아오자 세션은
// 처음 본 브리핑대로 「d105·v34 승인 대기」를 다시 물었다 — 이미 승인·구현까지 끝난 일이었다.
// 브리핑은 세션 시작에 한 번만 돌기 때문에, 시작 뒤에 다른 곳에서 바뀐 것은 아무도 알려 주지 않았다.
//
// 세 단계로 부른다(.claude/settings.json 의 훅):
//   start  (SessionStart)     — 지금 HEAD 를 이 세션 기준으로 적고, 최근에 활동한 다른 세션을 알린다
//   prompt (UserPromptSubmit) — 기준 HEAD 뒤에 생긴 커밋·PROGRESS 변경·활동 중인 다른 세션을 알린다
//   stop   (Stop)             — 이 턴이 끝난 HEAD 를 기준으로 적는다(이 턴에 내가 만든 커밋은 경고 대상이 아니다)
//
// 판정이 아니라 알림이다 — 언제나 종료 코드 0, 턴을 막지 않는다.
// 기록은 레포 루트 .session-sync/<session_id>.json (gitignore). 7일 지난 기록은 지운다.
//
// 검사: node scripts/check-session-sync.mjs

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.SESSION_SYNC_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_DIR = join(ROOT, ".session-sync");
const ACTIVE_MS = 30 * 60 * 1000; // 이 안에 활동한 다른 세션은 「지금 활동 중」
const RECENT_MS = 6 * 60 * 60 * 1000; // 세션 시작 때 알리는 범위
const EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LISTED = 8;

const mode = process.argv[2];
const now = Number(process.env.SESSION_SYNC_NOW ?? Date.now());

let input = {};
try { input = JSON.parse(readFileSync(0, "utf-8")); } catch { /* 입력이 없어도 조용히 끝낸다 */ }
const sessionId = typeof input.session_id === "string" && /^[\w-]+$/.test(input.session_id) ? input.session_id : null;
if (!sessionId || !["start", "prompt", "stop"].includes(mode)) process.exit(0);

const git = (...args) => {
  try { return execFileSync("git", args, { cwd: ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
};

function progressPath() {
  try {
    const slug = readFileSync(join(ROOT, "ACTIVE"), "utf-8").trim();
    return slug ? join(ROOT, "projects", slug, "workspace", "PROGRESS.md") : null;
  } catch { return null; }
}
function progressHash() {
  const p = progressPath();
  try { return p ? createHash("sha1").update(readFileSync(p)).digest("hex") : null; } catch { return null; }
}

const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return null; } };
const statePath = (id) => join(STATE_DIR, `${id}.json`);

function otherSessions(withinMs) {
  if (!existsSync(STATE_DIR)) return [];
  const out = [];
  for (const f of readdirSync(STATE_DIR)) {
    if (!f.endsWith(".json")) continue;
    const p = join(STATE_DIR, f);
    const s = readJson(p);
    if (!s || typeof s.at !== "number") continue;
    if (now - s.at > EXPIRE_MS) { try { rmSync(p); } catch { /* 다른 세션이 동시에 지웠을 수 있다 */ } continue; }
    if (s.closed_by) continue; // /clear 로 끝난 같은 창의 이전 세션 — 그 창이 다시 돌면 save() 가 이 표시를 지운다
    if (s.session_id !== sessionId && now - s.at <= withinMs) out.push(s);
  }
  return out.sort((a, b) => b.at - a.at);
}

// /clear 는 같은 창에 새 session_id 를 준다. 직전에 활동한 세션을 이 창의 이전 세션으로 보고 닫아 둔다
// (2026-10-25: 다른 창이 없는데 /clear 직후마다 「다른 세션이 일했다」가 떠서 사용자에게 되물었다).
// 틀렸으면(실제로 다른 창이었으면) 그 창의 다음 턴이 기록을 다시 써서 다시 잡힌다.
function closePredecessor() {
  const [prev] = otherSessions(RECENT_MS);
  if (prev) writeFileSync(statePath(prev.session_id), JSON.stringify({ ...prev, closed_by: sessionId }, null, 2));
}

const ago = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
};

function save(head) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(statePath(sessionId), JSON.stringify({ session_id: sessionId, head, progress: progressHash(), at: now }, null, 2));
}

function emit(event, lines) {
  if (!lines.length) return;
  const text = lines.join("\n");
  process.stdout.write(JSON.stringify({
    systemMessage: text,
    hookSpecificOutput: { hookEventName: event, additionalContext: text },
  }));
}

const head = git("rev-parse", "HEAD");
const mine = readJson(statePath(sessionId));

if (mode === "stop") {
  save(head);
  process.exit(0);
}

if (mode === "start") {
  if (input.source === "clear") closePredecessor();
  const others = otherSessions(RECENT_MS);
  save(head);
  emit("SessionStart", others.length ? [
    `⚠ 다른 세션 ${others.length}개가 최근 이 레포에서 일했다(가장 최근 ${ago(now - others[0].at)}). ` +
      "사용자에게 묻지 말고 직접 확인한다 — git status 에 이 세션이 만들지 않은 커밋 안 된 변경이 있는지, " +
      "최근 커밋·PROGRESS 「현재 상태」가 브리핑과 다른지. 겹치는 흔적이 있을 때만 무엇이 겹치는지 알리고, 없으면 그대로 진행한다.",
  ] : []);
  process.exit(0);
}

// prompt
const lines = [];
if (mine?.head && head && mine.head !== head) {
  const log = git("log", "--format=%h %ar %s", `${mine.head}..${head}`);
  const commits = log ? log.split("\n").filter(Boolean) : [];
  if (commits.length) {
    lines.push(`⚠ 이 세션의 지난 턴(${ago(now - mine.at)}) 뒤에 이 세션 밖(다른 세션·Codex·사용자)에서 커밋 ${commits.length}개가 생겼다:`);
    for (const c of commits.slice(0, MAX_LISTED)) lines.push(`   · ${c}`);
    if (commits.length > MAX_LISTED) lines.push(`   · …외 ${commits.length - MAX_LISTED}개`);
  } else {
    // 새 커밋 없이 HEAD 만 바뀜 — 되돌리기(reset)·다른 브랜치로 이동
    lines.push("⚠ 이 세션의 지난 턴 뒤에 HEAD 가 바뀌었다(브랜치 이동·되돌리기).");
  }
}
const pNow = progressHash();
if (mine && mine.progress && pNow && mine.progress !== pNow && !lines.length) {
  lines.push("⚠ 이 세션의 지난 턴 뒤에 PROGRESS.md 가 이 세션 밖에서 바뀌었다(커밋 없이).");
}
if (lines.length) {
  lines.push("   → 이 세션이 앞서 본 브리핑·PROGRESS 는 낡았다. 답하거나 작업하기 전에 PROGRESS.md 「현재 상태」와 HANDOFF 를 다시 읽고, 바뀐 상태를 사용자에게 먼저 알린다.");
}
const active = otherSessions(ACTIVE_MS);
if (active.length) {
  lines.push(`⚠ 지금 다른 세션 ${active.length}개가 이 레포에서 활동 중이다(마지막 활동 ${ago(now - active[0].at)}). 파일을 고치기 전에 git status 로 커밋 안 된 남의 변경을 확인한다 — 고칠 파일에 있으면 그 파일만 멈추고 사용자에게 알린다.`);
}
emit("UserPromptSubmit", lines);
save(head);
process.exit(0);
