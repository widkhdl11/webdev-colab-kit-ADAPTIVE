#!/usr/bin/env node
// 위험 명령 차단 (PreToolUse: Bash)
import { readFileSync } from "node:fs";
const RULES = [
  { re: /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/i, msg: "rm -rf 금지 — 삭제는 대상을 명시해 사용자 승인 후" },
  { re: /git\s+push\s+.*--force/, msg: "force push 금지" },
  { re: /(curl|wget)[^|]*\|\s*(sh|bash|node)/, msg: "원격 스크립트 파이프 실행 금지" },
  { re: /\bgit\s+reset\s+--hard/, msg: "hard reset 금지 — 사용자에게 요청하라" },
  { re: /\bRemove-Item\b(?=[^|;\n\r]*-Recurse\b)(?=[^|;\n\r]*-Force\b)/i, msg: "Remove-Item -Recurse -Force 금지 — 삭제는 대상을 명시해 사용자 승인 후" },
  { re: /(Invoke-WebRequest|Invoke-RestMethod|iwr|irm)[^|]*\|\s*(iex|Invoke-Expression)/i, msg: "원격 스크립트 파이프 실행 금지" },

];
const input = JSON.parse(readFileSync(0, "utf-8"));
const cmd = input.tool_input?.command ?? "";
for (const { re, msg } of RULES) {
  if (re.test(cmd)) { console.error(`차단됨: ${msg}. 명령: ${cmd.slice(0, 120)}`); process.exit(2); }
}
process.exit(0);
