#!/usr/bin/env node
// graph-stop.mjs — Stop 훅 오케스트레이터.
// 한 스크립트가 순서대로: 게이트 → sync(감지·전파) → release(dirty 해제) → HANDOFF 기록.
//
//   1) run-gates 내부 실행 → 카테고리 에러 수집 (하드exit 보류)
//   2) sync   : produces 내용해시 변경 감지 → propagate (상류 dirty → 하류 dirty)
//   3) release: 게이트 통과 노드(상류 clean+프론트매터+에러0)를 clean 으로 내림
//   4) persist: projects/<active>/workspace/HANDOFF.md 에 state 기록
//   5) qa 실패면 분류기 필요 안내
//   6) 남은 게이트 에러 있으면 exit 2 (기존 차단 유지)
//
// 상태·재작업 경로는 어디에도 선언 안 한다 — 전부 전파에서 파생(graph.mjs + propagate.mjs).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, basename, dirname } from "node:path";
import { GRAPH } from "../graph.mjs";
import { topLevel, childrenOf, propagate, descendants, recomputeParents, markDirty, topoSort } from "./propagate.mjs";

const ROOT = process.cwd();

// ── 활성 프로젝트 (없으면 스캐폴드 전 → skip, exit 0) ──────────────
const active = existsSync(join(ROOT, "ACTIVE")) ? readFileSync(join(ROOT, "ACTIVE"), "utf-8").trim() : "";
const projDir = active ? join(ROOT, "projects", active) : "";
if (!active || !existsSync(projDir)) {
  console.log("graph-stop skip: 활성 프로젝트 없음 (ACTIVE 미설정 또는 projects/<이름> 부재)");
  process.exit(0);
}
const HANDOFF = join(projDir, "workspace", "HANDOFF.md");

// ── 글롭: produces 패턴(*, **)을 projDir 상대경로에 매칭 (외부 dep 없이) ──
function globToRegex(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") { re += ".*"; i++; if (glob[i + 1] === "/") i++; }
      else re += "[^/]*";
    } else if (".+^${}()|[]\\/".includes(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp("^" + re + "$");
}
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
// projDir 아래 모든 파일을 posix 상대경로로. '_' 접두 파일(_TEMPLATE 등)은 제외.
const allFiles = walk(projDir)
  .map((f) => relative(projDir, f).split("\\").join("/"))
  .filter((rel) => !basename(rel).startsWith("_"));

function matchProduces(produces) {
  const res = produces.map(globToRegex);
  return allFiles.filter((rel) => res.some((r) => r.test(rel)));
}

// ── 해시: produces 내용 sha256 (파일 없으면 null) ────────────────
function hashNode(produces) {
  const files = matchProduces(produces).sort();
  if (files.length === 0) return null;
  const h = createHash("sha256");
  for (const rel of files) h.update(rel + "\0" + readFileSync(join(projDir, rel)));
  return h.digest("hex").slice(0, 12);
}

// clean 추적 단위: 톱레벨 노드 + 병렬 자식(부모 design 은 집계라 제외).
// signoff = 비결정론 사인오프 노드(review·deploy)는 마커로 clean, 변경감지에선 제외.
function allUnits() {
  const out = [];
  for (const n of topLevel(GRAPH)) {
    if (GRAPH[n].parallel)
      for (const [c, def] of Object.entries(GRAPH[n].parallel)) out.push({ id: `${n}/${c}`, produces: def.produces, clean_when: def.clean_when, signoff: null });
    else out.push({ id: n, produces: GRAPH[n].produces, clean_when: GRAPH[n].clean_when, signoff: GRAPH[n].clean_when?.signoff ?? null });
  }
  return out;
}
const unitParent = (id) => (id.includes("/") ? id.split("/")[0] : id);

// ── HANDOFF 읽기/쓰기 (```json 펜스 블록. yaml 파서 불필요) ────────
function loadState() {
  let s = null;
  if (existsSync(HANDOFF)) {
    const m = readFileSync(HANDOFF, "utf-8").match(/```json\s*([\s\S]*?)```/);
    if (m) { try { s = JSON.parse(m[1]); } catch { /* 손상 → 재부트스트랩 */ } }
  }
  if (!s) s = {};
  // 백필: 그래프에 있으나 상태에 없는 노드/자식은 dirty·null 로 (부트스트랩·스키마 변경 모두 커버).
  for (const n of topLevel(GRAPH)) {
    if (!s[n]) s[n] = { status: "dirty", hash: null };
    for (const c of childrenOf(GRAPH, n)) if (!s[c]) s[c] = { status: "dirty", hash: null };
  }
  return s;
}
function frontier(state) {
  return topoSort(GRAPH).filter(
    (n) => state[n].status === "dirty" && GRAPH[n].depends_on.every((u) => state[u].status === "clean")
  );
}
function persist(state) {
  if (!existsSync(dirname(HANDOFF))) mkdirSync(dirname(HANDOFF), { recursive: true });
  const f = frontier(state);
  const body =
    `# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)\n\n` +
    `# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).\n` +
    `# 프론티어(지금 작업할 노드, 파생값): ${f.length ? f.join(", ") : "없음 — 전부 clean"}\n\n` +
    "```json\n" + JSON.stringify(state, null, 2) + "\n```\n";
  writeFileSync(HANDOFF, body);
}

// ── 자식 포함 dirty 마킹 (해시 트리거는 세밀하게: 바뀐 자식만) ──────
function markUnitDirty(state, unit) {
  if (unit.includes("/")) {
    state[unit] = { status: "dirty", hash: null };          // 바뀐 자식만
    const parent = unitParent(unit);
    state[parent] = { status: "dirty", hash: null };        // 부모 집계 dirty
    for (const d of descendants(parent, GRAPH)) markDirty(state, d, GRAPH); // 부모의 하류
  } else {
    propagate(state, unit, GRAPH);                          // 톱레벨: 자기+자식+하류
  }
}

// ── 게이트 에러 파싱 → { cat, relPath, whole } ─────────────────
function parseGateErrors(text) {
  const out = [];
  const prefix = `projects/${active}/`;
  for (const line of text.split("\n")) {
    const m = line.match(/^\[([a-z-]+)\/[^\]]+\]\s+(.+)$/);
    if (!m) continue;
    const cat = m[1];
    let p = m[2].split(" — ")[0].split(" ")[0].replace(/:\d+$/, "").split("\\").join("/");
    const pm = p.match(/^projects\/([^/:]+)/);
    if (pm) {
      if (pm[1] !== active) continue;                     // 다른 프로젝트 에러 → 이 그래프와 무관, 무시
      if (p.startsWith(prefix)) out.push({ cat, relPath: p.slice(prefix.length), whole: false });
      else out.push({ cat, relPath: "", whole: true });   // projects/<active> 통째(test/FAIL 등)
    } else {
      out.push({ cat, relPath: "", whole: true });        // 프로젝트 경로 없는 전역 에러
    }
  }
  return out;
}
function frontmatterOK(cw) {
  if (!cw?.frontmatter) return true;
  const files = matchProduces([cw.frontmatter.path]);
  if (files.length === 0) return true; // 대상 없음 → 막지 않음
  const [k, v] = cw.frontmatter.require.split(":").map((x) => x.trim());
  // 줄 시작 앵커: status 등은 frontmatter 의 구조화된 필드 — 주석 뒤 같은 토큰을 값으로 오인하지 않게. (retro 2026-08-02)
  const re = new RegExp(`^\\s*${k}:\\s*${v}\\b`, "m");
  return files.every((rel) => {
    const src = readFileSync(join(projDir, rel), "utf-8");
    const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    return fm && re.test(fm[1]);
  });
}
// exists_nonempty: 파일이 존재하고 비어있지 않아야 clean (예: product=PRODUCT.md). 새 빈 프로젝트에서 필요.
function existsNonemptyOK(cw) {
  if (!cw?.exists_nonempty) return true;
  const files = matchProduces([cw.exists_nonempty]);
  return files.length > 0 && files.some((rel) => readFileSync(join(projDir, rel), "utf-8").trim().length > 0);
}
function gateBlocked(cw, produces, errors) {
  const cats = cw?.gate || [];
  if (cats.length === 0) return false;
  const res = produces.map(globToRegex);
  return errors.some(
    (e) => cats.includes(e.cat) && (e.whole || res.some((r) => r.test(e.relPath)))
  );
}
// 사인오프(review·deploy): 마커에 require 문구 + basis(구현 해시)가 현재와 일치해야 clean.
// 구현이 바뀌면 basis 불일치 → 낡음. 마커 없으면 미승인 → dirty.
function signoffOK(so) {
  const files = matchProduces([so.marker]);
  if (!files.length) return false;
  const fm = readFileSync(join(projDir, files[0]), "utf-8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return false;
  const [k, v] = so.require.split(":").map((x) => x.trim());
  if (!new RegExp(`${k}:\\s*${v}`).test(fm[1])) return false;
  const bm = fm[1].match(/basis:\s*(\w+)/);
  return bm && bm[1] === hashNode(GRAPH[so.basis_of].produces);
}

// ── 수동 마크 모드: 분류기/사용자가 파일 변경 없이 노드를 dirty 로 (그 뒤 전파) ──
//    사용: node gates/graph-stop.mjs --mark <spec|design|implement|...>
//    분류기가 판정한 level 을 이걸로 찍으면, 재작업 범위는 전파가 파생한다.
const markIdx = process.argv.indexOf("--mark");
if (markIdx !== -1) {
  const node = process.argv[markIdx + 1];
  if (!topLevel(GRAPH).includes(node)) {
    console.error(`--mark: 알 수 없는 노드 '${node}'. 후보: ${topLevel(GRAPH).join(", ")}`);
    process.exit(1);
  }
  const s = loadState();
  propagate(s, node, GRAPH);              // 자신+자식+전이하류 dirty (규칙 하나)
  persist(s);
  const fr = frontier(s);
  console.log(`● mark(${node}) → dirty 전파. 프론티어: ${fr.length ? fr.join(", ") : "없음"}`);
  process.exit(0);
}

// ═══ 파이프라인 ═══════════════════════════════════════════════
// 1) 게이트 실행 (전체: tsc·test 포함), 에러 수집 — 아직 exit 안 함
const g = spawnSync("node", [join(ROOT, "gates", "run-gates.mjs")], { cwd: ROOT, encoding: "utf-8" });
const gateErrors = parseGateErrors((g.stdout ?? "") + "\n" + (g.stderr ?? ""));

const state = loadState();

// 2) sync: 해시 변경 감지 → 전파 (사인오프 마커는 변경-트리거 아님 → 제외)
const changed = [];
for (const u of allUnits()) {
  if (u.signoff) continue;
  const h = hashNode(u.produces);
  if (h !== null && h !== state[u.id]?.hash) changed.push(u.id);
}
for (const id of changed) markUnitDirty(state, id);

// 3) release: 상류 clean + 프론트매터 + 게이트 에러 0 인 dirty 단위를 clean
//    처리 순서 = 상류 먼저(topoSort). 자식은 부모 슬롯에서 처리.
const unitsByParent = new Map();
for (const u of allUnits()) {
  const p = unitParent(u.id);
  if (!unitsByParent.has(p)) unitsByParent.set(p, []);
  unitsByParent.get(p).push(u);
}
for (const parent of topoSort(GRAPH)) {
  for (const u of unitsByParent.get(parent) ?? []) {
    if (state[u.id].status !== "dirty") continue;
    if (!GRAPH[parent].depends_on.every((up) => state[up].status === "clean")) continue;
    const ok = u.signoff
      ? signoffOK(u.signoff)                                            // 비결정론: 마커+basis
      : frontmatterOK(u.clean_when) && existsNonemptyOK(u.clean_when)   // 결정론 게이트
        && !gateBlocked(u.clean_when, u.produces, gateErrors);
    if (!ok) continue;
    state[u.id] = { status: "clean", hash: hashNode(u.produces) };
  }
  // 병렬 부모는 자식 처리 '직후' 집계 확정 — 하류(implement)가 이걸 보고 판정하므로 즉시여야 한다.
  const kids = childrenOf(GRAPH, parent);
  if (kids.length) state[parent] = kids.every((k) => state[k].status === "clean")
    ? { status: "clean", hash: null } : { status: "dirty", hash: null };
}

// 4) 저장
persist(state);

// 5) qa 실패 안내 (분류기는 모델/사용자가 파견 — 스크립트는 신호만)
const f = frontier(state);
if (state.qa.status === "dirty" && gateErrors.some((e) => ["test", "spec-coverage"].includes(e.cat))) {
  console.log("↩ qa dirty + 검증 실패 — 분류기(qa-classifier) 필요: 실패를 spec/design/impl 레벨로 귀속해 해당 노드 mark-dirty.");
}
console.log(`● HANDOFF 갱신 (${relative(ROOT, HANDOFF)}). 프론티어: ${f.length ? f.join(", ") : "없음(전부 clean)"}`);
// 사인오프 노드(review·deploy)가 프론티어면, 마커에 찍을 basis 를 안내(리뷰/배포 수행자용).
for (const n of topLevel(GRAPH)) {
  const so = GRAPH[n].clean_when?.signoff;
  if (so && state[n].status === "dirty" && GRAPH[n].depends_on.every((u) => state[u].status === "clean"))
    console.log(`  ↳ ${n} 사인오프 대기: ${so.marker} 에 '${so.require}' + 'basis: ${hashNode(GRAPH[so.basis_of].produces)}' 기록 시 clean`);
}

// 6) 남은 게이트 에러 있으면 기존처럼 차단
if (g.status === 2) {
  console.error("게이트 실패가 남아 있다 — 새 기능 금지, 위반만 수정 (run-gates 출력 참조).");
  process.exit(2);
}
