#!/usr/bin/env node
//
// verify.mjs — 활동 기록 훅(3층)이 실제로 붙었는지 판정한다.
//
//   node docs/references/pending-patches/2026-09-14-report-activity-hook/verify.mjs
//
// 붙기 전에는 A·B·C 가 실패하고, 붙은 뒤에는 전부 통과한다.
// D~G 는 패치와 무관하게 항상 통과해야 한다 — 검사 자체가 살아 있는지 보는 항목이다.
//
// 이 레포의 파일은 읽기만 한다. 프로브는 임시 디렉터리에서 돈다.

import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..", "..");
const HOOK = join(ROOT, ".claude", "hooks", "report-activity.mjs");
const SOURCE = join(ROOT, ".claude", "skills", "report-dashboard", "assets", "report-activity.mjs");
const SETTINGS = join(ROOT, ".claude", "settings.json");

const out = [];
const check = (id, cond, ok, bad) => out.push({ id, pass: !!cond, msg: cond ? ok : bad });
const read = (p) => { try { return readFileSync(p, "utf-8"); } catch { return null; } };

// A. 훅 파일이 제자리에 있다
const hookText = read(HOOK);
check("A 파일", hookText !== null,
  ".claude/hooks/report-activity.mjs 가 있다",
  ".claude/hooks/report-activity.mjs 가 없다 — assets 의 사본을 그 자리에 복사한다");

// B. 그 파일이 정본과 같다 (반쯤 낡은 사본이 붙어 있는 것을 잡는다)
const sourceText = read(SOURCE);
check("B 내용", hookText !== null && sourceText !== null && hookText === sourceText,
  "붙은 훅이 정본과 같다",
  hookText === null ? "훅이 없어서 대조할 수 없다" : "붙은 훅이 정본과 다르다 — 정본을 다시 복사한다");

// C. settings.json 의 PostToolUse 에 그 명령이 있다
const settingsText = read(SETTINGS);
let wired = false;
try {
  const s = JSON.parse(settingsText ?? "{}");
  wired = (s.hooks?.PostToolUse ?? []).some((g) => (g.hooks ?? []).some((h) => /report-activity\.mjs/.test(h.command ?? "")));
} catch { /* 아래에서 실패로 잡힌다 */ }
check("C 배선", wired,
  "settings.json 의 PostToolUse 가 이 훅을 부른다",
  "settings.json 에 배선이 없다 — node scripts/report-install-hook.mjs 의 출력으로 바꾼다");

// D. 기존 훅이 그대로 살아 있다 (병합이 무언가를 지웠는지 본다)
const KEEP = ["run-gates.mjs", "graph-stop.mjs", "protect-files.mjs", "protect-secrets.mjs", "block-danger.mjs", "briefing.mjs", "check-hooks-on-edit.mjs"];
const missing = KEEP.filter((k) => !(settingsText ?? "").includes(k));
check("D 보존", missing.length === 0,
  `기존 훅 ${KEEP.length}개가 전부 남아 있다`,
  `기존 훅이 사라졌다: ${missing.join(", ")} — 병합이 아니라 덮어쓴 것이다`);

// E. 두 벌로 들어가지 않았다
const dup = ((settingsText ?? "").match(/report-activity\.mjs/g) ?? []).length;
check("E 중복", dup <= 1, `배선이 ${dup}벌이다`, `배선이 ${dup}벌 들어갔다 — 한 벌만 남긴다`);

// F 프로브: 정본 훅에 가짜 입력을 넣으면 활동 한 줄이 쌓인다 (패치 전에도 통과해야 한다)
{
  const tmp = mkdtempSync(join(tmpdir(), "verify-hook-"));
  try {
    writeFileSync(join(tmp, "ACTIVE"), "fx", "utf-8");
    const dir = join(tmp, "projects", "fx", "report");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "activity.jsonl"), "", "utf-8");
    const r = spawnSync(process.execPath, [SOURCE], {
      input: JSON.stringify({ session_id: "s", cwd: tmp, tool_name: "Write", tool_input: { file_path: "a/b.ts" } }),
      encoding: "utf-8",
    });
    const lines = readFileSync(join(dir, "activity.jsonl"), "utf-8").trim().split("\n").filter(Boolean);
    const row = lines.length === 1 ? JSON.parse(lines[0]) : null;
    check("F 프로브", r.status === 0 && row?.tool === "Write" && row?.target === "a/b.ts",
      "정본 훅이 가짜 입력 하나를 활동 한 줄로 만든다",
      `정본 훅이 줄을 못 만들었다 (exit ${r.status}, ${lines.length}줄) ${r.stderr ?? ""}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// G 프로브: 배선 판정이 실제로 눈을 뜨고 있는지 — 심은 가짜 설정을 C 와 같은 방식으로 본다
{
  const planted = { hooks: { PostToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "node x/run-gates.mjs" }] }] } };
  const sees = (planted.hooks.PostToolUse ?? []).some((g) => (g.hooks ?? []).some((h) => /report-activity\.mjs/.test(h.command ?? "")));
  check("G 프로브", sees === false,
    "배선이 없는 설정을 '없다'고 판정한다",
    "배선이 없는데 있다고 판정한다 — C 항목이 무효다");
}

// H. 계약 테스트가 여전히 통과한다 (패치가 다른 것을 깨뜨리지 않았다)
{
  const r = spawnSync(process.execPath, [join(ROOT, "scripts", "check-report.mjs")], { encoding: "utf-8" });
  const tail = (r.stdout ?? "").trim().split("\n").pop() ?? "";
  check("H 계약", r.status === 0, `계약 테스트 통과 — ${tail}`, `계약 테스트 실패 — ${tail}`);
}

const passed = out.filter((r) => r.pass).length;
for (const r of out) console.log(`${r.pass ? "  ok " : "FAIL "} ${r.id} — ${r.msg}`);
console.log(`\n${passed}/${out.length} 통과`);
if (!existsSync(HOOK)) console.log("붙기 전이라면 A·B·C 가 실패하는 것이 정상이다 (기대값 5/8).");
process.exit(passed === out.length ? 0 : 1);
