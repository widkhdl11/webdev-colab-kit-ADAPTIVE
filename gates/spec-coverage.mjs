#!/usr/bin/env node
// 추적성 게이트: approved 스펙의 모든 불변식(INV-*)은 최소 1개 테스트가 참조해야 한다
// 스펙은 모든 projects/*/docs/specs 에서 읽고, 테스트는 projects/*/src 와 projects/*/tests 에서 찾는다.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const PROJECTS = join(ROOT, "projects");
// 모든 프로젝트의 docs/specs 를 스캔한다 (활성만이 아니라 전부 — 게이트는 저장소 전체의 약속을 지킨다).
const specDirs = existsSync(PROJECTS)
  ? readdirSync(PROJECTS)
      .map((n) => join(PROJECTS, n, "docs", "specs"))
      .filter((d) => { try { return statSync(d).isDirectory(); } catch { return false; } })
  : [];
if (specDirs.length === 0) process.exit(0);

function walk(dir) {
  let out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else out.push(p);
  }
  return out;
}

const invToSpec = new Map();
for (const f of specDirs.flatMap(walk).filter((f) => f.endsWith(".md"))) {
  const src = readFileSync(f, "utf-8");
  // status 는 frontmatter 의 구조화된 필드다 — 줄 시작 앵커로 값만 본다.
  // (주석 뒤에 등장하는 'approved' 글자를 값으로 오인하지 않게. retro 2026-08-02)
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm || !/^\s*status:\s*approved\b/m.test(fm[1])) continue;
  for (const m of src.matchAll(/\bINV-[A-Z0-9]+\b/g)) invToSpec.set(m[0], relative(ROOT, f));
}
if (invToSpec.size === 0) process.exit(0);

// 테스트 탐색 루트: projects/<이름>/src 와 projects/<이름>/tests
const testRoots = [];
const projectsDir = join(ROOT, "projects");
if (existsSync(projectsDir)) {
  for (const n of readdirSync(projectsDir)) {
    const p = join(projectsDir, n);
    try {
      if (statSync(p).isDirectory()) testRoots.push(join(p, "src"), join(p, "tests"));
    } catch { /* skip */ }
  }
}
const testFiles = testRoots
  .flatMap((d) => walk(d))
  .filter((f) => /\.(test|spec)\.(ts|tsx|js)$/.test(f));
// 주석 속 INV 문자열은 테스트가 아니다 — 몇 달 전 다른 목적으로 쓴 주석이 새 스펙의 불변식을
// 조용히 면제한 적이 있다(2026-08-09 INV-C5). 걷어내고 센다. (retro 2026-08-10)
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const testText = testFiles.map((f) => stripComments(readFileSync(f, "utf-8"))).join("\n");

const missing = [...invToSpec.entries()].filter(([inv]) => !testText.includes(inv));
if (missing.length > 0) {
  for (const [inv, spec] of missing)
    console.error(`[spec-coverage/MISSING_TEST] ${spec} — ${inv}를 검증하는 테스트가 없다. 구현 전에 테스트부터 (rules/tdd.md)`);
  process.exit(2);
}
process.exit(0);
