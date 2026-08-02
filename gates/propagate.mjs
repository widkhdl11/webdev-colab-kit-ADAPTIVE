#!/usr/bin/env node
// propagate.mjs — dirty 전파 엔진 (순수 그래프 알고리즘, 파일 I/O 없음)
//
// 유일한 규칙: 상류가 dirty → 그에 의존하는 하류가 전부 dirty.
// 이 파일은 그래프 위상만 다룬다. 상태 저장(HANDOFF)·게이트 판정은 호출자(graph-stop) 몫.
//
// 자기검증:  node gates/propagate.mjs --selftest
import { GRAPH } from "../graph.mjs";

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
// state: { [nodeId]: { status:'clean'|'dirty', hash } }  (자식 id 는 'design/page-designer' 형태)
export function markDirty(state, node, graph = GRAPH) {
  state[node] = { status: "dirty", hash: null };
  for (const child of childrenOf(graph, node)) state[child] = { status: "dirty", hash: null };
}

// ★ 전파 — 유일한 규칙. 시나리오 A~E 가 전부 여기서 파생된다.
export function propagate(state, node, graph = GRAPH) {
  markDirty(state, node, graph);                 // 1) 자신 (+ 병렬 자식)
  for (const d of descendants(node, graph))      // 2) 전이 하류 전부
    markDirty(state, d, graph);
  return state;
}

// 부모 집계: 병렬 자식이 전부 clean 이라야 부모 clean.
export function recomputeParents(state, graph = GRAPH) {
  for (const n of topLevel(graph)) {
    const kids = childrenOf(graph, n);
    if (kids.length === 0) continue;
    const allClean = kids.every((k) => state[k]?.status === "clean");
    if (allClean && state[n].status !== "clean") state[n] = { status: "clean", hash: state[n].hash };
    if (!allClean) state[n] = { status: "dirty", hash: null };
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
}

if (process.argv.includes("--selftest")) selftest();
