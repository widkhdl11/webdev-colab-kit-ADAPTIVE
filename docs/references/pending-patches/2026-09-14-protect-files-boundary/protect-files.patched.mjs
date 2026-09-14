#!/usr/bin/env node
// 보호 파일 직접 수정 차단 (PreToolUse: Edit|Write|MultiEdit)
//
// 2026-09-14 패치 — 두 가지를 고친다. 둘 다 "문자열로 보면 표기가 바뀌는 날 어긋난다"는 한 뿌리다.
//   ① 경로를 **경계**로 본다. 전에는 `targetPosix.includes("gates/")` 라 폴더 이름
//      `2026-09-06-retro-gates/` 가 걸렸다(그때는 폴더 이름을 바꿔 우회했다).
//      이제 경로를 조각으로 갈라 조각 단위로 맞춘다 — `retro-gates` 는 `gates` 가 아니다.
//   ② 히어독 본문은 명령이 아니라 **데이터**다. 2026-09-14 에 문서를 고치는 명령이 막혔는데,
//      원인은 히어독 안 마크다운의 인용 기호였다:
//         > **적용 완료.** 사용자가 `gates/run-gates.mjs` 를 덮어썼고
//         ^ 이 글자를 리다이렉트로 읽었다
//      그래서 스캔 전에 히어독 본문을 떼어낸다. **리다이렉트 자체는 히어독 바깥에 있으므로**
//      `cat > gates/x <<'EOF'` 는 그대로 잡힌다(검사에 넣어 확인한다).
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
const target = ti.file_path ?? ""; // Edit/Write/MultiEdit
const rawCmd = ti.command ?? ""; // Bash

// 히어독 본문 떼어내기 (위 ② 참고). 여는 표식(`<<'PY'`)만 남기고 본문과 닫는 표식을 지운다.
// 셸이 해석하지 않는 자리를 셸 구문으로 읽지 않기 위한 것이다.
const stripHeredocs = (c) => c.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^[\t ]*\2[\t ]*$/gm, "<<HEREDOC");

const cmd = stripHeredocs(rawCmd);
const cmdPosix = cmd.split("\\").join("/"); // Windows 경로를 같은 패턴으로 보기 위한 사본
const hits = (re) => re.test(cmd) || re.test(cmdPosix); // 원본과 정규화본 둘 다 본다

// bash 명령이 보호 경로에 '쓰기'로 닿는지 (리다이렉트 대상 / sed -i / tee / rm·cp·mv 대상). 읽기는 허용.
// rm 은 2026-08-15 에 추가했다 — 그 전엔 `rm .claude/hooks/protect-files.mjs` 가 그냥 통과했다(훅이 자기를
// 지우는 명령을 못 봤다). 정규식이라 `truncate`·`dd`·`node -e` 의 파일 쓰기는 여전히 안 잡힌다.
// 막으려면 node 실행을 통째로 금지해야 하는데 게이트·스캐폴딩이 전부 node 라 과차단 비용이 더 크다.
// 이 층의 목적은 봉인이 아니라 '제일 먼저 떠오르는 값싼 길'을 없애는 것이다.
// bash: 리다이렉트 · sed -i · tee · rm·cp·mv  (기존 그대로)
// PowerShell(2026-08-16 추가): cmdlet 이름이 rm·cp·mv 와 달라 전부 빠져나갔다.
function shellWritesTo(p) {
  // 앞에 낱말 글자·하이픈·점이 붙어 있으면 다른 이름이다 (`retro-gates/` ≠ `gates/`).
  const e = "(?<![\\w.-])" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    hits(new RegExp(`(?:>>?|\\btee\\b(?:\\s+-a)?)\\s*['"]?[^'"|&;\\n\\r]*${e}`)) ||
    hits(new RegExp(`\\bsed\\b[^|;&\\n\\r]*-i[^|;&\\n\\r]*${e}`)) ||
    hits(new RegExp(`\\b(?:rm|cp|mv)\\b[^|;&\\n\\r]*${e}`)) ||
    hits(
      new RegExp(
        `\\b(?:Set-Content|Add-Content|Clear-Content|Out-File|New-Item|Remove-Item|Move-Item|Copy-Item)\\b[^|;\\n\\r]*${e}`,
        "i",
      ),
    )
  );
}
// `rm -r <디렉터리>` 로 보호 파일의 부모 디렉터리를 통째로(또는 끝 슬래시 없이) 지우면
// 개별 파일명이 명령에 안 보여 위 shellWritesTo 판정을 피해간다(2026-08-15 발견,
// 예: `rm -r .claude/`·`rm -r gates`). 명령을 토큰으로 갈라 rm 의 인자가 PROTECTED
// 항목 자신이거나 그 조상 디렉터리인지 직접 대조한다.
function rmRecursiveDirHit() {
  for (const sub of cmdPosix.split(/&&|;|\|/)) {
    const m = sub.match(/\brm\s+(-[a-zA-Z]+(?:\s+-[a-zA-Z]+)*)\s+(.+)/);
    if (!m || !/r/i.test(m[1]) || /f/i.test(m[1])) continue; // -f 조합은 block-danger 가 별도로 잡는다
    const args = m[2]
      .trim()
      .split(/\s+/)
      .map((a) => a.replace(/^['"]|['"]$/g, "").replace(/\/+$/, ""));
    for (const arg of args) {
      for (const entry of PROTECTED) {
        const pDir = entry.p.replace(/\/$/, "");
        if (arg && (arg === pDir || entry.p.startsWith(`${arg}/`))) return entry;
      }
    }
  }
  return null;
}

// 편집 대상 경로가 보호 항목에 닿는지 — **조각 단위**로 본다 (위 ① 참고).
// 디렉터리 항목(`gates/`)은 그 아래 무엇이든, 파일 항목(`graph.mjs`)은 그 파일 자신일 때만.
const segs = (s) => s.split("\\").join("/").split("/").filter(Boolean);
function targetHits(targetPath, protectedPath) {
  if (!targetPath) return false;
  const t = segs(targetPath);
  const p = segs(protectedPath);
  const isDir = protectedPath.endsWith("/");
  for (let i = 0; i + p.length <= t.length; i++) {
    if (!p.every((seg, j) => seg === t[i + j])) continue;
    if (isDir || i + p.length === t.length) return true;
  }
  return false;
}

const hit = PROTECTED.find(({ p }) => targetHits(target, p) || shellWritesTo(p)) || rmRecursiveDirHit();
if (hit) {
  console.error(`보호 파일(${hit.p}) 수정 시도. ${hit.why}. 내용을 제안하고 사용자에게 요청하라.`);
  process.exit(2);
}
process.exit(0);
