#!/usr/bin/env node
// check-parked-status.mjs — 보류 스펙 상태(status: parked)가 제대로 붙었는지 검사한다.
//
// 왜 필요한가: 이 패치는 보호 파일 둘(graph.mjs · gates/graph-stop.mjs)을 사용자가 직접 붙인다.
// 둘 중 하나만 붙어도 겉으로는 아무 일이 없다(둘 다 "지금과 같음"으로 조용히 실패한다).
// 그래서 코드를 안 읽어도 어느 쪽이 빠졌는지 알 수 있어야 한다.
//
// 검사 넷:
//   A 선언   graph.mjs 의 spec 노드에 skip_when 이 있고, 그 값이 require 값의 접두사가 아니다
//   B 통과   status: parked 스펙이 docs/specs/ 에 있어도 spec 노드가 clean 이 된다
//   C 방벽   그 parked 스펙이 적은 surfaces 는 risk-surface 커버로 인정되지 않는다
//   D 범위   status: draft 스펙은 여전히 spec 노드를 막는다 (건너뛰기가 넓어지지 않았나)
//
// B·C·D 는 임시 디렉터리에 킷을 복사해 돌린다 — 이 레포의 파일은 하나도 건드리지 않는다.
//
// 사용: node scripts/check-parked-status.mjs
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const results = [];
const ok = (name, detail = "") => results.push({ pass: true, name, detail });
const no = (name, detail) => results.push({ pass: false, name, detail });

// ── A. 선언 (graph.mjs) ──────────────────────────────────────────
let GRAPH = null;
try {
  ({ GRAPH } = await import(`file://${join(ROOT, "graph.mjs")}`));
} catch (e) {
  no("A 선언", `graph.mjs 를 읽지 못했다: ${e.message}`);
}
if (GRAPH) {
  const fm = GRAPH.spec?.clean_when?.frontmatter;
  if (!fm) {
    no("A 선언", "graph.mjs 의 spec.clean_when.frontmatter 가 없다 — 그래프 구조가 예상과 다르다");
  } else if (!fm.skip_when) {
    no(
      "A 선언",
      "graph.mjs 의 spec.clean_when.frontmatter 에 skip_when 이 없다 — " +
        "패치 ①(graph.mjs)이 아직 안 붙었다",
    );
  } else {
    // 이름 함정: `\b` 는 하이픈을 단어 경계로 본다. skip 값이 require 값으로 시작하면
    // `status: approved-deferred` 가 `status: approved\b` 검사를 통과해 방벽이 통째로 열린다(실측).
    const val = (s) => String(s).split(":").slice(1).join(":").trim();
    const req = val(fm.require);
    const skip = val(fm.skip_when);
    if (skip.startsWith(req)) {
      no(
        "A 선언",
        `skip_when 값 '${skip}' 이 require 값 '${req}' 로 시작한다 — ` +
          `정규식의 \\b 가 하이픈을 단어 경계로 봐서 이 값이 승인으로 인정된다. 다른 이름을 써라`,
      );
    } else {
      ok("A 선언", `skip_when: "${fm.skip_when}" (require: "${fm.require}" 의 접두사가 아니다)`);
    }
  }
}

// ── 격리 실행 준비: 임시 디렉터리에 킷을 복사한다 ─────────────────
function makeKit() {
  const dir = mkdtempSync(join(tmpdir(), "parked-probe-"));
  cpSync(join(ROOT, "gates"), join(dir, "gates"), { recursive: true });
  cpSync(join(ROOT, "graph.mjs"), join(dir, "graph.mjs"));
  writeFileSync(join(dir, "ACTIVE"), "probe\n");
  const p = join(dir, "projects", "probe");
  mkdirSync(join(p, "docs", "specs"), { recursive: true });
  mkdirSync(join(p, "workspace"), { recursive: true });
  mkdirSync(join(p, "src"), { recursive: true });
  writeFileSync(join(p, "docs", "PRODUCT.md"), "# probe\n검사용 임시 프로젝트다.\n");
  return { dir, p };
}
function spec(status, extra = "") {
  return `---\nfeature: probe\nstatus: ${status}\n${extra}---\n# probe spec\n`;
}
function runGraphStop(dir) {
  const r = spawnSync("node", [join(dir, "gates", "graph-stop.mjs")], { cwd: dir, encoding: "utf-8" });
  let state = {};
  try {
    const m = readFileSync(join(dir, "projects", "probe", "workspace", "HANDOFF.md"), "utf-8").match(/```json\s*([\s\S]*?)```/);
    if (m) state = JSON.parse(m[1]);
  } catch { /* 없으면 빈 상태 */ }
  return { out: (r.stdout ?? "") + (r.stderr ?? ""), state };
}
function runGates(dir) {
  const r = spawnSync("node", [join(dir, "gates", "run-gates.mjs")], { cwd: dir, encoding: "utf-8" });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

// ── B. parked 스펙이 spec 노드를 막지 않는다 ─────────────────────
{
  const { dir, p } = makeKit();
  try {
    writeFileSync(join(p, "docs", "specs", "active.md"), spec("approved", "surfaces: []\n"));
    writeFileSync(join(p, "docs", "specs", "later.md"), spec("parked", "surfaces: []\n"));
    const { state } = runGraphStop(dir);
    const st = state.spec?.status;
    if (st === "clean") ok("B 통과", "approved 하나 + parked 하나 → spec clean");
    else
      no(
        "B 통과",
        `parked 스펙이 있는데 spec 노드가 '${st ?? "판정 못 함"}' 이다 — ` +
          `패치 ②(gates/graph-stop.mjs 의 frontmatterOK)가 아직 안 붙었거나 skip 처리가 안 돈다`,
      );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── C. parked 는 위험 표면 커버가 아니다 (핵심 방벽) ──────────────
{
  const { dir, p } = makeKit();
  try {
    // parked 스펙이 auth 를 덮는다고 주장한다. 인정되면 안 된다.
    writeFileSync(join(p, "docs", "specs", "later.md"), spec("parked", "surfaces: [auth]\n"));
    writeFileSync(
      join(p, "src", "route.ts"),
      'export function h(req: Request) {\n  const t = req.headers.get("authorization");\n  return t === `Bearer x`;\n}\n',
    );
    const { status, out } = runGates(dir);
    const blocked = status === 2 && /\[risk-surface\/AUTH\]/.test(out);
    if (blocked) ok("C 방벽", "parked 스펙은 auth 커버로 인정되지 않아 편집이 차단된다");
    else
      no(
        "C 방벽",
        `parked 스펙이 auth 표면을 덮어 버렸다 (종료 ${status}) — ` +
          `보류 스펙으로 위험 표면을 통과시킬 수 있다. 이름이나 검사식을 다시 봐야 한다`,
      );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── D. draft 는 여전히 막는다 (건너뛰기가 넓어지지 않았나) ─────────
{
  const { dir, p } = makeKit();
  try {
    writeFileSync(join(p, "docs", "specs", "wip.md"), spec("draft", "surfaces: []\n"));
    const { state } = runGraphStop(dir);
    const st = state.spec?.status;
    if (st !== "clean") ok("D 범위", `draft 스펙은 여전히 spec 을 막는다 (${st})`);
    else no("D 범위", "draft 스펙인데 spec 이 clean 이 됐다 — 건너뛰기가 draft 까지 먹었다");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── 보고 ─────────────────────────────────────────────────────────
let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.name}  ${r.detail}`);
  if (!r.pass) failed++;
}
console.log(`\ncheck-parked-status: ${results.length - failed}/${results.length} 통과`);
if (failed > 0) {
  console.error("\n실패가 남았다. 위 메시지가 어느 패치가 빠졌는지 말해 준다.");
  process.exit(1);
}
