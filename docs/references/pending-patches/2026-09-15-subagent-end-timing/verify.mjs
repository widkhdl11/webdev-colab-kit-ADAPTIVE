#!/usr/bin/env node
//
// verify.mjs — 「서브에이전트 종료 시각」 패치가 붙었는지 사람이 코드를 안 읽고 판정한다.
//
//   node docs/references/pending-patches/2026-09-15-subagent-end-timing/verify.mjs
//
// 붙기 전 1/4, 붙은 뒤 4/4. (--source 로 정본을 먼저 재 보면 지금도 4/4 가 나온다) 검사 대상은 **붙어 있는 훅**(.claude/hooks/report-subagent.mjs)이다 —
// 정본(assets)만 고치고 사본을 안 붙이면 도는 것은 여전히 옛 코드이고, 그 상태가 바로
// 이 검사가 잡아야 하는 것이다.

import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const INSTALLED = join(ROOT, ".claude", "hooks", "report-subagent.mjs");
const SOURCE = join(ROOT, ".claude", "skills", "report-dashboard", "assets", "report-subagent.mjs");

// --source 를 주면 **정본**을 검사한다. 붙이기 전에 "고쳐 놓은 파일은 정말 통과하나"를
// 먼저 볼 수 있게 두는 스위치다 — 안 그러면 사람은 4/4 를 한 번도 못 보고 복사해야 한다.
const USE_SOURCE = process.argv.includes("--source");
const TARGET = USE_SOURCE ? SOURCE : INSTALLED;

const results = [];
const check = (id, cond, okMsg, badMsg) => results.push({ id, pass: Boolean(cond), msg: cond ? okMsg : badMsg });

if (!existsSync(TARGET)) {
  console.error(`검사할 훅이 없다: ${TARGET}`);
  console.error("먼저 복사한다: cp .claude/skills/report-dashboard/assets/report-subagent.mjs .claude/hooks/report-subagent.mjs");
  process.exit(2);
}

const root = mkdtempSync(join(tmpdir(), "subagent-end-"));
writeFileSync(join(root, "ACTIVE"), "fx", "utf-8");
const dir = join(root, "projects", "fx", "report");
mkdirSync(dir, { recursive: true });
const log = join(dir, "subagents.jsonl");
writeFileSync(log, "", "utf-8");

const run = (payload) => spawnSync(process.execPath, [TARGET], { input: JSON.stringify(payload), encoding: "utf-8" });
const rows = () => readFileSync(log, "utf-8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

// A. 시작은 기록된다 (패치 전후 둘 다 통과해야 한다 — 이 검사가 훅을 정말 돌렸다는 증거)
run({ cwd: root, hook_event_name: "PreToolUse", tool_name: "Agent",
      tool_input: { subagent_type: "code-reviewer", prompt: "무엇을 시켰는지 첫 줄" } });
const afterStart = rows();
check("A 시작", afterStart.length === 1 && afterStart[0].event === "start" && afterStart[0].agent === "code-reviewer",
  "PreToolUse 가 start 한 줄을 쓴다 (훅이 실제로 돌았다)",
  `PreToolUse 가 start 를 안 썼다: ${JSON.stringify(afterStart)} — 훅이 아예 안 도는 것이니 아래 판정은 무의미하다`);

// B. **핵심** — PostToolUse 는 종료가 아니다
run({ cwd: root, hook_event_name: "PostToolUse", tool_name: "Agent",
      tool_input: { subagent_type: "code-reviewer" } });
const afterPost = rows();
check("B 조기 종료 없음", afterPost.length === 1,
  "PostToolUse 로 온 입력은 한 줄도 안 쓴다",
  `PostToolUse 가 end 를 썼다 — 이것이 고치려는 버그다. 배경으로 도는 에이전트는 이 시점에 아직 돌고 있고, 화면은 그때부터 영영 「대기」로 보인다: ${JSON.stringify(afterPost)}`);

// C. 진짜 종료는 SubagentStop 이다
run({ cwd: root, hook_event_name: "SubagentStop", agent: "code-reviewer" });
const afterStop = rows();
check("C 진짜 종료", afterStop.length === 2 && afterStop[1].event === "end" && afterStop[1].agent === "code-reviewer",
  "SubagentStop 이 end 한 줄을 쓴다",
  `SubagentStop 이 end 를 안 썼다: ${JSON.stringify(afterStop)}`);

// D. 붙어 있는 사본이 정본과 같다
if (USE_SOURCE) {
  check("D 사본", true, "정본을 직접 검사했다 — 사본 대조는 건너뛴다(--source)", "");
} else {
  check("D 사본", readFileSync(INSTALLED, "utf-8") === readFileSync(SOURCE, "utf-8"),
    "붙어 있는 훅이 정본과 같다",
    "붙어 있는 훅이 정본과 다르다 — 복사가 안 됐거나 손으로 고쳐졌다");
}

rmSync(root, { recursive: true, force: true });

const passed = results.filter((r) => r.pass).length;
for (const r of results) console.log(`${r.pass ? "  ok " : "FAIL "} ${r.id} — ${r.msg}`);
console.log(`\n${passed}/${results.length} 통과 — ${passed === results.length ? "패치가 붙었다." : "아직 안 붙었다(붙기 전 1/4 가 정상이다)."}`);
process.exit(passed === results.length ? 0 : 1);
