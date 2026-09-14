#!/usr/bin/env node
// @check-role: on-change
// @check-guards: gates/lib/read-spec.mjs, gates/lib/frontmatter.mjs
//
// check-read-spec.mjs — 스펙 frontmatter 를 읽는 자리를 gates/lib/ 하나로 모으는 패치가
// 붙었는지, 붙은 뒤에도 판정이 그대로인지를 검사한다.
//
// 왜 필요한가 — frontmatter 블록을 떼고 필드를 읽는 코드가 지금 네 곳에 복붙돼 있다.
//   gates/spec-coverage.mjs   status
//   gates/run-gates.mjs       specSurfaces() · designApproved()
//   gates/graph-stop.mjs      frontmatterOK() · fmList()
// 복붙이라 한 곳을 고쳐도 나머지가 안 따라온다. 2026-08-31 사고가 그것이다 —
// status 는 test() 라 한 줄이라도 approved 면 승인으로 읽고 surfaces 는 match() 라
// 첫 줄만 읽는데, 그 차이를 아무도 한자리에서 볼 수 없었다.
//
// 이 패치는 보호 파일(gates/)을 사용자가 직접 붙인다. 붙었는지를 코드를 안 읽고도
// 판정할 수 있게, 아래를 **실제로 게이트를 돌려서** 본다.
//
//   A lib 존재     gates/lib/frontmatter.mjs · read-spec.mjs 가 import 된다   ← 붙기 전 실패
//   B 소비자 교체  spec-coverage 가 자체 status 정규식을 안 쓴다              ← 붙기 전 실패
//   C 소비자 교체  run-gates 의 위험 표면 커버 판정이 readSpec 경유다         ← 붙기 전 실패
//   S 하네스 확인  스펙이 없으면 authz 표면이 실제로 막힌다                   ← 붙기 전후 통과
//   D 미등재 표면  surfaces 에 오타가 나면 커버로 인정하지 않는다(막힌다)     ← 붙기 전후 통과
//   E 미등재 상태  status 에 모르는 값이 오면 draft 로 취급한다               ← 붙기 전후 통과
//   F 과차단 없음  멀쩡한 스펙은 통과하고 게이트가 죽지 않는다                ← 붙기 전후 통과
//   G 판정 동등    현행 스펙 전부에서 구 파서와 신 파서의 결과가 같다         ← 붙기 전후 통과
//
// **D·E 는 붙기 전에도 통과한다.** 현행 정규식이 이미 안전한 쪽으로 떨어지기 때문이다 —
// `surfaces: [authorz]` 는 authz 와 다른 문자열이라 커버로 안 쳐지고, `status: signed-off` 은
// `^\s*status:\s*approved\b` 에 안 걸려 승인으로 안 읽힌다. 그러니 이 둘은 패치가 새로
// 만드는 성질이 아니라 **패치가 깨뜨리면 안 되는 성질**이다. 어휘 검사를 넣으면서
// "모르는 값은 일단 통과" 로 짜면 여기서 잡힌다.
//
// 오독은 항상 **더 엄격한 쪽**으로 떨어져야 한다 — 미등재 표면을 인정하면 방벽이 조용히
// 열리고, 미등재 status 를 approved 로 읽으면 승인 안 된 스펙이 구현을 허가한다.
// F 가 있는 이유: 오타 하나로 게이트 전체가 죽으면 사람이 그 스펙을 지워서 우회한다.
//
// S 가 있는 이유: 처음에 표면 패턴을 `.sql` 파일에 심었더니 게이트가 그 파일을 스캔하지 않아
// "0개 파일"로 통과했고, 그걸 D 가 '방벽이 열렸다'로 읽었다. 검사 하네스가 아무것도 안 하고
// 있는 상태와 게이트가 실패하는 상태는 겉으로 같아 보인다 — S 가 그 둘을 가른다.
//
// 사용:
//   node scripts/check-read-spec.mjs          # A~G 검사
//   node scripts/check-read-spec.mjs --diff   # 구 파서 vs 신 파서 판정 대조표만 출력
//
// 전부 임시 디렉터리에서 돈다 — 이 레포의 파일은 하나도 건드리지 않는다.

import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, cpSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECTS = join(ROOT, "projects");

// ── 어휘: 이 목록이 docs-contract.md 에 등재된 값 전부다 ───────────────────────
const STATUS_VOCAB = ["draft", "approved", "parked"];
const SURFACE_VOCAB = ["auth", "payment", "authz", "concurrency"];

// ── 구 파서: 지금 게이트에 박혀 있는 정규식을 그대로 옮겨 온 것 ───────────────
//    spec-coverage.mjs:34-35 와 run-gates.mjs 의 specSurfaces() 를 복제한다.
//    고치지 마라 — 이 함수의 목적은 '현행 동작을 그대로 재현하는 것'이다.
function oldParser(src) {
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return { status: null, surfaces: [] };
  const fmText = fm[1];
  const status = /^\s*status:\s*approved\b/m.test(fmText)
    ? "approved"
    : /^\s*status:\s*parked\b/m.test(fmText)
      ? "parked"
      : "draft";
  const m = fmText.match(/^[ \t]*surfaces:[ \t]*(.*)$/m);
  let surfaces = [];
  if (m) {
    const clean = (s) =>
      s.split(",").map((x) => x.trim().replace(/['"]/g, "")).filter((x) => /^[a-z-]+$/.test(x));
    const inline = m[1].trim();
    const br = inline.match(/^\[([^\]]*)\]/);
    if (br) surfaces = clean(br[1]);
    else if (inline && !inline.startsWith("#")) surfaces = clean(inline.split("#")[0]);
    else {
      const rest = fmText.slice(fmText.indexOf(m[0]) + m[0].length).split("\n").slice(1);
      for (const line of rest) {
        const li = line.match(/^[ \t]*-[ \t]*([A-Za-z-]+)/);
        if (!li) break;
        surfaces.push(li[1]);
      }
    }
  }
  return { status, surfaces };
}

// ── 신 파서: gates/lib/read-spec.mjs 가 붙었으면 그걸 쓰고, 없으면 같은 로직의 사본을 쓴다.
//    사본이 있는 이유는 하나다 — 패치가 붙기 **전에도** G(판정 동등)를 돌려서,
//    전환했을 때 무엇이 달라지는지 미리 볼 수 있어야 한다.
function newParserFallback(src) {
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return { status: "draft", surfaces: [], problems: ["frontmatter 없음"] };
  const fmText = fm[1];
  const problems = [];
  const field = (key) => {
    const m = fmText.match(new RegExp(`^[ \\t]*${key}:[ \\t]*(.*)$`, "m"));
    return m ? m[1] : null;
  };
  // status — 미등재 값은 draft 로 떨어뜨린다(더 엄격한 쪽).
  const rawStatus = (field("status") ?? "").split("#")[0].trim();
  let status = "draft";
  if (rawStatus === "") problems.push("status 필드가 없다 → draft 로 본다");
  else if (STATUS_VOCAB.includes(rawStatus)) status = rawStatus;
  else problems.push(`status 값 '${rawStatus}' 은 등재된 어휘가 아니다 → draft 로 본다`);
  // surfaces — 미등재 값은 버린다(커버로 인정하지 않는다).
  const raw = field("surfaces");
  let tokens = [];
  if (raw !== null) {
    const inline = raw.trim();
    const br = inline.match(/^\[([^\]]*)\]/);
    if (br) tokens = br[1].split(",");
    else if (inline && !inline.startsWith("#")) tokens = inline.split("#")[0].split(",");
    else {
      const at = fmText.indexOf(`surfaces:`);
      const rest = fmText.slice(at).split("\n").slice(1);
      for (const line of rest) {
        const li = line.match(/^[ \t]*-[ \t]*([A-Za-z-]+)/);
        if (!li) break;
        tokens.push(li[1]);
      }
    }
  }
  const surfaces = [];
  for (const t of tokens.map((x) => x.trim().replace(/['"]/g, "")).filter(Boolean)) {
    if (SURFACE_VOCAB.includes(t)) surfaces.push(t);
    else problems.push(`surfaces 값 '${t}' 은 등재된 어휘가 아니다 → 커버로 인정하지 않는다`);
  }
  return { status, surfaces, problems };
}

let newParser = newParserFallback;
let libApplied = false;
try {
  const mod = await import(new URL("../gates/lib/read-spec.mjs", import.meta.url));
  if (typeof mod.readSpecText === "function") {
    newParser = (src) => mod.readSpecText(src);
    libApplied = true;
  }
} catch {
  /* 아직 안 붙었다 — fallback 으로 간다 */
}

// ── 대상 스펙 모으기 ──────────────────────────────────────────────────────────
function allSpecs() {
  const out = [];
  if (!existsSync(PROJECTS)) return out;
  for (const p of readdirSync(PROJECTS)) {
    const dir = join(PROJECTS, p, "docs", "specs");
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".md")) continue;
      out.push({ project: p, slug: f.replace(/\.md$/, ""), path: join(dir, f) });
    }
  }
  return out;
}

// ── --diff: 구 파서 vs 신 파서 대조표 ─────────────────────────────────────────
function runDiff() {
  const rows = [];
  for (const s of allSpecs()) {
    const src = readFileSync(s.path, "utf-8");
    const o = oldParser(src);
    const n = newParser(src);
    const same =
      o.status === n.status && JSON.stringify(o.surfaces) === JSON.stringify(n.surfaces);
    rows.push({ ...s, o, n, same });
  }
  const w = Math.max(...rows.map((r) => `${r.project}/${r.slug}`.length), 10);
  console.log(`파서 대조 (신 파서 출처: ${libApplied ? "gates/lib/read-spec.mjs" : "이 스크립트의 사본"})\n`);
  console.log(`${"스펙".padEnd(w)}  구 status / 신 status   구 surfaces / 신 surfaces`);
  console.log("-".repeat(w + 52));
  for (const r of rows) {
    const name = `${r.project}/${r.slug}`.padEnd(w);
    const st = `${r.o.status} / ${r.n.status}`.padEnd(22);
    const sf = `[${r.o.surfaces.join(",")}] / [${r.n.surfaces.join(",")}]`;
    console.log(`${r.same ? " " : "≠"} ${name}  ${st}  ${sf}`);
    for (const p of r.n.problems ?? []) console.log(`${" ".repeat(w + 4)}⚠ ${p}`);
  }
  const diffs = rows.filter((r) => !r.same);
  console.log(`\n대상 ${rows.length}건 · 차이 ${diffs.length}건`);
  if (diffs.length) {
    console.log("\n차이가 나는 것은 전부 구 파서의 숨은 오독이다. 전환 전에 사람이 판정할 것:");
    for (const r of diffs) console.log(`  - ${r.project}/${r.slug}`);
  }
  return diffs.length;
}

// ── 검사 A~G ─────────────────────────────────────────────────────────────────
const results = [];
const ok = (id, name, pass, why) => results.push({ id, name, pass, why });

// --quick: tsc·test·spec-coverage 를 빼고 판정만 본다. 위험 표면 판정은 편집 즉시
// 걸려야 하는 것이라 --quick 안에 있다. (check-frontmatter-guards 와 같은 방식)
function gateRun(dir) {
  const r = spawnSync(process.execPath, [join(dir, "gates", "run-gates.mjs"), "--quick"], {
    cwd: dir,
    encoding: "utf-8",
  });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

// 임시 킷: gates/ 를 통째로 복사하고 projects/probe 하나만 둔다.
// gates/ 를 복사해야 게이트가 자기 옆의 파일(spec-coverage 등)을 찾는다.
function makeProbe(specs) {
  const dir = mkdtempSync(join(tmpdir(), "read-spec-probe-"));
  cpSync(join(ROOT, "gates"), join(dir, "gates"), { recursive: true });
  const proj = join(dir, "projects", "probe");
  mkdirSync(join(proj, "docs", "specs"), { recursive: true });
  mkdirSync(join(proj, "docs", "design"), { recursive: true });
  mkdirSync(join(proj, "src", "shared", "lib"), { recursive: true });
  mkdirSync(join(proj, "workspace"), { recursive: true });
  writeFileSync(join(dir, "ACTIVE"), "probe\n");
  for (const [name, body] of Object.entries(specs))
    writeFileSync(join(proj, "docs", "specs", `${name}.md`), body);
  return { dir, proj };
}

function sourceOf(f) {
  const p = join(ROOT, "gates", f);
  return existsSync(p) ? readFileSync(p, "utf-8") : "";
}

// A — lib 존재
{
  const has =
    existsSync(join(ROOT, "gates", "lib", "frontmatter.mjs")) &&
    existsSync(join(ROOT, "gates", "lib", "read-spec.mjs"));
  ok("A", "lib 존재  gates/lib/frontmatter.mjs · read-spec.mjs", has, has ? "" : "아직 없다");
}
// B — spec-coverage 가 자체 status 정규식을 안 쓴다
{
  const src = sourceOf("spec-coverage.mjs");
  const pass = /from\s+["'].*lib\/read-spec\.mjs["']/.test(src) && !/status:\\s\*approved/.test(src);
  ok("B", "소비자 교체  spec-coverage 가 readSpec 경유", pass, pass ? "" : "자체 정규식이 남아 있다");
}
// C — run-gates 의 커버 판정이 readSpec 경유
{
  const src = sourceOf("run-gates.mjs");
  const pass = /from\s+["'].*lib\/read-spec\.mjs["']/.test(src) && !/function specSurfaces/.test(src);
  ok("C", "소비자 교체  run-gates 커버 판정이 readSpec 경유", pass, pass ? "" : "specSurfaces() 가 남아 있다");
}
// D·E·F — 실제 게이트를 돌려 실패 방향을 본다
{
  const typo = `---
feature: 오타 표면
status: approved
surfaces: [authorz]
---
# 오타 표면
- INV-X1: 아무거나.
`;
  const badStatus = `---
feature: 모르는 상태
status: signed-off
surfaces: [authz]
---
# 모르는 상태
- INV-Y1: 아무거나.
`;
  const goodCover = `---
feature: 멀쩡한 스펙
status: approved
surfaces: [authz]
---
# 멀쩡한 스펙
- INV-Z1: 아무거나.
`;
  // 스펙 하나씩 따로 넣어 돌린다 — 셋을 한 프로젝트에 넣으면 어느 스펙이 커버를
  // 인정받았는지 구분되지 않는다. authz 표면 패턴은 세 경우 모두 같은 코드로 심는다.
  const trial = (specs) => {
    const { dir, proj } = makeProbe(specs);
    // .ts 여야 한다 — 게이트의 스캔 대상에 .sql 은 프로젝트 src 아래에서 안 들어온다.
    // (.sql 로 심었더니 "0개 파일"로 통과했고, 표면이 감지조차 안 된 것을 '방벽이 열렸다'로
    //  읽을 뻔했다. 감지 자체를 확인하는 것이 아래 S 검사다)
    writeFileSync(
      join(proj, "src", "shared", "lib", "policy.ts"),
      'export const isAdmin = (u: { user_role: string }) => u.user_role === "admin";\n',
    );
    const r = gateRun(dir);
    rmSync(dir, { recursive: true, force: true });
    return { blocked: /risk-surface\/AUTHZ/.test(r.out), ...r };
  };
  const tTypo = trial({ typo });
  const tBad = trial({ "bad-status": badStatus });
  const tGood = trial({ good: goodCover });
  const tNone = trial({});   // 스펙 0개 — 이건 반드시 막혀야 한다(검사 하네스 자체 확인)

  ok("S", "하네스 확인  스펙이 없으면 authz 표면이 실제로 막힌다", tNone.blocked,
    tNone.blocked ? "" : "표면이 감지조차 안 됐다 — 아래 D·E 판정은 믿을 수 없다");

  ok("D", "미등재 표면  surfaces 오타는 커버로 인정 안 함", tTypo.blocked,
    tTypo.blocked ? "" : "'authorz' 가 authz 커버로 인정돼 방벽이 열렸다");
  ok("E", "미등재 상태  모르는 status 는 draft 취급", tBad.blocked,
    tBad.blocked ? "" : "'signed-off' 이 승인으로 읽혀 방벽이 열렸다");
  const died = [tTypo, tBad, tGood].some(
    (t) => t.code === null || /Cannot find module|is not a function|SyntaxError|TypeError/.test(t.out),
  );
  const overblocked = tGood.blocked;
  ok("F", "과차단 없음  멀쩡한 스펙은 통과하고 게이트가 죽지 않는다", !died && !overblocked,
    died ? "게이트가 예외로 죽었다" : overblocked ? "approved + surfaces:[authz] 인데도 막혔다" : "");
}
// G — 판정 동등
{
  let diffs = 0;
  for (const s of allSpecs()) {
    const src = readFileSync(s.path, "utf-8");
    const o = oldParser(src);
    const n = newParser(src);
    if (o.status !== n.status || JSON.stringify(o.surfaces) !== JSON.stringify(n.surfaces)) diffs++;
  }
  ok("G", "판정 동등  현행 스펙에서 구·신 파서 결과가 같다", diffs === 0, diffs ? `${diffs}건 다르다 (--diff 로 확인)` : "");
}

if (process.argv.includes("--diff")) {
  process.exit(runDiff() > 0 ? 1 : 0);
}

let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.id} ${r.name}${r.why ? `  — ${r.why}` : ""}`);
  if (!r.pass) failed++;
}
console.log(`\ncheck-read-spec: ${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 2 : 0);
