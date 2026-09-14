#!/usr/bin/env node
// @check-role: on-change
// @check-guards: gates/graph-stop.mjs, gates/propagate.mjs
//
// check-na-cancel-notice.mjs — n/a 판단이 전파에 덮여 취소될 때 그 사실이 화면에 뜨는지 검사한다.
//
// 왜 필요한가: markDirty 는 노드를 { status:"dirty", hash:null } 로 통째로 덮어쓴다(gates/propagate.mjs).
// n/a 였다면 사유도 그때 사라진다. 취소는 옳지만 — 판단의 전제가 바뀌었으니까 — 아무 말이 없으면
// 다음 세션은 그 노드가 원래부터 dirty 였다고 읽는다. 사유는 이미 지워져 되짚을 근거도 없다.
// spec 한 자리만 예외적으로 알림이 있었다(risk-surface 가 잡았을 때). 나머지는 조용했다.
//
// 취소 경로가 둘이라 둘 다 본다:
//   A --mark   `--mark <상류>` 의 하류 전파가 n/a 를 덮을 때
//   B 파이프라인  산출물 해시 변경 감지 → 전파가 n/a 를 덮을 때 (Stop 훅의 보통 경로)
//   C 오탐없음  아무것도 안 바뀐 턴에는 취소 알림이 뜨지 않는다 (매 턴 울리면 아무도 안 읽는다)
//
// 검사는 임시 디렉터리에 킷을 복사해 돌린다 — 이 레포의 파일은 하나도 건드리지 않는다.
//
// 사용: node scripts/check-na-cancel-notice.mjs
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const results = [];
const ok = (name, detail = "") => results.push({ pass: true, name, detail });
const no = (name, detail) => results.push({ pass: false, name, detail });

const { GRAPH } = await import(`file://${join(ROOT, "graph.mjs")}`);

function makeKit() {
  const dir = mkdtempSync(join(tmpdir(), "na-notice-"));
  cpSync(join(ROOT, "gates"), join(dir, "gates"), { recursive: true });
  cpSync(join(ROOT, "graph.mjs"), join(dir, "graph.mjs"));
  writeFileSync(join(dir, "ACTIVE"), "probe\n");
  const p = join(dir, "projects", "probe");
  mkdirSync(join(p, "workspace"), { recursive: true });
  mkdirSync(join(p, "docs"), { recursive: true });
  writeFileSync(join(p, "docs", "PRODUCT.md"), "# probe\n검사용 임시 프로젝트다.\n");
  return { dir, p };
}
function run(dir, ...args) {
  const r = spawnSync("node", [join(dir, "gates", "graph-stop.mjs"), ...args], { cwd: dir, encoding: "utf-8" });
  let state = {};
  try {
    const m = readFileSync(join(dir, "projects", "probe", "workspace", "HANDOFF.md"), "utf-8").match(/```json\s*([\s\S]*?)```/);
    if (m) state = JSON.parse(m[1]);
  } catch { /* 없으면 빈 상태 */ }
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? ""), state };
}
function writeState(p, state) {
  writeFileSync(
    join(p, "workspace", "HANDOFF.md"),
    "# HANDOFF (검사기가 만든 것)\n\n```json\n" + JSON.stringify(state, null, 2) + "\n```\n",
  );
}
function allClean() {
  const s = {};
  for (const n of Object.keys(GRAPH)) {
    s[n] = { status: "clean", hash: "h" };
    for (const c of Object.keys(GRAPH[n].parallel ?? {})) s[`${n}/${c}`] = { status: "clean", hash: "h" };
  }
  return s;
}
// 취소 알림 한 줄: `↩ <노드> n/a 취소 ...` 안에 원래 사유가 그대로 있어야 한다.
function cancelLine(out, node) {
  return out.split("\n").find((l) => l.includes("↩") && l.includes(`${node} n/a 취소`)) ?? null;
}

const REASON_A = "배포는 다른 에이전트가 맡는다";
const REASON_B = "이번 작업엔 위험 표면 없음";

// ── A. --mark 의 하류 전파가 n/a 를 덮는다 ────────────────────────
{
  const { dir, p } = makeKit();
  try {
    const s = allClean();
    s.deploy = { status: "n/a", hash: null, reason: REASON_A };
    writeState(p, s);
    // implement 를 거부한다 → deploy 는 하류라 전파로 dirty 가 된다(= n/a 판단이 취소된다).
    const { out, state } = run(dir, "--mark", "implement", "재구현 필요");
    const line = cancelLine(out, "deploy");
    if (state.deploy?.status === "n/a") {
      no("A --mark", "deploy 가 아직 n/a 다 — 전파가 안 닿았다면 이 검사 자체를 다시 봐야 한다");
    } else if (!line) {
      no(
        "A --mark",
        `deploy 가 ${state.deploy?.status} 로 취소됐는데 알림이 없다 (출력: ${out.trim().split("\n").join(" / ") || "없음"})`,
      );
    } else if (!line.includes(REASON_A)) {
      no("A --mark", `알림은 떴는데 사라진 사유가 안 적혔다: ${line.trim()}`);
    } else {
      ok("A --mark", line.trim());
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── B. 파이프라인(해시 변경 → 전파)이 n/a 를 덮는다 ────────────────
{
  const { dir, p } = makeKit();
  try {
    run(dir);                                   // 부트스트랩: product 가 clean 이 되고 해시가 기록된다
    const na = run(dir, "--na", "spec", REASON_B);
    if (na.state.spec?.status !== "n/a") {
      no("B 파이프라인", `--na spec 이 안 먹었다 (지금 ${na.state.spec?.status}) — 검사 준비가 실패했다`);
    } else {
      // 상류(product)의 산출물을 바꾼다 → 다음 턴의 sync 가 전파 → spec 의 n/a 가 덮인다
      writeFileSync(join(p, "docs", "PRODUCT.md"), "# probe\n요구가 바뀌었다.\n");
      const { out, state } = run(dir);
      const line = cancelLine(out, "spec");
      if (state.spec?.status === "n/a") no("B 파이프라인", "spec 이 아직 n/a 다 — 전파가 안 닿았다");
      else if (!line) no("B 파이프라인", `spec 이 ${state.spec?.status} 로 취소됐는데 알림이 없다`);
      else if (!line.includes(REASON_B)) no("B 파이프라인", `알림은 떴는데 사라진 사유가 안 적혔다: ${line.trim()}`);
      else ok("B 파이프라인", line.trim());
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── C. 아무것도 안 바뀐 턴에는 조용하다 ────────────────────────────
{
  const { dir } = makeKit();
  try {
    run(dir);
    run(dir, "--na", "spec", REASON_B);
    const { out, state } = run(dir);            // 바뀐 것 없이 한 번 더
    const line = cancelLine(out, "spec");
    if (state.spec?.status !== "n/a") ok("C 오탐없음", `spec 이 n/a 가 아니게 됐다(${state.spec?.status}) — 취소가 실제로 일어났으니 알림은 맞다`);
    else if (line) no("C 오탐없음", `n/a 가 그대로인데 취소 알림이 떴다: ${line.trim()}`);
    else ok("C 오탐없음", "n/a 가 유지된 턴에는 알림이 없다");
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
console.log(`\ncheck-na-cancel-notice: ${results.length - failed}/${results.length} 통과`);
if (failed > 0) {
  console.error("\n실패가 남았다. A·B 가 '알림이 없다'로 실패하면 gates/graph-stop.mjs 의 n/a 알림 패치가 아직 안 붙었다");
  console.error("(헬퍼 naSnapshot·reportNaCancelled + --mark 블록 + 파이프라인의 3.6 — 셋이 한 벌이다).");
  process.exit(1);
}
