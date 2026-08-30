#!/usr/bin/env node
// check-mark-child.mjs — `--mark` 가 집계 노드(design)의 자식을 직접 찍을 수 있는지 검사한다.
//
// 왜 필요한가: 지금은 `--mark design` 밖에 못 쓴다. 그러면 markRework 가 자식 전부에 같은 사유를
// 복사하므로(gates/propagate.mjs 의 markRework), 시안 하나가 거부됐을 뿐인데 손대지 않은
// schema-designer 에까지 "시안 대비 미달" 이 붙고 그쪽도 재승인을 받아야 풀린다.
//
// 검사 넷:
//   A 수용   `--mark design/page-designer` 가 받아들여진다 (지금은 '알 수 없는 노드'로 거부)
//   B 형제   찍은 자식만 rework, 형제는 clean 그대로. 부모는 집계로 rework + 사유 승계
//   C 부모   `--mark design` 은 여전히 자식 둘을 함께 rework 로 만든다 (동작이 좁아지지 않았나)
//   D 하류   자식만 찍어도 하류(implement·qa·review·deploy)는 전부 dirty (전파는 그대로)
//
// 검사는 임시 디렉터리에 킷을 복사해 돌린다 — 이 레포의 파일은 하나도 건드리지 않는다.
// 게이트를 돌리지 않는다: --mark 는 게이트 실행 전에 상태만 고치고 끝난다.
//
// 사용: node scripts/check-mark-child.mjs
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const results = [];
const ok = (name, detail = "") => results.push({ pass: true, name, detail });
const no = (name, detail) => results.push({ pass: false, name, detail });

const { GRAPH } = await import(`file://${join(ROOT, "graph.mjs")}`);
const { descendants } = await import(`file://${join(ROOT, "gates", "propagate.mjs")}`);

// 병렬 자식이 있는 노드를 그래프에서 찾는다 — 이름을 베껴 두면 그래프가 바뀔 때 검사가 조용히 빗나간다.
const parent = Object.keys(GRAPH).find((n) => GRAPH[n].parallel);
const kids = parent ? Object.keys(GRAPH[parent].parallel).map((c) => `${parent}/${c}`) : [];
if (kids.length < 2) {
  console.error(`이 검사는 병렬 자식이 둘 이상인 노드를 전제로 한다 — 그래프에 없다(${parent ?? "집계 노드 없음"}).`);
  process.exit(1);
}
const [target, sibling] = kids;
const REASON = "시안 색 대비 미달";

// ── 임시 킷 ──────────────────────────────────────────────────────
function makeKit(state) {
  const dir = mkdtempSync(join(tmpdir(), "mark-child-"));
  cpSync(join(ROOT, "gates"), join(dir, "gates"), { recursive: true });
  cpSync(join(ROOT, "graph.mjs"), join(dir, "graph.mjs"));
  writeFileSync(join(dir, "ACTIVE"), "probe\n");
  const p = join(dir, "projects", "probe");
  mkdirSync(join(p, "workspace"), { recursive: true });
  mkdirSync(join(p, "docs"), { recursive: true });
  writeFileSync(join(p, "docs", "PRODUCT.md"), "# probe\n검사용 임시 프로젝트다.\n");
  writeFileSync(
    join(p, "workspace", "HANDOFF.md"),
    "# HANDOFF (검사기가 만든 것)\n\n```json\n" + JSON.stringify(state, null, 2) + "\n```\n",
  );
  return dir;
}
function allClean() {
  const s = {};
  for (const n of Object.keys(GRAPH)) {
    s[n] = { status: "clean", hash: "h" };
    for (const c of Object.keys(GRAPH[n].parallel ?? {})) s[`${n}/${c}`] = { status: "clean", hash: "h" };
  }
  return s;
}
function mark(dir, node, reason) {
  const r = spawnSync("node", [join(dir, "gates", "graph-stop.mjs"), "--mark", node, reason], {
    cwd: dir,
    encoding: "utf-8",
  });
  let state = {};
  try {
    const m = readFileSync(join(dir, "projects", "probe", "workspace", "HANDOFF.md"), "utf-8").match(/```json\s*([\s\S]*?)```/);
    if (m) state = JSON.parse(m[1]);
  } catch { /* 없으면 빈 상태 */ }
  return { status: r.status, out: ((r.stdout ?? "") + (r.stderr ?? "")).trim(), state };
}

// ── A·B·D: 자식 하나만 찍는다 ────────────────────────────────────
{
  const dir = makeKit(allClean());
  try {
    const { status, out, state } = mark(dir, target, REASON);
    if (status !== 0) {
      no("A 수용", `--mark ${target} 가 종료코드 ${status} 로 거부됐다: ${out.split("\n")[0]}`);
      no("B 형제", "A 가 실패해 판정할 상태가 없다");
      no("D 하류", "A 가 실패해 판정할 상태가 없다");
    } else {
      ok("A 수용", `--mark ${target} 통과`);

      const t = state[target] ?? {};
      const sib = state[sibling] ?? {};
      const par = state[parent] ?? {};
      const bad = [];
      if (t.status !== "rework") bad.push(`${target}=${t.status}(rework 여야 한다)`);
      if (t.reason !== REASON) bad.push(`${target}.reason="${t.reason ?? "없음"}"`);
      if (sib.status !== "clean") bad.push(`${sibling}=${sib.status}(clean 이어야 한다)`);
      if (sib.reason) bad.push(`${sibling} 에 사유가 옮아붙었다("${sib.reason}")`);
      if (par.status !== "rework") bad.push(`${parent}=${par.status}(집계가 rework 여야 한다)`);
      if (par.reason !== REASON) bad.push(`${parent}.reason="${par.reason ?? "없음"}"`);
      if (bad.length === 0) ok("B 형제", `${target}=rework · ${sibling}=clean · ${parent}=rework(사유 승계)`);
      else no("B 형제", bad.join(" / "));

      const downstream = [...descendants(parent, GRAPH)];   // 형제(spec)는 하류가 아니다 — 그래프에서 판다
      const notDirty = downstream.filter((n) => !["dirty", "rework"].includes(state[n]?.status));
      if (notDirty.length === 0) ok("D 하류", `하류 전부 dirty: ${downstream.join(", ")}`);
      else no("D 하류", `하류인데 안 막힌 노드: ${notDirty.map((n) => `${n}=${state[n]?.status}`).join(", ")}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── C: 부모로 찍는 기존 동작이 그대로인가 ─────────────────────────
{
  const dir = makeKit(allClean());
  try {
    const { status, state } = mark(dir, parent, "부모 통째 거부");
    const both = kids.every((k) => state[k]?.status === "rework");
    if (status === 0 && both) ok("C 부모", `--mark ${parent} 는 여전히 자식 둘을 함께 rework 로 만든다`);
    else
      no(
        "C 부모",
        `--mark ${parent} (종료 ${status}) 후 자식 상태 ${kids.map((k) => `${k}=${state[k]?.status}`).join(", ")} — ` +
          `자식 마크를 넣으면서 부모 마크가 좁아졌다`,
      );
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
console.log(`\ncheck-mark-child: ${results.length - failed}/${results.length} 통과`);
if (failed > 0) {
  console.error("\n실패가 남았다. A 가 '알 수 없는 노드'로 거부되면 패치 ①(--mark 블록)이 아직 안 붙은 것이고,");
  console.error("'naSnapshot is not defined' 면 같은 파일의 헬퍼 청크(naSnapshot·reportNaCancelled)가 빠진 것이다.");
  process.exit(1);
}
