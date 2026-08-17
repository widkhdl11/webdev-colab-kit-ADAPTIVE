#!/usr/bin/env node
// 검사 대상: .claude/hooks/protect-files.mjs 의 `rm -r <디렉터리>` 처리.
//
// 배경: protect-files 는 보호 경로 '문자열'이 명령에 있어야 잡는다. `rm -r .claude/` 에는
// `.claude/hooks/`·`.claude/settings.json` 같은 하위 파일명이 명령에 안 보여서 안 걸린다
// (2026-08-15 발견). 개별 파일 rm 은 이미 막혀 있고, 디렉터리 통째 삭제만 뚫려 있었다.
// 반영한 것: rm 의 인자를 직접 대조해 그 인자가 PROTECTED 항목의 조상 디렉터리면 막는다.
// node_modules 같은 무관한 재귀 삭제는 그대로 통과해야 한다(과차단 금지).
import { spawnSync } from "node:child_process";

function run(command) {
  const r = spawnSync("node", [".claude/hooks/protect-files.mjs"], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: "utf-8",
  });
  return r.status;
}

const cases = [
  { name: "rm -r .claude/  (settings.json·hooks 의 부모)", cmd: "rm -r .claude/", want: 2 },
  { name: "rm -r .claude  (끝 슬래시 없이)", cmd: "rm -r .claude", want: 2 },
  { name: "rm -r docs  (LESSONS.md 의 부모)", cmd: "rm -r docs", want: 2 },
  { name: "rm -r gates  (기존에도 막혔어야 함)", cmd: "rm -r gates", want: 2 },
  { name: "rm -r node_modules  (무관 — 과차단 금지)", cmd: "rm -r node_modules", want: 0 },
  { name: "rm -r projects/signal/dist  (무관 — 과차단 금지)", cmd: "rm -r projects/signal/dist", want: 0 },
];

let allPass = true;
for (const c of cases) {
  const got = run(c.cmd);
  const ok = got === c.want;
  if (!ok) allPass = false;
  console.error(`  ${ok ? "✓" : "✗"} ${c.name} — 기대 exit ${c.want}, 실제 ${got}`);
}

if (!allPass) {
  console.error("✗ 미달 — 위 ✗ 항목 확인. 패치 전이면 .claude/·docs 케이스가 0(안 막힘)으로 나오는 게 정상이다.");
  process.exit(1);
}
console.error("✓ 보호 디렉터리 통째 삭제는 막히고, 무관한 재귀 삭제는 과차단 없이 통과한다.");
process.exit(0);
