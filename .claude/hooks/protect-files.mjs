#!/usr/bin/env node
// 보호 파일 직접 수정 차단 (PreToolUse: Edit|Write|MultiEdit)
import { readFileSync } from "node:fs";
const PROTECTED = [
  { p: "docs/LESSONS.md", why: "LESSONS.md는 retro 스킬의 사용자 승인 절차로만 갱신한다" },
  { p: ".claude/settings.json", why: "훅/권한 설정은 사용자가 직접 수정한다" },
  { p: ".claude/hooks/", why: "훅 스크립트는 사용자가 직접 수정한다 (훅으로 훅 우회 차단)" },
  { p: "gates/", why: "판정 레이어는 제안 후 사용자가 반영한다 (retro/setup 절차)" },
  // 문서(harness-backlog·retro·CLAUDE)는 graph.mjs 를 줄곧 보호 파일이라 불렀는데 이 목록엔 없었다.
  // 게이트를 지키면서 그 게이트가 무엇을 검사할지 정하는 토폴로지·GATE_KIND 는 안 지키면 우회로가 그대로 남는다.
  { p: "graph.mjs", why: "토폴로지·GATE_KIND 선언도 판정 레이어다 — 제안 후 사용자가 반영한다 (gates/ 와 같은 취급)" },
];
const input = JSON.parse(readFileSync(0, "utf-8"));
const ti = input.tool_input ?? {};
const target = ti.file_path ?? "";   // Edit/Write/MultiEdit
const cmd = ti.command ?? "";        // Bash
const cmdPosix = cmd.split("\\").join("/");        // Windows 경로를 같은 패턴으로 보기 위한 사본
const hits = (re) => re.test(cmd) || re.test(cmdPosix);   // 원본과 정규화본 둘 다 본다

// bash 명령이 보호 경로에 '쓰기'로 닿는지 (리다이렉트 대상 / sed -i / tee / rm·cp·mv 대상). 읽기는 허용.
// rm 은 2026-08-15 에 추가했다 — 그 전엔 `rm .claude/hooks/protect-files.mjs` 가 그냥 통과했다(훅이 자기를
// 지우는 명령을 못 봤다). 정규식이라 `truncate`·`dd`·`node -e` 의 파일 쓰기는 여전히 안 잡힌다.
// 막으려면 node 실행을 통째로 금지해야 하는데 게이트·스캐폴딩이 전부 node 라 과차단 비용이 더 크다.
// 이 층의 목적은 봉인이 아니라 '제일 먼저 떠오르는 값싼 길'을 없애는 것이다.
// bash: 리다이렉트 · sed -i · tee · rm·cp·mv  (기존 그대로)
// PowerShell(2026-08-16 추가): cmdlet 이름이 rm·cp·mv 와 달라 전부 빠져나갔다.
function shellWritesTo(p) {
  const e = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return hits(new RegExp(`(?:>>?|\\btee\\b(?:\\s+-a)?)\\s*['"]?[^'"|&;\\n\\r]*${e}`))
      || hits(new RegExp(`\\bsed\\b[^|;&\\n\\r]*-i[^|;&\\n\\r]*${e}`))
      || hits(new RegExp(`\\b(?:rm|cp|mv)\\b[^|;&\\n\\r]*${e}`))
      || hits(new RegExp(`\\b(?:Set-Content|Add-Content|Clear-Content|Out-File|New-Item|Remove-Item|Move-Item|Copy-Item)\\b[^|;\\n\\r]*${e}`, "i"));
}
// const hit = PROTECTED.find(({ p }) => target.includes(p) || bashWritesTo(p));
const targetPosix = target.split("\\").join("/");
const hit = PROTECTED.find(({ p }) => targetPosix.includes(p) || shellWritesTo(p));
if (hit) {
  console.error(`보호 파일(${hit.p}) 수정 시도. ${hit.why}. 내용을 제안하고 사용자에게 요청하라.`);
  process.exit(2);
}
process.exit(0);