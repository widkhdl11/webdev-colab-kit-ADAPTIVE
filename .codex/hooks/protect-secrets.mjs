#!/usr/bin/env node
// 시크릿 노출 차단 (PreToolUse: Read|Bash|PowerShell)
import { readFileSync } from "node:fs";
const input = JSON.parse(readFileSync(0, "utf-8"));
const tool = input.tool_name ?? "";
const path = input.tool_input?.file_path ?? "";
const cmd  = input.tool_input?.command ?? "";
const isEnv = (p) => /(^|[\\/])\.env(\.[\w.-]+)?$/.test(p.replace(/\\/g, "/"));
const block = (m) => { console.error(`시크릿 보호: ${m}`); process.exit(2); };
if (tool === "Read" && isEnv(path)) block(".env 읽기 차단");
if (tool === "Bash" || tool === "PowerShell") {
  if (/\.env(\.[\w.-]+)?\b/.test(cmd) &&
      /\b(cat|less|more|head|tail|nl|grep|rg|type|Get-Content|gc|sort|xxd|od|strings|awk|sed|Select-String|sls)\b/i.test(cmd))
    block(".env 내용 출력 차단");
  if (/SUPABASE_TOKEN/.test(cmd)) block("SUPABASE_TOKEN 참조 차단");
  if (/\bprintenv\b/.test(cmd)) block("환경변수 덤프 차단");
  if (/(Get-ChildItem|Get-Item|gci|gi|ls|dir)\s+env:/i.test(cmd)) block("env: 덤프 차단");
}