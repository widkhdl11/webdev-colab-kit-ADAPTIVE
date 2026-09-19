#!/usr/bin/env node
// @check-role: on-change
// @check-guards: scripts/turn-transition.mjs
//
// turn-transition.mjs — 턴이 끝날 때 **지금 어느 노드인지를 기계가 기록한다.**
//
// 무엇을 푸는가:
//   전환 기록(`transitions.jsonl`)은 지금까지 에이전트가 `report-note.mjs` 를 손으로 쳐야만
//   남았다. 안 치면 아무 일도 안 일어나고, 화면은 **살아 있는 채로 틀린 위치**를 보여 준다.
//   실측(2026-09-17): 제품 파일 하나를 고치고 게이트와 Stop 훅을 돌려도 전환은 18줄 그대로였다.
//
//   노드를 정하는 계산 자체는 이미 있다 — `gates/graph-stop.mjs` 가 매 턴 산출물 해시를 뜬다.
//   없던 것은 그 결과를 **기록으로 남기는 자리**다. 여기가 그 자리다.
//
// 무엇을 하지 않는가:
//   `task`·`now`·`item` 같은 의미 필드는 훅이 채울 수 없다. 사람이 손으로 적은 현재 값을
//   그대로 실어 쓴다. 손 기록(`report-note.mjs`)은 그대로 살아 있고, 이 자동 기록은
//   **노드만** 책임진다.
//
//   그리고 `state.json` 을 직접 쓰지 않는다. 쓰기는 `report-note.mjs` 의 `note()` 하나뿐이고
//   (그 규약은 `check-report.mjs` 가 검사한다), 여기는 「무엇을 쓸지」만 정해서 넘긴다.
//
// 왜 해시 스냅샷을 따로 두나:
//   `graph-stop` 의 `changed` 는 「이번 턴에 바뀐 것」이 아니라 「**마지막으로 clean 이 됐을 때와
//   다른 것**」이다. dirty 노드의 해시는 `null` 이라(propagate.mjs 가 그렇게 비운다) 아무것도
//   안 고쳐도 매 턴 그 목록에 들어온다. 그것을 현재 위치로 쓰면 `implement` 가 dirty 인 동안
//   킷 파일만 고친 턴까지 `implement` 로 찍힌다. 그래서 **턴과 턴 사이**를 비교할 스냅샷을
//   따로 둔다: `projects/<슬러그>/report/turn-hashes.json`.
//
//   HANDOFF 안에는 못 둔다. `markUnitDirty` 가 `state[id]` 를 `{status, hash}` 로 통째 교체해서
//   덧붙인 필드가 조용히 사라진다(gates/propagate.mjs).
//
// 쓰는 법 (훅):
//   const m = await import("../scripts/turn-transition.mjs");
//   m.recordTurnTransition(해시맵);            // { 단위id: 해시|null }
//
// 쓰는 법 (직접 — 지금 무엇으로 판정되는지 보기만 한다):
//   node scripts/turn-transition.mjs --dry
//
// 계약 테스트: scripts/check-turn-transition.mjs

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { GRAPH } from "../graph.mjs";
import { note } from "./report-note.mjs";
import { readAllActivity } from "./measurement-gap.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 편집으로 치는 툴. 읽기·검색은 「무엇을 고쳤나」가 아니라서 사유가 되지 못한다. */
const EDIT_TOOLS = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);

/**
 * **기록 폴더** — 진행 대시보드의 설치본과 과정 기록이다. 여기 있는 파일은 「무엇을 만들었나」가
 * 아니라 「무엇을 했다고 적었나」라서, 이것이 바뀌었다고 제품 단계가 움직인 것이 아니다.
 * 프로젝트 폴더 기준 상대경로로 본다.
 *
 * 2026-09-18: 대시보드 설치본을 갱신한 턴이 `implement` 로 찍혔다. 지금 노드 해시는 이 폴더를
 * 아예 안 본다(어느 노드의 produces 글롭도 여기 안 닿는다) — 그런데 사인오프 노드 둘은
 * `workspace/` 를 내놓는다. 그것이 해시 대상에 들어오는 날 같은 오판이 조용히 돌아온다.
 */
export const RECORD_DIRS = ["report/", "workspace/"];

/** 프로젝트 기준 상대경로가 기록 폴더 안인가. */
export function isRecordPath(rel) {
  const s = String(rel ?? "").split("\\").join("/").replace(/^\/+/, "");
  return RECORD_DIRS.some((d) => s.startsWith(d));
}

/**
 * 내놓는 것이 **전부** 기록 폴더 안인 단위. 주 노드 후보에서 뺀다 — 기록이 바뀐 것을
 * 제품 단계가 움직인 것으로 읽으면 화면이 살아 있는 채로 틀린다.
 */
export function recordOnlyUnits(graph = GRAPH) {
  const out = new Set();
  const consider = (id, produces) => {
    const list = Array.isArray(produces) ? produces : [];
    if (list.length > 0 && list.every(isRecordPath)) out.add(id);
  };
  for (const [id, def] of Object.entries(graph)) {
    if (def.parallel) for (const [c, cdef] of Object.entries(def.parallel)) consider(`${id}/${c}`, cdef.produces);
    else consider(id, def.produces);
  }
  return out;
}

/** 손 기록이 없을 때 쓰는 값. 스키마가 `task`·`now` 에 빈 값을 허용하지 않아서 null 을 못 쓴다. */
export const NO_RECORD = { task: "기록-없음", now: "훅 자동 기록 — 손 기록 없음" };

/**
 * 추적 단위를 위상 순서로 편다. 병렬 자식이 있는 노드는 부모 대신 자식 id 가 들어간다
 * (`design` → `design/page-designer`, `design/schema-designer`). `gates/graph-stop.mjs` 의
 * `allUnits()` 와 같은 단위다.
 *
 * **여기서 직접 센다 — `gates/propagate.mjs` 를 부르지 않는다.** 샌드박스로 도는 검사들이
 * `gates/` 만 복사하거나 `scripts/` 만 복사하는데, 둘을 엮으면 그중 한쪽에서 모듈을 못 찾는다.
 */
export function unitOrder(graph = GRAPH) {
  const rest = Object.keys(graph);
  const sorted = [];
  while (rest.length > 0) {
    const i = rest.findIndex((n) => (graph[n].depends_on ?? []).every((d) => sorted.includes(d)));
    if (i < 0) { sorted.push(...rest.splice(0)); break; }   // 순환이면 선언 순서로 — 관측 도구가 여기서 죽지 않는다
    sorted.push(...rest.splice(i, 1));
  }
  return sorted.flatMap((n) =>
    graph[n].parallel ? Object.keys(graph[n].parallel).map((c) => `${n}/${c}`) : [n],
  );
}

/**
 * 스냅샷과 지금을 대조해 **이번 턴에 실제로 바뀐 단위**를 센다.
 *
 * 직전 스냅샷이 없으면(첫 실행) 빈 목록이다 — 「처음 본 것」과 「방금 바뀐 것」은 다르고,
 * 그 둘을 섞으면 설치 직후에 가짜 전환 한 줄이 생긴다.
 */
export function changedUnits(currentHashes, prevHashes, ignored = recordOnlyUnits()) {
  if (!prevHashes) return [];
  return Object.keys(currentHashes)
    .filter((id) => !ignored.has(id))
    .filter((id) => (currentHashes[id] ?? null) !== (prevHashes[id] ?? null));
}

/**
 * 주 노드 = **위상 순서상 가장 뒤**. 한 턴에 여러 노드의 산출물이 바뀌는 일은 흔하고
 * (스펙을 고치면서 구현도 고친다), 그때 「지금 어디인가」의 답은 하류 쪽이다 —
 * 상류를 답으로 쓰면 이미 지나온 자리에 머무는 것으로 보인다.
 */
export function mainNode(changed, order) {
  let picked = null;
  let lastIdx = -1;
  for (const id of changed) {
    const i = order.indexOf(id);
    if (i > lastIdx) { lastIdx = i; picked = id; }
  }
  return picked;
}

/** 경로를 짧게. 레포 안이면 레포 기준 상대경로, 아니면 파일명만. */
export function shortPath(p, root = ROOT) {
  const s = String(p ?? "").split("\\").join("/");
  const r = root.split("\\").join("/");
  return s.startsWith(r) ? s.slice(r.length).replace(/^\/+/, "") : basename(s) || s;
}

/**
 * 이번 턴에 고친 **그래프 밖 파일들**. 활동 기록에서 뽑는다.
 *
 * 그래프 밖 구간에 사유가 없으면 「밖에 있었다」와 「안 적었다」가 구별되지 않는다. 사람에게
 * 그 한 줄을 다시 요구하는 대신, 훅이 이미 아는 것(무슨 파일을 고쳤나)으로 채운다.
 */
export function kitEdits(activity, since, root = ROOT) {
  const cutoff = Date.parse(since ?? "");
  const out = [];
  for (const r of activity) {
    if (!EDIT_TOOLS.has(r?.tool)) continue;
    const t = Date.parse(r?.at ?? "");
    if (Number.isFinite(cutoff) && !(t > cutoff)) continue;
    const rel = shortPath(r?.target, root);
    if (/(^|\/)projects\//.test(rel)) continue;           // 제품 파일은 그래프 안이다
    // 대상을 못 읽은 편집(`target` 이 빈 줄)도 **셈에는 넣는다**. 그래프 밖으로 나온 것은
    // 사실이고 무엇을 고쳤는지만 모르는 상태다 — 그 줄을 버리면 위치가 조용히 안 바뀐다.
    const value = rel || "";
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

/**
 * 이번 턴에 고친 **프로젝트 파일**을 기록 폴더 안/밖으로 가른다. `kitEdits` 와 짝이다 —
 * 저쪽은 레포 루트 쪽을 보고 그래프 밖 사유를 만들고, 이쪽은 「제품을 건드렸나」를 가른다.
 *
 * 활동 기록이 없으면(훅 미설치) 둘 다 빈 배열이고, 그러면 아래 규칙은 아무것도 안 바꾼다 —
 * 모르는 것을 근거로 위치를 지우지 않는다.
 */
export function projectEdits(activity, since, slug, root = ROOT) {
  const cutoff = Date.parse(since ?? "");
  const prefix = `projects/${String(slug ?? "").trim()}/`;
  const record = [];
  const product = [];
  for (const r of activity) {
    if (!EDIT_TOOLS.has(r?.tool)) continue;
    const t = Date.parse(r?.at ?? "");
    if (Number.isFinite(cutoff) && !(t > cutoff)) continue;
    const rel = shortPath(r?.target, root);
    if (!rel.startsWith(prefix)) continue;
    const inProject = rel.slice(prefix.length);
    (isRecordPath(inProject) ? record : product).push(inProject);
  }
  return { record, product };
}

/** 기록 폴더만 고친 턴의 사유 한 줄. 「킷 —」과 달리 이쪽은 프로젝트 안이다. */
export function makeRecordReason(files) {
  const names = (files ?? []).map((p) => String(p ?? "").trim()).filter(Boolean);
  if (names.length === 0) return null;
  return names.length === 1 ? `기록 — ${names[0]}` : `기록 — ${names[0]} 외 ${names.length - 1}개`;
}

/** 그래프 밖 사유 한 줄. 고친 것이 없으면 `null` 이고, 부르는 쪽이 「미기재」로 적는다. */
export function makeReason(files) {
  const names = (files ?? []).map((p) => String(p ?? "").trim()).filter(Boolean);
  if (names.length === 0) return null;
  const head = names[0];
  return names.length === 1 ? `킷 — ${head}` : `킷 — ${head} 외 ${names.length - 1}개`;
}

/**
 * **순수 함수다** — 파일도 시계도 안 본다. 무엇을 기록할지만 정한다.
 *
 * @returns 기록할 것이 없으면 `null`. 있으면 `note()` 에 그대로 넘길 수 있는 객체.
 */
export function decide({ currentHashes, prevHashes, order, state, lastTransition, kitFiles = [], edits = { record: [], product: [] } }) {
  if (!prevHashes) return null;                       // 첫 실행 — 스냅샷만 남기고 기록은 안 한다
  const changed = changedUnits(currentHashes, prevHashes);
  // 이번 턴에 손댄 프로젝트 파일이 **전부** 기록 폴더 안이면 제품 단계는 안 움직인 것이다.
  // 해시가 바뀌어 있더라도 그 변화는 이번 턴 것이 아니다 — 앞 턴의 변화가 늦게 잡힌 것이고,
  // 그것을 지금 위치로 쓰면 이번 턴의 한 줄 설명이 엉뚱한 노드에 붙는다(2026-09-18 실측).
  const recordOnlyTurn = edits.record.length > 0 && edits.product.length === 0;
  const node = !recordOnlyTurn && changed.length > 0 ? mainNode(changed, order) : null;
  const currentNode = state?.current_node ?? null;

  // 같은 자리에 머무는 턴은 줄을 안 늘린다. 체류 시간은 줄 **사이의 간격**이라,
  // 한 노드 안에서 열 번 고쳤다고 열 줄이 생기면 그 노드의 체류가 0초 열 개로 쪼개진다.
  if (node === currentNode) return null;

  // 그래프 밖으로 나왔다고 판정하려면 근거가 있어야 한다. 아무것도 안 고친 턴
  // (읽기만 한 턴·질문만 한 턴)은 위치가 바뀐 것이 아니다.
  if (node === null && kitFiles.length === 0 && !recordOnlyTurn) return null;

  const reason = node === null
    ? (makeReason(kitFiles) ?? (recordOnlyTurn ? makeRecordReason(edits.record) : null) ?? "미기재")
    : null;
  return {
    node: node,
    // 의미 필드는 손 기록이 적은 현재 값을 그대로 싣는다. 훅이 지어내면 화면의 설명이
    // 기계 문장이 되고, 그건 「기록이 없다」보다 나쁘다 — 틀린 줄 모르게 된다.
    task: (state?.task ?? "").trim() || NO_RECORD.task,
    now: (state?.now ?? "").trim() || NO_RECORD.now,
    // `item` 은 `state.json` 에 없는 필드라 마지막 전환 줄에서 물려받는다.
    item: lastTransition?.item ?? null,
    // `result`(무엇이 끝났나)는 훅이 알 수 없다. 언제나 null 이고 손 기록만 채운다.
    result: null,
    ...(node === null ? { offGraph: reason } : {}),
  };
}

/** 스냅샷 파일 경로. 이 파일은 기록이 아니라 **대조용 메모**다 — 사람이 읽을 일이 없다. */
export const SNAPSHOT_FILE = "turn-hashes.json";

function readJson(p, fallback = null) {
  try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return fallback; }
}

function activeSlug() {
  try { return readFileSync(join(ROOT, "ACTIVE"), "utf-8").trim(); } catch { return ""; }
}

/**
 * 판정하고, 기록하고, 스냅샷을 갱신한다.
 *
 * **스냅샷은 기록을 안 했을 때도 갱신한다.** 안 그러면 「이번 턴」의 시작점이 옛날에 머물러
 * 며칠 전 편집이 계속 이번 턴 것으로 잡힌다.
 *
 * @param currentHashes { 단위id: 해시|null } — 부르는 쪽(graph-stop)이 이미 계산해 둔 것
 * @returns 기록한 전환 줄, 또는 `null`
 */
export function recordTurnTransition(currentHashes, { slug, root = ROOT, now = new Date().toISOString() } = {}) {
  const active = (slug || activeSlug()).trim();
  if (!active) return null;
  const dir = join(root, "projects", active, "report");
  if (!existsSync(dir)) return null;                 // 대시보드를 안 깐 프로젝트에는 아무것도 안 만든다

  const snapPath = join(dir, SNAPSHOT_FILE);
  const snap = readJson(snapPath);
  const state = readJson(join(dir, "state.json"));
  const transPath = join(dir, "transitions.jsonl");
  const rows = existsSync(transPath)
    ? readFileSync(transPath, "utf-8").split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    : [];

  let written = null;
  try {
    const toWrite = decide({
      currentHashes,
      prevHashes: snap?.hashes ?? null,
      order: unitOrder(),
      state,
      lastTransition: rows[rows.length - 1] ?? null,
      kitFiles: kitEdits(readAllActivity(dir), snap?.at ?? null, root),
      edits: projectEdits(readAllActivity(dir), snap?.at ?? null, active, root),
    });
    if (toWrite) written = note(dir, toWrite);
  } finally {
    // 판정이 실패해도 스냅샷은 갱신한다. 안 그러면 다음 턴이 같은 자리에서 또 넘어진다.
    mkdirSync(dir, { recursive: true });
    writeFileSync(snapPath, `${JSON.stringify({ at: now, hashes: currentHashes }, null, 2)}\n`, "utf-8");
  }
  return written;
}

// ── 직접 실행 ──────────────────────────────────────────────────────────
const isDirectRun = Boolean(process.argv[1]) && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  console.log("단위 순서:", unitOrder().join(" → "));
  console.log("이 스크립트는 판정만 한다. 실제 기록은 gates/graph-stop.mjs 가 턴 끝에 부른다.");
}
