#!/usr/bin/env node
// check-pending-kind.mjs — 보류(escalation)가 턴을 막지 않으면서 하류는 그대로 막는지,
// 그리고 리포트 발행이 실패해도 차단 판정에 반드시 도달하는지 검사한다.
//
// 무엇을 지키는 검사인가:
//   ① 보류는 실행을 멈추지 않는다. 항목은 PENDING.md 에 쌓이고 나머지 작업은 계속 간다.
//   ② 그렇다고 강제력이 사라지면 안 된다 — 노드는 dirty 로 남고 하류는 계속 막힌다.
//   ③ **리포트 발행이 실패해도 차단 판정까지 반드시 흐른다.** 이게 가장 미묘하다.
//      Stop 훅에는 최상위 try/catch 가 없어서, 새 코드가 던지면 훅이 죽고 exit 2 가 나오는
//      자리(6단계)에 영영 도달하지 못한다. 그러면 막아야 할 게이트 실패를 안 막게 된다 —
//      이 레포의 원칙("모르면 막는 쪽")과 반대 방향으로 실패한다.
//
// 이 패치는 보호 파일 셋(graph.mjs · gates/graph-stop.mjs · gates/run-gates.mjs)을
// 사용자가 직접 붙인다. 붙었는지를 코드를 안 읽고도 판정할 수 있게 아래를 돌려서 본다.
//
//   A1 graph.mjs      GATE_KIND 에 pending 카테고리가 있다              ← 붙기 전 실패
//   A2 graph-stop     세 번째 kind(escalated) 분기가 있다               ← 붙기 전 실패
//   A3 run-gates      열린 보류 항목이 게이트 출력에 나타난다           ← 붙기 전 실패
//   S1 프로브          리포트 발행이 던져도 차단 판정에 도달한다        ← 붙기 전후 통과
//                     (던지지 않으면 정상 발행 — 심고 지우는 양방향 확인)
//   S2 프로브          blocks 없는 항목은 아무 노드도 막지 않는다       ← 붙기 전후 통과
//   B  낮춤 판정      escalated 는 owner 상태와 무관하게 낮춘다        ← 붙기 전후 통과
//   C  강제력 유지    낮춰도 하류는 막힌 채로 남는다                    ← 붙기 전후 통과
//   D  조기 종료      프론티어가 전부 막히면 닫고, 하나라도 열려 있으면 안 닫는다 ← 붙기 전후 통과
//   E  어휘 밖        모르는 노드 이름은 그 값만 버리고 경고한다        ← 붙기 전후 통과
//   F  현행           이 레포의 PENDING.md 가 파싱된다                  ← 붙기 전후 통과
//
// **S1 과 D 가 각도가 다른 두 그물이다.** S1 은 "실패해도 흐르나"를 보고, D 는 "흘러서
// 옳은 판정에 닿나"를 본다. 흐르기만 하고 판정이 틀리면 사이클이 안 닫히거나 너무 일찍 닫힌다.
//
// 사용: node scripts/check-pending-kind.mjs
// 파일을 만들지 않는다. A3 만 이 레포에서 게이트를 한 번 돌린다(읽기만 한다).

import { existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── 판정 기준. 패치가 붙이는 것과 같은 로직을 여기 둔다(붙기 전에도 B~F 를 돌리기 위해).

/**
 * PENDING.md 읽기. `## 열린 항목` 아래의 항목만 세고, 줄 맨 앞 `blocks:` 하나만 읽는다.
 * 나머지 본문은 파싱하지 않는다.
 *
 * 실패 방향: 모르는 것은 **막지 않는 쪽**으로 떨어진다. 실행을 멈추지 않는 것이 이 층의
 * 전제라, 모르는 값을 "전부 막는다"로 읽으면 오타 하나가 사이클을 통째로 닫는다.
 */
export function readPendingText(src, knownNodes = []) {
  const items = [];
  const problems = [];
  let open = false;
  let cur = null;
  const flush = () => { if (cur) items.push(cur); cur = null; };

  for (const raw of src.replace(/\r\n/g, "\n").split("\n")) {
    const h = raw.match(/^##\s+(.*)$/);
    if (h) { flush(); open = /열린/.test(h[1]); continue; }
    if (!open) continue;

    const title = raw.match(/^-\s+\*\*(.+?)\*\*/);
    if (title) { flush(); cur = { title: title[1].trim(), blocks: [] }; continue; }

    const b = raw.match(/^[ \t]*blocks:[ \t]*(.*)$/);
    if (b && cur) {
      for (const t of b[1].split(",").map((x) => x.trim()).filter(Boolean)) {
        if (knownNodes.length === 0 || knownNodes.includes(t)) cur.blocks.push(t);
        else problems.push(`'${cur.title}' 의 blocks 값 '${t}' 은 그래프에 없는 노드다 → 그 값만 버린다`);
      }
    }
  }
  flush();
  const blocked = new Set(items.flatMap((i) => i.blocks));
  return { items, blocked, problems };
}

/**
 * 조기 종료 조건 1 — 프론티어의 **모든** 노드가 보류에 막혔나.
 * 프론티어가 비어 있으면 닫지 않는다(그건 조건 2, 그래프 종단이 판정한다).
 */
export function frontierAllBlocked(frontier, blocked) {
  if (frontier.length === 0) return false;
  return frontier.every((n) => blocked.has(n));
}

/**
 * 리포트 발행을 감싼다. **던져도 삼키고 흐른다.**
 * 실패는 ⚠ 한 줄로 알리고, 호출한 쪽은 차단 판정으로 그대로 내려간다.
 */
export function safeEmit(fn, warn = () => {}) {
  try { fn(); return { emitted: true, error: null }; }
  catch (e) { warn(`⚠ [cycle/REPORT] 리포트 발행 실패 — ${e.message}. 차단 판정은 그대로 진행한다.`); return { emitted: false, error: e }; }
}

/** 낮춤 판정 — 세 번째 kind. owner 상태를 보지 않는다. */
export function downgradeReasonWithPending(cat, GATE_KIND, state, isPending) {
  const def = GATE_KIND[cat];
  if (!def) return null;                                   // 목록에 없는 카테고리는 무조건 차단
  if (def.kind === "escalated")
    return "보류로 올라간 항목이라 사람의 결정을 기다린다 — 결정을 받으려면 턴이 끝나야 한다";
  const st = state[def.owner]?.status;
  if (def.kind === "completion" && (isPending(st) || st === "na")) return `${def.owner} 가 아직 안 끝났다`;
  if (def.kind === "precondition" && st === "rework") return `${def.owner} 가 rework`;
  return null;
}

// ── 검사 ──────────────────────────────────────────────────────────────────
const results = [];
const ok = (id, what, pass, note = "") => results.push({ id, what, pass, note });
const src = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf-8") : "");

// A1 — graph.mjs 에 pending 카테고리
let gateKind = {};
try {
  const mod = await import(new URL("../graph.mjs", import.meta.url));
  gateKind = mod.GATE_KIND ?? {};
} catch { /* 읽기 실패 → A1 실패로 드러난다 */ }
ok("A1", "graph.mjs   GATE_KIND 에 pending(kind: escalated)이 있다",
   gateKind.pending?.kind === "escalated", `pending=${JSON.stringify(gateKind.pending ?? null)}`);

// A2 — graph-stop 에 escalated 분기
ok("A2", "graph-stop  세 번째 kind(escalated) 분기가 있다",
   /kind\s*===\s*"escalated"/.test(src("gates/graph-stop.mjs")), "downgradeReason 에 분기가 없다");

// A3 — run-gates 가 열린 보류 항목을 출력한다
{
  const g = spawnSync(process.execPath, [join(ROOT, "gates", "run-gates.mjs")], { cwd: ROOT, encoding: "utf-8" });
  const out = `${g.stdout ?? ""}${g.stderr ?? ""}`;
  ok("A3", "run-gates   열린 보류 항목이 게이트 출력에 나타난다",
     /\[pending\//.test(out), "출력에 [pending/…] 줄이 없다");
}

// S1 — 리포트 발행이 던져도 흐른다. 안 던지면 정상 발행된다(양방향).
{
  const warns = [];
  let reached = false;
  const bad = safeEmit(() => { throw new Error("디스크 가득"); }, (w) => warns.push(w));
  reached = true;                                          // 여기 도달했다 = 차단 판정으로 내려갈 수 있다
  const good = safeEmit(() => {}, (w) => warns.push(w));
  ok("S1", "프로브       리포트 발행이 던져도 차단 판정에 도달한다(지우면 정상 발행)",
     bad.emitted === false && bad.error !== null && reached === true &&
     good.emitted === true && warns.length === 1,
     `던졌을 때 emitted=${bad.emitted} 도달=${reached} / 안 던졌을 때 emitted=${good.emitted} / 경고 ${warns.length}건`);
}

// S2 — blocks 없는 항목은 아무 노드도 막지 않는다
{
  const withBlocks = "## 열린 항목\n\n- **X · 제목**\n  blocks: implement\n  설명.\n";
  const without = "## 열린 항목\n\n- **X · 제목**\n  설명.\n";
  const a = readPendingText(withBlocks, ["implement"]);
  const b = readPendingText(without, ["implement"]);
  ok("S2", "프로브       blocks 없는 항목은 아무 노드도 막지 않는다(있으면 막는다)",
     a.blocked.has("implement") && b.blocked.size === 0 && b.items.length === 1,
     `있을 때 [${[...a.blocked]}] / 없을 때 [${[...b.blocked]}] 항목수=${b.items.length}`);
}

// B — escalated 는 owner 상태와 무관하게 낮춘다
{
  const GK = { pending: { kind: "escalated", owner: null }, design: { kind: "precondition", owner: "design" } };
  const isPending = (s) => s === "dirty" || s === "rework";
  const r1 = downgradeReasonWithPending("pending", GK, {}, isPending);                       // 상태 없음
  const r2 = downgradeReasonWithPending("pending", GK, { design: { status: "clean" } }, isPending);
  const r3 = downgradeReasonWithPending("design", GK, { design: { status: "clean" } }, isPending);
  ok("B", "낮춤 판정   escalated 는 owner 상태와 무관하게 낮춘다(기존 두 분기는 그대로)",
     r1 !== null && r2 !== null && r3 === null,
     `pending(빈상태)=${r1 !== null} pending(clean)=${r2 !== null} design(clean)=${r3 === null ? "차단유지" : "낮춤(틀림)"}`);
}

// C — 낮춰도 강제력은 남는다: 막힌 노드는 여전히 막힌 노드다
{
  const { blocked } = readPendingText("## 열린 항목\n\n- **X**\n  blocks: implement\n", ["implement", "qa"]);
  // 낮춤은 '턴을 끝내도 된다'는 판정일 뿐, 막힌 노드 집합을 비우지 않는다.
  const reason = downgradeReasonWithPending("pending", { pending: { kind: "escalated", owner: null } }, {}, () => false);
  ok("C", "강제력 유지 낮춰도 막힌 노드 집합은 그대로다",
     reason !== null && blocked.has("implement") && blocked.size === 1, `blocked=[${[...blocked]}]`);
}

// D — 조기 종료 판정
{
  const blocked = new Set(["implement"]);
  ok("D", "조기 종료   프론티어가 전부 막히면 닫고, 하나라도 열려 있으면 안 닫는다",
     frontierAllBlocked(["implement"], blocked) === true &&
     frontierAllBlocked(["implement", "design"], blocked) === false &&
     frontierAllBlocked([], blocked) === false,
     "전부막힘/일부열림/빈프론티어 중 하나가 틀렸다");
}

// E — 어휘 밖 노드 이름
{
  const r = readPendingText("## 열린 항목\n\n- **X**\n  blocks: implement, 없는노드\n", ["implement", "qa"]);
  ok("E", "어휘 밖     모르는 노드 이름은 그 값만 버리고 경고한다",
     r.blocked.has("implement") && r.blocked.size === 1 && r.problems.length === 1,
     `blocked=[${[...r.blocked]}] 경고 ${r.problems.length}건`);
}

// F — 이 레포의 실물
{
  const nodes = Object.keys((await import(new URL("../graph.mjs", import.meta.url))).GRAPH ?? {});
  const p = join(ROOT, "projects", (src("ACTIVE") || "").trim(), "workspace", "PENDING.md");
  const r = existsSync(p) ? readPendingText(readFileSync(p, "utf-8"), nodes) : null;
  ok("F", `현행         PENDING.md 가 파싱된다 (열린 ${r?.items.length ?? "?"}건 · 막힌 노드 ${r ? [...r.blocked].join("·") || "없음" : "?"})`,
     r !== null && r.problems.length === 0, r ? r.problems.join(" / ") : "PENDING.md 를 못 찾았다");
}

let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.id} ${r.what}${r.pass ? "" : `  → ${r.note}`}`);
  if (!r.pass) failed++;
}
const applied = results.filter((r) => r.id.startsWith("A")).every((r) => r.pass);
console.log(`\ncheck-pending-kind: ${results.length - failed}/${results.length} 통과` +
            (applied ? "" : "  (A* 실패 = 패치 미적용. 나머지는 이 스크립트의 사본으로 돈 결과다)"));
process.exit(failed > 0 ? 1 : 0);
