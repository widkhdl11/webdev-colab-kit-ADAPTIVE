#!/usr/bin/env node
// protect-secrets 가 "막아야 할 것은 막고, 막지 말아야 할 것은 통과시키는지" 판정한다.
//
// 붙기 전에는 과차단 넷이 실패하고, 붙은 뒤에는 열셋 다 통과해야 한다.
// 훅을 실제로 실행시켜(자식 프로세스에 stdin 으로 JSON 을 먹여) 종료 코드로 본다 —
// 소스 문자열 대조가 아니라 동작 검사다.
//
// 돌리는 법:
//   node docs/references/pending-patches/2026-09-14-protect-secrets-args/verify.mjs
//   ... --patched   ← 붙이기 전에 붙은 뒤의 판정을 미리 본다

import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..", "..");
const PATCHED = process.argv.includes("--patched");
const HOOK = PATCHED ? join(HERE, "protect-secrets.patched.mjs") : join(ROOT, ".claude", "hooks", "protect-secrets.mjs");
console.log(PATCHED ? "※ --patched: 패치본을 돌린다 (붙은 뒤 판정 미리보기)\n" : "※ 지금 붙어 있는 훅을 돌린다\n");

// 막아야 하는 것 / 막으면 안 되는 것.
// BLOCK 은 "환경파일의 내용이 밖으로 나가는 명령", PASS 는 "환경파일을 안 읽는 정상 작업"이다.
const CASES = [
  // [설명, 입력, 막혀야 하나]
  ["cat .env", { tool_name: "Bash", tool_input: { command: "cat .env" } }, true],
  ["cat ./.env", { tool_name: "Bash", tool_input: { command: "cat ./.env" } }, true],
  ["cat projects/x/.env.local", { tool_name: "Bash", tool_input: { command: "cat projects/x/.env.local" } }, true],
  ["셸 확장 $(cat .env)", { tool_name: "Bash", tool_input: { command: 'echo "$(cat .env)"' } }, true],
  ["Windows 경로 type .\\.env", { tool_name: "Bash", tool_input: { command: "type .\\.env" } }, true],
  ["Read .env", { tool_name: "Read", tool_input: { file_path: "C:/x/.env" } }, true],
  ["printenv", { tool_name: "Bash", tool_input: { command: "printenv" } }, true],
  ["SUPABASE_TOKEN 참조", { tool_name: "Bash", tool_input: { command: "echo $SUPABASE_TOKEN" } }, true],

  // 아래 넷이 이 패치가 고치는 자리다 — 붙기 전에는 전부 막힌다.
  [
    "코드 안의 process.env 접근",
    { tool_name: "Bash", tool_input: { command: "node -e 'console.log(Object.keys(process.env).length)'" } },
    false,
  ],
  [
    // 2026-09-04 신고 그대로: process.env 를 쓰는 소스를 히어독으로 쓰려다 두 번 막혔다
    "process.env 를 쓰는 소스를 히어독으로 쓰기",
    {
      tool_name: "Bash",
      tool_input: { command: "cat > src/shared/env.ts <<'EOF'\nexport const url = process.env.NEXT_PUBLIC_SUPABASE_URL;\nEOF" },
    },
    false,
  ],
  [
    "소스에서 process.env 를 grep",
    { tool_name: "Bash", tool_input: { command: "grep -rn 'process.env' projects/study-mate/src/" } },
    false,
  ],
  [
    "마크다운을 grep (패턴에 .env 가 들어 있다)",
    { tool_name: "Bash", tool_input: { command: "grep -n '\\.env\\.example' docs/references/harness-backlog.md" } },
    false,
  ],
  ["견본 파일 읽기 cat .env.example", { tool_name: "Bash", tool_input: { command: "cat .env.example" } }, false],
  ["견본 파일 Read .env.example", { tool_name: "Read", tool_input: { file_path: "C:/x/.env.example" } }, false],

  // 과차단 확인 하나 더 — .env 라는 글자가 파일명 한가운데 있는 멀쩡한 파일
  ["docs/dotenv-notes.md 읽기", { tool_name: "Bash", tool_input: { command: "cat docs/dotenv-notes.md" } }, false],
];

let bad = 0;
for (const [label, input, shouldBlock] of CASES) {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: "utf-8" });
  const blocked = r.status === 2;
  const pass = blocked === shouldBlock;
  console.log(
    `${pass ? "✓" : "✗"} ${shouldBlock ? "막아야" : "통과해야"} — ${label}${pass ? "" : blocked ? " → 막혔다(과차단)" : " → 통과했다(구멍)"}`,
  );
  if (!pass) bad += 1;
}

console.log(bad === 0 ? `\n${CASES.length}/${CASES.length} 통과.` : `\n${CASES.length - bad}/${CASES.length} — ${bad}건 실패.`);
process.exit(bad === 0 ? 0 : 1);
