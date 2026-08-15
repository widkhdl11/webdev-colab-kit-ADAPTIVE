#!/usr/bin/env node
// propagate.mjs — dirty 전파 엔진 (순수 그래프 알고리즘, 파일 I/O 없음)
//
// 유일한 규칙: 상류가 dirty → 그에 의존하는 하류가 전부 dirty.
// 이 파일은 그래프 위상만 다룬다. 상태 저장(HANDOFF)·게이트 판정은 호출자(graph-stop) 몫.
//
// 자기검증:  node gates/propagate.mjs --selftest
import { GRAPH } from "../graph.mjs";

// ── 상태 어휘 ─────────────────────────────────────────────────
// dirty · clean · rework · n/a 넷. 하류 진행을 막느냐만 놓고 보면 n/a 는 clean 과 같다 —
// "이번 작업엔 해당 없음"이 하류를 세워 두면 생략이 생략이 아니게 된다.
// rework 는 반대로 dirty 와 같다 — 막는 것도 프론티어에 뜨는 것도 dirty 와 똑같고,
// 갈리는 자리는 Stop 훅의 턴 차단 하나뿐이다(graph.mjs 의 GATE_KIND).
export const isSatisfied = (st) => st === "clean" || st === "n/a";
export const isPending = (st) => st === "dirty" || st === "rework";

// ── 위상 도우미 ───────────────────────────────────────────────
// 톱레벨 노드만 위상에 참여한다(병렬 자식은 부모 내부 — 집계로만 다룸).
export const topLevel = (graph = GRAPH) => Object.keys(graph);
export const childrenOf = (graph, node) =>
  graph[node]?.parallel ? Object.keys(graph[node].parallel).map((c) => `${node}/${c}`) : [];

// reverse[u] = { u 에 직접 의존하는 노드들 }. depends_on(상류)만 선언돼 있으니 여기서 하류를 판다.
export function buildReverse(graph = GRAPH) {
  const reverse = new Map(topLevel(graph).map((n) => [n, new Set()]));
  for (const n of topLevel(graph))
    for (const up of graph[n].depends_on) {
      if (!reverse.has(up)) throw new Error(`선언 오류: '${n}'.depends_on 의 '${up}' 는 존재하지 않는 노드`);
      reverse.get(up).add(n);
    }
  return reverse;
}

// ── 순환 검출 (Kahn) — 시작 시 1회. cycle 이면 실행 거부 ────────────
export function assertAcyclic(graph = GRAPH) {
  const reverse = buildReverse(graph);
  const indeg = new Map(topLevel(graph).map((n) => [n, graph[n].depends_on.length]));
  const queue = topLevel(graph).filter((n) => indeg.get(n) === 0);
  let visited = 0;
  while (queue.length) {
    const n = queue.shift();
    visited++;
    for (const down of reverse.get(n)) {
      indeg.set(down, indeg.get(down) - 1);
      if (indeg.get(down) === 0) queue.push(down);
    }
  }
  if (visited !== topLevel(graph).length) {
    const stuck = topLevel(graph).filter((n) => indeg.get(n) > 0);
    throw new Error(`순환 의존 검출 — 방문 불가 노드: ${stuck.join(", ")}`);
  }
}

// ── 위상 정렬 (상류 먼저: product ... qa) ──────────────────────
export function topoSort(graph = GRAPH) {
  const reverse = buildReverse(graph);
  const indeg = new Map(topLevel(graph).map((n) => [n, graph[n].depends_on.length]));
  const queue = topLevel(graph).filter((n) => indeg.get(n) === 0);
  const order = [];
  while (queue.length) {
    const n = queue.shift();
    order.push(n);
    for (const down of reverse.get(n)) {
      indeg.set(down, indeg.get(down) - 1);
      if (indeg.get(down) === 0) queue.push(down);
    }
  }
  if (order.length !== topLevel(graph).length) throw new Error("순환 의존 — topoSort 불가");
  return order;
}

// node 의 전이 하류 전체(자기 제외).
export function descendants(node, graph = GRAPH) {
  const reverse = buildReverse(graph);
  if (!reverse.has(node)) throw new Error(`알 수 없는 노드: ${node}`);
  const out = new Set();
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    for (const down of reverse.get(n))
      if (!out.has(down)) { out.add(down); stack.push(down); }
  }
  return out; // node 미포함
}

// ── 마킹 ──────────────────────────────────────────────────────
// state: { [nodeId]: { status:'clean'|'dirty'|'rework'|'n/a', hash, reason? } }  (자식 id 는 'design/page-designer' 형태)
// dirty 로 찍으면 reason 은 사라진다 — n/a 판단이 취소됐다는 뜻이다.
export function markDirty(state, node, graph = GRAPH) {
  state[node] = { status: "dirty", hash: null };
  for (const child of childrenOf(graph, node)) state[child] = { status: "dirty", hash: null };
}

// rework 선언 — "통과했던 것이 취소됐다". 사유는 선택이지만 적으면 HANDOFF·브리핑에 그대로 남는다.
// 전파는 하지 않는다: 하류는 markDirty 로 따로 찍는다. rework 는 '이 노드 자신이 거부됐다'는 뜻이고,
// 하류는 거부된 게 아니라 상류가 흔들려 다시 해야 하는 것이라 둘을 같은 말로 부르면 안 된다.
export function markRework(state, node, reason, graph = GRAPH) {
  const mark = { status: "rework", hash: null, ...(reason?.trim() ? { reason: reason.trim() } : {}) };
  state[node] = { ...mark };
  for (const child of childrenOf(graph, node)) state[child] = { ...mark };
}

// n/a 선언. 사유는 필수 — 사유 없는 생략은 몇 턴 뒤에 아무도 근거를 못 댄다.
// 그래프가 na_allowed: false 로 막은 노드(review)는 거부한다.
export function markNa(state, node, reason, graph = GRAPH) {
  if (!reason || !reason.trim()) throw new Error(`n/a 선언에는 사유 한 줄이 필요하다: '${node}'`);
  if (graph[node]?.na_allowed === false)
    throw new Error(`'${node}' 는 n/a 로 둘 수 없다 — 깊이(구성)만 조절 가능하고 존재 자체는 생략 불가`);
  state[node] = { status: "n/a", hash: null, reason: reason.trim() };
  for (const child of childrenOf(graph, node)) state[child] = { status: "n/a", hash: null, reason: reason.trim() };
  return state;
}

// ★ 전파 — 유일한 규칙. 시나리오 A~E 가 전부 여기서 파생된다.
export function propagate(state, node, graph = GRAPH) {
  markDirty(state, node, graph);                 // 1) 자신 (+ 병렬 자식)
  for (const d of descendants(node, graph))      // 2) 전이 하류 전부
    markDirty(state, d, graph);
  return state;
}

// 부모 집계: 병렬 자식이 전부 clean(또는 n/a)이라야 부모가 하류를 놓아준다.
// 자식이 전부 n/a 면 부모도 n/a — 브리핑이 "clean(다 했음)"과 "n/a(안 함)"를 구분해 말해야 한다.
export function recomputeParents(state, graph = GRAPH) {
  for (const n of topLevel(graph)) {
    const kids = childrenOf(graph, n);
    if (kids.length === 0) continue;
    const allOk = kids.every((k) => isSatisfied(state[k]?.status));
    if (!allOk) {
      // 자식 중 하나라도 순수 dirty 면 부모도 dirty. 안 끝난 자식이 전부 rework 일 때만 부모가 rework 다 —
      // 부모를 무조건 dirty 로 뭉개면 선행 게이트 판정이 자식의 rework 를 못 본다(design 이 정확히 그 모양).
      const pendingKids = kids.filter((k) => !isSatisfied(state[k]?.status));
      const anyDirty = pendingKids.some((k) => state[k]?.status === "dirty");
      state[n] = anyDirty
        ? { status: "dirty", hash: null }
        : { status: "rework", hash: null, ...(() => {
            const r = pendingKids.map((k) => state[k]?.reason).filter(Boolean)[0];
            return r ? { reason: r } : {};
          })() };
      continue;
    }
    if (kids.every((k) => state[k]?.status === "n/a"))
      state[n] = { status: "n/a", hash: null, reason: kids.map((k) => state[k].reason).filter(Boolean)[0] ?? "자식 전부 n/a" };
    else if (state[n].status !== "clean") state[n] = { status: "clean", hash: state[n].hash };
  }
  return state;
}

// ── 자기검증 ──────────────────────────────────────────────────
function selftest() {
  const cleanState = () => {
    const s = {};
    for (const n of topLevel()) {
      s[n] = { status: "clean", hash: "h" };
      for (const c of childrenOf(GRAPH, n)) s[c] = { status: "clean", hash: "h" };
    }
    return s;
  };
  const dirtyOf = (s) => topLevel().filter((n) => s[n].status === "dirty");

  console.log("● assertAcyclic:", (() => { try { assertAcyclic(); return "통과 (DAG)"; } catch (e) { return "실패 " + e.message; } })());
  console.log("● topoSort (상류→하류):", topoSort().join(" → "));
  console.log("");
  console.log("● 전파 시나리오 (규칙 하나에서 전부 파생, 개별 라우팅 0):");
  for (const [label, changed, expect] of [
    ["A 구현만", "implement", "qa, review, deploy"],
    ["B 디자인", "design", "implement, qa, review, deploy"],
    ["C 스펙", "spec", "implement, qa, review, deploy"],
    ["  (루트) product", "product", "spec, design, implement, qa, review, deploy"],
  ]) {
    const s = cleanState();
    propagate(s, changed);
    const got = dirtyOf(s).filter((n) => n !== changed).join(", ");
    const ok = got === expect ? "✓" : `✗ (기대 ${expect})`;
    console.log(`   ${label.padEnd(14)} mark(${changed}) → 하류 dirty: ${got}  ${ok}`);
  }
  console.log("");
  console.log("● 순환 검출(합성 그래프 a↔b):",
    (() => {
      const cyc = { a: { depends_on: ["b"] }, b: { depends_on: ["a"] } };
      try { assertAcyclic(cyc); return "✗ 못 잡음"; } catch (e) { return "✓ 거부 — " + e.message; }
    })());
  console.log("● 병렬 집계: design 자식 하나만 dirty 여도 design dirty:",
    (() => {
      const s = cleanState();
      s["design/schema-designer"] = { status: "dirty", hash: null };
      recomputeParents(s);
      return s.design.status === "dirty" ? "✓" : "✗";
    })());
  console.log("");
  console.log("● rework (통과했다가 취소됨 — dirty 의 하위 종류):");
  console.log("   하류를 막는 건 dirty 와 똑같다:",
    (() => {
      const s = cleanState();
      markRework(s, "design", "ui-reviewer 지적 3건");
      return GRAPH.implement.depends_on.every((u) => isSatisfied(s[u].status)) ? "✗ 안 막힘" : "✓ implement 막힘";
    })());
  console.log("   사유는 상태에 남는다:",
    (() => {
      const s = cleanState();
      markRework(s, "design", "ui-reviewer 지적 3건");
      return s.design.reason === "ui-reviewer 지적 3건" ? "✓" : "✗ 사라짐";
    })());
  console.log("   자식이 전부 rework 면 부모도 rework:",
    (() => {
      const s = cleanState();
      s["design/page-designer"] = { status: "rework", hash: null, reason: "승인 철회" };
      recomputeParents(s);
      return s.design.status === "rework" && s.design.reason === "승인 철회" ? "✓" : `✗ (${s.design.status})`;
    })());
  console.log("   자식 하나라도 순수 dirty 면 부모는 dirty:",
    (() => {
      const s = cleanState();
      s["design/page-designer"] = { status: "rework", hash: null };
      s["design/schema-designer"] = { status: "dirty", hash: null };
      recomputeParents(s);
      return s.design.status === "dirty" ? "✓" : `✗ (${s.design.status})`;
    })());
  console.log("");
  console.log("● n/a (이번 작업엔 해당 없음):");
  console.log("   사유 없으면 거부:",
    (() => { try { markNa({}, "spec", "  "); return "✗ 통과됨"; } catch (e) { return "✓ — " + e.message; } })());
  console.log("   review 는 n/a 불가(na_allowed: false):",
    (() => { try { markNa({}, "review", "이번엔 생략"); return "✗ 통과됨"; } catch (e) { return "✓ — " + e.message; } })());
  console.log("   n/a 는 하류를 막지 않는다 (isSatisfied):",
    (() => {
      const s = cleanState();
      markNa(s, "spec", "카피 교체뿐 — 위험 표면 없음");
      const blocked = GRAPH.implement.depends_on.every((u) => isSatisfied(s[u].status));
      return blocked ? "✓ implement 진행 가능" : "✗ 막힘";
    })());
  console.log("   상류가 dirty 면 n/a 판단은 취소된다:",
    (() => {
      const s = cleanState();
      markNa(s, "spec", "위험 표면 없음");
      propagate(s, "product");                       // 전제(제품 정의)가 바뀌었다
      return s.spec.status === "dirty" && !s.spec.reason ? "✓ spec 다시 dirty" : "✗ n/a 가 살아남음";
    })());
  console.log("   자식이 전부 n/a 면 부모도 n/a:",
    (() => {
      const s = cleanState();
      markNa(s, "design/page-designer", "시각 변경 없음");
      markNa(s, "design/schema-designer", "스키마 변경 없음");
      recomputeParents(s);
      return s.design.status === "n/a" ? "✓" : "✗ " + s.design.status;
    })());
}

if (process.argv.includes("--selftest")) selftest();
