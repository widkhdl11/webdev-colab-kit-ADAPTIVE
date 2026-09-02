#!/usr/bin/env node
// check-docs-boundary.mjs — 프로젝트 docs/ 와 하네스 사이의 경계 검사(a·b)가 붙었는지,
// 붙은 뒤에도 멀쩡한 문서를 막지 않는지를 검사한다.
//
// 무엇을 지키는 검사인가 (v3.2 목표):
//   이전 = projects/<이름>/docs/ 복사 + docs/references/docs-contract.md 전달.
//   그러려면 docs/ 안에 (1) 하네스만 아는 필드가 없어야 하고 (2) 하네스 구현을
//   가리키는 문장이 없어야 한다. 사람이 매번 눈으로 보면 새어 나간다.
//
//   검사 a  스펙 frontmatter 에 feature·status·surfaces 외 필드가 있으면 실패
//   검사 b  projects/*/docs/** 안에 하네스 구현 참조가 있으면 실패
//
// 이 패치는 보호 파일(gates/run-gates.mjs)을 사용자가 직접 붙인다.
// 붙었는지를 코드를 안 읽고도 판정할 수 있게, 아래를 **실제로 게이트를 돌려서** 본다.
//
//   S1 하네스 확인  검사 a 가 실제로 스펙 파일을 훑는다(위반을 심으면 잡힌다)  ← 붙기 전 실패
//   S2 하네스 확인  검사 b 가 실제로 docs 를 훑는다(위반을 심으면 잡힌다)      ← 붙기 전 실패
//   A  과차단 없음  멀쩡한 스펙 frontmatter 세 필드는 통과한다                 ← 붙기 전후 통과
//   B  주석 오인 X  frontmatter 주석 줄을 필드로 세지 않는다                    ← 붙기 전후 통과
//   C  오탐 없음    CSS `flex-basis: 100%` 는 basis 참조가 아니다               ← 붙기 전후 통과
//   D  오탐 없음    "게이트가 막는다" 같은 서술은 잡지 않는다(구현 이름만 잡는다) ← 붙기 전후 통과
//   E  현행 통과    이 레포의 현재 docs 가 두 검사를 통과한다                    ← 붙기 전후 통과
//
// **S1·S2 가 이 파일의 핵심이다.** 위반이 0건이라는 보고와 검사가 아예 안 돌았다는 것은
// 겉으로 같다. 위반을 일부러 심어서 잡히는 것을 보지 않으면 둘을 구분할 수 없다.
// (같은 함정을 check-read-spec 에서 한 번 밟았다 — 표면 패턴을 .sql 에 심었더니 게이트가
//  그 파일을 스캔하지 않아 "0개 파일"로 통과했고, 그것을 '방벽이 열렸다'로 읽을 뻔했다)
//
// A~D 가 있는 이유: 이 패치는 게이트를 **조이는** 변경이라 과차단이 실패 방향이다.
// 멀쩡한 문서까지 막으면 매 턴 걸려서 우회(문장 지우기)가 값싸진다.
//
// 사용: node scripts/check-docs-boundary.mjs
// 전부 임시 디렉터리에서 돈다 — 이 레포의 파일은 하나도 건드리지 않는다.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── 판정 기준: 아래 둘이 곧 검사 a·b 다. run-gates 에 붙일 것과 같은 목록을 여기 둔다.
//    (패치 문서 docs/references/pending-patches/2026-09-02-docs-boundary.md 와 같은 값)
const SPEC_FM_FIELDS = ["feature", "status", "surfaces"];
const HARNESS_REFS = [
  { re: /\bgates\//, what: "게이트 경로" },
  { re: /\b(run-gates|graph-stop|spec-coverage|propagate|graph)\.mjs\b/, what: "게이트 파일명" },
  { re: /\b(run-gates|graph-stop|spec-coverage)\b/, what: "게이트 이름" },
  { re: /\b(BEFORE_UI|NO_INNERHTML|risk-surface)\b/, what: "게이트 규칙 이름" },
  { re: /(^|[\s(`"'])\.claude\//, what: "하네스 설정 경로" },
  { re: /\bworkspace\//, what: "과정 기록 경로" },
  { re: /^[ \t]*basis:/, what: "사인오프 해시 필드" },   // 줄 맨 앞 — CSS flex-basis 오탐 방지
];

function listDirs(p) {
  if (!existsSync(p)) return [];
  return readdirSync(p).map((n) => join(p, n)).filter((f) => statSync(f).isDirectory());
}
function walk(p, out = []) {
  if (!existsSync(p)) return out;
  for (const n of readdirSync(p)) {
    const f = join(p, n);
    if (statSync(f).isDirectory()) walk(f, out);
    else out.push(f);
  }
  return out;
}

const results = [];
const ok = (id, name, pass, why = "") => results.push({ id, name, pass, why });

// projects/probe 하나만 둔 임시 킷. gates/ 를 복사해야 게이트가 자기 옆 파일을 찾는다.
function makeKit(files) {
  const dir = mkdtempSync(join(tmpdir(), "docs-boundary-"));
  cpSync(join(ROOT, "gates"), join(dir, "gates"), { recursive: true });
  const p = join(dir, "projects", "probe");
  mkdirSync(join(p, "docs", "specs"), { recursive: true });
  mkdirSync(join(p, "docs", "design", "mockups"), { recursive: true });
  mkdirSync(join(p, "src", "shared"), { recursive: true });
  mkdirSync(join(p, "workspace"), { recursive: true });
  writeFileSync(join(dir, "ACTIVE"), "probe\n");
  writeFileSync(join(p, "src", "shared", "noop.ts"), "export const noop = () => {};\n");
  for (const [rel, body] of Object.entries(files)) {
    const full = join(p, ...rel.split("/"));
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}

function runGates(dir) {
  const r = spawnSync(process.execPath, [join(dir, "gates", "run-gates.mjs"), "--quick"], {
    cwd: dir,
    encoding: "utf-8",
  });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function trial(files) {
  const dir = makeKit(files);
  const r = runGates(dir);
  rmSync(dir, { recursive: true, force: true });
  return {
    ...r,
    hitA: /docs-boundary\/FRONTMATTER_FIELD/.test(r.out),
    hitB: /docs-boundary\/HARNESS_REF/.test(r.out),
    died: r.code === null || /Cannot find module|is not a function|SyntaxError|TypeError/.test(r.out),
  };
}

const goodSpec = `---
feature: 멀쩡한 스펙
status: draft
surfaces: []
# 이 주석은 필드가 아니다. status: approved 라고 적어도 필드로 세면 안 된다.
#   들여쓴 이어지는 줄도 마찬가지다.
---

# 멀쩡한 스펙

- INV-A1: 아무것도 하지 않는다. (강제 위치: 서버)
`;

// ── S1 · A · B: 검사 a ────────────────────────────────────────────────────────
{
  const withExtra = goodSpec.replace("surfaces: []", "surfaces: []\nbasis: db3d371e675b");
  const t1 = trial({ "docs/specs/bad.md": withExtra });
  ok("S1", "하네스 확인  검사 a 가 실제로 스펙을 훑는다", t1.hitA,
    t1.hitA ? "" : "frontmatter 에 basis: 를 심었는데 안 잡혔다 — 검사가 안 돌았거나 없다");

  const t2 = trial({ "docs/specs/good.md": goodSpec });
  ok("A", "과차단 없음  세 필드만 있는 스펙은 통과", !t2.hitA && !t2.died,
    t2.died ? "게이트가 죽었다" : t2.hitA ? "멀쩡한 스펙이 막혔다" : "");
  ok("B", "주석 오인 X  frontmatter 주석을 필드로 세지 않는다", !t2.hitA,
    t2.hitA ? "주석 줄을 필드로 셌다" : "");
}

// ── S2 · C · D: 검사 b ────────────────────────────────────────────────────────
{
  const t1 = trial({
    "docs/specs/good.md": goodSpec,
    "docs/notes.md": "이 판정은 gates/run-gates.mjs 가 한다.\n",
  });
  ok("S2", "하네스 확인  검사 b 가 실제로 docs 를 훑는다", t1.hitB,
    t1.hitB ? "" : "docs 에 gates/run-gates.mjs 를 심었는데 안 잡혔다 — 검사가 안 돌았거나 없다");

  const t2 = trial({
    "docs/specs/good.md": goodSpec,
    "docs/design/mockups/x.html": "<style>.meta { flex-basis: 100%; }</style>\n",
  });
  ok("C", "오탐 없음  CSS flex-basis 는 basis 참조가 아니다", !t2.hitB && !t2.died,
    t2.died ? "게이트가 죽었다" : t2.hitB ? "flex-basis 를 basis 로 오인했다" : "");

  const t3 = trial({
    "docs/specs/good.md": goodSpec,
    "docs/DECISIONS.md":
      "- 승인된 스펙은 불변식마다 테스트가 요구되므로 통째로 올리지 않는다.\n" +
      "- 승인 전에는 pages·widgets 구현이 막힌다.\n",
  });
  ok("D", "오탐 없음  구현 이름 없는 서술은 잡지 않는다", !t3.hitB,
    t3.hitB ? "결정의 근거로 쓰인 서술이 막혔다" : "");
}

// ── E: 이 레포의 현재 docs ────────────────────────────────────────────────────
//    게이트에 검사가 아직 없으면 게이트 출력만 보는 E 는 무조건 통과해 버린다(헛돈다).
//    그래서 같은 판정을 여기서 직접 돌린다 — 패치를 붙이기 **전에** 무엇이 걸릴지 볼 수 있다.
{
  const found = [];
  for (const projDir of listDirs(join(ROOT, "projects"))) {
    const docs = join(projDir, "docs");
    if (!existsSync(docs)) continue;
    for (const f of walk(docs)) {
      if (!/\.(md|html|css|txt|json|ya?ml)$/i.test(f)) continue;
      const rel = relative(ROOT, f).split("\\").join("/");
      const src = readFileSync(f, "utf-8");
      src.split("\n").forEach((line, i) => {
        for (const { re, what } of HARNESS_REFS)
          if (re.test(line)) found.push(`[HARNESS_REF] ${rel}:${i + 1} — ${what}`);
      });
      if (/[\\/]docs[\\/]specs[\\/][^\\/]+\.md$/.test(rel.split("/").join("/"))) {
        const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (fm)
          for (const line of fm[1].split("\n")) {
            const m = line.match(/^([A-Za-z_][\w-]*):/);
            if (m && !SPEC_FM_FIELDS.includes(m[1]))
              found.push(`[FRONTMATTER_FIELD] ${rel} — 허용되지 않은 필드 '${m[1]}'`);
          }
      }
    }
  }
  ok("E", `현행 통과  이 레포의 docs 가 두 판정을 통과한다`, found.length === 0,
    found.length ? `${found.length}건:\n     ${found.join("\n     ")}` : "");
}

let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.id} ${r.name}${r.why ? `  — ${r.why}` : ""}`);
  if (!r.pass) failed++;
}
console.log(`\ncheck-docs-boundary: ${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 2 : 0);
