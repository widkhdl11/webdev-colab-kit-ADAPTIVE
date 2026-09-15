#!/usr/bin/env node
//
// verify.mjs — 서브에이전트 기록 훅이 실제로 붙었는지 판정한다.
//
//   node docs/references/pending-patches/2026-09-14-report-subagent-hook/verify.mjs
//
// 붙기 전에는 A·B·C·D 가 실패하고(6/10), 붙은 뒤에는 10/10 이다.
// G~I 는 패치와 무관하게 항상 통과해야 한다 — 검사 자체가 살아 있는지 보는 항목이다.
//
// 이 레포의 파일은 읽기만 한다. 프로브는 임시 디렉터리에서 돈다.

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..", "..");
const HOOK = join(ROOT, ".claude", "hooks", "report-subagent.mjs");
const SOURCE = join(ROOT, ".claude", "skills", "report-dashboard", "assets", "report-subagent.mjs");
const SETTINGS = join(ROOT, ".claude", "settings.json");

const out = [];
const check = (id, cond, ok, bad) => out.push({ id, pass: !!cond, msg: cond ? ok : bad });
const read = (p) => { try { return readFileSync(p, "utf-8"); } catch { return null; } };

const hookText = read(HOOK);
const sourceText = read(SOURCE);
const settingsText = read(SETTINGS);
let settings = {};
try { settings = JSON.parse(settingsText ?? "{}"); } catch { /* 아래 항목이 잡는다 */ }

check("A 파일", hookText !== null,
  ".claude/hooks/report-subagent.mjs 가 있다",
  ".claude/hooks/report-subagent.mjs 가 없다 — assets 의 정본을 복사한다");

check("B 내용", hookText !== null && sourceText !== null && hookText === sourceText,
  "붙은 훅이 정본과 같다",
  hookText === null ? "훅이 없어서 대조할 수 없다" : "붙은 훅이 정본과 다르다 — 정본을 다시 복사한다");

const groups = (event) => settings.hooks?.[event] ?? [];
const callsSub = (g) => (g.hooks ?? []).some((h) => /report-subagent\.mjs/.test(h.command ?? ""));
const wiredEvents = ["PreToolUse", "PostToolUse", "SubagentStop"].filter((e) => groups(e).some(callsSub));
check("C 배선", wiredEvents.length > 0,
  `서브에이전트 훅이 ${wiredEvents.join(" · ")} 에 배선돼 있다`,
  "settings.json 에 배선이 없다 — node scripts/report-install-hook.mjs 의 출력으로 바꾼다");

// 활동 훅 matcher 가 서브에이전트 툴까지 보는가
const actGroup = groups("PostToolUse").find((g) => (g.hooks ?? []).some((h) => /report-activity\.mjs/.test(h.command ?? "")));
check("D matcher", actGroup && /Task|Agent/.test(actGroup.matcher ?? ""),
  `활동 훅 matcher 가 서브에이전트 툴을 포함한다 (${actGroup?.matcher ?? "없음"})`,
  `활동 훅 matcher 가 좁다 (${actGroup?.matcher ?? "활동 훅 없음"}) — 서브에이전트 호출이 활동 기록에 안 남는다`);

const KEEP = ["run-gates.mjs", "graph-stop.mjs", "protect-files.mjs", "protect-secrets.mjs",
              "block-danger.mjs", "briefing.mjs", "check-hooks-on-edit.mjs", "report-activity.mjs"];
const missing = KEEP.filter((k) => !(settingsText ?? "").includes(k));
check("E 보존", missing.length === 0,
  `기존 훅 ${KEEP.length}개가 전부 남아 있다`,
  `기존 훅이 사라졌다: ${missing.join(", ")} — 병합이 아니라 덮어쓴 것이다`);

const dup = ((settingsText ?? "").match(/report-subagent\.mjs/g) ?? []).length;
check("F 중복", dup <= 3,
  `배선이 ${dup}군데다 (시작·끝·SubagentStop 까지 셋까지는 정상)`,
  `배선이 ${dup}군데로 늘어났다 — 중복이다`);

// ── 프로브: 패치 전에도 통과해야 한다 ──────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), "verify-sub-"));
try {
  writeFileSync(join(tmp, "ACTIVE"), "fx", "utf-8");
  const dir = join(tmp, "projects", "fx", "report");
  mkdirSync(dir, { recursive: true });
  const run = (payload) => spawnSync(process.execPath, [SOURCE], { input: JSON.stringify(payload), encoding: "utf-8" });

  run({ cwd: tmp, hook_event_name: "PreToolUse", tool_name: "Agent",
        tool_input: { subagent_type: "code-reviewer", prompt: "첫 줄\n둘째 줄" } });
  // 종료를 쓰는 이벤트는 SubagentStop 이다. PostToolUse 는 서브에이전트가 끝난 시점이 아니라
  // 그것을 띄운 툴 호출이 돌아온 시점에 뛰므로 한 줄도 쓰지 않는다
  // (2026-09-15 subagent-end-timing 패치가 이 동작을 바꿨고, 아래 두 줄이 그 계약이다).
  run({ cwd: tmp, hook_event_name: "PostToolUse", tool_name: "Agent",
        tool_input: { subagent_type: "code-reviewer" } });
  run({ cwd: tmp, hook_event_name: "SubagentStop", agent: "code-reviewer" });
  const rows = (read(join(dir, "subagents.jsonl")) ?? "").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  check("G 프로브(기록)", rows.length === 2 && rows[0].event === "start" && rows[0].agent === "code-reviewer"
        && rows[0].brief === "첫 줄" && rows[1].event === "end",
    "start 는 PreToolUse 가 쓰고 end 는 SubagentStop 이 쓴다 — PostToolUse 는 안 써서 두 줄이다",
    `두 줄이 안 맞는다: ${JSON.stringify(rows)}`);

  const r3 = run({ cwd: tmp, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } });
  const after = (read(join(dir, "subagents.jsonl")) ?? "").trim().split("\n").filter(Boolean).length;
  check("H 프로브(툴 구분)", r3.status === 0 && after === rows.length,
    "서브에이전트가 아닌 툴 호출은 기록하지 않는다", "보통 툴 호출까지 기록했다");

  const r4 = spawnSync(process.execPath, [SOURCE], { input: "{깨진 JSON", encoding: "utf-8" });
  check("I 프로브(깨진 입력)", r4.status === 0,
    "깨진 입력에도 종료 코드 0이다", `깨진 입력에 종료 코드 ${r4.status} — 훅이 작업을 막는다`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

{
  const r = spawnSync(process.execPath, [join(ROOT, "scripts", "check-report.mjs")], { encoding: "utf-8" });
  const tail = (r.stdout ?? "").trim().split("\n").pop() ?? "";
  check("J 계약", r.status === 0, `계약 테스트 통과 — ${tail}`, `계약 테스트 실패 — ${tail}`);
}

const passed = out.filter((r) => r.pass).length;
for (const r of out) console.log(`${r.pass ? "  ok " : "FAIL "} ${r.id} — ${r.msg}`);
console.log(`\n${passed}/${out.length} 통과`);
if (!existsSync(HOOK)) console.log("붙기 전이라면 A·B·C·D 가 실패하는 것이 정상이다 (기대값 6/10).");
process.exit(passed === out.length ? 0 : 1);
