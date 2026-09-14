#!/usr/bin/env node
// @check-role: on-change
// @check-guards: gates/spec-coverage.mjs
//
// check-inv-scope.mjs — 불변식 커버 판정이 프로젝트를 가르는지 검사한다.
//
// 무엇을 지키는 검사인가:
//   "승인된 스펙은 불변식마다 그것을 참조하는 테스트가 요구된다" — 이 저장소의 핵심 약속이다.
//   그런데 추적성 게이트는 **모든 프로젝트의 테스트를 한 덩어리로 합쳐** INV id 문자열을
//   찾는다. INV id 는 스펙 파일 안에서만 고유하고 프로젝트가 다르면 같은 id(INV-A1 …)를
//   쓰는 것이 정상이라, **남의 프로젝트 테스트가 내 불변식을 덮는다.**
//
//   2026-09-04 에 실제로 그랬다: study-mate 의 승인된 인증 스펙 불변식 넷(INV-A1~A4)이
//   테스트가 하나도 없는데도 전부 통과했다 — wama 의 동명 테스트가 덮었다.
//   프로젝트가 하나뿐일 때는 드러날 수 없는 구멍이다.
//
//   A 현행     내 프로젝트에 테스트가 없으면 남의 동명 테스트로 덮이지 않는다  ← 붙기 전 실패
//   B 과차단 X 자기 프로젝트 테스트가 참조하면 통과한다                        ← 붙기 전후 통과
//   C 패치 확인 패치를 적용한 사본에서 A 가 통과하고 B 도 유지된다             ← 붙기 전에도 통과
//
// **B 가 A 와 각도가 다르다.** 이 패치는 게이트를 **조이는** 변경이라 실패 방향이 과차단이다.
// A 만 보면 "전부 막는" 고장난 패치도 초록불이다.
//
// **C 가 핵심이다.** 고칠 파일이 보호 파일이라 붙기 전에는 A 를 통과시킬 수 없다. C 는 패치를
// 적용한 사본을 임시 폴더에 만들어 거기서 A·B 와 같은 판정을 돌린다 — 검사가 들고 있는 치환과
// 패치 문서의 치환이 같은 것이다.
//
// 전부 임시 디렉터리에서 돈다 — 이 레포의 파일은 하나도 건드리지 않는다.
//
// 사용: node scripts/check-inv-scope.mjs

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const ok = (id, name, pass, why = "") => results.push({ id, name, pass, why });

// ── 패치 — 이 치환이 패치 문서의 내용과 같은 것이다 ──────────────────────────
const PATCH = [
  {
    find: `const invToSpec = new Map();`,
    replace: `// INV id 는 스펙 파일 안에서만 고유하다. 프로젝트가 둘 이상이면 다른 프로젝트가 같은 id
// (INV-A1 등)를 쓰는 것이 정상이라, 테스트를 전부 한 덩어리로 합쳐 이름만 찾으면 **남의
// 프로젝트 테스트가 내 불변식을 덮는다.** 2026-09-04 에 실제로 그랬다 — 새 프로젝트의 승인된
// 스펙 불변식 넷이 테스트 0개인 채로 다른 프로젝트의 동명 테스트에 덮여 통과했다.
// 그래서 키에 프로젝트를 붙이고, 테스트 본문도 프로젝트별로 나눠 본다.
const projectOf = (p) => {
  const m = relative(ROOT, p).split("\\\\").join("/").match(/^projects\\/([^/]+)\\//);
  return m ? m[1] : "";
};
const KEY = (proj, inv) => \`\${proj}\\u0000\${inv}\`;
const invToSpec = new Map();`,
  },
  {
    find: `  for (const m of src.matchAll(/^[ \\t]*-[ \\t]+(INV-[A-Z0-9]+)[ \\t]*:/gm)) invToSpec.set(m[1], relative(ROOT, f));`,
    replace: `  for (const m of src.matchAll(/^[ \\t]*-[ \\t]+(INV-[A-Z0-9]+)[ \\t]*:/gm)) invToSpec.set(KEY(projectOf(f), m[1]), relative(ROOT, f));`,
  },
  {
    find: `const testText = testFiles.map((f) => stripComments(readFileSync(f, "utf-8"))).join("\\n");

const missing = [...invToSpec.entries()].filter(([inv]) => !testText.includes(inv));
if (missing.length > 0) {
  for (const [inv, spec] of missing)
    console.error(\`[spec-coverage/MISSING_TEST] \${spec} — \${inv}를 검증하는 테스트가 없다. 구현 전에 테스트부터 (rules/tdd.md)\`);`,
    replace: `const textByProject = new Map();
for (const f of testFiles) {
  const k = projectOf(f);
  textByProject.set(k, (textByProject.get(k) ?? "") + "\\n" + stripComments(readFileSync(f, "utf-8")));
}

const missing = [...invToSpec.entries()].filter(([key]) => {
  const [proj, inv] = key.split("\\u0000");
  return !(textByProject.get(proj) ?? "").includes(inv);
});
if (missing.length > 0) {
  for (const [key, spec] of missing)
    console.error(\`[spec-coverage/MISSING_TEST] \${spec} — \${key.split("\\u0000")[1]}를 검증하는 테스트가 없다. 구현 전에 테스트부터 (rules/tdd.md)\`);`,
  },
];

function applyPatch(src) {
  // 줄끝을 맞춘 뒤에 찾는다 — 이 저장소의 파일은 CRLF 로 저장돼 있을 수 있고, 여러 줄짜리
  // 치환 대상은 그것 때문에 조용히 안 잡힌다(2026-09-04 에 실제로 그렇게 헛짚었다).
  let out = src.split("\r\n").join("\n");
  for (const { find, replace } of PATCH) {
    if (!out.includes(find)) return { ok: false, at: find.split("\n")[0].slice(0, 60) };
    out = out.replace(find, replace);
  }
  return { ok: true, src: out };
}

// ── 픽스처: 프로젝트 둘. 같은 INV id 를 쓰고, 테스트는 한쪽에만 있다 ────────
const SPEC = `---
feature: 표본
status: approved
surfaces: []
---
# 표본

- INV-A1: 표본 불변식.
`;

function fixture({ ownTest }) {
  const dir = mkdtempSync(join(tmpdir(), "inv-scope-"));
  cpSync(join(ROOT, "gates"), join(dir, "gates"), { recursive: true });
  // mine: 승인된 스펙이 있다. 테스트는 ownTest 일 때만 자기 프로젝트에 둔다.
  mkdirSync(join(dir, "projects", "mine", "docs", "specs"), { recursive: true });
  mkdirSync(join(dir, "projects", "mine", "src"), { recursive: true });
  writeFileSync(join(dir, "projects", "mine", "docs", "specs", "sample.md"), SPEC);
  if (ownTest)
    writeFileSync(join(dir, "projects", "mine", "src", "own.test.ts"),
      `import { it } from "vitest";\nit("INV-A1 을 검증한다", () => {});\n`);
  // other: 같은 id 를 쓰는 남의 테스트. 이게 mine 의 불변식을 덮으면 안 된다.
  mkdirSync(join(dir, "projects", "other", "src"), { recursive: true });
  writeFileSync(join(dir, "projects", "other", "src", "other.test.ts"),
    `import { it } from "vitest";\nit("INV-A1 을 검증한다(남의 것)", () => {});\n`);
  return dir;
}

function runCoverage({ ownTest, patched }) {
  const dir = fixture({ ownTest });
  try {
    if (patched) {
      const src = readFileSync(join(dir, "gates", "spec-coverage.mjs"), "utf-8");
      const res = applyPatch(src);
      if (!res.ok) return { code: null, patchFailedAt: res.at };
      writeFileSync(join(dir, "gates", "spec-coverage.mjs"), res.src);
    }
    const r = spawnSync(process.execPath, [join(dir, "gates", "spec-coverage.mjs")], {
      cwd: dir, encoding: "utf-8",
    });
    const out = (r.stdout ?? "") + "\n" + (r.stderr ?? "");
    const syntax = out.match(/^\s*(\w*(?:Syntax|Reference|Type)Error: .+)$/m);
    return { code: r.status, out, broken: syntax?.[1] ?? null };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const alreadyPatched = readFileSync(join(ROOT, "gates", "spec-coverage.mjs"), "utf-8").includes("textByProject");

const a = runCoverage({ ownTest: false, patched: false });
ok("A", "현행     내 프로젝트에 테스트가 없으면 남의 동명 테스트로 덮이지 않는다", a.code === 2,
  a.broken ? `게이트가 아예 못 돈다 — ${a.broken}` :
  a.code === 0 ? "exit 0 — 테스트가 하나도 없는 승인 스펙이 통과했다. 남의 프로젝트 테스트가 덮었다(패치 미적용)" : "");

const b = runCoverage({ ownTest: true, patched: false });
ok("B", "과차단 X 자기 프로젝트 테스트가 참조하면 통과한다", b.code === 0,
  b.code !== 0 ? `exit ${b.code} — 통과해야 하는데 막혔다` : "");

if (alreadyPatched) {
  ok("C", "패치 확인 이미 적용돼 있다(사본 대조 생략)", a.code === 2 && b.code === 0,
    "적용된 것으로 보이는데 A·B 가 기대와 다르다");
} else {
  const ca = runCoverage({ ownTest: false, patched: true });
  const cb = runCoverage({ ownTest: true, patched: true });
  ok("C", "패치 확인 패치를 적용한 사본에서 A 가 통과하고 B 도 유지된다",
    ca.code === 2 && cb.code === 0,
    ca.patchFailedAt ? `패치가 안 붙는다 — 못 찾은 자리: "${ca.patchFailedAt}…"` :
    ca.broken ? `패치한 사본이 못 돈다 — ${ca.broken}` :
    `테스트 없음=exit ${ca.code}(2 여야) / 자기 테스트 있음=exit ${cb.code}(0 이어야)`);
}

console.log();
let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.id} ${r.name}${r.why ? `  — ${r.why}` : ""}`);
  if (!r.pass) failed++;
}
console.log(`\ncheck-inv-scope: ${results.length - failed}/${results.length} 통과` +
  (alreadyPatched ? "" : "  (패치 미적용 — A 가 그 신호이고, C 가 붙이면 닫힌다는 근거다)"));
process.exit(failed ? 2 : 0);
