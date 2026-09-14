#!/usr/bin/env node
// protect-files 가 "막아야 할 것은 막고, 막지 말아야 할 것은 통과시키는지" 판정한다.
//
// 훅을 실제로 실행시켜(자식 프로세스에 stdin 으로 JSON 을 먹여) 종료 코드로 본다.
// 붙기 전에는 과차단 셋이 실패하고, 붙은 뒤에는 전부 통과해야 한다.
//
// 돌리는 법:
//   node docs/references/pending-patches/2026-09-14-protect-files-boundary/verify.mjs
//   ... --patched   ← 붙이기 전에 붙은 뒤의 판정을 미리 본다

import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..", "..");
const PATCHED = process.argv.includes("--patched");
const HOOK = PATCHED ? join(HERE, "protect-files.patched.mjs") : join(ROOT, ".claude", "hooks", "protect-files.mjs");
console.log(PATCHED ? "※ --patched: 패치본을 돌린다 (붙은 뒤 판정 미리보기)\n" : "※ 지금 붙어 있는 훅을 돌린다\n");

const edit = (file_path) => ({ tool_name: "Edit", tool_input: { file_path } });
const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });

// 히어독 안에 마크다운 인용 기호가 있는 명령 — 2026-09-14 에 실제로 막혔던 모양 그대로.
const HEREDOC_DOC = `cd /repo && python - <<'PY'
s = """
> **적용 완료.** 사용자가 \`gates/run-gates.mjs\` 를 덮어썼다
"""
open("docs/references/pending-patches/x/README.md","w").write(s)
PY`;

// 히어독을 떼어내도 리다이렉트는 바깥에 남는다 — 그게 안 잡히면 구멍이다.
const HEREDOC_WRITE = `cat > gates/run-gates.mjs <<'EOF'
아무 내용
EOF`;

const CASES = [
  // ── 막아야 하는 것
  ["보호 폴더 편집", edit("C:/repo/gates/run-gates.mjs"), true],
  ["보호 파일 편집 (graph.mjs)", edit("C:/repo/graph.mjs"), true],
  ["훅 폴더 편집", edit("C:/repo/.claude/hooks/protect-files.mjs"), true],
  ["LESSONS.md 편집", edit("C:/repo/docs/LESSONS.md"), true],
  ["Windows 역슬래시 경로", edit("C:\\repo\\gates\\run-gates.mjs"), true],
  ["리다이렉트로 덮어쓰기", bash("echo x > gates/run-gates.mjs"), true],
  ["히어독 바깥의 리다이렉트", bash(HEREDOC_WRITE), true],
  ["sed -i", bash("sed -i 's/a/b/' gates/run-gates.mjs"), true],
  ["rm -r 로 폴더 통째로", bash("rm -r gates"), true],
  ["PowerShell Set-Content", bash("Set-Content graph.mjs 'x'"), true],

  // ── 통과해야 하는 것 (아래 셋이 이 패치가 고치는 자리)
  ["이름이 비슷한 폴더 편집 (retro-gates)", edit("C:/repo/docs/references/pending-patches/2026-09-06-retro-gates/README.md"), false],
  ["히어독 안 마크다운 인용 기호", bash(HEREDOC_DOC), false],
  ["이름이 비슷한 폴더에 쓰기", bash("echo x > docs/references/pending-patches/2026-09-14-retro-gates/README.md"), false],
  ["보호 파일 읽기", bash("cat gates/run-gates.mjs"), false],
  ["무관한 파일 편집", edit("C:/repo/projects/study-mate/src/app/page.tsx"), false],
  ["무관한 rm -r", bash("rm -r node_modules"), false],
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
