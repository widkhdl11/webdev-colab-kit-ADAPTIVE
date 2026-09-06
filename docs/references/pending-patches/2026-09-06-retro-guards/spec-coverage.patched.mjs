#!/usr/bin/env node
// 추적성 게이트: approved 스펙의 모든 불변식(INV-*)은 최소 1개 테스트가 참조해야 한다
// 스펙은 모든 projects/*/docs/specs 에서 읽고, 테스트는 projects/*/src 와 projects/*/tests 에서 찾는다.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { readSpec } from "./lib/read-spec.mjs";

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

// INV id 는 스펙 파일 안에서만 고유하다. 프로젝트가 둘 이상이면 다른 프로젝트가 같은 id
// (INV-A1 등)를 쓰는 것이 정상이라, 테스트를 전부 한 덩어리로 합쳐 이름만 찾으면 **남의
// 프로젝트 테스트가 내 불변식을 덮는다.** 2026-09-04 에 실제로 그랬다 — 새 프로젝트의 승인된
// 스펙 불변식 넷이 테스트 0개인 채로 다른 프로젝트의 동명 테스트에 덮여 통과했다.
// 그래서 키에 프로젝트를 붙이고, 테스트 본문도 프로젝트별로 나눠 본다.
const projectOf = (p) => {
  const m = relative(ROOT, p).split("\\").join("/").match(/^projects\/([^/]+)\//);
  return m ? m[1] : "";
};
const KEY = (proj, inv) => `${proj}\u0000${inv}`;
const invToSpec = new Map();
// 시나리오 ID 유일성 검사가 쓴다 — 승인된 스펙 파일만 모은다.
const approvedSpecs = [];

for (const f of specDirs.flatMap(walk).filter((f) => f.endsWith(".md"))) {
  const src = readFileSync(f, "utf-8");
  // status 는 frontmatter 의 구조화된 필드다 — 줄 시작 앵커로 값만 본다.
  // status·surfaces 는 lib/read-spec.mjs 한 자리에서 읽는다. 어휘를 벗어난 값은
  // 더 엄격한 쪽(draft)으로 떨어지고, throw 하지 않고 경고만 남긴다.
  const spec = readSpec(f);
  for (const p of spec.problems) console.error(`⚠ [spec/VOCAB] ${relative(ROOT, f)} — ${p}`);
  if (spec.status !== "approved") continue;
  approvedSpecs.push(f);
  for (const m of src.matchAll(/^[ \t]*-[ \t]+(INV-[A-Z0-9]+)[ \t]*:/gm)) invToSpec.set(KEY(projectOf(f), m[1]), relative(ROOT, f)); 
}
// ── 시나리오 ID 유일성 (docs/references/docs-contract.md 2절, 2026-09-06 등재) ──
//
// 시나리오 번호는 테스트 이름에 담기는 규약이고(`INV-Z13 ④-1 (S16): …`), 사람이 「그
// 시나리오에 검사가 있나」를 확인할 때 쓰는 **유일한 손잡이**다. 번호가 겹치면 그 확인이
// 두 계약을 뭉갠다 — 한쪽 검사를 지워도 「S14 검사가 있다」는 결과가 그대로 나온다.
// 2026-09-06 에 write-authorization.md 에서 S14 가 INV-Z13 과 INV-Z12 를 동시에 가리켰고,
// 리뷰어 둘이 독립적으로 지적할 때까지 기계는 끝까지 몰랐다.
//
// **커버리지는 요구하지 않는다.** 시나리오는 불변식 하나를 여러 각도에서 쪼갠 것이라 개수가
// 판단이다. 「시나리오마다 테스트」를 강제하면 반대 절반을 한 검사에 묶는 것이 위반이 된다.
//
// approved 만 본다. 초안에서 번호가 겹치는 것은 쓰는 중이고, 승인되는 순간 — 그 번호가
// 계약의 손잡이가 되는 순간 — 여기서 걸린다.
//
// 모양: 줄 맨 앞의 `- S<숫자>…` 뒤에 `(` 또는 `:` 가 온다. 본문에서 `S14 는` 처럼 인용하는
// 것은 정의가 아니라 참조다(불변식 앵커와 같은 규칙).
const SCENARIO_ID = /^[ \t]*-[ \t]+(S\d+[A-Za-z0-9-]*)[ \t]*[(:]/gm;
const dupScenarios = [];
for (const sf of approvedSpecs) {
  const seen = new Map();
  for (const m of readFileSync(sf, "utf-8").matchAll(SCENARIO_ID))
    seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  for (const [id, n] of seen) if (n > 1) dupScenarios.push([relative(ROOT, sf), id, n]);
}
if (dupScenarios.length > 0) {
  for (const [spec, id, n] of dupScenarios)
    console.error(
      `[spec-coverage/DUP_SCENARIO] ${spec} — 시나리오 ${id} 가 ${n} 번 나온다. 한 파일 안에서 유일해야 한다` +
        " (docs/references/docs-contract.md 2절). 나중에 붙인 쪽을 뒤 번호로 민다",
    );
  process.exit(2);
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
const textByProject = new Map();
for (const f of testFiles) {
  const k = projectOf(f);
  textByProject.set(k, (textByProject.get(k) ?? "") + "\n" + stripComments(readFileSync(f, "utf-8")));
}

const missing = [...invToSpec.entries()].filter(([key]) => {
  const [proj, inv] = key.split("\u0000");
  return !(textByProject.get(proj) ?? "").includes(inv);
});
if (missing.length > 0) {
  for (const [key, spec] of missing)
    console.error(`[spec-coverage/MISSING_TEST] ${spec} — ${key.split("\u0000")[1]}를 검증하는 테스트가 없다. 구현 전에 테스트부터 (rules/tdd.md)`);
  process.exit(2);
}
process.exit(0);
