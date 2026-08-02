#!/usr/bin/env node
// 보호 파일 직접 수정 차단 (PreToolUse: Edit|Write|MultiEdit)
import { readFileSync } from "node:fs";
const PROTECTED = [
  { p: "docs/LESSONS.md", why: "LESSONS.md는 retro 스킬의 사용자 승인 절차로만 갱신한다" },
  { p: ".claude/settings.json", why: "훅/권한 설정은 사용자가 직접 수정한다" },
  { p: ".claude/hooks/", why: "훅 스크립트는 사용자가 직접 수정한다 (훅으로 훅 우회 차단)" },
  { p: "gates/", why: "판정 레이어는 제안 후 사용자가 반영한다 (retro/setup 절차)" },
];
const input = JSON.parse(readFileSync(0, "utf-8"));
const ti = input.tool_input ?? {};
const target = ti.file_path ?? "";   // Edit/Write/MultiEdit
const cmd = ti.command ?? "";        // Bash

// bash 명령이 보호 경로에 '쓰기'로 닿는지 (리다이렉트 대상 / sed -i / tee / cp·mv 목적지). 읽기는 허용.
function bashWritesTo(p) {
  const e = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:>>?|\\btee\\b(?:\\s+-a)?)\\s*['"]?[^'"|&;\\n\\r]*${e}`).test(cmd)
      || new RegExp(`\\bsed\\b[^|;&\\n\\r]*-i[^|;&\\n\\r]*${e}`).test(cmd)
      || new RegExp(`\\b(?:cp|mv)\\b[^|;&\\n\\r]*${e}`).test(cmd);
}
const hit = PROTECTED.find(({ p }) => target.includes(p) || bashWritesTo(p));
if (hit) {
  console.error(`보호 파일(${hit.p}) 수정 시도. ${hit.why}. 내용을 제안하고 사용자에게 요청하라.`);
  process.exit(2);
}
process.exit(0);