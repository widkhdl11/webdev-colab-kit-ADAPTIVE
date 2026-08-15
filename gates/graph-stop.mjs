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
import { GRAPH, GATE_KIND } from "../graph.mjs";
import { topLevel, childrenOf, propagate, descendants, recomputeParents, markDirty, markRework, markNa, topoSort, isSatisfied, isPending } from "./propagate.mjs";

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
    (n) => isPending(state[n].status) && GRAPH[n].depends_on.every((u) => isSatisfied(state[u].status))
  );
}
// n/a 목록 — "비어 있음"과 "이번 작업엔 해당 없음(사유)"은 다른 말이다.
function naList(state) {
  return topLevel(GRAPH).filter((n) => state[n].status === "n/a").map((n) => `${n}(${state[n].reason ?? "사유 없음"})`);
}
// rework 목록 — "아직 안 함"과 "했다가 취소됨(사유)"도 다른 말이다. 사유가 안 보이면 왜 거부됐는지 다음 세션이 모른다.
function reworkList(state) {
  return topLevel(GRAPH).filter((n) => state[n].status === "rework").map((n) => `${n}(${state[n].reason ?? "사유 없음"})`);
}
function persist(state) {
  if (!existsSync(dirname(HANDOFF))) mkdirSync(dirname(HANDOFF), { recursive: true });
  const f = frontier(state);
  const na = naList(state);
  const rw = reworkList(state);
  const body =
    `# HANDOFF.md — 그래프 런타임 상태 (graph-stop.mjs 가 자동 갱신 — 손으로 편집 금지)\n\n` +
    `# 토폴로지는 루트 graph.mjs. 여기는 dirty/hash 상태만 담는다(학습·이유는 LESSONS/DECISIONS).\n` +
    `# 프론티어(지금 작업할 노드, 파생값): ${f.length ? f.join(", ") : "없음 — 전부 clean"}\n` +
    (rw.length ? `# rework(통과했다가 취소됨): ${rw.join(", ")}\n` : "") +
    (na.length ? `# n/a(이번 작업엔 해당 없음): ${na.join(", ")}\n` : "") +
    "\n```json\n" + JSON.stringify(state, null, 2) + "\n```\n";
  writeFileSync(HANDOFF, body);
}

// ── 자식 포함 dirty 마킹 (해시 트리거는 세밀하게: 바뀐 자식만) ──────
// rework 인 노드는 rework 로 남긴다 — 재작업 중에 그 노드의 파일을 고치는 건 당연한 일인데,
// 그때마다 dirty 로 풀리면 거부 사실이 사라지고 턴이 다시 막힌다. rework 는 --mark 로만 켜지고
// release(조건 충족)로만 꺼진다.
function markUnitDirty(state, unit) {
  const keep = state[unit]?.status === "rework" ? { ...state[unit], hash: null } : null;
  if (unit.includes("/")) {
    state[unit] = keep ?? { status: "dirty", hash: null };  // 바뀐 자식만
    const parent = unitParent(unit);
    state[parent] = { status: "dirty", hash: null };        // 부모 집계 — release 뒤 recomputeParents 가 다시 정한다
    for (const d of descendants(parent, GRAPH)) markDirty(state, d, GRAPH); // 부모의 하류
  } else {
    if (keep) {
      state[unit] = keep;
      for (const c of childrenOf(GRAPH, unit)) state[c] = { ...keep };
      for (const d of descendants(unit, GRAPH)) markDirty(state, d, GRAPH);
    } else {
      propagate(state, unit, GRAPH);                        // 톱레벨: 자기+자식+하류
    }
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
// frontmatter 의 목록 필드를 읽는다: `key: [a, b]` 와 `key:` 다음 줄부터의 `- a` 둘 다.
function fmList(fmText, key) {
  const m = fmText.match(new RegExp(`^[ \\t]*${key}:[ \\t]*(.*)$`, "m"));
  if (!m) return null;                       // 필드 자체가 없음(빈 목록과 구분한다)
  const clean = (s) => s.split(",").map((x) => x.trim().replace(/['"]/g, "")).filter((x) => /^[A-Za-z][\w-]*$/.test(x));
  const br = m[1].trim().match(/^\[([^\]]*)\]/);
  if (br) return clean(br[1]);
  if (m[1].trim() && !m[1].trim().startsWith("#")) return clean(m[1].split("#")[0]);
  const rest = fmText.slice(fmText.indexOf(m[0]) + m[0].length).split("\n").slice(1);
  const out = [];
  for (const line of rest) {
    const li = line.match(/^[ \t]*-[ \t]*([A-Za-z][\w-]*)/);
    if (!li) break;
    out.push(li[1]);
  }
  return out;
}

// 사인오프(review·deploy): 마커에 require 문구 + basis(구현 해시)가 현재와 일치해야 clean.
// 구현이 바뀌면 basis 불일치 → 낡음. 마커 없으면 미승인 → dirty.
// review 는 여기에 더해 '누가 리뷰했는가'를 요구한다(graph.mjs 의 require_reviewer).
// 왜 필요한가: basis 는 graph-stop 이 화면에 찍어주는 값이라, 그것만 검사하면 리뷰를 돌린 것과
// 두 줄을 적은 것이 구분되지 않는다. 표면별 판단으로 파견 여부를 모델에 맡긴 만큼 기록은 대조한다.
// 실패 이유를 문자열로 돌려준다 — "왜 안 되는지"가 안 보이면 사용자가 고칠 수 없다.
function signoffCheck(so, detectedSurfaces) {
  const files = matchProduces([so.marker]);
  if (!files.length) return { ok: false, why: `${so.marker} 없음` };
  const fm = readFileSync(join(projDir, files[0]), "utf-8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return { ok: false, why: `${so.marker} 에 frontmatter 없음` };
  const [k, v] = so.require.split(":").map((x) => x.trim());
  if (!new RegExp(`${k}:\\s*${v}`).test(fm[1])) return { ok: false, why: `'${so.require}' 없음` };
  const bm = fm[1].match(/basis:\s*(\w+)/);
  const want = hashNode(GRAPH[so.basis_of].produces);
  if (!bm || bm[1] !== want)
    return { ok: false, why: bm ? `basis 불일치 (기록 ${bm[1]} ≠ 현재 ${want}) — 구현이 바뀌었으니 다시 봐야 한다` : "basis 없음" };
  if (so.reviewers_field) {
    const reviewers = fmList(fm[1], so.reviewers_field);
    if (reviewers === null || reviewers.length === 0)
      return { ok: false, why: `${so.reviewers_field}: 필드가 없거나 비었다 — 어떤 리뷰어를 돌렸는지 적어야 사인오프다` };
    for (const [reviewer, surfaces] of Object.entries(so.require_reviewer ?? {})) {
      const touched = surfaces.filter((s) => detectedSurfaces.has(s));
      if (touched.length > 0 && !reviewers.includes(reviewer))
        return {
          ok: false,
          why: `코드에 ${touched.join("·")} 표면이 있는데 ${so.reviewers_field} 에 ${reviewer} 가 없다 ` +
            `(기록: ${reviewers.join(", ")}). 파견하고 결과를 적거나, 표면이 사라졌으면 그때 다시 사인오프한다`,
        };
    }
  }
  return { ok: true };
}

// ── 수동 마크 모드: 분류기/사용자가 파일 변경 없이 노드를 dirty 로 (그 뒤 전파) ──
//    사용: node gates/graph-stop.mjs --mark <spec|design|implement|...> ["<사유 한 줄>"]
//    분류기가 판정한 level 을 이걸로 찍으면, 재작업 범위는 전파가 파생한다.
//
//    dirty 냐 rework 냐는 선언하지 않는다 — 지금 상태에서 파생한다.
//    clean 인 노드를 mark = 통과했던 판정을 취소하는 것(rework) / 이미 dirty 인 노드를 mark = 그대로 dirty.
//    그래서 "한 번도 승인 안 받은 것"은 rework 가 될 수 없고, 선행 게이트가 그대로 막는다.
const markIdx = process.argv.indexOf("--mark");
if (markIdx !== -1) {
  const node = process.argv[markIdx + 1];
  const reason = process.argv.slice(markIdx + 2).join(" ").trim();
  if (!topLevel(GRAPH).includes(node)) {
    console.error(`--mark: 알 수 없는 노드 '${node}'. 후보: ${topLevel(GRAPH).join(", ")}`);
    process.exit(1);
  }
  const s = loadState();
  const wasClean = s[node]?.status === "clean";
  if (wasClean) markRework(s, node, reason, GRAPH);         // 자신 + 병렬 자식
  else markDirty(s, node, GRAPH);
  for (const d of descendants(node, GRAPH)) markDirty(s, d, GRAPH);  // 하류는 거부된 게 아니라 상류가 흔들린 것
  persist(s);
  const fr = frontier(s);
  console.log(`● mark(${node}) → ${wasClean ? "rework" : "dirty"} 전파. 프론티어: ${fr.length ? fr.join(", ") : "없음"}`);
  if (wasClean && !reason)
    console.log(`  ↳ 사유가 비었다 — 몇 턴 뒤엔 왜 취소됐는지 아무도 근거를 못 댄다: --mark ${node} "<사유 한 줄>"`);
  process.exit(0);
}

// ── n/a 모드: "이번 작업엔 이 노드가 해당 없음"을 사유와 함께 선언/해제 ──
//    사용: node gates/graph-stop.mjs --na <노드> "<사유 한 줄>"
//          node gates/graph-stop.mjs --na-clear <노드>
//    n/a 는 clean 처럼 하류를 놓아주지만 clean 이 아니다 — 브리핑·HANDOFF 에 사유가 그대로 남는다.
const naIdx = process.argv.indexOf("--na");
if (naIdx !== -1) {
  const node = process.argv[naIdx + 1];
  const reason = process.argv.slice(naIdx + 2).join(" ").trim();
  if (!topLevel(GRAPH).includes(node)) {
    console.error(`--na: 알 수 없는 노드 '${node}'. 후보: ${topLevel(GRAPH).join(", ")}`);
    process.exit(1);
  }
  const s = loadState();
  try { markNa(s, node, reason, GRAPH); } catch (e) { console.error(`--na: ${e.message}`); process.exit(1); }
  persist(s);
  const fr = frontier(s);
  console.log(`● ${node} = n/a — ${reason}`);
  console.log(`  판단이 틀리면 기계가 취소한다: 산출물이 생기거나, 상류가 바뀌거나, risk-surface 게이트가 위험 패턴을 잡으면 dirty 로 돌아온다.`);
  console.log(`  프론티어: ${fr.length ? fr.join(", ") : "없음"}`);
  process.exit(0);
}
const naClearIdx = process.argv.indexOf("--na-clear");
if (naClearIdx !== -1) {
  const node = process.argv[naClearIdx + 1];
  if (!topLevel(GRAPH).includes(node)) {
    console.error(`--na-clear: 알 수 없는 노드 '${node}'. 후보: ${topLevel(GRAPH).join(", ")}`);
    process.exit(1);
  }
  const s = loadState();
  propagate(s, node, GRAPH);              // n/a 해제 = 다시 해야 할 일 → dirty + 하류 전파
  persist(s);
  console.log(`● ${node} n/a 해제 → dirty. 프론티어: ${frontier(s).join(", ") || "없음"}`);
  process.exit(0);
}

// ═══ 파이프라인 ═══════════════════════════════════════════════
// 1) 게이트 실행 (전체: tsc·test 포함), 에러 수집 — 아직 exit 안 함
const g = spawnSync("node", [join(ROOT, "gates", "run-gates.mjs")], { cwd: ROOT, encoding: "utf-8" });
const gateOut = (g.stdout ?? "") + "\n" + (g.stderr ?? "");
const gateErrors = parseGateErrors(gateOut);
// 위험 표면 예외(⚠)는 게이트를 통과시키지만 여기서 삼키면 아무도 모르게 방벽이 사라진다.
// run-gates 출력은 이 프로세스가 캡처하므로, 통과했어도 예외 줄만은 그대로 올려보낸다.
for (const line of gateOut.split("\n")) if (line.startsWith("⚠")) console.log(line);
// 게이트가 신고한 '코드에 존재하는 위험 표면' — review 사인오프 판정에 쓴다(활성 프로젝트 것만).
const detectedSurfaces = new Set();
for (const line of gateOut.split("\n")) {
  const m = line.match(/^ℹ \[risk-surface\/DETECTED\]\s+(\S+)\s+—\s+(.+)$/);
  if (m && m[1].split("/")[1] === active) for (const s of m[2].split(",")) detectedSurfaces.add(s.trim());
}

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
    if (!isPending(state[u.id].status)) continue;   // n/a 는 release 대상이 아니다(이미 하류를 놓아준 상태). rework 는 dirty 와 같이 취급 — 조건을 채우면 clean 으로 풀린다
    if (!GRAPH[parent].depends_on.every((up) => isSatisfied(state[up].status))) continue;
    const ok = u.signoff
      ? signoffCheck(u.signoff, detectedSurfaces).ok                    // 비결정론: 마커+basis+리뷰어 기록
      : frontmatterOK(u.clean_when) && existsNonemptyOK(u.clean_when)   // 결정론 게이트
        && !gateBlocked(u.clean_when, u.produces, gateErrors);
    if (!ok) continue;
    state[u.id] = { status: "clean", hash: hashNode(u.produces) };
  }
  // 병렬 부모는 자식 처리 '직후' 집계 확정 — 하류(implement)가 이걸 보고 판정하므로 즉시여야 한다.
  // 자식이 전부 n/a 면 부모도 n/a (clean 과 구분해서 보여야 하므로 집계를 recomputeParents 와 같은 규칙으로).
  if (childrenOf(GRAPH, parent).length) recomputeParents(state, GRAPH);
}

// 3.5) n/a 자동 취소 — 생략 판단은 모델이 하고, 생략이 틀렸다는 감지는 기계가 한다.
//      risk-surface 게이트가 위험 패턴을 잡았다는 건 "이번 작업엔 스펙이 해당 없다"는 판단이 틀렸다는 뜻이다.
//      release 뒤에 찍는다 — 그래야 이번 턴에 clean 으로 내려간 spec 도 다시 dirty 로 돌아온다.
const riskErrors = gateErrors.filter((e) => e.cat === "risk-surface");
// (rework 는 이미 '안 끝난 상태'라 다시 찍지 않는다 — 찍으면 거부 사유만 지워진다)
if (riskErrors.length > 0 && isSatisfied(state.spec.status)) {
  const was = state.spec.status;
  const why = state.spec.reason;
  propagate(state, "spec", GRAPH);
  console.error(
    was === "n/a"
      ? `↩ spec n/a 취소 (사유였던 것: ${why ?? "기록 없음"}) — risk-surface 가 위험 패턴 ${riskErrors.length}건을 잡았다. ` +
          `위험 표면이 실제로 닿았으므로 스펙은 생략 대상이 아니다. /spec 으로 불변식부터 쓴다.`
      : `↩ spec → dirty — risk-surface 가 위험 패턴 ${riskErrors.length}건을 잡았다(스펙 없이 위험 표면 진입). /spec 으로 불변식부터 쓴다.`,
  );
}

// 4) 저장
persist(state);

// 5) qa 실패 안내 (분류기는 모델/사용자가 파견 — 스크립트는 신호만)
const f = frontier(state);
if (state.qa.status === "dirty" && gateErrors.some((e) => ["test", "spec-coverage"].includes(e.cat))) {
  console.log("↩ qa dirty + 검증 실패 — 분류기(qa-classifier) 필요: 실패를 spec/design/impl 레벨로 귀속해 해당 노드 mark-dirty.");
}
console.log(`● HANDOFF 갱신 (${relative(ROOT, HANDOFF)}). 프론티어: ${f.length ? f.join(", ") : "없음(전부 clean)"}`);
const rw = reworkList(state);
if (rw.length) console.log(`  ↳ rework(통과했다가 취소됨): ${rw.join(", ")}`);
const na = naList(state);
if (na.length) console.log(`  ↳ n/a(이번 작업엔 해당 없음): ${na.join(", ")}`);
// 사인오프 노드(review·deploy)가 프론티어면 무엇이 모자란지 그대로 알린다.
// basis 해시만 찍어주면 "그 줄만 적으면 통과"로 읽힌다 — 모자란 조건을 같이 말한다.
for (const n of topLevel(GRAPH)) {
  const so = GRAPH[n].clean_when?.signoff;
  if (!so || !isPending(state[n].status) || !GRAPH[n].depends_on.every((u) => isSatisfied(state[u].status))) continue;
  const chk = signoffCheck(so, detectedSurfaces);
  console.log(`  ↳ ${n} 사인오프 대기 — 막힌 이유: ${chk.why ?? "(없음)"}`);
  const need = [`'${so.require}'`, `'basis: ${hashNode(GRAPH[so.basis_of].produces)}'`];
  if (so.reviewers_field) {
    const req = Object.entries(so.require_reviewer ?? {})
      .filter(([, surfaces]) => surfaces.some((s) => detectedSurfaces.has(s)))
      .map(([r]) => r);
    need.push(`'${so.reviewers_field}: [실제로 돌린 리뷰어]'${req.length ? ` — 이 코드는 ${req.join("·")} 를 포함해야 한다` : ""}`);
  }
  console.log(`     ${so.marker} 에 ${need.join(" + ")} 기록 시 clean`);
}

// 6) 남은 게이트 에러 → 차단 여부 판정
//
// 기본은 차단이다. 다만 **그래프가 지금 처방한 상태에서 비롯된 실패**는 안내로 낮춘다.
// 그런 실패를 차단으로 두면 푸는 유일한 길(사용자 승인·다음 세션의 구현)이 턴을 끝내야 도달하는데
// 그 턴이 안 끝난다 — 질문도 wrap-up 도 차단 메시지에 걸린다. 실제로 3번 관찰됐고 2번은 회피했다.
// 판정 재료는 새로 만들지 않았다: graph.mjs 의 GATE_KIND(카테고리 성격 + owner) 와 HANDOFF 의 노드 상태.
//
// 낮춰도 강제력은 남는다 — 노드는 여전히 dirty/rework 이고, 하류(implement·qa·review·deploy)는 그대로 막혀 있고,
// 프론티어도 그 노드를 계속 가리킨다. 푸는 게 아니라 '턴을 끝내는 것'만 허용한다.
function downgradeReason(cat) {
  const def = GATE_KIND[cat];
  if (!def) return null;                                   // 목록에 없는 카테고리는 무조건 차단
  const st = state[def.owner]?.status;
  if (def.kind === "completion" && isPending(st))
    return `${def.owner} 가 아직 안 끝났고(${st}) 그래서 하류가 이미 전부 막혀 있다 — 턴 차단은 중복이다`;
  if (def.kind === "precondition" && st === "rework")
    return `${def.owner} 가 rework(${state[def.owner]?.reason ?? "사유 없음"}) — 재승인은 턴을 끝내야 받는다`;
  return null;
}
if (g.status === 2) {
  const byCat = new Map();                                  // 카테고리 → 낮출 사유(없으면 null = 차단)
  for (const e of gateErrors) if (!byCat.has(e.cat)) byCat.set(e.cat, downgradeReason(e.cat));
  const blocking = [...byCat].filter(([, why]) => !why).map(([c]) => c);
  const lowered = [...byCat].filter(([, why]) => why);
  // 에러를 하나도 못 파싱했으면 판정할 근거가 없다 → 예전처럼 막는다(모르면 막는 쪽).
  if (gateErrors.length === 0 || blocking.length > 0) {
    for (const [cat, why] of lowered)
      console.error(`⚠ [graph/EXPECTED] ${cat} 은 처방된 상태에서 비롯됐다(${why}). 이번 차단의 이유는 ${blocking.join("·") || "파싱 불가"} 다.`);
    console.error("게이트 실패가 남아 있다 — 새 기능 금지, 위반만 수정 (run-gates 출력 참조).");
    process.exit(2);
  }
  // 남은 실패가 전부 처방된 것 → 턴은 끝낸다. 조용히 넘기지 않는다: 매 턴 ⚠ 로 찍는다(risk-surface 예외와 같은 취급).
  for (const [cat, why] of lowered)
    console.error(`⚠ [graph/EXPECTED] ${cat} 실패가 남았지만 턴은 막지 않는다 — ${why}.`);
  console.error(
    `   하류는 그대로 막혀 있다. 다음에 할 일: ${f.length ? f.join(", ") : "없음"} — 진행이 아니라 턴 종료만 허용된 것이다.`,
  );
}
