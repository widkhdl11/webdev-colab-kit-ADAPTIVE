#!/usr/bin/env node
// @check-role: on-change
// @check-guards: docs/references/node-skills.json, graph.mjs
//
//   이 검사가 도는 자리는 둘이다. 위 두 파일이 바뀔 때(여기 적힌 배선), 그리고
//   report-dashboard 스킬 디렉터리가 바뀔 때 — 그쪽 배선은 바인딩 파일의
//   `contract` 가 들고 있다(docs/references/node-skills.json). 같은 지도를 두 벌
//   두지 않으려고 여기에 스킬 디렉터리를 다시 적지 않는다.
//
//   전에는 `standing` 이라고 선언돼 있었는데, 등록부가 호출처로 인정한 것은 SKILL.md 에
//   이 파일 이름이 적혀 있다는 사실뿐이었다 — 실제로는 한 번도 안 돌았다(2026-09-15 실측).
//
// check-report.mjs — report-dashboard 스킬의 계약 테스트.
//
// 무엇을 지키는 검사인가:
//   대시보드는 사람이 "지금 뭘 하는지" 알려고 켜 두는 화면이다. 그래서 틀렸을 때의 증상이
//   에러가 아니라 **그럴듯한 화면**이다 — 노드가 엉뚱한 데서 빛나거나, 체류 시간이 조용히
//   틀리거나, 활동 줄이 그냥 안 쌓인다. 셋 다 보고 있어도 모른다.
//
//   그래서 항목마다 **위반을 일부러 심어 잡히는 것까지 본다.** "위반 0건"이라는 보고와
//   검사가 아예 안 돈 것은 겉이 같다.
//
// 이 검사는 이 스킬의 계약 테스트다 — 훅 스크립트·index.html·설치 절차·기록 규약 중
// 무엇을 고치든 고친 뒤에 다시 통과해야 한다.
//
// 사용: node scripts/check-report.mjs [--project <slug>]
// 프로브는 전부 임시 디렉터리에서 돈다. 이 레포의 파일은 하나도 건드리지 않는다.

import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { GRAPH } from "../graph.mjs";
import { deriveWorkflow, validateState, validateTransition, dwellByNode, pairingErrors, bindingErrors, chainErrors, parseJsonl, NOW_MAX } from "./lib/report-model.mjs";
import { mergeActivityHook } from "./report-install-hook.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, ".claude", "skills", "report-dashboard", "assets");

const results = [];
const ok = (id, msg) => results.push({ id, pass: true, msg });
const bad = (id, msg) => results.push({ id, pass: false, msg });
const check = (id, cond, okMsg, badMsg) => (cond ? ok(id, okMsg) : bad(id, badMsg));

function arg(n) {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function activeSlug() {
  try { return readFileSync(join(ROOT, "ACTIVE"), "utf-8").trim(); } catch { return ""; }
}
const SLUG = (arg("project") ?? activeSlug()).trim();
const REPORT = SLUG ? join(ROOT, "projects", SLUG, "report") : "";
const INSTALLED = REPORT !== "" && existsSync(join(REPORT, "workflow.json"));

const tmpRoots = [];
function tmp(prefix) {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tmpRoots.push(d);
  return d;
}

const BINDINGS_PATH = join(ROOT, "docs", "references", "node-skills.json");
const SKILLS_DIR = join(ROOT, ".claude", "skills");
let BINDINGS = [];
let bindingsReadError = null;
try {
  BINDINGS = JSON.parse(readFileSync(BINDINGS_PATH, "utf-8")).bindings ?? [];
} catch (e) {
  bindingsReadError = e.message;
}
const skillDirs = () => {
  try {
    return readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch {
    return [];
  }
};
const DERIVED = deriveWorkflow(GRAPH, BINDINGS);
const RENDER_EXPORTS = await import(pathToFileURL(join(ASSETS, "render.mjs")).href);
const {
  layout: layoutRef, nodeState: nodeStateRef, nodePanel: nodePanelRef,
  subagentView: subagentViewRef, requestView: requestViewRef,
  itemStrip: itemStripRef, delayDiagnosis: delayDiagnosisRef,
  reportConfig: reportConfigRef, DEFAULT_REPORT_CONFIG, itemIntervals: itemIntervalsRef,
  nowRows: nowRowsRef, progressView: progressViewRef, noticeRows: noticeRowsRef,
  summaryRows: summaryRowsRef, subagentSection: subagentSectionRef,
  mapView: mapViewRef, feedStageText: feedStageTextRef,
} = RENDER_EXPORTS;
// 화면 어휘표. 검사는 이 표를 **정답지로** 쓴다 — 화면에 나간 라벨이 여기 없으면 위반이다.
const { ALL_LABELS, INTERNAL_TERMS, TERM: VOCAB_TERM } = await import(pathToFileURL(join(ASSETS, "ui-vocab.mjs")).href);
const { validateRequest, frozenItemsErrors, itemsFromSpec, TITLE_MAX: TITLE_MAX_MODEL } = await import(pathToFileURL(join(ROOT, "scripts", "lib", "request-model.mjs")).href);
const { validateDecision, blockerLinkErrors, parseVocab, FIELD_MAX } = await import(pathToFileURL(join(ROOT, "scripts", "lib", "decision-model.mjs")).href);
const { decisionCard: decisionCardRef, answeredDecisionRow: answeredDecisionRowRef } = RENDER_EXPORTS;

// ── 1. workflow.json 이 그래프 선언과 맞는가 ─────────────────────────────
{
  const id = "1 구조";
  if (!INSTALLED) {
    bad(id, `설치된 프로젝트가 없다(${SLUG || "slug 미정"}). 스킬을 먼저 돌린다 — 검사할 것이 없는 것은 통과가 아니다`);
  } else {
    const onDisk = JSON.parse(readFileSync(join(REPORT, "workflow.json"), "utf-8"));
    // agents 는 그래프 선언이 아니라 에이전트 정의 파일에서 오므로 여기 비교에서 뺀다
    // (그쪽이 맞는지는 12절이 정의 파일과 직접 대조한다).
    const shape = (w) => JSON.stringify({ nodes: w.nodes, edges: w.edges, skills: w.skills });
    const same = onDisk.nodes?.length === DERIVED.nodes.length && onDisk.edges?.length === DERIVED.edges.length
      && shape(onDisk) === shape(DERIVED);
    check(id, same,
      `workflow.json 이 선언과 같다 (노드 ${DERIVED.nodes.length} · 엣지 ${DERIVED.edges.length})`,
      `workflow.json 이 낡았다 — 디스크 노드 ${onDisk.nodes?.length}/엣지 ${onDisk.edges?.length} vs 선언 ${DERIVED.nodes.length}/${DERIVED.edges.length}. node scripts/export-workflow.mjs 를 다시 돌린다`);

    // 심은 위반: 디스크 쪽에 엣지를 하나 뺀 파일을 실제로 만들어 같은 판정 경로에 넣는다.
    // (예전 프로브는 두 객체를 stringify 해 비교하기만 해서, deriveWorkflow 가 무엇을 내놓든
    //  항상 통과했다 — 지워도 아무것도 안 달라지는 항목이었다)
    const fx = tmp("report-wf-");
    writeFileSync(join(fx, "workflow.json"), JSON.stringify({ nodes: DERIVED.nodes, edges: DERIVED.edges.slice(1) }, null, 2), "utf-8");
    const caught = shape(JSON.parse(readFileSync(join(fx, "workflow.json"), "utf-8"))) !== shape(DERIVED);
    check("1 프로브", caught, "엣지를 하나 뺀 파일을 낡았다고 판정한다", "심은 어긋남을 못 잡는다 — 이 항목은 무효다");
  }

  // 파생 함수 자체가 틀린 것은 위 비교로 영영 안 잡힌다 — 파일을 다시 내보내면 둘 다 같이 틀리기
  // 때문이다. 그래서 선언에 대한 고정 사실을 여기 박아 둔다(report-contract 1절의 kind 어휘).
  const byId = new Map(DERIVED.nodes.map((n) => [n.id, n]));
  check("1 어휘", byId.get("product")?.kind === "root" && byId.get("design")?.kind === "aggregate"
        && byId.get("design/page-designer")?.kind === "child" && byId.get("design/page-designer")?.parent === "design"
        && byId.get("qa")?.kind === "step"
        && DERIVED.nodes.every((n) => ["root", "step", "aggregate", "child"].includes(n.kind))
        && DERIVED.edges.some((e) => e.from === "product" && e.to === "spec")
        && DERIVED.edges.some((e) => e.from === "design/page-designer" && e.to === "design"),
    "파생이 kind 어휘와 부모·엣지 방향을 지킨다",
    `파생이 어긋났다: product=${byId.get("product")?.kind} design=${byId.get("design")?.kind} 자식부모=${byId.get("design/page-designer")?.parent}`);
}

// ── 2. state.json 스키마 ────────────────────────────────────────────────
{
  const id = "2 state";
  const good = { session_id: "s1", current_node: "implement", task: "t1", now: "구현 중", since: new Date().toISOString(), blockers: [], skill: null, delay_reason: null };
  check(id, validateState(good, DERIVED).length === 0, "정상 state 는 통과한다", `정상 state 가 거부됐다: ${validateState(good, DERIVED).join(" / ")}`);

  const planted = [
    ["필수 필드 누락", { ...good, task: undefined }],
    ["없는 노드", { ...good, current_node: "no-such-node" }],
    ["blockers 모양", { ...good, blockers: [{ id: "x" }] }],
    ["since 형식", { ...good, since: "어제쯤" }],
  ];
  for (const [what, s] of planted) {
    check(`2 프로브(${what})`, validateState(s, DERIVED).length > 0,
      `심은 위반(${what})을 잡는다`, `심은 위반(${what})이 통과했다 — 스키마 검증이 비어 있다`);
  }

  if (INSTALLED && existsSync(join(REPORT, "state.json"))) {
    const real = JSON.parse(readFileSync(join(REPORT, "state.json"), "utf-8"));
    const workflow = JSON.parse(readFileSync(join(REPORT, "workflow.json"), "utf-8"));
    const errs = validateState(real, workflow);
    check("2 현행", errs.length === 0, "설치된 state.json 이 스키마를 지킨다", `설치된 state.json 위반: ${errs.join(" / ")}`);

    // transitions.jsonl 이 없어도 읽는다. 없는 상태가 바로 "짝이 깨진 상태"라서, 그걸
    // ENOENT 로 죽는 대신 정상 실패로 신고해야 한다(죽으면 결과 출력도 tmp 정리도 안 돈다).
    const transText = existsSync(join(REPORT, "transitions.jsonl")) ? readFileSync(join(REPORT, "transitions.jsonl"), "utf-8") : "";
    const { rows, broken } = parseJsonl(transText);
    const pair = pairingErrors(real, rows);
    check("2 현행 짝", pair.length === 0,
      `설치본의 state 와 전환 이력이 짝·체인을 지킨다 (전환 ${rows.length}건)`,
      `설치본의 짝/체인이 깨졌다: ${pair.join(" / ")}`);
    check("2 현행 줄", broken.length === 0,
      "전환 이력에 못 읽은 줄이 없다",
      `전환 이력에서 못 읽은 줄: ${broken.join(", ")}번째 — 부분 쓰기이거나 손으로 고친 자국이다`);
  }
}

// ── 3. 훅 스크립트가 활동 한 줄을 덧붙이는가 ─────────────────────────────
{
  const id = "3 훅";
  const root = tmp("report-hook-");
  writeFileSync(join(root, "ACTIVE"), "fx", "utf-8");
  const dir = join(root, "projects", "fx", "report");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "activity.jsonl"), "", "utf-8");

  const hook = join(ASSETS, "report-activity.mjs");
  const input = JSON.stringify({
    session_id: "sess-1", cwd: root, hook_event_name: "PostToolUse",
    tool_name: "Edit", tool_input: { file_path: "projects/fx/src/app.ts" },
  });
  const r = spawnSync(process.execPath, [hook], { input, encoding: "utf-8" });
  const { rows } = parseJsonl(readFileSync(join(dir, "activity.jsonl"), "utf-8"));
  check(id, r.status === 0 && rows.length === 1 && rows[0].tool === "Edit" && rows[0].target === "projects/fx/src/app.ts" && Number.isFinite(Date.parse(rows[0].at)),
    "가짜 훅 입력 하나가 활동 한 줄이 된다",
    `활동 줄이 안 맞는다 (exit ${r.status}, ${rows.length}줄): ${JSON.stringify(rows[0] ?? null)} ${r.stderr ?? ""}`);

  // 심은 조건: report/ 가 없는 프로젝트에는 아무것도 만들지 않는다(설치 안 한 곳을 오염시키지 않는다)
  const bare = tmp("report-bare-");
  writeFileSync(join(bare, "ACTIVE"), "fx", "utf-8");
  const r2 = spawnSync(process.execPath, [hook], { input: JSON.stringify({ cwd: bare, tool_name: "Edit", tool_input: {} }), encoding: "utf-8" });
  check("3 프로브(미설치)", r2.status === 0 && !existsSync(join(bare, "projects")),
    "설치 안 된 레포에는 아무것도 안 만들고 조용히 끝낸다", "미설치 레포에 파일을 만들었다");

  // 심은 조건: 입력이 깨져도 훅이 실패하지 않는다 (관찰이 관찰 대상을 망가뜨리지 않는다)
  const r3 = spawnSync(process.execPath, [hook], { input: "{이건 JSON 이 아니다", encoding: "utf-8" });
  check("3 프로브(깨진 입력)", r3.status === 0, "깨진 입력에도 exit 0 이다", `깨진 입력에 exit ${r3.status} — 훅이 작업을 막는다`);
}

// ── 4. index.html 의 외부 의존과 설치본 일치 ─────────────────────────────
{
  const id = "4 의존";
  const html = readFileSync(join(ASSETS, "index.html"), "utf-8");
  const urls = [...html.matchAll(/https?:\/\/[^\s"')]+/g)].map((m) => m[0]);
  const hosts = new Set(urls.map((u) => new URL(u).host));
  check(id, hosts.size <= 1, `외부 의존은 ${hosts.size}곳이다 (${[...hosts].join(", ") || "없음"})`,
    `외부 의존이 ${hosts.size}곳이다 — CDN 하나만 허용한다: ${[...hosts].join(", ")}`);
  const hasBuildRef = (text) => /dist\/|bundle\.|\.min\.js["']|node_modules/.test(text.replace(/https?:\/\/[^\s"')]+/g, ""));
  check("4 빌드없음", !hasBuildRef(html), "빌드 산출물을 참조하지 않는다", "빌드 산출물 참조가 있다");
  check("4 프로브(빌드)", hasBuildRef(`${html}
<script src="dist/app.bundle.js"></script>`),
    "심은 빌드 산출물 참조를 잡는다", "심은 빌드 산출물 참조가 통과했다 — 이 항목은 무효다");

  // 붙여 놓은 훅이 정본과 갈라진 것도 사본 대조 대상이다. 없으면(아직 미배선) 건너뛰지 않고
  // 그 사실을 적는다 — "검사할 게 없다"와 "통과"는 다르다.
  // 훅은 **둘**이다(활동·서브에이전트). 예전엔 활동 훅만 대조해서, 서브에이전트 훅이 낡아도
  // 아무도 안 알려 줬다 — 2026-09-15 에 정본을 고쳤는데 붙어 있는 사본은 옛 코드로 계속 돌았고
  // 검사는 그대로 통과했다. 대조에서 빠진 파일은 「검사가 없다」가 아니라 「통과」로 보인다.
  for (const name of ["report-activity.mjs", "report-subagent.mjs"]) {
    const installedHook = join(ROOT, ".claude", "hooks", name);
    if (existsSync(installedHook)) {
      check(`4 사본(${name})`, readFileSync(installedHook, "utf-8") === readFileSync(join(ASSETS, name), "utf-8"),
        `붙어 있는 훅이 정본과 같다: ${name}`, `붙어 있는 훅이 정본과 갈라졌다 — 정본을 다시 복사한다: ${name}`);
    } else {
      ok(`4 사본(${name})`, `이 훅은 아직 안 붙어 있다 — 대조할 사본이 없다: ${name}`);
    }
  }

  if (INSTALLED) {
    // 새 자산을 여기 안 적으면 그 파일만 조용히 안 대조된다 — 「검사가 없다」가
    // 「통과」로 보이는 그 모양이다(훅 하나가 빠져 있던 2026-09-15 와 같은 자리).
    for (const name of ["index.html", "render.mjs", "ui-vocab.mjs"]) {
      const a = join(ASSETS, name), b = join(REPORT, name);
      if (!existsSync(b)) { bad(`4 사본(${name})`, `설치본이 없다: ${b}`); continue; }
      check(`4 사본(${name})`, readFileSync(a, "utf-8") === readFileSync(b, "utf-8"),
        `설치본이 정본과 같다`, `설치본이 정본과 갈라졌다 — 정본을 고치고 다시 설치한다: ${name}`);
    }
  }
}

// ── 5. 강조가 실제로 current_node 를 따라가는가 (새 렌더러 기준) ──────────
{
  const id = "5 강조";
  const base = { session_id: "s", task: "t", now: "n", since: new Date().toISOString(), blockers: [], skill: null, delay_reason: null };
  const stateOf = (nodeId, st) => layoutRef(DERIVED).nodes.map((n) => [n.id, nodeStateRef(n, st).kind]);

  const a = stateOf("implement", { ...base, current_node: "implement" });
  const b = stateOf("qa", { ...base, current_node: "qa" });
  const hit = (pairs, wanted) => pairs.filter(([, k]) => k !== "idle").map(([n]) => n).join(",") === wanted;
  check(id, hit(a, "implement") && hit(b, "qa"),
    "current_node 를 바꾸면 강조되는 노드가 정확히 그 하나로 바뀐다",
    `강조가 안 따라간다: ${JSON.stringify([a.filter(([, k]) => k !== "idle"), b.filter(([, k]) => k !== "idle")])}`);

  const blocked = stateOf("qa", { ...base, current_node: "qa", blockers: [{ id: "q1", label: "제목 범위" }] });
  check("5 프로브(대기)", blocked.some(([n, k]) => n === "qa" && k === "blocked"),
    "blocker 가 있으면 사람 입력 대기로 구분해 그린다", "blocker 가 있어도 보통 강조와 같다");

  const none = stateOf(null, { ...base, current_node: "no-such-node" });
  check("5 프로브(없는 노드)", none.every(([, k]) => k === "idle"),
    "없는 노드는 아무것도 강조하지 않는다", "없는 노드를 강조한다");
}

// ── 6. now 길이 제한 ────────────────────────────────────────────────────
{
  const id = "6 길이";
  const long = "가".repeat(NOW_MAX + 1);
  const s = { session_id: "s", current_node: "qa", task: "t", now: long, since: new Date().toISOString(), blockers: [], skill: null, delay_reason: null };
  const t = { at: new Date().toISOString(), from_node: null, to_node: "qa", task: "t", now: long, result: null };
  check(id, validateState(s, DERIVED).some((e) => e.includes(`${NOW_MAX}자`)) && validateTransition(t, DERIVED).some((e) => e.includes(`${NOW_MAX}자`)),
    `${NOW_MAX}자 초과를 state·transitions 양쪽에서 거부한다`, `${NOW_MAX}자 초과가 한쪽에서 통과한다`);
  const okLen = { ...s, now: "가".repeat(NOW_MAX) };
  check("6 프로브(경계)", validateState(okLen, DERIVED).length === 0, `정확히 ${NOW_MAX}자는 통과한다`, `${NOW_MAX}자가 거부됐다 — 경계가 하나 어긋났다`);
}

// ── 7. 훅 병합이 기존 설정을 보존하는가 ──────────────────────────────────
{
  const id = "7 병합";
  const fixture = {
    permissions: { deny: ["Read(./.env*)"] },
    hooks: {
      PostToolUse: [{ matcher: "Edit|Write|MultiEdit", hooks: [{ type: "command", command: "node gates/run-gates.mjs --quick" }] }],
      Stop: [{ hooks: [{ type: "command", command: "node gates/graph-stop.mjs" }] }],
    },
  };
  const cmd = 'node "X/.claude/hooks/report-activity.mjs"';
  const { settings, added } = mergeActivityHook(fixture, cmd);
  const all = JSON.stringify(settings);
  check(id, added && all.includes("run-gates.mjs --quick") && all.includes("graph-stop.mjs") && all.includes("report-activity.mjs")
        && JSON.stringify(fixture).includes("run-gates") && !JSON.stringify(fixture).includes("report-activity"),
    "기존 훅을 하나도 안 지우고 덧붙인다(입력 객체도 안 건드린다)", "병합이 기존 설정을 잃거나 입력을 바꿨다");

  const again = mergeActivityHook(settings, cmd);
  const count = (JSON.stringify(again.settings).match(/report-activity\.mjs/g) ?? []).length;
  check("7 프로브(두 번)", again.added === false && count === 1, "두 번 돌려도 두 벌이 안 생긴다", `두 번 돌리니 ${count}벌이 됐다`);

  const empty = mergeActivityHook({}, cmd);
  check("7 프로브(빈 설정)", empty.added && empty.settings.hooks.PostToolUse.length === 1, "hooks 가 없던 설정에도 붙는다", "빈 설정에서 병합이 깨진다");
}

// ── 8. 전환 3회 → 3줄 · 체류 시간 · 한쪽만 기록하는 경로 없음 ────────────
{
  const id = "8 기록";
  const root = tmp("report-note-");
  const dir = join(root, "report");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "workflow.json"), JSON.stringify(DERIVED), "utf-8");
  const { note } = await import(pathToFileURL(join(ROOT, "scripts", "report-note.mjs")).href);
  note(dir, { node: "spec", task: "T", now: "스펙 쓰는 중" });
  note(dir, { node: "implement", task: "T", now: "구현 중" });
  note(dir, { node: "qa", task: "T", now: "테스트 도는 중", result: "통과" });

  const { rows } = parseJsonl(readFileSync(join(dir, "transitions.jsonl"), "utf-8"));
  const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf-8"));
  const dwell = dwellByNode(rows);

  // 화면이 실제로 그리는 숫자는 render.mjs 의 feedRows 가 만든다. 모델 쪽 dwellByNode 만
  // 검사하면 화면이 한 번도 실행하지 않는 코드를 검증하게 된다 — feedRows 만 틀어져도
  // 검사는 초록이고 화면 숫자만 조용히 틀린다. 그래서 둘이 같은 답을 내는지 본다.
  const { feedRows } = await import(pathToFileURL(join(ASSETS, "render.mjs")).href);
  const until = Date.now();
  const fed = feedRows(rows, [], until);
  const fedDwell = {};
  for (const r of fed) fedDwell[r.to_node] = (fedDwell[r.to_node] ?? 0) + r.dwell_ms;
  const modelDwell = dwellByNode(rows, until);
  const stable = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  check("8 화면 계산", stable(fedDwell) === stable(modelDwell),
    "화면이 쓰는 체류 시간이 모델 쪽 계산과 같다",
    `화면과 모델의 체류 시간이 다르다: 화면 ${JSON.stringify(fedDwell)} vs 모델 ${JSON.stringify(modelDwell)}`);
  check(id, rows.length === 3 && Object.keys(dwell).length === 3 && rows[1].from_node === "spec" && rows[2].result === "통과",
    "전환 3회가 3줄이 되고 노드별 체류 시간이 나온다", `전환 기록이 안 맞는다: ${rows.length}줄 / 체류 ${Object.keys(dwell).length}개`);
  check("8 짝", pairingErrors(state, rows).length === 0, "state 와 마지막 전환이 짝을 이룬다", `짝이 깨졌다: ${pairingErrors(state, rows).join(" / ")}`);

  // 심은 위반: 한쪽만 고치면 짝 검사가 잡아야 한다
  const desynced = { ...state, current_node: "review" };
  check("8 프로브(한쪽만)", pairingErrors(desynced, rows).length > 0,
    "state 만 고친 상태를 잡는다", "한쪽만 기록된 상태가 통과했다 — 짝 검사가 무효다");

  // 쓰는 자리가 하나뿐인가. 예전엔 scripts/ 바로 아래 .mjs 만 봤는데 그러면 scripts/lib/ 도
  // .claude/hooks/ 도 gates/ 도 사각지대였다. 그리고 "state.json 이라는 글자가 있다"로 판정해서
  // 읽기만 하는 파일도 오탐이었다. 이제 레포를 재귀로 훑고, 쓰기 호출과 같은 줄일 때만 센다.
  const stateWriters = (root, skip = []) => {
    const found = [];
    const walk = (d) => {
      let entries = [];
      try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const p = join(d, e.name);
        if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".git") walk(p); continue; }
        if (!/\.(mjs|js|cjs)$/.test(e.name)) continue;
        const rel = p.slice(root.length + 1).split("\\").join("/");
        if (skip.includes(rel)) continue;
        for (const line of readFileSync(p, "utf-8").split(/\r?\n/)) {
          const code = line.split("//")[0];
          if (/state\.json/.test(code) && /\b(writeFileSync|appendFileSync|createWriteStream|writeFile)\b/.test(code)) {
            found.push(rel);
            break;
          }
        }
      }
    };
    for (const sub of ["scripts", ".claude", "gates"]) walk(join(root, sub));
    return found;
  };
  const SOLE = ["scripts/report-note.mjs"];
  const writers = stateWriters(ROOT, SOLE);
  check("8 단일 기록자", writers.length === 0,
    "state.json 을 쓰는 자리는 scripts/report-note.mjs 하나뿐이다 (scripts·.claude·gates 재귀)",
    `state.json 을 쓰는 다른 자리가 있다: ${writers.join(", ")} — 쓰기 경로가 갈라지면 짝 규칙이 깨진다`);

  // 심은 위반: 하위 폴더에 두 번째 기록자를 만들어 두면 스캐너가 잡아야 한다
  {
    const fx = tmp("report-writer-");
    mkdirSync(join(fx, "scripts", "lib"), { recursive: true });
    writeFileSync(join(fx, "scripts", "report-note.mjs"), "// 정본 자리\n", "utf-8");
    // 조각으로 나눠 쓴다 — 한 줄에 다 적으면 이 파일 자신이 스캐너에 기록자로 잡힌다
    const planted = ["writeFileSync", '(join(d, "state', '.json"), "{}");'].join("") + "\n";
    writeFileSync(join(fx, "scripts", "lib", "sneaky.mjs"), planted, "utf-8");
    const caught = stateWriters(fx, SOLE);
    check("8 프로브(기록자)", caught.includes("scripts/lib/sneaky.mjs"),
      "하위 폴더에 심은 두 번째 기록자를 잡는다",
      `심은 기록자를 못 잡았다 (찾은 것: ${caught.join(", ") || "없음"}) — 이 항목은 무효다`);
  }

  // 스키마를 어기는 기록은 아예 거부돼야 한다 (두 파일 중 하나만 써진 채 실패하지 않는다)
  const before = readFileSync(join(dir, "transitions.jsonl"), "utf-8");
  let refused = false;
  try { note(dir, { node: "qa", task: "T", now: "가".repeat(NOW_MAX + 1) }); } catch { refused = true; }
  check("8 프로브(거부)", refused && readFileSync(join(dir, "transitions.jsonl"), "utf-8") === before,
    "스키마 위반 기록은 거부되고 파일에 아무것도 안 남는다", "위반 기록이 통과했거나 절반만 써졌다");
}

// ── 9. 노드↔스킬 바인딩이 낡지 않았는가 (docs-contract 8절) ──────────────
{
  const ids = new Set(DERIVED.nodes.map((n) => n.id));
  const dirs = skillDirs();
  const exists = (rel) => existsSync(join(ROOT, rel));
  const backlogText = (() => {
    try {
      return readFileSync(join(ROOT, "docs", "references", "harness-backlog.md"), "utf-8");
    } catch {
      return "";
    }
  })();
  const backlogHas = (frag) => backlogText.includes(frag);
  const opts = { nodeIds: ids, skillDirs: dirs, fileExists: exists, backlogHas };

  check("9 읽기", bindingsReadError === null && BINDINGS.length > 0,
    `바인딩 ${BINDINGS.length}줄을 읽었다`,
    `바인딩을 못 읽었다: ${bindingsReadError ?? "bindings 가 비었다"}`);

  const errs = bindingErrors(BINDINGS, opts);
  check("9 현행", errs.length === 0,
    `스킬 ${dirs.length}개가 전부 바인딩에 있고, 낡은 줄이 없다`,
    `바인딩이 낡았다: ${errs.join(" / ")}`);

  // 심은 위반 셋 — 각각 다른 각도다. 하나만 심으면 나머지 두 그물의 구멍을 못 본다.
  const dropped = BINDINGS.filter((b) => b.skill !== "spec");
  check("9 프로브(미등장)", bindingErrors(dropped, opts).some((e) => e.includes("안 올라온 스킬")),
    "바인딩에서 스킬 하나를 빼면 미등장으로 잡는다", "스킬을 빼도 통과했다 — 미등장 검사가 무효다");

  const staleNode = [...BINDINGS, { node: "no-such-node", skill: "spec", contract: null }];
  check("9 프로브(낡은 노드)", bindingErrors(staleNode, opts).some((e) => e.includes("워크플로우에 없다")),
    "없는 노드를 가리키는 줄을 잡는다", "없는 노드를 가리켜도 통과했다");

  const staleSkill = [...BINDINGS, { node: "qa", skill: "no-such-skill", contract: null }];
  check("9 프로브(낡은 스킬)", bindingErrors(staleSkill, opts).some((e) => e.includes("디렉터리가 없다")),
    "없는 스킬을 가리키는 줄을 잡는다", "없는 스킬을 가리켜도 통과했다");

  const badContract = [...BINDINGS, { node: "qa", skill: "spec", contract: "scripts/nope.mjs" }];
  check("9 프로브(없는 계약 경로)", bindingErrors(badContract, opts).some((e) => e.includes("경로에 파일이 없다")),
    "없는 계약 테스트 경로를 잡는다", "없는 계약 경로가 통과했다");

  // contract 어휘 — null 이 제일 위험한 값이다. 「아직 없다」와 「필요 없다」가 같은 글자면
  // 무엇이 빠졌는지 셀 수가 없다. 그래서 넷을 각각 심어 본다.
  const nullContract = [...BINDINGS, { node: "qa", skill: "spec", contract: null }];
  check("9 프로브(빈 계약)", bindingErrors(nullContract, opts).some((e) => e.includes("구별이 안 된다")),
    "contract 가 비어 있는 줄을 잡는다 — 셋 중 하나를 고르게 한다", "빈 contract 가 통과했다");

  const bareNone = [...BINDINGS, { node: "qa", skill: "spec", contract: "none:" }];
  check("9 프로브(사유 없는 none)", bindingErrors(bareNone, opts).some((e) => e.includes("이름만 바뀐 null")),
    "사유 없는 none 을 잡는다", "사유 없는 면제가 통과했다 — 어휘가 null 의 새 이름이 된다");

  const barePending = [...BINDINGS, { node: "qa", skill: "spec", contract: "pending:" }];
  check("9 프로브(근거 없는 pending)", bindingErrors(barePending, opts).some((e) => e.includes("어느 백로그 항목")),
    "근거 없는 pending 을 잡는다", "근거 없는 pending 이 통과했다");

  const lostPending = [...BINDINGS, { node: "qa", skill: "spec", contract: "pending: 있지도 않은 백로그 항목" }];
  check("9 프로브(사라진 백로그)", bindingErrors(lostPending, opts).some((e) => e.includes("없다 — 미룬 이유")),
    "백로그에 없는 항목을 가리키는 pending 을 잡는다", "사라진 백로그 항목을 가리켜도 통과했다");

  const okVocab = [...BINDINGS, { node: "qa", skill: "spec", contract: "none: 문서만 읽는 절차라 자동 판정할 산출물이 없다" }];
  check("9 어휘(정상)", bindingErrors(okVocab, opts).length === 0,
    "사유가 붙은 none 은 그대로 통과한다 — 어휘가 통과 불가능한 관문이 아니다",
    `사유가 붙은 none 이 막혔다: ${bindingErrors(okVocab, opts).join(" / ")}`);

  // 스킬이 workflow.json 까지 실리는가. 화면에 **어떻게** 보이는지는 11~13 항목이 본다 —
  // 기본 화면에는 안 보이고 패널에만 보이는 것이 지금 기준이다.
  if (INSTALLED) {
    const onDisk = JSON.parse(readFileSync(join(REPORT, "workflow.json"), "utf-8"));
    const productSkills = onDisk.nodes?.find((n) => n.id === "product")?.skills ?? [];
    check("9 실림", productSkills.length > 0 && Array.isArray(onDisk.skills) && onDisk.skills.length === dirs.length,
      `내보낸 workflow.json 에 노드별 스킬과 목록 ${onDisk.skills?.length ?? 0}개가 실렸다`,
      `내보낸 workflow.json 에 스킬이 안 실렸다 (product=${JSON.stringify(productSkills)}, 목록=${onDisk.skills?.length ?? 0}/${dirs.length})`);
  }
}

// ── 10. 그래프 밖 작업 — "모른다"를 정직하게 적을 수 있는가 ──────────────
{
  const base = { session_id: "s", task: "t", now: "킷 손보는 중", since: new Date().toISOString(), blockers: [], skill: null, delay_reason: null };

  check("10 밖", validateState({ ...base, current_node: null, off_graph: "킷 스크립트 수정" }, DERIVED).length === 0,
    "current_node 가 null 이고 사유가 있으면 통과한다",
    `그래프 밖 상태가 거부됐다: ${validateState({ ...base, current_node: null, off_graph: "킷" }, DERIVED).join(" / ")}`);

  check("10 프로브(사유 없음)", validateState({ ...base, current_node: null }, DERIVED).some((e) => e.includes("off_graph")),
    "사유 없는 그래프 밖을 잡는다 — '밖'과 '안 적었다'는 다르다",
    "사유 없이도 통과했다 — 빈칸이 '밖'으로 읽힌다");

  check("10 프로브(둘 다)", validateState({ ...base, current_node: "qa", off_graph: "킷" }, DERIVED).some((e) => e.includes("off_graph")),
    "노드가 있는데 사유까지 적은 것을 잡는다", "노드와 사유가 함께 있어도 통과했다");

  // 이력: 그래프 밖 구간이 이어지는 것은 정상, 끊기는 것은 위반
  const t = (from, to, at) => ({ at, from_node: from, to_node: to, task: "t", now: "n", result: null });
  const okChain = [t(null, "qa", "2026-09-14T00:00:00Z"), t("qa", null, "2026-09-14T00:01:00Z"), t(null, null, "2026-09-14T00:02:00Z")];
  check("10 이력", chainErrors(okChain).length === 0,
    "노드 → 그래프 밖 → 그래프 밖 이 이어지는 것은 정상이다",
    `정상 이력이 거부됐다: ${chainErrors(okChain).join(" / ")}`);

  const broken = [t(null, "qa", "2026-09-14T00:00:00Z"), t(null, "review", "2026-09-14T00:01:00Z")];
  check("10 프로브(끊김)", chainErrors(broken).some((e) => e.includes("이력이 끊겼다")),
    "qa 에 도착했는데 다음 줄이 아무 데서도 출발 안 한 것을 잡는다",
    "끊긴 이력이 통과했다 — null 을 허용하면서 체인 검사가 헐거워졌다");

  // 화면: 그래프 밖이면 아무 노드도 안 빛난다
  const off = { ...base, current_node: null, off_graph: "킷", skill: null };
  const lit = layoutRef(DERIVED).nodes.filter((n) => nodeStateRef(n, off).kind !== "idle");
  check("10 화면", lit.length === 0,
    "그래프 밖이면 지도에서 아무 상자도 안 빛난다", `그래프 밖인데 빛나는 상자가 있다: ${lit.map((n) => n.id).join(", ")}`);
}

// ── 11. 요청 층 — "시킨 것 대비 어디까지, 밖으로 나갔나" ─────────────────
{
  const now = Date.now();
  const iso = (min) => new Date(now - min * 60000).toISOString();
  const req = {
    task: "T", request: "좋아요 기능을 추가해 줘", source: "manual", spec_path: null,
    items: [
      { id: "I1", label: "버튼 붙이기", done: true },
      { id: "I2", label: "집계 저장", done: false },
    ],
    goal: "좋아요 수를 보고 인기 글을 고르려는 것",
    status: "진행 중", status_reason: null, started_at: iso(30), ended_at: null,
  };
  check("11 스키마", validateRequest(req).length === 0,
    "정상 request 는 통과한다", `정상 request 가 거부됐다: ${validateRequest(req).join(" / ")}`);

  const planted = [
    ["items 없음", { ...req, items: [] }],
    ["없는 status", { ...req, status: "하는 중" }],
    ["사유 없는 대기", { ...req, status: "승인 대기", status_reason: null }],
    ["manual 인데 spec_path", { ...req, spec_path: "docs/specs/x.md" }],
    ["id 중복", { ...req, items: [{ id: "I1", label: "a", done: false }, { id: "I1", label: "b", done: false }] }],
  ];
  for (const [what, r] of planted) {
    check(`11 프로브(${what})`, validateRequest(r).length > 0,
      `심은 위반(${what})을 잡는다`, `심은 위반(${what})이 통과했다`);
  }

  // items 는 얼어붙는다 — done 만 바뀐다
  const doneOnly = JSON.parse(JSON.stringify(req));
  doneOnly.items[1].done = true;
  check("11 고정", frozenItemsErrors(req.items, doneOnly.items).length === 0,
    "done 만 바꾸는 것은 통과한다", "done 만 바꿨는데 거부됐다");

  const added = { ...req, items: [...req.items, { id: "I3", label: "나중에 생긴 일", done: false }] };
  const renamed = JSON.parse(JSON.stringify(req));
  renamed.items[0].label = "딴 이름";
  check("11 프로브(항목 추가)", frozenItemsErrors(req.items, added.items).length > 0,
    "시작 후 항목을 더하는 것을 거부한다 — 나간 것을 목록에 넣으면 안 나간 것이 된다",
    "시작 후 항목 추가가 통과했다 — 파생 판별이 무효다");
  check("11 프로브(항목 수정)", frozenItemsErrors(req.items, renamed.items).length > 0,
    "시작 후 항목 이름을 바꾸는 것을 거부한다", "항목 이름 변경이 통과했다");

  // 요청 밖 작업: items 에 없는 item 을 단 전환은 밖으로 잡힌다
  const tr = [
    { at: iso(30), from_node: null, to_node: "implement", task: "T", now: "n", result: null, item: "버튼 붙이기" },
    { at: iso(20), from_node: "implement", to_node: "implement", task: "T", now: "n", result: null, item: "로그인 버그 고치기" },
    { at: iso(10), from_node: "implement", to_node: "qa", task: "T", now: "n", result: null, item: "집계 저장" },
  ];
  const v = requestViewRef(req, tr, null, now);
  check("11 밖", v.outside.length === 1 && v.outside[0].label === "로그인 버그 고치기" && v.outside[0].ms >= 9 * 60000,
    `요청 밖 작업 1건을 체류 시간과 함께 잡는다 (${v.outside[0] ? Math.round(v.outside[0].ms / 60000) : "?"}분)`,
    `요청 밖 작업이 안 잡혔다: ${JSON.stringify(v.outside)}`);
  check("11 진행", v.done === 1 && v.total === 2 && v.current === "집계 저장",
    "n/m 과 현재 항목이 맞다", `진행이 안 맞는다: ${v.done}/${v.total} 현재=${v.current}`);

  const bothDone = { ...req, items: req.items.map((i) => ({ ...i, done: true })) };
  check("11 프로브(완료 수)", requestViewRef(bothDone, tr, null, now).done === 2,
    "done 을 갱신하면 완료 수가 바뀐다", "done 을 갱신해도 완료 수가 그대로다");

  // 스펙에서 항목 뽑기 — 출처는 불변식 정의 앵커
  const specFile = join(ROOT, "projects", SLUG || "study-mate", "docs", "specs", "auth-session.md");
  if (existsSync(specFile)) {
    const items = itemsFromSpec(readFileSync(specFile, "utf-8"));
    check("11 스펙", items.length > 0 && items.every((i) => /^INV-/.test(i.id)),
      `스펙에서 불변식 ${items.length}개를 항목으로 뽑는다`, "스펙에서 항목을 못 뽑는다");
    check("11 프로브(인용 제외)", itemsFromSpec("본문에서 INV-A1: 이렇게 인용한 줄\n- INV-A9: 진짜 정의").length === 1,
      "줄 맨 앞의 정의만 세고 본문 인용은 안 센다", "본문 인용까지 항목으로 셌다");
  }
}

// ── 12. 서브에이전트 — 훅과 칸 ──────────────────────────────────────────
{
  const root = tmp("report-sub-");
  writeFileSync(join(root, "ACTIVE"), "fx", "utf-8");
  const dir = join(root, "projects", "fx", "report");
  mkdirSync(dir, { recursive: true });
  const hook = join(ASSETS, "report-subagent.mjs");
  const run = (payload) => spawnSync(process.execPath, [hook], { input: JSON.stringify(payload), encoding: "utf-8" });

  run({ cwd: root, hook_event_name: "PreToolUse", tool_name: "Agent",
        tool_input: { subagent_type: "code-reviewer", prompt: "첫 줄이 brief 다\n둘째 줄" } });

  // **PostToolUse 는 종료가 아니다.** 서브에이전트가 끝난 시점이 아니라 그것을 띄우는 툴
  // 호출이 돌아온 시점에 뛰고, 배경으로 도는 에이전트에서는 그게 시작 직후다. 여기서 end 를
  // 쓰면 화면의 「실행 중」이 영영 안 뜬다 — 2026-09-15 에 실제로 그랬다(start 0.4초 뒤 end).
  run({ cwd: root, hook_event_name: "PostToolUse", tool_name: "Agent",
        tool_input: { subagent_type: "code-reviewer" } });
  const mid = parseJsonl(readFileSync(join(dir, "subagents.jsonl"), "utf-8")).rows;
  check("12 프로브(PostToolUse 는 종료 아님)", mid.length === 1 && mid[0].event === "start",
    "PostToolUse 로 온 입력은 한 줄도 안 쓴다 — 그 이벤트는 시작 직후에 뛴다",
    `PostToolUse 가 줄을 썼다: ${JSON.stringify(mid)} — 배경 에이전트는 영영 「대기」로 보인다`);

  run({ cwd: root, hook_event_name: "SubagentStop", agent: "code-reviewer" });
  const { rows } = parseJsonl(readFileSync(join(dir, "subagents.jsonl"), "utf-8"));
  check("12 훅", rows.length === 2 && rows[0].event === "start" && rows[0].agent === "code-reviewer"
        && rows[0].brief === "첫 줄이 brief 다" && rows[1].event === "end",
    "PreToolUse 가 start 를, SubagentStop 이 end 를 쓴다", `두 줄이 안 맞는다: ${JSON.stringify(rows)}`);

  const r3 = run({ cwd: root, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } });
  const after = parseJsonl(readFileSync(join(dir, "subagents.jsonl"), "utf-8")).rows;
  check("12 프로브(툴 구분)", r3.status === 0 && after.length === 2,
    "서브에이전트가 아닌 툴 호출은 기록하지 않는다", "보통 툴 호출까지 기록했다");

  // 렌더: start 뒤 end 가 없으면 실행 중
  const wf = { agents: [{ name: "code-reviewer", description: "d" }, { name: "ui-reviewer", description: "d" }] };
  const running = subagentViewRef(wf, [{ at: new Date(Date.now() - 5000).toISOString(), event: "start", agent: "code-reviewer", brief: "b" }]);
  const idle = subagentViewRef(wf, rows);
  check("12 칸", running[0].running && running[0].label === "작업 중" && !running[1].running && idle[0].label === "대기",
    "start 만 있으면 작업 중, end 까지 오면 대기로 바뀐다",
    `상태가 안 맞는다: ${JSON.stringify([running.map((x) => x.label), idle.map((x) => x.label)])}`);

  // 목록의 출처가 정의 파일인가 (화면·스크립트에 하드코딩 없음)
  let defs = [];
  try { defs = readdirSync(join(ROOT, ".claude", "agents")).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")).sort(); } catch { /* 없으면 아래에서 실패 */ }
  if (INSTALLED) {
    const onDisk = JSON.parse(readFileSync(join(REPORT, "workflow.json"), "utf-8"));
    const listed = (onDisk.agents ?? []).map((a) => a.name).sort();
    check("12 출처", defs.length > 0 && JSON.stringify(defs) === JSON.stringify(listed),
      `서브에이전트 ${defs.length}개가 정의 파일과 같다`,
      `정의 파일과 다르다: 파일 ${JSON.stringify(defs)} vs 실린 것 ${JSON.stringify(listed)}`);
  }
  const hard = readFileSync(join(ASSETS, "index.html"), "utf-8") + readFileSync(join(ASSETS, "render.mjs"), "utf-8");
  const hardcoded = defs.filter((d) => hard.includes(d));
  check("12 하드코딩 없음", hardcoded.length === 0,
    "화면 코드에 에이전트 이름이 박혀 있지 않다", `화면 코드에 이름이 박혀 있다: ${hardcoded.join(", ")}`);
}

// ── 13. 지도 렌더러 — Mermaid 없이, 기본 화면에 스킬명 없이 ───────────────
{
  const html = readFileSync(join(ASSETS, "index.html"), "utf-8");
  const urls = [...html.matchAll(/https?:\/\/[^\s"')]+/g)].map((m) => m[0]);
  check("13 CDN 0", urls.length === 0, "외부 CDN 참조가 0개다", `외부 참조가 남아 있다: ${urls.join(", ")}`);
  // 주석은 "왜 걷어냈나"의 기록이라 남는다. 실제로 쓰는 자리만 본다 — 주석을 지운 뒤 검사한다.
  // CRLF 를 안 걷어내면 줄 끝의 \r 때문에 `//.*$` 가 빗나가 주석이 그대로 남는다
  // (이 레포가 run-gates 에서 이미 겪은 모양이다 — 주석 속 글자가 코드로 읽혔다).
  const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const code = stripComments(html) + stripComments(readFileSync(join(ASSETS, "render.mjs"), "utf-8"));
  check("13 Mermaid 없음", !/mermaid/i.test(code), "코드에 Mermaid 쓰임이 없다", "Mermaid 를 아직 쓴다");
  check("13 프로브(주석 제외)", /mermaid/i.test(html + readFileSync(join(ASSETS, "render.mjs"), "utf-8")) === true,
    "주석에 남은 기록은 위반으로 세지 않는다(검사가 낱말이 아니라 쓰임을 본다는 증거)",
    "주석에도 흔적이 없어 이 항목이 무엇을 거르는지 확인할 수 없다");

  const L = layoutRef(DERIVED);
  check("13 배치", L.nodes.length === DERIVED.nodes.filter((n) => n.kind !== "child").length && L.edges.length > 0
        && L.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)),
    `노드 ${L.nodes.length}개·엣지 ${L.edges.length}개를 좌표로 배치한다 (${L.width}x${L.height})`,
    "배치가 안 나온다");
  check("13 폭", L.width <= 980,
    `지도 자연 폭 ${L.width}px — 창 1024px 에서 가로 스크롤 없이 들어간다`,
    `지도가 ${L.width}px 라 창 1024px 에서 넘친다 (기준: docs/references/devtool-ui-standards.md 6절)`);

  // 기본 화면(패널 닫힘)에 스킬 이름이 안 나타난다
  const base = { session_id: "s", task: "t", now: "n", since: new Date().toISOString(), blockers: [], skill: null, delay_reason: null };
  // 노드 이름과 스킬 이름이 같은 경우가 있다(노드 spec · 스킬 spec). 그래서 "스킬 이름이
  // 글자로 나타나나"가 아니라 **"그려지는 글이 노드 이름 그것뿐인가"**를 본다.
  const drawnLabels = layoutRef(DERIVED).nodes.flatMap((n) => [n.label, ...n.children.map((c) => c.label)]);
  const nodeLabels = new Set(DERIVED.nodes.map((n) => n.label));
  const extra = drawnLabels.filter((l) => !nodeLabels.has(l));
  const product = layoutRef(DERIVED).nodes.find((n) => n.id === "product");
  const productSkills = DERIVED.nodes.find((n) => n.id === "product").skills;
  const shown = JSON.stringify([product.label, product.children.map((c) => c.label)]);
  const leaked = productSkills.filter((sk) => shown.includes(sk));
  check("13 기본 화면", extra.length === 0 && leaked.length === 0,
    `기본 화면은 노드 이름만 그린다 (product 의 스킬 ${productSkills.length}개는 안 보인다)`,
    `기본 화면에 노드 이름 아닌 글이 있다: ${[...extra, ...leaked].join(", ")}`);

  // 상태는 색만이 아니라 라벨도 준다
  const cur = nodeStateRef({ id: "qa" }, { ...base, current_node: "qa" });
  const blk = nodeStateRef({ id: "qa" }, { ...base, current_node: "qa", blockers: [{ id: "b", label: "l" }] });
  const off = nodeStateRef({ id: "qa" }, { ...base, current_node: null });
  check("13 이중 표기", cur.kind === "current" && cur.label === "진행 중" && blk.kind === "blocked" && blk.label === "대기" && off.kind === "idle",
    "노드 상태가 색 이름과 라벨을 함께 준다(색만으로 구분하지 않는다)",
    `상태 표기가 안 맞는다: ${JSON.stringify([cur, blk, off])}`);

  // 패널: 그 노드의 바인딩 스킬 전부 + 상시, 그리고 실행 중 강조
  const p1 = nodePanelRef(DERIVED, { ...base, current_node: "product" }, "product");
  const bound = DERIVED.nodes.find((n) => n.id === "product").skills;
  check("13 패널", JSON.stringify(p1.skills) === JSON.stringify([...bound].sort()) && p1.alwaysSkills.length > 0,
    `패널에 그 노드의 스킬 ${p1.skills.length}개와 상시 ${p1.alwaysSkills.length}개가 전부 나온다`,
    `패널 스킬이 안 맞는다: ${JSON.stringify(p1.skills)}`);
  const p2 = nodePanelRef(DERIVED, { ...base, current_node: "product", skill: "kickoff" }, "product");
  check("13 실행 중", p2.runningSkill === "kickoff" && p1.runningSkill === null,
    "state.skill 이 있으면 패널이 그 스킬을 실행 중으로 표시하고, null 이면 아무것도 강조 안 한다",
    "실행 중 표시가 안 맞는다");
  check("13 프로브(없는 스킬)", validateState({ ...base, current_node: "qa", skill: "no-such-skill" }, DERIVED).some((e) => e.includes("바인딩에 없는")),
    "바인딩에 없는 스킬명을 거부한다", "없는 스킬명이 통과했다");
}

// ── 14. 요청 이력 — 끝내면 옮겨지고 현재 요청은 비워진다 ──────────────────
{
  const dir = tmp("report-req-");
  const reqMod = await import(pathToFileURL(join(ROOT, "scripts", "report-request.mjs")).href);
  reqMod.start(dir, { task: "T", request: "무언가 해 줘", items: [{ id: "I1", label: "하나", done: false }] });
  reqMod.update(dir, (r) => { r.items[0].done = true; });
  let refused = false;
  try { reqMod.update(dir, (r) => r.items.push({ id: "I2", label: "끼워넣기", done: false })); } catch { refused = true; }
  check("14 거부", refused, "시작 후 항목 추가 시도를 스크립트가 거부한다", "스크립트가 항목 추가를 받아들였다");

  const done = reqMod.finish(dir, { status: "완료" });
  const hist = parseJsonl(readFileSync(join(dir, "requests-history.jsonl"), "utf-8")).rows;
  check("14 이력", hist.length === 1 && hist[0].status === "완료" && hist[0].ended_at && !existsSync(join(dir, "request.json")),
    "끝내면 이력에 한 줄 남고 현재 요청은 비워진다",
    `이력 이동이 안 맞는다 (이력 ${hist.length}줄, request.json ${existsSync(join(dir, "request.json")) ? "남아 있음" : "없음"})`);
  check("14 사유", validateRequest({ ...done, status: "중단", status_reason: null }).some((e) => e.includes("status_reason")),
    "중단인데 사유가 없으면 거부한다", "사유 없는 중단이 통과했다");
}

// ── 15. 단계 띠 — items 의 순서가 화면에 있는가 ──────────────────────────
{
  const now = Date.now();
  const iso = (min) => new Date(now - min * 60000).toISOString();
  const req = {
    task: "T", request: "셋을 순서대로 해 줘", goal: null, source: "manual", spec_path: null,
    items: [
      { id: "I1", label: "하나", done: true },
      { id: "I2", label: "둘", done: false },
      { id: "I3", label: "셋", done: false },
    ],
    status: "진행 중", status_reason: null, started_at: iso(50), ended_at: null,
  };
  // 하나에 20분(50→30), 둘에 30분(30→지금). 셋은 아직.
  const tr = [
    { at: iso(50), from_node: null, to_node: "implement", task: "T", now: "n", result: null, item: "하나", blockers: [] },
    { at: iso(30), from_node: "implement", to_node: "implement", task: "T", now: "n", result: null, item: "둘", blockers: [] },
  ];
  const strip = itemStripRef(req, tr, now, DEFAULT_REPORT_CONFIG);

  check("15 순서", JSON.stringify(strip.cells.map((c) => c.label)) === JSON.stringify(["하나", "둘", "셋"]),
    "띠가 items 의 배열 순서 그대로 그려진다",
    `띠의 순서가 items 와 다르다: ${strip.cells.map((c) => c.label).join(",")}`);
  check("15 상태", strip.cells[0].state === "done" && strip.cells[1].state === "current" && strip.cells[2].state === "todo",
    "첫 칸 완료 · 둘째 칸 진행 중 · 셋째 칸 아직",
    `칸 상태가 안 맞는다: ${strip.cells.map((c) => `${c.label}=${c.state}`).join(" ")}`);
  // 빈 문자열만 거르면 완료/아직을 서로 바꿔 넣어도 통과한다. 대응을 직접 대조한다.
  const LABEL_OF = { done: "완료", current: "하는 중", todo: "아직 안 함" };
  check("15 이중 표기", strip.cells.every((c) => c.stateLabel === LABEL_OF[c.state]),
    "칸마다 상태에 맞는 라벨이 붙는다(색만으로 구분하지 않는다)",
    `상태와 라벨이 어긋난다: ${strip.cells.map((c) => `${c.state}=${c.stateLabel}`).join(" ")}`);
  check("15 프로브(칸 번호)", strip.cells.every((c, i) => c.index === i),
    "칸의 index 가 배열 자리와 같다(화면이 이 값으로 번호를 그린다)", "칸 번호가 자리와 어긋난다");

  const mins = strip.cells.map((c) => Math.round(c.ms / 60000));
  check("15 체류", JSON.stringify(mins) === JSON.stringify([20, 30, 0]),
    `칸별 체류가 수기 계산과 같다 (${mins.join("·")}분)`, `칸별 체류가 다르다: ${mins.join("·")}분 (기대 20·30·0)`);

  const swapped = { ...req, items: [req.items[1], req.items[0], req.items[2]] };
  check("15 프로브(순서 뒤집기)",
    JSON.stringify(itemStripRef(swapped, tr, now, DEFAULT_REPORT_CONFIG).cells.map((c) => c.label)) === JSON.stringify(["둘", "하나", "셋"]),
    "items 의 순서를 바꾸면 띠의 순서도 바뀐다(순서를 정말 읽는다)", "items 순서를 바꿔도 띠가 그대로다");

  check("15 순서 고정", frozenItemsErrors(req.items, swapped.items).some((e) => e.includes("순서")),
    "시작 후 items 순서를 바꾸려는 기록 시도를 거부한다", "순서 재배열이 기록에서 통과했다 — 띠의 순서를 못 믿는다");
}

// ── 16. 임계 초과 — "오래"의 기준이 설정값이고, 넘을 때만 뜬다 ────────────
{
  const now = Date.now();
  const iso = (min) => new Date(now - min * 60000).toISOString();
  const mk = (dwellMin) => {
    const req = {
      task: "T", request: "r", goal: null, source: "manual", spec_path: null,
      items: [{ id: "I1", label: "오래 걸리는 것", done: false }],
      status: "진행 중", status_reason: null, started_at: iso(dwellMin), ended_at: null,
    };
    const tr = [{ at: iso(dwellMin), from_node: null, to_node: "implement", task: "T", now: "n", result: null, item: "오래 걸리는 것", blockers: [] }];
    const state = { session_id: "s", current_node: "implement", task: "T", now: "n", since: iso(dwellMin), blockers: [], skill: null, delay_reason: null };
    return { workflow: DERIVED, state, request: req, transitions: tr, activity: [], subagents: [], history: [] };
  };
  const over = mk(45), under = mk(5);
  const cfg = DEFAULT_REPORT_CONFIG;

  check("16 초과", itemStripRef(over.request, over.transitions, now, cfg).cells[0].over === true
        && noticeRowsRef(over, now, cfg).some((n) => n.code === 8 && n.value.includes("기준 30분")),
    "임계를 넘으면 칸에 초과 표시가 붙고 특이사항에 8번 줄이 뜬다",
    "임계를 넘었는데 표시가 없다");
  check("16 프로브(미만)", itemStripRef(under.request, under.transitions, now, cfg).cells[0].over === false
        && !noticeRowsRef(under, now, cfg).some((n) => n.code === 8),
    "임계 미만이면 초과 표시도 8번 줄도 없다", "임계 미만인데 초과 표시가 떴다");

  const loose = reportConfigRef({ dwell_threshold_min: 60 });
  const tight = reportConfigRef({ dwell_threshold_min: 1 });
  check("16 설정", itemStripRef(over.request, over.transitions, now, loose).cells[0].over === false
        && itemStripRef(under.request, under.transitions, now, tight).cells[0].over === true,
    "임계 T 를 바꾸면 판정이 그 값을 따른다 (45분이 60분 임계에선 정상, 5분이 1분 임계에선 초과)",
    "임계를 바꿔도 판정이 안 바뀐다 — 설정값이 안 읽힌다");
  // 한 칸이 잘못됐을 때 **그 칸만** 돌아가야 한다. 객체 전체를 기본값으로 되돌리는 구현도
  // 「음수는 기본값」 하나만 보면 통과한다 — 그래서 성한 칸이 살아남는지 같이 본다.
  const halfBad = reportConfigRef({ dwell_threshold_min: -3, activity_gap_min: 25 });
  check("16 프로브(잘못된 설정)", halfBad.dwell_threshold_min === DEFAULT_REPORT_CONFIG.dwell_threshold_min
        && halfBad.activity_gap_min === 25,
    "못 쓸 값이 있는 칸만 기본값으로 돌아가고 성한 칸은 살아남는다 (30 · 25)",
    `그 칸만 돌아가지 않는다: ${JSON.stringify(halfBad)}`);
  for (const [what, bad] of [["문자열", "30"], ["NaN", NaN], ["무한", Infinity], ["0", 0]]) {
    check(`16 프로브(${what})`, reportConfigRef({ dwell_threshold_min: bad }).dwell_threshold_min === DEFAULT_REPORT_CONFIG.dwell_threshold_min,
      `${what} 임계는 기본값으로 돌아간다`, `${what} 이 임계로 그대로 쓰인다`);
  }
}

// ── 17. 지연 진단 — 집계 다섯이 각각 단독으로 잡히는가 ────────────────────
{
  const now = Date.now();
  const iso = (min) => new Date(now - min * 60000).toISOString();
  const LABEL = "느린 항목";
  const base = (tr, extra = {}) => ({
    workflow: DERIVED,
    state: { session_id: "s", current_node: "implement", task: "T", now: "n", since: tr[tr.length - 1].at, blockers: [], skill: null, delay_reason: null },
    request: {
      task: "T", request: "r", goal: null, source: "manual", spec_path: null,
      items: [{ id: "I1", label: LABEL, done: false }],
      status: "진행 중", status_reason: null, started_at: tr[0].at, ended_at: null,
    },
    transitions: tr, activity: [], subagents: [], history: [], ...extra,
  });
  const row = (min, o = {}) => ({ at: iso(min), from_node: null, to_node: "implement", task: "T", now: "n", result: null, item: LABEL, blockers: [], ...o });
  const chain = (rows) => rows.map((r, i) => ({ ...r, from_node: i === 0 ? null : "implement" }));

  const plainTr = chain([row(60)]);
  const acts = [];
  for (let m = 60; m >= 0; m -= 2) acts.push({ at: iso(m), tool: "Edit", target: "a.ts", session_id: "s" });
  const plain = delayDiagnosisRef(LABEL, base(plainTr, { activity: acts }), now, DEFAULT_REPORT_CONFIG);
  check("17 바탕", plain.failures.length === 0 && plain.derived.rows.length === 0 && plain.blocked.ms === 0
        && plain.gaps.rows.length === 0 && plain.agents.length === 0 && plain.reason === null,
    "아무 조건도 없으면 집계 다섯이 전부 0/없음이고 사유는 기록 없음이다",
    `바탕이 안 비었다: ${JSON.stringify({ f: plain.failures.length, d: plain.derived.rows.length, b: plain.blocked.ms, g: plain.gaps.rows.length, a: plain.agents.length })}`);

  // 「나머지는 0」을 술어로 받으면 빠뜨린 칸이 생긴다 — 실제로 d1·d2·d3 이 gaps 를 안 보고
  // 있었고, 실패 줄이 활동 공백을 잘못 켜도 안 잡혔다. 그래서 **다섯 칸을 전부 세고 어느 칸이
  // 차야 하는지만 이름으로 받는다.** 빠뜨릴 자리가 없어진다.
  const shape = (d) => ({
    failures: d.failures.length, derived: d.derived.rows.length,
    blocked: d.blocked.ms, gaps: d.gaps.rows.length, agents: d.agents.length,
  });
  const only = (name, d, wanted, hit) => {
    check(`17 ${name}`, hit(d), `${name} 이 잡힌다`, `${name} 이 안 잡혔다`);
    const got = shape(d);
    const zeros = Object.entries(got).filter(([k]) => k !== wanted).every(([, v]) => v === 0);
    check(`17 프로브(${name} 외 0)`, zeros && got[wanted] > 0,
      `${name} 을 심었더니 ${wanted} 만 차고 나머지 네 칸은 전부 0 이다`,
      `${name} 을 심었는데 다른 집계까지 값이 찼다: ${JSON.stringify(got)}`);
  };

  const d1 = delayDiagnosisRef(LABEL, base(chain([row(60, { result: "반려" }), row(40, { result: "실패" }), row(20)]), { activity: acts }), now, DEFAULT_REPORT_CONFIG);
  only("1 실패 반복", d1, "failures", (d) => d.failures.length === 2 && d.failures[0].result === "반려");
  check("17 프로브(통과는 안 셈)", delayDiagnosisRef(LABEL, base(chain([row(60, { result: "통과" })]), { activity: acts }), now, DEFAULT_REPORT_CONFIG).failures.length === 0,
    "result 가 통과인 줄은 실패로 안 센다", "통과까지 실패로 셌다");

  const d2 = delayDiagnosisRef(LABEL, base(chain([row(60), row(40, { item: "끼어든 일" }), row(20)]), { activity: acts }), now, DEFAULT_REPORT_CONFIG);
  // 비율의 정답은 0.5 다(파생 20분 / 체류 40분). `> 0` 으로 두면 분모가 창 전체로 바뀌어도 통과한다.
  only("2 요청 밖", d2, "derived", (d) => d.derived.rows.length === 1
    && Math.round(d.derived.totalMs / 60000) === 20 && Math.abs(d.derived.ratio - 0.5) < 0.01);

  const d3 = delayDiagnosisRef(LABEL, base(chain([row(60), row(40, { blockers: [{ id: "q", label: "제목 범위" }] }), row(20)]), { activity: acts }), now, DEFAULT_REPORT_CONFIG);
  only("3 블로커", d3, "blocked", (d) => Math.round(d.blocked.ms / 60000) === 20 && d.blocked.known === "all");
  const noField = chain([row(60), row(40)]).map(({ blockers, ...rest }) => rest);
  check("17 프로브(블로커 미기록)", delayDiagnosisRef(LABEL, base(noField, { activity: acts }), now, DEFAULT_REPORT_CONFIG).blocked.known === "none",
    "blockers 를 안 적던 시절의 줄은 0분이 아니라 '기록 없음'으로 구분한다",
    "blockers 가 없는 줄을 0분으로 셌다 — 모르는 것이 0 으로 보인다");

  const sparse = [{ at: iso(60), tool: "Edit", target: "a.ts", session_id: "s" }, { at: iso(5), tool: "Edit", target: "b.ts", session_id: "s" }];
  const d4 = delayDiagnosisRef(LABEL, base(plainTr, { activity: sparse }), now, DEFAULT_REPORT_CONFIG);
  only("4 활동 공백", d4, "gaps", (d) => d.gaps.rows.length === 1 && Math.round(d.gaps.rows[0].ms / 60000) === 55);

  const subs = [{ at: iso(50), event: "start", agent: "code-reviewer", brief: "b" }, { at: iso(35), event: "end", agent: "code-reviewer" }];
  const d5 = delayDiagnosisRef(LABEL, base(plainTr, { activity: acts, subagents: subs }), now, DEFAULT_REPORT_CONFIG);
  only("5 서브에이전트", d5, "agents", (d) => d.agents.length === 1 && Math.round(d.agents[0].ms / 60000) === 15);

  // 위 픽스처는 실행이 구간 **안에** 통째로 들어 있어서, 창으로 자르는 코드를 없애도 15분이
  // 그대로 나온다. 그래서 「구간과 겹친 시간만 센다」를 따로 찍는다 — 구간 밖 실행 하나와
  // 경계를 걸친 실행 하나를 심는다(창은 [-60분, 지금]이다).
  const spanning = [
    { at: iso(200), event: "start", agent: "ui-reviewer", brief: "b" }, { at: iso(190), event: "end", agent: "ui-reviewer" },
    { at: iso(70), event: "start", agent: "code-reviewer", brief: "b" }, { at: iso(50), event: "end", agent: "code-reviewer" },
  ];
  const d5b = delayDiagnosisRef(LABEL, base(plainTr, { activity: acts, subagents: spanning }), now, DEFAULT_REPORT_CONFIG);
  check("17 프로브(구간 밖·경계)", d5b.agents.length === 1 && d5b.agents[0].name === "code-reviewer"
        && Math.round(d5b.agents[0].ms / 60000) === 10,
    "구간 밖 실행은 안 세고, 경계를 걸친 실행은 겹친 10분만 센다",
    `창으로 자르지 않는다: ${JSON.stringify(d5b.agents)}`);

  // 옛 줄과 새 줄이 섞인 구간 — 규약 3절이 "0분이 아니라 기록 없음"이라고 적은 모양이다.
  const mixed = chain([row(60), { ...row(40, { blockers: [{ id: "q", label: "정해 주세요" }] }) }, row(20)])
    .map((r, i) => (i === 0 ? (({ blockers, ...rest }) => rest)(r) : r));
  const dMix = delayDiagnosisRef(LABEL, base(mixed, { activity: acts }), now, DEFAULT_REPORT_CONFIG);
  check("17 프로브(블로커 반쪽 기록)", dMix.blocked.known === "partial" && Math.round(dMix.blocked.unknownMs / 60000) === 20,
    "기록이 있는 줄과 없는 줄이 섞이면 'partial' 로 알리고 모르는 구간의 길이를 같이 준다",
    `섞인 구간을 확정값으로 그렸다: ${JSON.stringify(dMix.blocked)}`);

  const withReason = base(plainTr, { activity: acts });
  withReason.state.delay_reason = "마이그레이션 재실행이 매번 3분 걸린다";
  check("17 6 사유", delayDiagnosisRef(LABEL, withReason, now, DEFAULT_REPORT_CONFIG).reason === "마이그레이션 재실행이 매번 3분 걸린다",
    "delay_reason 이 있으면 그대로 보여 준다(요약·해석하지 않는다)", "delay_reason 이 안 실린다");
  check("17 프로브(사유 없음)", plain.reason === null,
    "delay_reason 이 null 이면 '기록 없음'이 된다", "사유가 없는데 무언가 실렸다");

  const two = {
    ...withReason,
    request: { ...withReason.request, items: [{ id: "I1", label: LABEL, done: true }, { id: "I2", label: "다음 항목", done: false }] },
    transitions: chain([row(60), { ...row(10), item: "다음 항목" }]),
  };
  check("17 프로브(항목 바뀜)", delayDiagnosisRef(LABEL, two, now, DEFAULT_REPORT_CONFIG).reason === null
        && delayDiagnosisRef("다음 항목", two, now, DEFAULT_REPORT_CONFIG).reason !== null,
    "사유는 지금 항목의 것이다 — 지난 항목 패널에는 안 붙는다", "지난 항목 패널에 지금 사유가 붙었다");
}

// ── 18. 특이사항 — 조건 일곱이 각각 단독으로 뜨는가 ───────────────────────
{
  const now = Date.now();
  const iso = (min) => new Date(now - min * 60000).toISOString();
  const quiet = {
    workflow: DERIVED,
    state: { session_id: "s", current_node: "implement", task: "T", now: "구현 중", since: iso(3), blockers: [], skill: null, delay_reason: null },
    request: {
      task: "T", title: null, request: "좋아요 기능을 추가해 줘", goal: null, source: "manual", spec_path: null,
      items: [{ id: "I1", label: "버튼 붙이기", done: false }],
      status: "진행 중", status_reason: null, started_at: iso(5), ended_at: null,
    },
    transitions: [{ at: iso(5), from_node: null, to_node: "implement", task: "T", now: "구현 중", result: null, item: "버튼 붙이기", blockers: [] }],
    activity: [{ at: iso(1), tool: "Edit", target: "a.ts", session_id: "s" }],
    subagents: [], history: [],
  };
  const clone = (f) => { const d = JSON.parse(JSON.stringify(quiet)); d.workflow = DERIVED; f(d); return d; };
  const codes = (d) => noticeRowsRef(d, now, DEFAULT_REPORT_CONFIG).map((n) => n.code).sort((a, b) => a - b);

  // 이 바탕이 "아무 조건도 없음"인 것은 **기본 임계에서 멀기 때문**이다(활동 1분 전 · 체류 5분).
  // 기본값이 그보다 빡빡해지면 아래 케이스가 전부 7·8번을 같이 켜서 단독성이 무너진다.
  // 그때 무엇이 깨졌는지 바로 알도록 전제를 먼저 찍는다.
  check("18 바탕 전제", DEFAULT_REPORT_CONFIG.activity_gap_min > 1 && DEFAULT_REPORT_CONFIG.dwell_threshold_min > 5,
    "바탕(활동 1분 전 · 체류 5분)이 기본 임계에서 충분히 멀다 — 아래 단독성이 여기 기댄다",
    `기본 임계가 바탕에 너무 가깝다: ${JSON.stringify(DEFAULT_REPORT_CONFIG)} — 아래 「조건 N 만」이 무너진다`);
  check("18 없음", noticeRowsRef(quiet, now, DEFAULT_REPORT_CONFIG).length === 0,
    "아무 조건도 없으면 특이사항이 빈 배열이다(화면은 절 자체를 안 그린다)",
    `조건 없이 특이사항이 떴다: ${JSON.stringify(codes(quiet))}`);

  const cases = [
    [1, (d) => { d.request.status = "승인 대기"; d.request.status_reason = "제목 범위를 정해 주세요"; }],
    [2, (d) => { d.state.blockers = [{ id: "q1", label: "제목 범위" }]; }],
    [3, (d) => { d.transitions.push({ at: iso(4), from_node: "implement", to_node: "implement", task: "T", now: "n", result: null, item: "끼어든 일", blockers: [] }); }],
    [5, (d) => { d.transitions[0].result = "통과"; }],
    [6, (d) => { d.subagents = [{ at: iso(2), event: "start", agent: "code-reviewer", brief: "b" }]; }],
    [7, (d) => { d.activity = [{ at: iso(40), tool: "Edit", target: "a.ts", session_id: "s" }]; }],
    [8, (d) => { d.transitions[0].at = iso(90); d.request.started_at = iso(90); }],
  ];
  for (const [code, mutate] of cases) {
    const got = codes(clone(mutate));
    check(`18 조건 ${code}`, JSON.stringify(got) === JSON.stringify([code]),
      `조건 ${code} 만 심으면 그 줄 하나만 뜬다`, `조건 ${code} 을 심었는데 뜬 줄이 ${JSON.stringify(got)} 다`);
  }

  // 옛 4번(제품 단계가 아님)은 특이사항에서 빠졌다. 화면 맨 위의 「작업 종류」가 같은 것을
  // 이미 말하기 때문이다 — 두 자리가 같은 말을 하면 한쪽을 고칠 때 다른 쪽이 남는다.
  const offGraph = clone((d) => { d.state.current_node = null; d.state.off_graph = "킷 손보는 중"; });
  check("18 제품 단계 아님", codes(offGraph).length === 0,
    "제품 단계가 아닌 것은 더는 특이사항이 아니다 — 「지금」의 작업 종류가 말한다",
    `제품 단계가 아니라고 특이사항이 떴다: ${JSON.stringify(codes(offGraph))}`);

  // 9번은 심어서 만드는 것이 아니라 **요청을 닫으면** 생기는 상태다(제품 단계 + 열린 요청 없음).
  const noReq = clone((d) => { d.request = null; d.transitions = []; });
  check("18 조건 9", JSON.stringify(codes(noReq)) === JSON.stringify([9]),
    "제품 단계인데 열린 요청이 없으면 그 사실이 특이사항에 한 줄 뜬다(표시만)",
    `요청을 닫았는데 뜬 줄이 ${JSON.stringify(codes(noReq))} 다`);

  // 번호만 보면 문장 안의 숫자·이름은 아무도 안 본다. 합계가 틀려도, 분 계산이 틀려도,
  // 엉뚱한 대기 항목 이름이 들어가도 전부 통과한다. 그래서 값이 실린 줄은 글자로 대조한다.
  const rowOf = (d, code) => noticeRowsRef(d, now, DEFAULT_REPORT_CONFIG).find((n) => n.code === code) ?? { label: "", value: "" };
  const outside = clone((d) => {
    d.transitions.push({ at: iso(4), from_node: "implement", to_node: "implement", task: "T", now: "n", result: null, item: "끼어든 일", blockers: [] });
  });
  const r3 = rowOf(outside, 3);
  check("18 3번 줄", r3.label === "요청 밖 작업" && r3.value === "1건 · 4분",
    "3번 줄이 라벨과 함께 건수·합계 시간을 정확히 적는다", `3번 줄이 다르다: ${r3.label} / ${r3.value}`);
  const r7 = rowOf(clone((d) => { d.activity = [{ at: iso(40), tool: "Edit", target: "a", session_id: "s" }]; }), 7);
  check("18 7번 줄", r7.label === "활동 없음" && r7.value === "40분",
    "7번 줄의 분 계산이 맞다", `7번 줄이 다르다: ${r7.label} / ${r7.value}`);
  const r2 = rowOf(clone((d) => { d.state.blockers = [{ id: "q1", label: "제목 범위" }]; }), 2);
  check("18 2번 줄", r2.label === "대기 항목" && r2.value === "제목 범위",
    "2번 줄이 그 대기 항목의 label 을 적는다", `2번 줄에 엉뚱한 이름이 들어갔다: ${r2.value}`);
  const r5 = rowOf(clone((d) => { d.transitions[0].result = "통과"; }), 5);
  check("18 5번 줄", r5.label === "최근 검사 결과" && r5.value.startsWith("검사 통과 ("),
    "5번 줄이 '통과' 를 화면 말인 '검사 통과' 로 바꿔 적는다", `5번 줄이 다르다: ${r5.value}`);

  // 손쓸 일과 상황 설명을 화면이 같은 색으로 그리면 멀쩡한 상태가 문제로 읽힌다.
  const tone = (d, code) => noticeRowsRef(d, now, DEFAULT_REPORT_CONFIG).find((n) => n.code === code)?.tone;
  check("18 색 구분", tone(clone((d) => { d.transitions[0].result = "통과"; }), 5) === "info"
        && tone(noReq, 9) === "info"
        && tone(clone((d) => { d.state.blockers = [{ id: "q1", label: "x" }]; }), 2) === "warn",
    "검사 결과·열린 요청 없음은 알려 주는 줄이고, 대기 항목은 손쓸 줄이다",
    "손쓸 줄과 알려 주는 줄이 같은 색으로 그려진다 — 멀쩡한 상태가 문제로 읽힌다");

  check("18 프로브(훅 미설치)", noticeRowsRef(clone((d) => { d.activity = []; }), now, DEFAULT_REPORT_CONFIG).every((n) => n.code !== 7),
    "활동 기록이 아예 없으면 '활동 없음'을 띄우지 않는다(훅이 안 붙은 것과 조용한 것은 다르다)",
    "활동 기록이 하나도 없는데 '활동 없음'이 떴다");
}

// ── 19. 화면 배치 — 요약은 항상, 패널은 하나 ─────────────────────────────
{
  const html = readFileSync(join(ASSETS, "index.html"), "utf-8");
  const iSummary = html.indexOf('id="summary"');
  const iPanel = html.indexOf('id="panel"');
  check("19 자리", iSummary > 0 && iPanel > iSummary,
    "우측 열에서 요약 박스가 위, 패널이 그 아래다", "요약 박스와 패널의 자리가 뒤집혔거나 없다");
  check("19 요약 항상", /function drawSummary/.test(html) && /drawSummary\(\);/.test(html)
        && !/drawSummary[\s\S]{0,60}selected/.test(html),
    "요약 박스는 선택 상태와 무관하게 매 갱신마다 그려진다(패널을 열어도 그대로 있다)",
    "요약 박스가 선택 상태에 얽혀 있다");
  // 호출 **횟수**를 박으면 리팩터링에 깨지면서 정작 둘 다 틀린 경우는 통과한다.
  // 그래서 「한 자리를 삼항 하나가 나눠 쓴다」는 구조를 통째로 대조한다.
  const panelEls = (html.match(/id="panel"/g) ?? []).length;
  const split = /selected\.kind === "node" \? nodePanelHtml\(selected\.id\) : delayPanelHtml\(selected\.id\)/.test(html);
  check("19 패널 하나", panelEls === 1 && split,
    "패널 자리는 하나고, 스킬 패널과 지연 진단이 그 한 자리를 삼항 하나로 나눠 쓴다(둘이 동시에 안 열린다)",
    `패널이 한 자리를 나눠 쓰지 않는다 (자리 ${panelEls} · 삼항 ${split})`);
  check("19 프로브(선택 자리 하나)", (html.match(/let selected/g) ?? []).length === 1,
    "열린 패널을 담는 변수가 하나뿐이다 — 둘을 동시에 담을 자리가 없다", "선택 상태를 담는 자리가 여럿이다");
}

// ── 20. goal · delay_reason · 전환 blockers 스키마 ───────────────────────
{
  const now = Date.now();
  const req = {
    task: "T", request: "r", goal: null, source: "manual", spec_path: null,
    items: [{ id: "I1", label: "하나", done: false }],
    status: "진행 중", status_reason: null, started_at: new Date(now).toISOString(), ended_at: null,
  };
  check("20 goal null", validateRequest(req).length === 0, "goal 이 null 인 요청은 통과한다", "goal: null 이 거부됐다");
  check("20 goal 문자열", validateRequest({ ...req, goal: "왜 하는지 한 줄" }).length === 0,
    "goal 이 문자열인 요청은 통과한다", "goal 문자열이 거부됐다");
  const { goal, ...noGoal } = req;
  check("20 프로브(goal 빠짐)", validateRequest(noGoal).some((e) => e.includes("goal")),
    "goal 을 아예 안 적은 것은 거부한다 — 모르면 null 을 적는다", "goal 이 없는데 통과했다");
  check("20 프로브(goal 숫자)", validateRequest({ ...req, goal: 3 }).some((e) => e.includes("goal")),
    "goal 에 문자열도 null 도 아닌 값을 거부한다", "goal 에 숫자가 통과했다");

  const st = { session_id: "s", current_node: "qa", task: "t", now: "n", since: new Date(now).toISOString(), blockers: [], skill: null, delay_reason: null };
  check("20 사유 null", validateState(st, DERIVED).length === 0, "delay_reason 이 null 인 state 는 통과한다", "delay_reason: null 이 거부됐다");
  const { delay_reason, ...noReason } = st;
  check("20 프로브(사유 빠짐)", validateState(noReason, DERIVED).some((e) => e.includes("delay_reason")),
    "delay_reason 을 아예 안 적은 것은 거부한다(빠뜨림과 '사유 없음'을 구별한다)", "delay_reason 이 없는데 통과했다");
  check("20 프로브(사유 길이)", validateState({ ...st, delay_reason: "가".repeat(81) }, DERIVED).some((e) => e.includes("delay_reason")),
    "80자를 넘는 지연 사유를 거부한다(산문 보고를 쓰는 자리가 아니다)", "긴 지연 사유가 통과했다");
  check("20 프로브(사유 경계)", validateState({ ...st, delay_reason: "가".repeat(80) }, DERIVED).length === 0,
    "정확히 80자는 통과한다", "80자가 거부됐다 — 경계가 하나 어긋났다");
  // 심볼로만 대조하면 NOW_MAX 를 500 으로 바꿔도 통과한다. 규약 2절의 「80자」를 값으로 고정한다.
  check("20 규약 값", NOW_MAX === 80,
    "now 한도는 규약이 적은 80자다", `규약은 80자인데 코드가 ${NOW_MAX} 를 쓴다`);

  const tr = { at: new Date(now).toISOString(), from_node: null, to_node: "qa", task: "t", now: "n", result: null, item: null, blockers: [{ id: "b", label: "l" }] };
  check("20 blockers", validateTransition(tr, DERIVED).length === 0, "전환 줄의 blockers 를 받아들인다", "전환의 blockers 가 거부됐다");
  check("20 프로브(blockers 모양)", validateTransition({ ...tr, blockers: [{ id: "b" }] }, DERIVED).some((e) => e.includes("blockers")),
    "label 이 없는 blocker 를 거부한다", "모양이 깨진 blocker 가 통과했다");
  const { blockers, ...oldRow } = tr;
  check("20 프로브(옛 줄)", validateTransition(oldRow, DERIVED).length === 0,
    "blockers 를 안 적던 시절의 줄은 그대로 읽는다(이력을 되돌아가 고치지 않는다)", "옛 전환 줄이 거부됐다");
}

// ── 21. 기록 스크립트 — 지연 사유는 항목이 바뀌면 기계로 지워진다 ─────────
{
  const dir = tmp("report-delay-");
  writeFileSync(join(dir, "workflow.json"), JSON.stringify(DERIVED), "utf-8");
  const noteMod = await import(pathToFileURL(join(ROOT, "scripts", "report-note.mjs")).href);

  noteMod.note(dir, { node: "implement", task: "T", now: "하나 하는 중", item: "하나" });
  noteMod.note(dir, { node: "implement", task: "T", now: "여전히 하나", item: "하나", delayReason: "재실행이 매번 3분" });
  const s1 = JSON.parse(readFileSync(join(dir, "state.json"), "utf-8"));
  check("21 사유 기록", s1.delay_reason === "재실행이 매번 3분", "지연 사유가 state 에 적힌다", "지연 사유가 안 적혔다");

  noteMod.note(dir, { node: "implement", task: "T", now: "계속 하나", item: "하나" });
  const s2 = JSON.parse(readFileSync(join(dir, "state.json"), "utf-8"));
  check("21 유지", s2.delay_reason === "재실행이 매번 3분",
    "같은 항목에 머무는 동안은 사유가 유지된다", "같은 항목인데 사유가 사라졌다");

  noteMod.note(dir, { node: "implement", task: "T", now: "둘 시작", item: "둘" });
  const s3 = JSON.parse(readFileSync(join(dir, "state.json"), "utf-8"));
  check("21 초기화", s3.delay_reason === null,
    "항목이 바뀌면 사유가 null 로 돌아간다(사람이 지우는 것에 안 맡긴다)", "항목이 바뀌었는데 앞 항목의 사유가 남았다");

  const rows = parseJsonl(readFileSync(join(dir, "transitions.jsonl"), "utf-8")).rows;
  check("21 전환 blockers", rows.every((r) => Array.isArray(r.blockers)),
    "전환 줄마다 그 시점의 blockers 가 남는다", "blockers 가 안 남는 전환 줄이 있다");
  noteMod.note(dir, { node: "implement", task: "T", now: "대기", item: "둘", blockers: [{ id: "q", label: "정해 주세요" }] });
  const rows2 = parseJsonl(readFileSync(join(dir, "transitions.jsonl"), "utf-8")).rows;
  check("21 프로브(blocker 구간)", rows2[rows2.length - 1].blockers.length === 1 && rows2[0].blockers.length === 0,
    "blocker 가 생긴 줄과 없던 줄이 이력에서 구별된다 — 지연 진단이 대기 구간을 여기서 잰다",
    "blocker 가 이력에서 구별되지 않는다");
}

// ── 22. 리뷰에서 나온 「조용히 그럴듯해지는」 자리들 ─────────────────────
//
// 전부 2026-09-15 코드 리뷰가 잡은 것이다. 공통점 하나 — 틀렸을 때 에러가 아니라
// 그럴듯한 숫자가 나온다. 그래서 값이 맞는지가 아니라 **모를 때 모른다고 말하는지**를 본다.
{
  const now = Date.now();
  const iso = (min) => new Date(now - min * 60000).toISOString();
  const cfg = DEFAULT_REPORT_CONFIG;
  const chain = (rows) => rows.map((r, i) => ({ ...r, from_node: i === 0 ? null : "implement" }));
  const row = (min, o = {}) => ({ at: iso(min), from_node: null, to_node: "implement", task: "T", now: "n", result: null, item: null, blockers: [], ...o });
  const reqOf = (items, tr) => ({
    task: "T", request: "r", goal: null, source: "manual", spec_path: null, items,
    status: "진행 중", status_reason: null, started_at: tr[0].at, ended_at: null,
  });
  const dataOf = (items, tr, extra = {}) => {
    const request = reqOf(items, tr);
    return {
      workflow: DERIVED, request, transitions: tr,
      state: { session_id: "s", current_node: "implement", task: "T", now: "n", since: tr[tr.length - 1].at, blockers: [], skill: null, delay_reason: null },
      activity: [], subagents: [], history: [], ...extra,
    };
  };

  // H1. 끝난 항목의 구간이 영원히 자라지 않는다
  {
    // 순서가 중요하다. 「끝난 것 → **딴 일** → 지금 것」이라야 자르는 코드를 지난다 —
    // 딴 일 구간의 during 이 아직 「끝난 것」이기 때문이다. 사이에 다른 요청 안 항목을 끼우면
    // 이월이 거기서 넘어가 버려서, 자르는 줄을 지워도 프로브가 초록으로 남는다(실제로 그랬다).
    const items = [{ id: "I1", label: "끝난 것", done: true }, { id: "I2", label: "지금 것", done: false }];
    const tr = chain([row(180, { item: "끝난 것" }), row(150, { item: "딴 일" }), row(60, { item: "지금 것" })]);
    const d = delayDiagnosisRef("끝난 것", dataOf(items, tr), now, cfg);
    check("22 H1", Math.round(d.dwellMs / 60000) === 30 && d.derived.rows.length === 0,
      "끝난 항목의 구간은 자기 마지막 구간에서 끊긴다 (체류 30분 · 그 뒤 90분은 안 붙는다)",
      `끝난 항목이 뒤 시간을 끌어안았다: 체류 ${Math.round(d.dwellMs / 60000)}분 · 파생 ${JSON.stringify(d.derived.rows)}`);
    // 자르지 않았을 때 무엇이 붙는지를 같이 보여 준다 — 「지금 항목」으로 물으면 같은 이월 규칙이
    // 살아 있어서 딴 일이 잡힌다. 위 0건이 "원래 아무것도 없어서"가 아니라는 증거다.
    const cut = delayDiagnosisRef("지금 것", dataOf([{ ...items[0] }, { ...items[1] }], chain([row(180, { item: "지금 것" }), row(150, { item: "딴 일" })])), now, cfg);
    check("22 프로브(안 자르면 붙는다)", cut.derived.rows.length === 1,
      "같은 모양이라도 지금 항목이면 딴 일이 그 항목 구간에 붙는다 — 위 0건은 자른 결과다",
      "이월 자체가 안 돈다 — 위 0건이 무엇을 뜻하는지 확인할 수 없다");
    const withBack = chain([row(180, { item: "끝난 것" }), row(150, { item: "지금 것" }), row(120, { item: "딴 일" }), row(60, { item: "지금 것" })]);
    const cur = delayDiagnosisRef("지금 것", dataOf(items, withBack), now, cfg);
    check("22 프로브(지금 항목은 안 끊는다)", cur.derived.rows.length === 1 && Math.round(cur.derived.totalMs / 60000) === 60,
      "지금 항목은 끝이 아직 없으므로 기준 시각까지 세고, 사이에 끼어든 일도 잡는다",
      `지금 항목의 구간이 잘렸다: 파생 ${JSON.stringify(cur.derived)}`);
  }

  // H2. 활동 기록이 아예 없으면 「구간 전체가 공백」이라고 말하지 않는다
  {
    const items = [{ id: "I1", label: "하나", done: false }];
    const tr = chain([row(180, { item: "하나" })]);
    const none = delayDiagnosisRef("하나", dataOf(items, tr), now, cfg);
    check("22 H2", none.gaps.known === false && none.gaps.rows.length === 0,
      "활동 기록이 하나도 없으면 활동 공백을 '없음'도 '3시간'도 아닌 '기록 없음'으로 둔다",
      `훅이 안 붙은 상태를 공백으로 셌다: ${JSON.stringify(none.gaps)}`);
    const withAct = delayDiagnosisRef("하나", dataOf(items, tr, { activity: [{ at: iso(179), tool: "Edit", target: "a", session_id: "s" }] }), now, cfg);
    check("22 프로브(기록이 있으면 센다)", withAct.gaps.known === true && withAct.gaps.rows.length === 1,
      "활동 기록이 한 줄이라도 있으면 그때부터는 공백을 센다", "활동 기록이 있는데도 공백을 안 셌다");
  }

  // H4. label 이 겹치면 거부한다 — 전환과 항목을 잇는 키가 label 이다
  {
    const dup = [{ id: "I1", label: "같은 이름", done: false }, { id: "I2", label: "같은 이름", done: false }];
    const tr = chain([row(60, { item: "같은 이름" })]);
    check("22 H4", validateRequest(reqOf(dup, tr)).some((e) => e.includes("label 이 겹친다")),
      "label 이 겹치는 items 를 거부한다", "label 이 겹치는데 통과했다 — 같은 시간이 두 칸에 중복 계상된다");
    const strip = itemStripRef(reqOf(dup, tr), tr, now, cfg);
    check("22 프로브(겹치면 중복 계상)", strip.cells[0].ms === strip.cells[1].ms && strip.cells[0].ms > 0,
      "겹친 label 이 실제로 두 칸에 같은 시간을 넣는다 — 위 거부가 막는 것이 이것이다",
      "겹친 label 의 중복 계상이 재현되지 않는다 — 이 항목이 무엇을 막는지 확인할 수 없다");
    const long = "가".repeat(70);
    const items = itemsFromSpec(`- INV-A1: ${long}1\n- INV-A2: ${long}2`);
    check("22 프로브(잘려서 겹침)", items.length === 2 && items[0].label !== items[1].label,
      "59자에서 잘려 같아지는 불변식 둘을 서로 다른 label 로 만든다", "잘린 label 이 똑같이 나왔다");
  }

  // M1. 읽을 수 없는 at 은 구간에서 빼고, 뺀 줄 수를 센다
  {
    const items = [{ id: "I1", label: "하나", done: false }];
    // 깨진 줄을 **가운데**에 심는다. 꼬리에 심으면 앞 구간이 원래 안 접혀서, 주석이 경고하는
    // 증상(앞 줄의 끝이 자기 시작으로 접혀 0초가 된다)을 한 번도 안 지난다.
    const good = chain([row(60, { item: "하나" }), row(30, { item: "하나" })]);
    const withBroken = [good[0], { ...row(45, { item: "하나" }), at: "언제였더라" }, good[1]];
    const ok = itemIntervalsRef(reqOf(items, good), good, now);
    const bad = itemIntervalsRef(reqOf(items, good), withBroken, now);
    const mins = (list) => list.map((x) => Math.round(x.ms / 60000));
    check("22 M1", bad.length === 2 && bad.dropped === 1
          && JSON.stringify(mins(ok)) === JSON.stringify(mins(bad)) && JSON.stringify(mins(bad)) === JSON.stringify([30, 30]),
      "가운데의 못 읽는 줄을 빼고(dropped 1) 앞뒤 구간은 30분·30분 그대로 둔다",
      `깨진 줄이 앞 구간까지 망쳤다: ${JSON.stringify(mins(bad))} (정상: ${JSON.stringify(mins(ok))})`);
  }

  // M4. 같은 공백 임계를 요약 박스와 지연 진단이 같은 부등호로 읽는다
  //
  // 활동을 5분 간격으로 촘촘히 깔고 **마지막 10분만** 비운다. 성기게 깔면 구간 앞쪽에 큰 공백이
  // 먼저 생겨서, 부등호를 무엇으로 바꾸든 패널은 늘 "공백 있음"이 된다(그 픽스처로는 아무것도
  // 못 잡는다). 그리고 `box === panel` 로만 단언하면 **둘 다 꺼져도** 통과하므로 둘 다 참을 본다.
  {
    const items = [{ id: "I1", label: "하나", done: false }];
    const tr = chain([row(60, { item: "하나" })]);
    const dense = [];
    for (let m = 60; m >= 10; m -= 5) dense.push({ at: iso(m), tool: "Edit", target: "a", session_id: "s" });
    const exact = dataOf(items, tr, { activity: dense });
    const box = noticeRowsRef(exact, now, cfg).some((n) => n.code === 7);
    const gaps = delayDiagnosisRef("하나", exact, now, cfg).gaps.rows;
    check("22 M4", box === true && gaps.length === 1 && Math.round(gaps[0].ms / 60000) === 10,
      "정확히 임계(10분)만큼 끊긴 구간을 특이사항과 지연 진단이 둘 다 공백으로 센다",
      `같은 설정을 두 칸이 다르게 읽는다: 특이사항 ${box} · 패널 ${JSON.stringify(gaps.map((g) => Math.round(g.ms / 60000)))}`);
    const under = dataOf(items, tr, { activity: [...dense, { at: iso(4), tool: "Edit", target: "a", session_id: "s" }] });
    check("22 프로브(임계 미만)", noticeRowsRef(under, now, cfg).every((n) => n.code !== 7)
          && delayDiagnosisRef("하나", under, now, cfg).gaps.rows.length === 0,
      "임계에 못 미치는 간격(5분·4분)만 있으면 두 칸 다 조용하다", "임계 미만인데 공백으로 셌다");
  }

  // M6. 항목 체류 임계의 경계 — 「넘으면」이라 정확히 T 는 초과가 아니다 (규약 11절)
  {
    const mk = (ms) => {
      const at = new Date(now - ms).toISOString();
      const items = [{ id: "I1", label: "하나", done: false }];
      const tr = [{ at, from_node: null, to_node: "implement", task: "T", now: "n", result: null, item: "하나", blockers: [] }];
      return itemStripRef(reqOf(items, tr), tr, now, cfg).cells[0].over;
    };
    const T = cfg.dwell_threshold_min * 60000;
    check("22 M6", mk(T) === false && mk(T + 60000) === true,
      "정확히 임계면 초과가 아니고, 1분을 넘으면 초과다(규약의 「넘으면」이 그 뜻이다)",
      `임계 경계가 안 맞는다: 정확히 ${mk(T)} · 1분 초과 ${mk(T + 60000)}`);
  }

  // M4(모델). task 필터 — 앞 요청의 전환이 지금 띠에 합산되면 안 된다
  {
    const items = [{ id: "I1", label: "하나", done: false }];
    const mine = chain([row(40, { item: "하나" })]);
    const mixed = [{ ...row(300, { item: "하나" }), task: "이전-T" }, ...mine];
    const a = itemStripRef(reqOf(items, mine), mine, now, cfg).cells[0].ms;
    const b = itemStripRef(reqOf(items, mine), mixed, now, cfg).cells[0].ms;
    check("22 task 필터", Math.round(a / 60000) === 40 && a === b,
      "다른 task 의 전환은 이 요청의 체류에 안 섞인다 (40분 그대로)",
      `앞 요청의 시간이 합산됐다: ${Math.round(a / 60000)}분 → ${Math.round(b / 60000)}분`);
  }
}

// ── 23. 지연 사유는 항목이 바뀔 때만 지워진다 (그래프 밖은 항목이 아니다) ──
{
  const dir = tmp("report-delay2-");
  writeFileSync(join(dir, "workflow.json"), JSON.stringify(DERIVED), "utf-8");
  const noteMod = await import(pathToFileURL(join(ROOT, "scripts", "report-note.mjs")).href);
  const reason = () => JSON.parse(readFileSync(join(dir, "state.json"), "utf-8")).delay_reason;

  noteMod.note(dir, { node: "implement", task: "T", now: "하나", item: "하나", delayReason: "재실행이 매번 3분" });
  noteMod.note(dir, { node: null, task: "T", now: "킷 손보는 중", offGraph: "킷", item: null });
  check("23 그래프 밖", reason() === "재실행이 매번 3분",
    "그래프 밖 전환(항목 null)은 항목이 바뀐 것이 아니다 — 사유가 남는다",
    "그래프 밖으로 한 줄 나갔다고 사유가 지워졌다 — 항목은 바뀐 적이 없다");
  noteMod.note(dir, { node: "implement", task: "T", now: "다시 하나", item: "하나" });
  check("23 복귀", reason() === "재실행이 매번 3분", "같은 항목으로 돌아오면 사유가 그대로다", "돌아왔는데 사유가 없다");
  noteMod.note(dir, { node: "implement", task: "T", now: "둘", item: "둘" });
  check("23 바뀜", reason() === null, "항목이 정말 바뀌면 사유가 지워진다", "항목이 바뀌었는데 앞 사유가 남았다");

  // 항목이 바뀌는 그 줄에 사유를 명시하면 그것이 이긴다(새 항목에 대한 사유다)
  noteMod.note(dir, { node: "implement", task: "T", now: "셋", item: "셋", delayReason: "새 항목 사유" });
  check("23 명시 우선", reason() === "새 항목 사유",
    "항목이 바뀌는 줄에 사유를 주면 지워지지 않고 그 값이 적힌다", "명시한 사유가 초기화에 먹혔다");

  // blockers 상속 — 안 주면 앞 상태의 것이 이어진다. 지연 진단의 대기 구간이 이것에 기댄다.
  noteMod.note(dir, { node: "implement", task: "T", now: "대기 시작", item: "셋", blockers: [{ id: "q", label: "정해 주세요" }] });
  noteMod.note(dir, { node: "implement", task: "T", now: "계속 대기", item: "셋" });
  const rows3 = parseJsonl(readFileSync(join(dir, "transitions.jsonl"), "utf-8")).rows;
  check("23 blocker 상속", rows3[rows3.length - 1].blockers.length === 1,
    "blocker 를 안 주면 앞 상태의 것이 이어진다 — 대기 구간이 한 줄에서 끊기지 않는다",
    "blocker 를 안 줬더니 빈 배열이 됐다 — 대기가 한 줄 만에 풀린 것으로 보인다");
  noteMod.note(dir, { node: "implement", task: "T", now: "해소", item: "셋", blockers: [] });
  const rows4 = parseJsonl(readFileSync(join(dir, "transitions.jsonl"), "utf-8")).rows;
  check("23 프로브(해소)", rows4[rows4.length - 1].blockers.length === 0,
    "빈 배열을 명시하면 해소로 기록된다", "해소가 기록되지 않는다");
}

// ── 24~33. 화면 재구성 v3 — 읽는 순서·라벨 필수·화면 어휘 ─────────────────
//
// 이 묶음이 지키는 것은 하나다: **화면에 나간 말이 사람의 말인가.**
// 틀렸을 때의 증상이 에러가 아니라 「값이 라벨 없이 점으로 이어진 줄」이나
// 「하네스 내부 용어가 그대로 적힌 칸」이라서, 보고 있어도 틀린 줄을 모른다.
// 그래서 렌더가 문자열이 아니라 **라벨 달린 줄의 배열**을 돌려주게 하고 여기서 전수로 본다.

// 아래 항목들이 공유하는 바탕 셋. 킷 작업 · 요청 작업 · 요청 없는 제품 작업이다.
const V3 = (() => {
  const now = Date.now();
  const iso = (m) => new Date(now - m * 60000).toISOString();
  const base = { workflow: DERIVED, subagents: [], history: [], activity: [{ at: iso(1), tool: "Edit", target: "a.ts", session_id: "s" }] };
  const kit = {
    ...base,
    state: { session_id: "s", current_node: null, task: "T", now: "어휘표 설계", since: iso(42), blockers: [], skill: null, delay_reason: null, off_graph: "킷 — 대시보드 재구성" },
    request: null, transitions: [],
  };
  const request = {
    ...base,
    state: { session_id: "s", current_node: "implement", task: "T", now: "버튼 붙이는 중", since: iso(12), blockers: [], skill: null, delay_reason: null },
    request: {
      task: "T", title: "게시글 좋아요", request: "③으로 투입: '게시글 좋아요' (또는 같은 크기의 DB+API+UI 기능). 개입 횟수를 셀 것",
      goal: "인기 글을 고르려는 것", source: "manual", spec_path: null,
      items: [{ id: "I1", label: "테이블", done: true }, { id: "I2", label: "API", done: false }, { id: "I3", label: "버튼", done: false }],
      status: "진행 중", status_reason: null, started_at: iso(60), ended_at: null,
    },
    transitions: [
      { at: iso(60), from_node: null, to_node: "implement", task: "T", now: "시작", result: null, item: "테이블", blockers: [] },
      { at: iso(20), from_node: "implement", to_node: "implement", task: "T", now: "API", result: "통과", item: "API", blockers: [] },
    ],
  };
  const product = {
    ...request, request: null,
    state: { ...request.state, current_node: "deploy", now: "커밋 대기", since: iso(5) },
  };
  return { now, iso, kit, request, product, all: [kit, request, product] };
})();

/** 한 상태가 화면에 내보내는 **라벨 달린 줄 전부**. 세 절이 이것 말고 다른 문자열을 안 만든다. */
const v3Rows = (d) => [
  ...nowRowsRef(d, V3.now, DEFAULT_REPORT_CONFIG).rows,
  ...noticeRowsRef(d, V3.now, DEFAULT_REPORT_CONFIG),
  ...summaryRowsRef(d),
];

// ── 24. 라벨 필수 ───────────────────────────────────────────────────────
{
  // 판정기를 먼저 세우고, 진짜 화면과 **심은 위반** 둘 다에 같은 것을 먹인다.
  // 판정기를 진짜에만 쓰면 "위반 0건"과 "검사가 안 돌았다"가 겉으로 같다.
  const unlabeled = (rows) => rows.filter((r) => typeof r.label !== "string" || r.label.trim() === "" || !ALL_LABELS.includes(r.label));

  const bad24 = V3.all.flatMap((d) => unlabeled(v3Rows(d)).map((r) => `${r.label}=${r.value}`));
  check("24 라벨", bad24.length === 0,
    `세 상태의 모든 줄이 어휘표의 라벨을 달고 나온다 (검사한 줄 ${V3.all.reduce((s, d) => s + v3Rows(d).length, 0)}개)`,
    `라벨이 없거나 어휘표 밖인 줄이 있다: ${bad24.join(" / ")}`);

  const planted = [{ label: "", value: "그래프 밖 · 이 단계 42분 · 진행 중" }, { label: "지도 밖", value: "x" }];
  check("24 프로브(무라벨)", unlabeled(planted).length === 2,
    "라벨이 빈 줄과 어휘표 밖 라벨을 둘 다 잡는다", "심은 무라벨 줄이 통과했다 — 이 항목은 무효다");

  // 옛 화면의 무라벨 한 줄(「지금」 요약 문장)이 아직 있으면 이 검사를 우회한다.
  check("24 옛 요약 없음", RENDER_EXPORTS.summaryBox === undefined,
    "라벨 없이 문장 하나를 만들던 옛 요약 함수가 없어졌다",
    "summaryBox 가 아직 있다 — 라벨 없는 문장이 화면에 남을 길이 열려 있다");
}

// ── 25. 화면 어휘표 밖의 말이 없다 ───────────────────────────────────────
{
  // 기록에서 실려 온 값(요청 원문·now·항목 이름)은 대상이 아니다 — 사람이 적은 문장을
  // 화면이 고쳐 쓰지 않는다. 그래서 줄마다 fromRecord 를 들고 다니고, 여기서 그것으로 가른다.
  const internal = (rows) => rows.flatMap((r) => {
    const text = `${r.label ?? ""} ${r.fromRecord ? "" : r.value ?? ""}`;
    return INTERNAL_TERMS.filter((t) => text.includes(t)).map((t) => `${t} @ ${r.label}:${r.value}`);
  });

  const bad25 = V3.all.flatMap((d) => internal(v3Rows(d)));
  check("25 내부 용어", bad25.length === 0,
    "세 상태 어디에도 하네스 내부 용어가 화면 문자열로 나가지 않는다",
    `내부 용어가 화면에 나갔다: ${bad25.join(" / ")}`);

  const planted = [{ label: "현재 단계", value: "지도 밖 · 42분", fromRecord: false }];
  check("25 프로브(내부 용어)", internal(planted).length > 0,
    "심은 내부 용어를 잡는다", "심은 내부 용어가 통과했다 — 이 항목은 무효다");

  const exempt = [{ label: "지금 하는 일", value: "킷 — 그래프 밖 정리 — 어쩌고", fromRecord: true }];
  check("25 프로브(기록은 예외)", internal(exempt).length === 0,
    "사람이 적어 둔 문장에 같은 말이 들어 있어도 위반이 아니다(화면이 만든 말만 본다)",
    "기록에서 실려 온 문장까지 위반으로 셌다 — 그러면 아무 요청도 못 그린다");

  // 어휘표 자신도 대상이다. 표가 오염되면 위의 전수 검사가 통째로 눈을 감는다.
  const tableBad = [...ALL_LABELS, ...Object.values(VOCAB_TERM)]
    .flatMap((s) => INTERNAL_TERMS.filter((t) => s.includes(t)).map((t) => `${t} @ ${s}`));
  check("25 어휘표 자신", tableBad.length === 0,
    "어휘표에 적힌 말 자체에 내부 용어가 없다", `어휘표가 내부 용어를 담고 있다: ${tableBad.join(" / ")}`);
}

// ── 26. 킷 작업 · 제품 작업 — 행 구성과 지도의 파이프라인 밖 상자 ──────────
{
  const kitNow = nowRowsRef(V3.kit, V3.now, DEFAULT_REPORT_CONFIG);
  const keys = kitNow.rows.map((r) => r.key);
  check("26 킷 행", kitNow.kind === "kit" && JSON.stringify(keys) === JSON.stringify(["now_doing", "work_kind", "stage", "stage_dwell", "status"]),
    "제품 단계가 아니면 「항목 진행」 없이 다섯 줄로 그린다(0/0 같은 값을 안 만든다)",
    `킷 작업 행이 다르다: ${JSON.stringify(keys)}`);
  const stageRow = kitNow.rows.find((r) => r.key === "stage");
  check("26 킷 단계", stageRow.value === VOCAB_TERM.stage_none,
    "「현재 단계」가 왜 없는지까지 적는다", `단계 칸이 다르다: ${stageRow.value}`);

  const m = mapViewRef(DERIVED, V3.kit.state);
  check("26 상자 강조", m.offBox.current === true && m.dimmed === true,
    "제품 단계가 아니면 「파이프라인 밖」 상자가 강조되고 제품 단계는 저채도가 된다",
    `상자 강조가 안 맞는다: ${JSON.stringify([m.offBox.current, m.dimmed])}`);
  const m2 = mapViewRef(DERIVED, V3.request.state);
  check("26 프로브(반대)", m2.offBox.current === false && m2.dimmed === false,
    "제품 단계에 있으면 상자가 저채도다(둘이 동시에 강조되지 않는다)",
    "제품 단계인데 파이프라인 밖 상자가 같이 강조된다");
  check("26 지도 폭", m.width <= 980,
    `상자를 더해도 지도 폭이 ${m.width}px — 창 1024px 에서 가로 스크롤 없이 들어간다`,
    `상자를 더했더니 ${m.width}px 로 넘친다 (기준: docs/references/devtool-ui-standards.md 6절)`);

  const pNow = nowRowsRef(V3.product, V3.now, DEFAULT_REPORT_CONFIG);
  check("26 제품 작업", pNow.kind === "product"
        && pNow.rows.find((r) => r.key === "work_kind").value === VOCAB_TERM.kind_product
        && !pNow.rows.some((r) => r.key === "item_progress"),
    "제품 단계인데 열린 요청이 없으면 그 사실을 「작업 종류」에 적고 항목 진행은 안 만든다",
    `요청 없는 제품 작업의 행이 다르다: ${JSON.stringify(pNow.rows.map((r) => [r.key, r.value]))}`);

  const pProg = progressViewRef(V3.product, V3.now, DEFAULT_REPORT_CONFIG);
  const kProg = progressViewRef(V3.kit, V3.now, DEFAULT_REPORT_CONFIG);
  check("26 띠 없음", pProg.kind === "none" && kProg.kind === "none"
        && kProg.message === VOCAB_TERM.strip_none_kit && pProg.message === VOCAB_TERM.strip_none_product,
    "띠를 못 그리는 두 경우가 서로 다른 이유를 적는다(왜 없는지가 달라서 문구도 다르다)",
    `띠 없음 문구가 다르다: ${JSON.stringify([kProg.message, pProg.message])}`);
}

// ── 27. 요청 작업 — 제목이 대표하고, 없으면 원문 앞 40자 ──────────────────
{
  const v = nowRowsRef(V3.request, V3.now, DEFAULT_REPORT_CONFIG);
  const doing = v.rows.find((r) => r.key === "now_doing").value;
  check("27 제목 대표", v.kind === "request" && doing.startsWith("게시글 좋아요 —"),
    "열린 요청이 있으면 맨 윗줄을 제목이 대표한다(원문이 아니라)",
    `맨 윗줄이 제목으로 시작하지 않는다: ${doing}`);
  check("27 항목 진행", v.rows.find((r) => r.key === "item_progress").value === "1/3 완료 · 현재 항목: API",
    "항목 진행이 완료 수와 지금 항목을 같이 적는다",
    `항목 진행이 다르다: ${v.rows.find((r) => r.key === "item_progress").value}`);

  const noTitle = JSON.parse(JSON.stringify(V3.request));
  noTitle.workflow = DERIVED;
  noTitle.request.title = null;
  const doing2 = nowRowsRef(noTitle, V3.now, DEFAULT_REPORT_CONFIG).rows.find((r) => r.key === "now_doing").value;
  const head40 = [...V3.request.request.request].slice(0, 40).join("");
  check("27 제목 없음", doing2.startsWith(head40),
    `제목이 확정 전이면 원문 앞 40자가 그 자리를 대신한다`,
    `대역이 안 맞는다: ${doing2}`);
  check("27 프로브(안 자름)", head40.length === 40 && V3.request.request.request.length > 40,
    "이 바탕의 원문이 40자보다 길다 — 안 그러면 위 항목이 아무것도 안 본다",
    "바탕 원문이 짧아서 자르기가 확인되지 않는다");

  // 요약 박스는 원문을 그대로 들고 있다. 제목이 대표한다고 원문을 고쳐 쓰지 않는다.
  const sum = summaryRowsRef(V3.request);
  check("27 원문 보존", sum.find((r) => r.key === "request_text").value === V3.request.request.request,
    "요약 박스의 요청 원문은 자르지도 고치지도 않는다", "요청 원문이 화면에서 바뀌었다");
}

// ── 28. 특이사항 절은 조건이 있을 때만 나타난다 ──────────────────────────
{
  const html = readFileSync(join(ASSETS, "index.html"), "utf-8");
  check("28 절 숨김", /function drawNotice\(\)[\s\S]{0,400}rows\.length === 0[\s\S]{0,80}hidden = true/.test(html),
    "특이사항 조건이 하나도 없으면 화면이 절 자체를 지운다('없음'이라고 안 쓴다)",
    "특이사항이 비어도 절을 그린다 — 자리만 차지하고 아무것도 안 알려 준다");
  check("28 Tab", /<li tabindex="0"/.test(html),
    "특이사항 줄이 Tab 순회에 들어간다", "특이사항 줄에 초점이 안 간다");
}

// ── 29. 서브에이전트 접힘 절 ─────────────────────────────────────────────
{
  // 에이전트 목록의 출처는 workflow(=바인딩 파일이 아니라 .claude/agents 의 실제 파일)다.
  // DERIVED 에는 그 목록이 없으므로(설치 때 붙는다) 여기서는 이름 셋짜리 바탕을 만든다 —
  // 이 항목이 보는 것은 목록의 출처가 아니라 접힘 규칙이다(출처는 12절이 본다).
  const AGENTS = { nodes: [], edges: [], skills: [], agents: [{ name: "a-one" }, { name: "a-two" }, { name: "a-three" }] };
  const idle = subagentSectionRef(AGENTS, []);
  check("29 전부 대기", idle.open === false && idle.summary === `전부 대기 (${idle.rows.length})` && idle.rows.length > 0,
    `전부 대기면 접힌 채로 개수만 말한다 (${idle.summary})`,
    `전부 대기인데 접힘/제목이 다르다: ${JSON.stringify([idle.open, idle.summary])}`);

  const name = AGENTS.agents[0].name;
  const running = subagentSectionRef(AGENTS, [{ at: new Date(V3.now - 60000).toISOString(), event: "start", agent: name, brief: "b" }], V3.now);
  check("29 실행 중", running.open === true && running.rows[0].name === name && running.rows[0].running,
    "하나라도 실행 중이면 펼치고 그것을 맨 위로 올린다",
    `실행 중인데 안 펼쳐지거나 순서가 그대로다: ${JSON.stringify([running.open, running.rows[0].name])}`);
  check("29 프로브(개수)", running.summary === "실행 중 1개",
    "펼쳤을 때의 제목은 실행 중 개수를 말한다", `제목이 다르다: ${running.summary}`);
}

// ── 30. 피드 줄의 단계 표기 ──────────────────────────────────────────────
{
  check("30 피드 단계", feedStageTextRef({ to_node: "implement", dwell_ms: 42 * 60000 }) === "구현 단계 · 머문 시간 42분",
    "피드 줄이 단계를 한글 라벨과 머문 시간으로 적는다",
    `피드 단계 표기가 다르다: ${feedStageTextRef({ to_node: "implement", dwell_ms: 42 * 60000 })}`);
  check("30 피드 킷", feedStageTextRef({ to_node: null, dwell_ms: 90 * 60000 }) === "제품 파이프라인 밖 작업 · 머문 시간 1시간 30분",
    "제품 단계가 아닌 줄은 하네스 수리로 적는다(기록의 null 을 화면 말로 바꾼다)",
    `킷 줄 표기가 다르다: ${feedStageTextRef({ to_node: null, dwell_ms: 90 * 60000 })}`);
  const html = readFileSync(join(ASSETS, "index.html"), "utf-8");
  check("30 프로브(옛 표기)", !/지도 밖/.test(html),
    "화면 코드에 옛 표기('지도 밖')가 남아 있지 않다", "화면 코드가 아직 옛 표기를 쓴다");
}

// ── 31. 요약 박스에 「지금」과 겹치는 줄이 없다 ───────────────────────────
{
  const sumKeys = summaryRowsRef(V3.request).map((r) => r.key);
  const SUM_KEYS = ["goal", "request_text", "brief"];
  check("31 자리", sumKeys.every((k) => SUM_KEYS.includes(k)),
    "요약 박스가 쓰는 자리는 목표·요청 원문·브리프 셋뿐이다", `요약 박스 줄이 다르다: ${JSON.stringify(sumKeys)}`);

  // 값이 없는 행은 그리지 않는다. 「기록 없음」이 세 줄 나란히 서면 요약 박스가 아무것도
  // 안 알려 주면서 자리만 차지한다. 판정기를 먼저 세우고 진짜와 심은 것 둘 다에 먹인다.
  const empty = (rows) => rows.filter((r) => typeof r.value !== "string" || r.value.trim() === "");
  check("31 빈 행 없음", empty(summaryRowsRef(V3.request)).length === 0,
    "값이 없는 행은 요약 박스에 안 나온다", `값 없는 행이 그려졌다: ${JSON.stringify(empty(summaryRowsRef(V3.request)).map((r) => r.key))}`);
  check("31 프로브(빈 값 심기)", !summaryRowsRef({ ...V3.request, request: { ...V3.request.request, goal: null } }).some((r) => r.key === "goal"),
    "목표를 비워 두면 그 줄이 사라진다 — 위 항목이 실제로 값을 본다", "값을 비웠는데도 줄이 그려졌다");
  check("31 프로브(값 있으면 남음)", summaryRowsRef(V3.request).some((r) => r.key === "goal"),
    "값이 있으면 그 줄은 그대로 있다 — 거르기가 전부를 지우는 것이 아니다", "값이 있는데도 줄이 사라졌다");

  const nowLabels = new Set(nowRowsRef(V3.request, V3.now, DEFAULT_REPORT_CONFIG).rows.map((r) => r.label));
  const dup = summaryRowsRef(V3.request).map((r) => r.label).filter((l) => nowLabels.has(l));
  check("31 중복 없음", dup.length === 0,
    "요약 박스와 「지금」이 같은 줄을 두 번 말하지 않는다", `두 자리에 같은 줄이 있다: ${dup.join(", ")}`);
  check("31 프로브(겹침 감지)", [...nowLabels].filter((l) => nowLabels.has(l)).length > 0,
    "겹침 판정이 실제로 라벨을 비교한다(비어 있지 않다)", "비교할 라벨이 없어 위 항목이 무효다");
}

// ── 32. request.json 의 title ────────────────────────────────────────────
{
  const base = {
    task: "T", request: "무언가 해 줘", goal: null, source: "manual", spec_path: null,
    items: [{ id: "I1", label: "하나", done: false }],
    status: "진행 중", status_reason: null, started_at: new Date().toISOString(), ended_at: null,
  };
  const errs = (patch) => validateRequest({ ...base, ...patch });
  check("32 없어도 됨", errs({}).length === 0 && errs({ title: null }).length === 0,
    "title 은 없어도 되고 null 이어도 된다(확정 전 상태가 있다)", `title 없는 요청이 거부됐다: ${errs({}).join(" / ")}`);
  check("32 40자", errs({ title: "가".repeat(40) }).length === 0,
    "40자까지는 받는다", `40자 제목이 거부됐다: ${errs({ title: "가".repeat(40) }).join(" / ")}`);
  check("32 프로브(41자)", errs({ title: "가".repeat(41) }).some((e) => e.includes("40자")),
    "41자는 거부한다 — 화면 맨 위 한 줄이 두 줄로 넘어가면 그 자리가 한 줄이 아니게 된다",
    "41자 제목이 통과했다");
  check("32 프로브(빈 문자열)", errs({ title: "   " }).length > 0,
    "공백뿐인 제목은 거부한다(모르면 아예 안 적는다)", "공백 제목이 통과했다");

  check("32 한도 두 벌", TITLE_MAX_MODEL === RENDER_EXPORTS.TITLE_MAX,
    `제목 한도가 기록 쪽과 화면 쪽에서 같다 (${TITLE_MAX_MODEL}자)`,
    `한도가 갈라졌다: 기록 ${TITLE_MAX_MODEL} vs 화면 ${RENDER_EXPORTS.TITLE_MAX} — 기록은 받는데 화면은 자르는 상태가 된다`);

  // 시작 후에는 안 바뀐다(②a). items 와 같은 규칙이고, 막는 자리도 같다.
  const dir = tmp("report-title-");
  const reqMod = await import(pathToFileURL(join(ROOT, "scripts", "report-request.mjs")).href);
  reqMod.start(dir, { task: "T", request: "무언가 해 줘", items: [{ id: "I1", label: "하나", done: false }], title: "짧은 제목" });
  let blocked = "";
  try { reqMod.update(dir, (r) => { r.title = "바꾼 제목"; }); } catch (e) { blocked = e.message; }
  check("32 프로브(제목 고정)", blocked.includes("시작 후 안 바뀐다"),
    "시작 뒤에 제목을 바꾸려 하면 거부한다", `제목이 시작 후에 바뀌었다 (막은 메시지: ${blocked || "없음"})`);
  const saved = JSON.parse(readFileSync(join(dir, "request.json"), "utf-8"));
  check("32 기록됨", saved.title === "짧은 제목",
    "시작할 때 준 제목이 request.json 에 실린다", `제목이 기록되지 않았다: ${JSON.stringify(saved.title)}`);
}

// ── 33. 「파이프라인 밖」 상자가 실행 그래프로 새지 않았다 ─────────────────
{
  // 이 상자는 렌더 요소일 뿐이다. 노드로 새면 그래프가 없는 경로를 있다고 말하게 되고,
  // dirty 전파와 프론티어가 그 없는 노드를 기다린다.
  const leaks = (text) => [VOCAB_TERM.box_kit, "off-box", "offBox"].filter((t) => text.includes(t));
  const guarded = [
    join(ROOT, "graph.mjs"),
    join(ROOT, "docs", "references", "node-skills.json"),
    ...readdirSync(join(ROOT, "gates")).filter((f) => f.endsWith(".mjs")).map((f) => join(ROOT, "gates", f)),
  ];
  const found = guarded.flatMap((f) => leaks(readFileSync(f, "utf-8")).map((t) => `${t} @ ${f.slice(ROOT.length + 1)}`));
  check("33 안 샘", found.length === 0,
    `실행 그래프·바인딩·게이트 ${guarded.length}개 어디에도 화면 상자가 없다`,
    `화면 상자가 실행 그래프 쪽으로 샜다: ${found.join(" / ")}`);
  check("33 프로브(샘 감지)", leaks(`const n = { id: "x", label: "${VOCAB_TERM.box_kit}" };`).length > 0,
    "심은 유출을 잡는다", "심은 유출이 통과했다 — 이 항목은 무효다");

  // 바인딩이 가리키는 노드가 전부 그래프에 있는지도 같이 본다 — 상자를 바인딩에만 적는
  // 방법으로도 같은 사고가 난다.
  const graphIds = new Set(DERIVED.nodes.map((n) => n.id));
  const strayed = BINDINGS.flatMap((b) => (b.nodes ?? []).filter((n) => n !== "all" && !graphIds.has(n)));
  check("33 바인딩", strayed.length === 0,
    "바인딩이 그래프에 없는 자리를 가리키지 않는다", `그래프에 없는 자리를 가리킨다: ${strayed.join(", ")}`);
}

// ── 34~40. 결정 카드 — 승인 요청을 사용자 말로 ────────────────────────────
//
// 이 카드의 증상도 에러가 아니라 **그럴듯한 화면**이다. 카드가 하네스 말로 채워져 있어도
// 화면은 멀쩡히 그려지고, 사람은 그 카드를 읽다가 포기할 뿐 아무 신호도 안 뜬다.
// 그래서 항목마다 위반을 심어 잡히는 것까지 본다.

/** 규약을 지키는 카드 한 벌. 사용자가 문구를 직접 고친 예시 그대로다 — 이것이 기준이다. */
const OK_CARD = {
  id: "signal2-20260918-1-d1",
  task: "prose",
  asked_at: "2026-09-18T01:00:00.000Z",
  answer_options: ["착수해", "아니"],
  what: "기사 상세에 원문 본문을 보여준다",
  why: "지금은 본문 칸이 비어 있다",
  visible_change: "기사 화면에 본문이 생긴다. 위험한 링크는 보이지 않는다",
  risk_and_guard: "외부 사이트의 HTML을 그대로 쓰면 위험하다.\n위험한 부분을 걸러낸 뒤 넣고, 보안 검토를 거친다",
  not_doing: "기사 수집기, 본문 번역",
  also_fixing: "원문 링크의 주소 검사 (원래 있던 허점)",
  done_when: ["본문이 보인다", "위험한 링크가 차단된다", "보안 검토를 통과했다"],
  details_ref: "projects/signal2/report/decision-detail.md",
  status: "대기",
  answer: null,
  answered_at: null,
};
const VOCAB = parseVocab(JSON.parse(readFileSync(join(ASSETS, "decision-vocab.json"), "utf-8"))).vocab;
const card = (over = {}) => ({ ...OK_CARD, ...over });
const rejects = (over, what) => validateDecision(card(over), VOCAB).some((e) => e.includes(what));

// ── 34. 스키마 — 빠진 칸·긴 줄·모자란 판정 항목 ────────────────────────────
{
  check("34 기준 카드", validateDecision(OK_CARD, VOCAB).length === 0,
    "사용자가 고른 예시 카드가 그대로 통과한다",
    `기준으로 삼은 카드가 거부됐다: ${validateDecision(OK_CARD, VOCAB).join(" / ")}`);

  const missing = { ...OK_CARD };
  delete missing.why;
  check("34 프로브(칸 누락)", validateDecision(missing, VOCAB).some((e) => e.includes("why")),
    "칸이 빠지면 거부한다", "빠진 칸이 통과했다");

  check("34 프로브(60자 초과)", rejects({ what: "가".repeat(FIELD_MAX + 1) }, `${FIELD_MAX}자를 넘는다`),
    `${FIELD_MAX}자를 넘는 칸은 거부한다 — 첫 세 칸만 읽고 답한다는 전제가 거기서 깨진다`,
    "긴 칸이 통과했다");
  check("34 경계(60자)", validateDecision(card({ what: "가".repeat(FIELD_MAX) }), VOCAB).length === 0,
    `${FIELD_MAX}자 그 자리는 받는다(경계는 포함이다)`, "경계값을 거부했다");

  check("34 프로브(판정 1개)", rejects({ done_when: ["본문이 보인다"] }, "2~5개"),
    "끝나면 확인할 것이 하나뿐이면 거부한다 — 그건 판정이 아니라 선언이다", "한 개짜리가 통과했다");
  check("34 프로브(판정 6개)", rejects({ done_when: Array(6).fill("본문이 보인다") }, "2~5개"),
    "여섯 개가 넘으면 거부한다 — 그건 작업 계획서다", "여섯 개가 통과했다");

  check("34 프로브(고를 것 하나)", rejects({ answer_options: ["착수해"] }, "2~4개"),
    "고를 것이 하나뿐이면 거부한다 — 고르는 것이 아니다", "선택지 하나가 통과했다");
  check("34 프로브(두 줄 초과)", rejects({ risk_and_guard: "한 줄\n두 줄\n세 줄" }, "2줄까지다"),
    "위험한 부분과 대비가 세 줄이면 거부한다", "세 줄이 통과했다");
  check("34 프로브(id 모양)", rejects({ id: "signal2-20260918-1" }, "연번"),
    "사이클 id 를 그대로 쓰면 거부한다 — 한 사이클에 카드가 여럿일 수 있다", "사이클 id 가 그대로 통과했다");
  check("34 프로브(답 없이 답변됨)", rejects({ status: "답변됨" }, "answer 가 비었다"),
    "답변됨인데 답이 비어 있으면 거부한다", "빈 답이 통과했다");
  check("34 프로브(고를 수 없는 답)", validateDecision(card({ status: "답변됨", answer: "나중에", answered_at: OK_CARD.asked_at }), VOCAB)
        .some((e) => e.includes("고를 수 있는 값이 아니다")),
    "고를 수 있는 값이 아닌 답은 거부한다", "엉뚱한 답이 통과했다");
}

// ── 35. 금지 표현 — 표에 적힌 말이 카드에 들어오면 거부 ────────────────────
{
  check("35 프로브(씻다)", rejects({ visible_change: "외부 HTML을 씻어서 넣는다" }, "씻다"),
    "「씻어서」를 심으면 잡는다 — 표에는 사전형으로 적혀 있어도 활용형에서 걸린다",
    "「씻어서」가 통과했다");
  check("35 프로브(구멍)", rejects({ also_fixing: "원문 링크의 구멍" }, "구멍"),
    "「구멍」을 심으면 잡는다", "「구멍」이 통과했다");
  check("35 프로브(닿는다)", rejects({ why: "이 변경이 보안에 닿는다" }, "닿는다"),
    "「닿는다」를 심으면 잡는다", "「닿는다」가 통과했다");
  check("35 대체 표현", validateDecision(card({ visible_change: "위험한 부분을 걸러낸 뒤 넣는다" }), VOCAB).length === 0,
    "대체 표현(걸러내다)은 그대로 통과한다 — 금지가 아니라 바꿔 쓰라는 표다", "대체 표현이 거부됐다");
  check("35 표 모양", parseVocab({ banned: "아님" }).errors.length > 0,
    "표의 모양이 틀리면 빈 표로 넘어가지 않고 오류다 — 조용히 통과하면 방벽이 열린다",
    "망가진 표가 그냥 통과했다");
}

// ── 36. 끝나면 확인할 것은 완결 문장이다 ──────────────────────────────────
{
  check("36 프로브(점으로 이음)", rejects({ done_when: ["본문 보임 · 이상한 링크 차단", "보안 검토를 통과했다"] }, "점(·)"),
    "점으로 이어 붙인 조각은 거부한다", "점으로 이은 조각이 통과했다");
  check("36 프로브(명사 조각)", rejects({ done_when: ["본문 보임", "보안 검토를 통과했다"] }, "완결 문장이 아니다"),
    "점이 없어도 명사 조각이면 거부한다 — 「…다」로 끝나야 한다", "명사 조각이 통과했다");
}

// ── 37. 본문 칸에 하네스의 말이 없다 (자세히 보는 곳에는 있어도 된다) ───────
{
  check("37 프로브(경로)", rejects({ what: "src/app/page.tsx 에 본문을 넣는다" }, "경로"),
    "본문 칸의 파일 경로를 잡는다", "경로가 통과했다");
  check("37 프로브(파일 이름)", rejects({ what: "render.mjs 를 고친다" }, "파일 이름"),
    "경로 없이 파일 이름만 적어도 잡는다", "파일 이름이 통과했다");
  check("37 프로브(규칙 번호)", rejects({ why: "INV-D6 이 비어 있다" }, "규칙 번호"),
    "규칙 번호를 잡는다", "규칙 번호가 통과했다");
  check("37 프로브(단계 이름)", rejects({ not_doing: "deploy 는 안 한다" }, "단계 이름"),
    "실행 그래프의 단계 이름을 잡는다", "단계 이름이 통과했다");
  check("37 자세히는 예외", validateDecision(OK_CARD, VOCAB).length === 0 && OK_CARD.details_ref.includes("/"),
    "자세히 보는 곳(details_ref)의 경로는 그대로 받는다 — 거기가 경로를 적는 자리다",
    "details_ref 의 경로까지 거부했다");
  check("37 오탐 안 함", validateDecision(card({ not_doing: "찬성/반대 투표, 본문 번역" }), VOCAB).length === 0,
    "한국어 문장의 「찬성/반대」는 경로로 보지 않는다 — ASCII 로만 된 것만 경로다",
    "한국어 사선 표기를 경로로 잘못 잡았다");
}

// ── 38. 화면 — 카드가 맨 위, 「지금」이 그 아래 ────────────────────────────
{
  const html = readFileSync(join(ASSETS, "index.html"), "utf-8");
  const iDecision = html.indexOf('id="decision-sec"');
  const iNow = html.indexOf('id="now-sec"');
  check("38 자리", iDecision > 0 && iNow > iDecision,
    "결정 카드 자리가 「지금」 절보다 위에 있다 — 답할 것이 있으면 그게 먼저다",
    `카드와 「지금」의 자리가 뒤집혔거나 없다 (카드 ${iDecision} · 지금 ${iNow})`);

  const v = decisionCardRef({ decision: OK_CARD });
  check("38 라벨:값", v !== null && v.rows.every((r) => typeof r.label === "string" && r.label !== "" && r.value),
    "카드의 모든 칸이 라벨과 값을 갖는다(라벨 필수 원칙)", "라벨이나 값이 빈 칸이 있다");
  check("38 어휘표", v !== null && v.rows.every((r) => ALL_LABELS.includes(r.label))
        && ALL_LABELS.includes(v.doneWhenLabel) && ALL_LABELS.includes(v.detailsLabel),
    "카드의 라벨이 전부 화면 어휘표 안에 있다", "어휘표 밖의 라벨이 카드에 있다");
  check("38 답은 채팅에서", v !== null && v.note === VOCAB_TERM.answer_in_chat && !/id="decision-sec"[\s\S]{0,4000}<(input|textarea|form)\b/.test(html),
    "카드에 입력칸이 없고 「답은 채팅에서」 한 줄이 붙는다 — 화면은 읽기 전용이다",
    "카드에 입력칸이 있거나 안내 한 줄이 없다");
  check("38 프로브(닫힌 결정)", decisionCardRef({ decision: { ...OK_CARD, status: "답변됨", answer: "착수해" } }) === null
        && decisionCardRef({}) === null,
    "열린 결정이 없으면 카드를 안 그린다 — 답한 카드가 화면에 남지 않는다", "닫힌 결정에도 카드가 그려진다");
  check("38 프로브(같이 고치는 것 없음)", decisionCardRef({ decision: card({ also_fixing: null }) }).rows.every((r) => r.key !== "d_also"),
    "「같이 고치는 것」이 없으면 그 줄을 안 만든다 — 빈칸은 「없다」와 「안 적었다」를 구별 못 한다",
    "빈 줄이 그려진다");
  check("38 펼침 유지", /const wasOpen = el\.querySelector\("details"\)\?\.open === true;/.test(html)
        && /<details\$\{wasOpen \? " open" : ""\}>/.test(html),
    "펼쳐 둔 「자세히」가 4초 뒤 다시 그릴 때도 펼쳐진 채로 남는다",
    "다시 그리면 「자세히」가 저절로 닫힌다 — 읽는 중에 닫히면 화면이 손을 무시하는 것이다");
  check("38 스크롤 유지", /if \(html === lastDecisionHtml\) return;/.test(html)
        && /lastDecisionHtml = html;\s*\n\s*el\.innerHTML = html;/.test(html)
        && /if \(!v\) \{ el\.innerHTML = ""; el\.hidden = true; lastDecisionHtml = ""; return; \}/.test(html),
    "내용이 그대로면 결정 카드를 다시 안 그린다 — 자세히 칸의 스크롤 위치가 남는다",
    "같은 내용으로도 카드를 갈아끼운다 — 자세히 칸이 4초마다 맨 위로 돌아가 긴 근거를 못 읽는다");
  // 위 「스크롤 유지」는 자세히 칸 **안쪽** 스크롤을, 이건 **페이지 전체** 스크롤을 본다.
  // 둘은 원인이 다르다 — 안쪽은 카드를 갈아끼워서, 페이지 쪽은 절을 갈아끼우는 동안
  // 문서가 잠깐 짧아져서 브라우저가 스크롤을 끌어내리기 때문이다. 하나만 고치면 증상이 남는다.
  // 강제 장치가 둘이라 항목도 둘로 나눈다. 한 항목으로 묶으면 둘 중 하나만 살아 있어도
  // 통과로 나와서, 나머지 하나는 아무도 안 붙드는데 숫자는 만점이 된다.
  check("38 읽던 자리", /const pageY = window\.scrollY;\s*\n\s*draw\(\);\s*\n\s*if \(window\.scrollY !== pageY\) window\.scrollTo\(/.test(html),
    "다시 그려도 페이지가 읽던 자리에 머문다",
    "다시 그리면 페이지가 맨 위로 올라간다 — 아래쪽 절을 끝까지 못 읽는다");
  check("38 초점 복원이 안 흔든다", /\?\.focus\?\.\(\{ preventScroll: true \}\)/.test(html),
    "초점을 돌려줄 때 화면을 움직이지 않는다 — 방금 되돌린 자리가 그대로 남는다",
    "초점 복원이 그 요소를 보이게 하려고 화면을 끌어당긴다");
  check("38 그대로 나감", decisionCardRef({ decision: OK_CARD }).rows.find((r) => r.key === "d_what").value === OK_CARD.what,
    "카드의 문장이 기록에 적힌 그대로 화면에 나간다(렌더가 고쳐 쓰지 않는다)", "렌더가 문장을 고쳐 썼다");
}

// ── 39. 답변 처리 — 이력으로 옮기고 카드와 근거 본문을 비운다 ──────────────
{
  const dir = tmp("report-dec-");
  const decMod = await import(pathToFileURL(join(ROOT, "scripts", "report-decision.mjs")).href);
  writeFileSync(join(dir, "decision-vocab.json"), readFileSync(join(ASSETS, "decision-vocab.json"), "utf-8"));

  let refusedNoDetail = false;
  try { decMod.ask(dir, card(), ""); } catch { refusedNoDetail = true; }
  check("39 쌍 규칙", refusedNoDetail && !existsSync(join(dir, "decision.json")),
    "근거 본문 없이 카드만 쓰려 하면 거부하고, 카드도 안 남는다 — 둘은 같은 턴에 쌍으로 기록한다",
    "근거 본문 없이 카드가 만들어졌다");

  decMod.ask(dir, card(), "# 근거\n합의문 본문");
  check("39 쌍 기록", existsSync(join(dir, "decision.json")) && existsSync(join(dir, "decision-detail.md")),
    "카드와 근거 본문이 같이 쓰인다", "둘 중 하나가 안 쓰였다");

  let refusedTwo = false;
  try { decMod.ask(dir, card({ id: "signal2-20260918-1-d2" }), "또 다른 근거"); } catch { refusedTwo = true; }
  check("39 하나뿐", refusedTwo, "열린 결정이 있으면 새 결정을 거부한다", "결정 둘이 동시에 열렸다");

  // 본문만 갈아끼우기. 답을 기다리는 동안 더 나은 안이 나왔을 때 쓰는 자리다 —
  // 이게 없으면 안 고른 답을 기록해 닫는 것 말고는 낡은 본문을 고칠 길이 없다.
  const cardBefore = readFileSync(join(dir, "decision.json"), "utf-8");
  decMod.amend(dir, OK_CARD.id, "# 근거\n다시 쓴 본문");
  check("39 본문만 갈아끼움", readFileSync(join(dir, "decision-detail.md"), "utf-8").includes("다시 쓴 본문")
        && readFileSync(join(dir, "decision.json"), "utf-8") === cardBefore,
    "본문만 갈아끼우면 근거는 바뀌고 카드는 그대로다 — 묻는 말이 안 바뀌었으니 대기도 그대로다",
    "본문이 안 바뀌었거나 카드까지 바뀌었다");

  let refusedOtherId = false;
  try { decMod.amend(dir, "signal2-20260918-1-d9", "# 근거\n엉뚱한 카드"); } catch { refusedOtherId = true; }
  check("39 프로브(다른 결정)", refusedOtherId
        && readFileSync(join(dir, "decision-detail.md"), "utf-8").includes("다시 쓴 본문"),
    "열린 결정이 아닌 번호로 갈아끼우려 하면 거부한다 — 남의 근거를 덮지 않는다",
    "다른 번호로도 본문이 덮였다");

  let refusedEmpty = false;
  try { decMod.amend(dir, OK_CARD.id, "   "); } catch { refusedEmpty = true; }
  check("39 프로브(빈 본문)", refusedEmpty
        && readFileSync(join(dir, "decision-detail.md"), "utf-8").includes("다시 쓴 본문"),
    "빈 본문으로 갈아끼우려 하면 거부한다 — 근거가 사라진 카드가 남지 않는다",
    "빈 본문이 근거를 지웠다");

  const closed = decMod.answer(dir, "착수해");
  const hist = parseJsonl(readFileSync(join(dir, "decisions-history.jsonl"), "utf-8")).rows;
  // 본문은 위에서 갈아끼웠다. 이력에 실려 가는 것이 **갈아끼운 뒤의 본문**이어야 한다 —
  // 옛 본문이 실려 가면 사람이 읽고 결정한 근거와 기록이 갈린다.
  check("39 이력", hist.length === 1 && hist[0].answer === "착수해" && hist[0].detail.includes("다시 쓴 본문")
        && !existsSync(join(dir, "decision.json")) && !existsSync(join(dir, "decision-detail.md")),
    "답하면 이력에 근거 본문까지 한 줄로 실려 가고, 카드와 본문 파일은 비워진다",
    `이력 이동이 안 맞는다 (이력 ${hist.length}줄)`);

  const row = answeredDecisionRowRef({ decision: null, decisionsHistory: hist }, Date.parse(closed.answered_at) + 1000);
  check("39 특이사항", row !== null && row.value.includes(OK_CARD.what) && row.value.includes("착수해")
        && ALL_LABELS.includes(row.label),
    "답한 직후 특이사항에 「방금 답한 결정」 한 줄이 뜬다", "답한 결정이 특이사항에 안 뜬다");
  check("39 프로브(24시간 뒤)", answeredDecisionRowRef({ decision: null, decisionsHistory: hist },
        Date.parse(closed.answered_at) + 25 * 3600 * 1000) === null,
    "하루가 지나면 그 줄은 사라진다 — 답한 것이 계속 쌓이지 않는다", "답한 줄이 계속 남는다");
  check("39 프로브(다음 결정)", answeredDecisionRowRef({ decision: OK_CARD, decisionsHistory: hist },
        Date.parse(closed.answered_at) + 1000) === null,
    "다음 결정이 열리면 그 줄은 사라진다", "새 결정이 열려도 옛 줄이 남는다");
}

// ── 40. 대기 항목 연동 — 결정이 열려 있으면 사람 대기 상태다 ────────────────
{
  const withBlocker = { blockers: [{ id: OK_CARD.id, label: OK_CARD.what }] };
  check("40 연동", blockerLinkErrors(OK_CARD, withBlocker).length === 0,
    "열린 결정에 같은 이름의 대기 항목이 있으면 통과한다", "제대로 물린 연동을 거부했다");
  check("40 프로브(항목 없음)", blockerLinkErrors(OK_CARD, { blockers: [] }).some((e) => e.includes("대기 항목이 없다")),
    "결정이 열려 있는데 대기 항목이 없으면 잡는다 — 화면이 사람 대기 상태로 안 보인다",
    "대기 항목 없는 열린 결정이 통과했다");
  check("40 프로브(이름 다름)", blockerLinkErrors(OK_CARD, { blockers: [{ id: OK_CARD.id, label: "딴 것" }] })
        .some((e) => e.includes("이름이")),
    "대기 항목의 이름이 카드의 「무엇을」과 다르면 잡는다", "다른 이름이 통과했다");
  check("40 프로브(남은 항목)", blockerLinkErrors(null, withBlocker).some((e) => e.includes("남아 있다")),
    "카드는 닫혔는데 대기 항목만 남으면 잡는다 — 화면이 영영 사람을 기다린다",
    "남은 대기 항목이 통과했다");
  check("40 쓰는 자리", !readFileSync(join(ROOT, "scripts", "report-decision.mjs"), "utf-8").includes("state.json\""),
    "결정 기록 스크립트는 state.json 을 쓰지 않는다 — 그 파일을 쓰는 자리는 하나뿐이다",
    "결정 기록이 state.json 을 직접 쓴다");
}

// ── 41. 단계가 없는 작업의 말 · 카드가 열린 동안의 대기 항목 ─────────────
{
  const rowOfKey = (d, key) => nowRowsRef(d, V3.now, DEFAULT_REPORT_CONFIG).rows.find((r) => r.key === key);
  check("41 단계 없음", rowOfKey(V3.kit, "stage_dwell").label === "이 작업에 머문 시간",
    "단계가 없는 작업에서는 「이 단계에」라고 부르지 않는다", `라벨이 다르다: ${rowOfKey(V3.kit, "stage_dwell").label}`);
  check("41 프로브(단계 있음)", rowOfKey(V3.request, "stage_dwell").label === "이 단계에 머문 시간",
    "단계가 있으면 그대로 「이 단계에」다 — 위 항목이 상태를 실제로 가른다", "단계가 있는데도 작업 표기를 썼다");

  const blocked = { ...V3.request, state: { ...V3.request.state, blockers: [{ id: "c1", label: "아주 긴 카드 문장이 그대로 복사된 값" }] } };
  const code2 = (d) => noticeRowsRef(d, V3.now, DEFAULT_REPORT_CONFIG).find((n) => n.code === 2);
  check("41 카드 열림", code2({ ...blocked, decision: { id: "c1", status: "대기", what: "아주 긴 카드 문장이 그대로 복사된 값" } })?.value === "결정 카드 답 대기",
    "카드가 열려 있으면 대기 항목은 카드 문장을 되풀이하지 않고 가리키기만 한다",
    "대기 항목이 카드의 문장을 그대로 한 번 더 적는다");
  check("41 프로브(카드 없음)", code2(blocked)?.value === "아주 긴 카드 문장이 그대로 복사된 값",
    "카드가 없으면 대기 항목의 값은 적힌 그대로다 — 위 항목이 카드 유무를 실제로 본다",
    "카드가 없는데도 값을 바꿔 적었다");
}

// ── 42. 대시보드 서버 — 이 PC 의 이 주소로 온 읽기만 받는다 (2026-09-24 보안 리뷰) ──
// 127.0.0.1 바인딩만으로는 DNS 재바인딩한 외부 페이지가 activity.jsonl(명령 원문)을 읽어 간다.
// 실제 서버를 띄워 요청을 보낸다 — 함수만 보면 서버가 그 함수를 안 불러도 통과한다.
if (INSTALLED) {
  const { spawn } = await import("node:child_process");
  const { request } = await import("node:http");
  const port = 44000 + Math.floor(Math.random() * 1000);
  const proc = spawn(process.execPath, [join(ROOT, "scripts", "report-serve.mjs"), "--project", SLUG, "--port", String(port), "--no-open"], { stdio: "pipe" });
  const up = await new Promise((ok) => {
    const t = setTimeout(() => ok(false), 5000);
    proc.stdout.on("data", (d) => { if (String(d).includes("대시보드")) { clearTimeout(t); ok(true); } });
    proc.on("exit", () => { clearTimeout(t); ok(false); });
  });
  const hit = (path, { host = `localhost:${port}`, method = "GET" } = {}) => new Promise((ok) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers: { host } }, (res) => { res.resume(); ok({ status: res.statusCode, headers: res.headers }); });
    req.on("error", () => ok({ status: 0, headers: {} }));
    req.end();
  });
  if (!up) {
    check("42 서버", false, "", "대시보드 서버가 안 떴다 — 아래 항목을 판정할 수 없다");
  } else {
    const okRead = await hit("/workflow.json");
    check("42 읽기", okRead.status === 200, "우리 주소로 온 읽기는 받는다", `정상 읽기가 ${okRead.status} — 아래 프로브가 전부 무의미해진다`);
    check("42 프로브(재바인딩)", (await hit("/activity.jsonl", { host: `evil.example:${port}` })).status === 403,
      "Host 가 우리 주소가 아니면 403 — 재바인딩한 외부 페이지가 활동 기록을 못 읽는다", "다른 Host 의 읽기가 통과했다");
    check("42 틀 넣기 금지", okRead.headers["x-frame-options"] === "DENY" && String(okRead.headers["content-security-policy"]).includes("frame-ancestors 'none'"),
      "모든 응답에 틀 넣기 금지 헤더가 붙는다", "틀 넣기 금지 헤더가 없다");
    check("42 프로브(쓰기)", (await hit("/workflow.json", { method: "POST" })).status === 405, "읽기 전용 — POST 는 405", "POST 가 405 가 아니다");
    // report/ 밖의 실재 파일(루트 ACTIVE)을 가리킨다. 경로는 절대 경로로 정규화돼 루트 위로 못 올라가서
    // 보통 report/ 안의 없는 파일(404)이 된다 — 판정은 「그 파일이 안 나온다」(200 이 아님)다.
    const escapes = ["/..%2f..%2f..%2fACTIVE", "/..%2f..%2f..%2f..%2f..%2fACTIVE", "/..%5c..%5c..%5cACTIVE"];
    const leaked = [];
    for (const p of escapes) if ((await hit(p)).status === 200) leaked.push(p);
    check("42 프로브(바깥 경로)", leaked.length === 0, "report/ 밖의 파일은 어떤 경로로도 안 나온다", `밖의 파일이 나왔다: ${leaked.join(", ")}`);
    const bad = await hit("/%E0%A4%A");
    const after = await hit("/workflow.json");
    check("42 프로브(깨진 인코딩)", bad.status === 400 && after.status === 200, "깨진 퍼센트 인코딩은 400 이고 서버는 산다", `깨진 인코딩 ${bad.status}, 그 뒤 ${after.status}`);
  }
  proc.kill();
}

// ── 보고 ────────────────────────────────────────────────────────────────
for (const d of tmpRoots) { try { rmSync(d, { recursive: true, force: true }); } catch { /* 임시 폴더다 */ } }

const passed = results.filter((r) => r.pass).length;
for (const r of results) console.log(`${r.pass ? "  ok " : "FAIL "} ${r.id} — ${r.msg}`);
console.log(`\n${passed}/${results.length} 통과${INSTALLED ? ` (설치: projects/${SLUG}/report)` : " (미설치 — 1번 항목이 그렇게 신고한다)"}`);
process.exit(passed === results.length ? 0 : 1);
