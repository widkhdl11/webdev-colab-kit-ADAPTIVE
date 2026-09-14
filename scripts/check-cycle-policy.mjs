#!/usr/bin/env node
// @check-role: standing
//
// check-cycle-policy.mjs — 사이클 종료 판정과 승격 미처리 신고가 계약대로 도는지 검사한다.
//
// 무엇을 지키는 검사인가:
//   v3.3 을 만들 때 승격 판정과 종료 판정이 검사 스크립트 안에만 있었다. 그래서 검사가
//   자기 사본을 검사했고, 실제로 도는 코드는 아무도 밟지 않았다. 그 상태에서 리포트의
//   "승격 0건"과 "아무도 안 셌다"는 겉이 똑같다.
//
//   그리고 종료 조건의 상한이 문서에만 있었다 — `상한(N)` 이라고 적혀 있고 N 에 숫자가
//   없었고, 코드는 상한을 아예 안 봤다. 보류가 몇 건 쌓여도 아무 일도 안 일어났다.
//
//   이 검사는 그 둘을 실제로 도는 자리에서 본다.
//
//   A  lib 적용     gates/lib/cycle-policy.mjs 가 import 된다               ← 붙기 전 실패
//   B  게이트 배선  심은 미처리 후보를 run-gates 가 신고하고, 지우면 안 한다 ← 붙기 전 실패
//   S1 프로브 상한  상한에 닿으면 닫고, 하나 모자라면 안 닫는다 (양방향)     ← 붙기 전후 통과
//   S2 프로브 승격  2회면 미처리로 잡고, 1회로 줄이면 안 잡는다 (양방향)     ← 붙기 전후 통과
//   C  조건 1       프론티어 전부 막힘 / 일부 열림 / 빈 프론티어             ← 붙기 전후 통과
//   D  no-auto      사유가 달린 항목은 2회여도 미처리가 아니다               ← 붙기 전후 통과
//   E  어휘 밖      scope 를 못 읽으면 실패가 아니라 경고 대상이다           ← 붙기 전후 통과
//   F  구역         `## 후보` 밖의 항목은 세지 않는다                        ← 붙기 전후 통과
//   G  중복         같은 사이클이 두 번 적혀도 1회로 센다                    ← 붙기 전후 통과
//   H  로그 인용    근거 열에서 규칙 id 만 걷는다(NEW·HUMAN 은 아니다)       ← 붙기 전후 통과
//   I  현행         이 레포의 대장·로그·규칙 파일이 대조된다                 ← 붙기 전후 통과
//   J  판정 동등    lib 과 검사 안 사본이 같은 픽스처에서 같은 답을 낸다     ← 붙은 뒤 의미 있음
//   K  훅 배선     임시 레포에서 보류를 상한까지 늘리면 Stop 훅이 종료를 알린다     ← 붙기 전 실패
//
// **S1 과 C 가 각도가 다른 두 그물이다.** C 는 "막혔을 때 닫나"를 보고 S1 은 "안 막혔어도
// 상한이면 닫나"를 본다. C 만 있으면 상한 조건을 통째로 지워도 검사가 초록불이다.
//
// **B 가 나머지와 각도가 다르다.** 나머지는 판정 함수를 직접 부르는데 B 는 게이트를 실제로
// 돌린다. 판정이 맞아도 게이트에 배선이 안 됐으면 아무도 그 판정을 부르지 않는다.
//
// 사용: node scripts/check-cycle-policy.mjs
// **이 레포의 파일을 건드리지 않는다.** B 는 projects/__probe__/ 를 만들었다 finally 로 지우고,
// K 는 임시 레포를 만들어 거기서 훅을 돌린다 — 실제 PENDING.md 를 늘렸다 되돌리게 짰다가
// 끊기면 손상이 남는 것을 미러 검사에서 먼저 겪었다(2026-09-04, docs/LESSONS.md).

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const ok = (id, what, pass, note = "") => results.push({ id, what, pass: !!pass, note });

// ── lib 을 먼저 시도한다. 없으면 아래 사본으로 떨어져서 나머지 항목은 그대로 돈다.
//    (A 가 실패로 남으므로 "안 붙었는데 초록불"은 나오지 않는다)
let lib = null;
try { lib = await import(new URL("../gates/lib/cycle-policy.mjs", import.meta.url)); } catch { /* 미적용 */ }
const libApplied = !!lib && typeof lib.closeVerdict === "function";

// ── 사본: lib 이 붙기 전에도 판정 자체를 검사할 수 있게 둔다. 붙은 뒤에는 J 가 둘을 대조한다.
const COPY_SCOPES = ["ui", "data-model", "api", "copy", "harness"];
const COPY_CAP = 5;
const COPY_AT = 2;
function copyCloseVerdict({ frontier = [], blocked = new Set(), openCount = 0 } = {}) {
  const b = blocked instanceof Set ? blocked : new Set(blocked);
  if (frontier.length > 0 && frontier.every((n) => b.has(n)))
    return { close: true, reason: `조건 1 — 프론티어(${frontier.join(", ")})가 전부 보류에 막혔다` };
  if (openCount >= COPY_CAP)
    return { close: true, reason: `조건 1' — 열린 보류가 상한에 닿았다(${openCount}/${COPY_CAP})` };
  return { close: false, reason: null };
}
function copyReadCandidatesText(src) {
  const items = [];
  let inSection = false, cur = null;
  const flush = () => { if (cur) items.push(cur); cur = null; };
  for (const raw of String(src).replace(/\r\n/g, "\n").split("\n")) {
    const h = raw.match(/^##\s+(.*)$/);
    if (h) { flush(); inSection = h[1].trim() === "후보"; continue; }
    if (!inSection) continue;
    const t = raw.match(/^-\s+\*\*(.+?)\*\*/);
    if (t) { flush(); cur = { title: t[1].trim(), scope: [], badScope: [], seen: [], noAuto: null }; continue; }
    if (!cur) continue;
    const sc = raw.match(/^[ \t]*scope:[ \t]*(.*)$/);
    if (sc) {
      for (const v of sc[1].replace(/^\[|\]$/g, "").split(",").map((x) => x.trim()).filter(Boolean))
        (COPY_SCOPES.includes(v) ? cur.scope : cur.badScope).push(v);
      continue;
    }
    const se = raw.match(/^[ \t]*seen:[ \t]*(.*)$/);
    if (se) {
      for (const v of se[1].split(",").map((x) => x.trim()).filter(Boolean))
        if (!cur.seen.includes(v)) cur.seen.push(v);
      continue;
    }
    const na = raw.match(/^[ \t]*no-auto:[ \t]*(.*)$/);
    if (na) { cur.noAuto = na[1].trim() || "(사유 없음)"; continue; }
  }
  flush();
  return { items };
}
function copyPromotionPending(items) {
  const mustHandle = [], unreadable = [];
  for (const it of items) {
    if (it.seen.length < COPY_AT) continue;
    if (it.noAuto) continue;
    if (it.scope.length === 0) unreadable.push(it);
    else mustHandle.push(it);
  }
  return { mustHandle, unreadable };
}
function copyReadLogCitations(src) {
  const ids = new Set();
  for (const raw of String(src).replace(/\r\n/g, "\n").split("\n")) {
    if (!raw.startsWith("|")) continue;
    const cells = raw.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    const last = cells[cells.length - 1].split("`").join("").trim();
    if (!last || last === "NEW" || last === "HUMAN" || last === "근거") continue;
    for (const v of last.split(",").map((x) => x.trim()).filter(Boolean))
      if (/^[a-z0-9][a-z0-9-]*$/.test(v)) ids.add(v);
  }
  return ids;
}

const closeVerdict = libApplied ? lib.closeVerdict : copyCloseVerdict;
const readCandidatesText = libApplied ? lib.readCandidatesText : copyReadCandidatesText;
const promotionPending = libApplied ? lib.promotionPending : copyPromotionPending;
const readLogCitations = libApplied ? lib.readLogCitations : copyReadLogCitations;
const CAP = libApplied ? lib.PENDING_CAP : COPY_CAP;

// 후보 픽스처. 항목 하나짜리 대장을 만든다.
const CAND = (over = {}) => {
  const f = { section: "후보", scope: "harness", seen: "c1, c2", extra: "", ...over };
  return `## ${f.section}\n\n- **후보 제목**\n  scope: ${f.scope}\n  seen: ${f.seen}\n${f.extra}  원문: 산문.\n`;
};
const mustCount = (src) => promotionPending(readCandidatesText(src).items).mustHandle.length;
const unreadCount = (src) => promotionPending(readCandidatesText(src).items).unreadable.length;

// ── A: lib 이 붙었나
ok("A", "lib 적용     gates/lib/cycle-policy.mjs 가 import 된다", libApplied,
   "아직 안 붙었다 — 아래 판정은 검사 안의 사본으로 돌았다");

// ── S1: 상한 프로브 (양방향)
{
  const at = closeVerdict({ frontier: ["deploy"], blocked: new Set(), openCount: CAP });
  const below = closeVerdict({ frontier: ["deploy"], blocked: new Set(), openCount: CAP - 1 });
  ok("S1", `프로브 상한  보류 ${CAP}건이면 닫고 ${CAP - 1}건이면 안 닫는다`,
     at.close === true && below.close === false,
     `${CAP}건=${at.close} / ${CAP - 1}건=${below.close}`);
}

// ── S2: 승격 프로브 (양방향)
ok("S2", "프로브 승격  2회면 미처리로 잡고, 1회로 줄이면 안 잡는다",
   mustCount(CAND()) === 1 && mustCount(CAND({ seen: "c1" })) === 0,
   `2회=${mustCount(CAND())} / 1회=${mustCount(CAND({ seen: "c1" }))}`);

// ── C: 조건 1
{
  const b = new Set(["implement"]);
  ok("C", "조건 1       전부 막힘=닫음 · 일부 열림=안 닫음 · 빈 프론티어=안 닫음",
     closeVerdict({ frontier: ["implement"], blocked: b, openCount: 1 }).close === true &&
     closeVerdict({ frontier: ["implement", "design"], blocked: b, openCount: 1 }).close === false &&
     closeVerdict({ frontier: [], blocked: b, openCount: 1 }).close === false,
     "셋 중 하나가 틀렸다");
}

// ── D: no-auto
ok("D", "no-auto      사유가 달린 항목은 2회여도 미처리가 아니다",
   mustCount(CAND({ extra: "  no-auto: 시각 정체성이라 자동 승격 대상이 아니다\n" })) === 0,
   "no-auto 가 무시됐다");

// ── E: 어휘 밖 scope → 실패가 아니라 경고 대상
ok("E", "어휘 밖      scope 를 못 읽으면 미처리(실패)가 아니라 경고 대상이다",
   mustCount(CAND({ scope: "없는영역" })) === 0 && unreadCount(CAND({ scope: "없는영역" })) === 1,
   `must=${mustCount(CAND({ scope: "없는영역" }))} unreadable=${unreadCount(CAND({ scope: "없는영역" }))}`);

// ── F: 구역
ok("F", "구역         `## 후보` 밖의 항목은 세지 않는다",
   mustCount(CAND({ section: "승격하지 않기로 판정한 것" })) === 0,
   "구역 밖 항목이 세어졌다");

// ── G: 같은 사이클 중복
ok("G", "중복         같은 사이클이 두 번 적혀도 1회로 센다",
   mustCount(CAND({ seen: "c1, c1" })) === 0,
   "중복이 2회로 세어졌다");

// ── H: 로그 인용
{
  const log = "| id | 영역 | 결정 | 이유 | 기각한 대안 | 근거 |\n|---|---|---|---|---|---|\n" +
    "| D1 | harness | a | b | c | NEW |\n| D2 | harness | a | b | c | HUMAN |\n" +
    "| D3 | harness | a | b | c | open-for-extension |\n";
  const ids = [...readLogCitations(log)];
  ok("H", "로그 인용    근거 열에서 규칙 id 만 걷는다(NEW·HUMAN·구분선 제외)",
     ids.length === 1 && ids[0] === "open-for-extension", `걷은 것: [${ids}]`);
}

// ── I: 이 레포의 실물 — 대장 · 로그 · 규칙 파일 대조
{
  const active = (existsSync(join(ROOT, "ACTIVE")) ? readFileSync(join(ROOT, "ACTIVE"), "utf-8") : "").trim();
  const projDir = join(ROOT, "projects", active);
  const ledger = join(projDir, "workspace", "DECISION_CANDIDATES.md");
  const { items } = existsSync(ledger) ? readCandidatesText(readFileSync(ledger, "utf-8")) : { items: [] };
  const pend = promotionPending(items);
  const logDir = join(projDir, "workspace", "logs");
  const missing = [];
  let citedTotal = 0;
  if (existsSync(logDir)) {
    for (const f of readdirSync(logDir).filter((n) => /^DECISION_LOG\..+\.md$/.test(n))) {
      const cid = f.replace(/^DECISION_LOG\./, "").replace(/\.md$/, "");
      for (const id of readLogCitations(readFileSync(join(logDir, f), "utf-8"))) {
        citedTotal++;
        const found = [join(projDir, "docs", "policy", `${id}.md`), join(ROOT, "docs", "references", "policy", `${id}.md`)]
          .find((p) => existsSync(p));
        if (!found) { missing.push(`${id}(규칙 파일이 없다)`); continue; }
        const cur = (readFileSync(found, "utf-8").match(/^last_applied:[ \t]*(.*)$/m)?.[1] ?? "").trim();
        if (!cur.split(",").map((x) => x.trim()).includes(cid)) missing.push(`${id}(last_applied 에 ${cid} 없음)`);
      }
    }
  }
  // 후보 0건은 두 가지일 수 있다 — 대장을 못 읽었거나, 아직 아무 판단도 안 쌓인 새 프로젝트거나.
  // 파서가 도는지는 S2·D·F·G 가 픽스처로 이미 본다. 그래서 여기서는 **0건을 실패로 세지 않고**
  // 대조를 건너뛰었다고 말한다. 0건을 실패로 두면 새 프로젝트를 열 때마다 이 검사가 빨간불이
  // 되고, 빨간불이 상수가 되면 아무도 안 본다 (2026-09-04: study-mate 를 열자마자 그렇게 됐다).
  const nothingToCompare = items.length === 0 && citedTotal === 0;
  ok("I", `현행         후보 ${items.length}건(미처리 ${pend.mustHandle.length}) · 로그 인용 ${citedTotal}건이 규칙 파일과 맞는다` +
       (nothingToCompare ? `  ('${active}' 는 아직 쌓인 판단이 없다 — 대조는 건너뛰고 픽스처 항목이 파서를 본다)` : ""),
     pend.mustHandle.length === 0 && missing.length === 0,
     missing.join(" / ") || "미처리 후보가 남아 있다");
}

// ── J: 판정 동등 (lib vs 사본)
{
  const fx = [CAND(), CAND({ seen: "c1" }), CAND({ scope: "없는영역" }),
              CAND({ extra: "  no-auto: 사유\n" }), CAND({ section: "밖" }), CAND({ seen: "c1, c1" })];
  const sameProm = fx.every((s) =>
    mustCount(s) === copyPromotionPending(copyReadCandidatesText(s).items).mustHandle.length);
  const sameClose = [[["a"], ["a"], 0], [["a", "b"], ["a"], 0], [["a"], [], CAP], [["a"], [], CAP - 1]]
    .every(([fr, bl, oc]) =>
      closeVerdict({ frontier: fr, blocked: new Set(bl), openCount: oc }).close ===
      copyCloseVerdict({ frontier: fr, blocked: new Set(bl), openCount: oc }).close);
  ok("J", "판정 동등    lib 과 검사 안 사본이 같은 픽스처에서 같은 답을 낸다", sameProm && sameClose,
     "lib 과 사본이 갈라졌다 — 둘 중 하나가 계약에서 벗어났다");
}

// ── B: 게이트 배선 — 미처리 후보를 심고 run-gates 가 신고하는지 본다. 1회로 줄이면 안 해야 한다.
{
  const probeRoot = join(ROOT, "projects", "__probe__");
  const probeFile = join(probeRoot, "workspace", "DECISION_CANDIDATES.md");
  const reported = () => {
    const r = spawnSync(process.execPath, [join(ROOT, "gates", "run-gates.mjs")], { cwd: ROOT, encoding: "utf-8" });
    return /\[promotion\/UNPROCESSED\][^\n]*__probe__/.test((r.stdout ?? "") + "\n" + (r.stderr ?? ""));
  };
  let caught = null, clean = null;
  try {
    mkdirSync(join(probeRoot, "workspace"), { recursive: true });
    writeFileSync(probeFile, CAND(), "utf-8");
    caught = reported();
    writeFileSync(probeFile, CAND({ seen: "c1" }), "utf-8");
    clean = reported();
  } finally {
    rmSync(probeRoot, { recursive: true, force: true });
  }
  ok("B", "게이트 배선  심은 미처리 후보를 run-gates 가 신고하고, 1회로 줄이면 안 한다",
     caught === true && clean === false,
     `심었을 때 신고=${caught} / 1회일 때 신고=${clean} — 게이트에 배선이 안 됐다`);
}

// ── K: 훅 배선 — 상한이 Stop 훅에서 실제로 발동하는가.
//    S1 은 판정 함수가 옳은지 보고, K 는 훅이 그 함수를 부르는지 본다. 판정이 맞아도
//    훅이 안 부르면 상한은 없는 것과 같다 — v3.3 에서 실제로 그 상태였다.
//    PENDING.md 를 잠깐 늘렸다 되돌린다. 되돌리기는 finally 에서 하고, 실패하면 크게 알린다.
// **이 레포의 파일을 건드리지 않는다.** 처음에는 진짜 PENDING.md 를 늘렸다 되돌리게 짰는데,
// 같은 형태를 미러 검사에서 먼저 겪었다 — 훅이 도는 동안 끊기면 되돌리기가 안 돌고, 그다음
// 실행은 더럽혀진 파일을 '원본'으로 읽어 **복원 성공이라고 보고하면서 손상을 보존한다**
// (2026-09-04, docs/LESSONS.md). graph-stop 도 ROOT 를 cwd 로 잡으므로 cwd 만 픽스처로 준다.
{
  // 훅이 **돌기는 하는지**를 먼저 본다. 문법 오류면 아무 줄도 안 나오는데,
  // 그 상태와 "배선이 안 됐다"는 출력이 똑같아 보인다 — 2026-09-04 에 실제로 헷갈렸다.
  // (닫는 `});` 한 줄이 빠져 훅 전체가 죽어 있었고, K 는 "배선 없음"이라고만 말했다)
  let stopBroken = null;
  const runStopIn = (dir) => {
    const r = spawnSync(process.execPath, [join(ROOT, "gates", "graph-stop.mjs")], { cwd: dir, encoding: "utf-8" });
    const out = (r.stdout ?? "") + "\n" + (r.stderr ?? "");
    const syntax = out.match(/^\s*(\w*(?:Syntax|Reference|Type)Error: .+)$/m);
    if (syntax && !/\[cycle\//.test(out)) stopBroken = syntax[1];
    return out;
  };
  // 최소 픽스처 레포. graph-stop 이 보는 것만 넣는다.
  // src/ 를 넣는 이유: 없으면 게이트가 '검사 대상 없음'으로 일찍 끝난다.
  const mkFixture = (openCount) => {
    const dir = mkdtempSync(join(tmpdir(), "cycle-policy-"));
    mkdirSync(join(dir, "projects", "probe", "workspace"), { recursive: true });
    mkdirSync(join(dir, "projects", "probe", "src", "shared"), { recursive: true });
    writeFileSync(join(dir, "ACTIVE"), "probe\n");
    writeFileSync(join(dir, "projects", "probe", "src", "shared", "x.ts"), "export const x = 1;\n");
    // blocks: 를 안 적으므로 아무 노드도 막지 않는다 — 조건 1 과 섞이지 않고 상한만 본다.
    const items = Array.from({ length: openCount }, (_, i) => `- **P${i + 1} · 프로브**\n\n`).join("");
    writeFileSync(join(dir, "projects", "probe", "workspace", "PENDING.md"),
      `# 보류\n\n## 열린 항목\n\n${items}## 닫힌 항목\n`);
    writeFileSync(join(dir, "projects", "probe", "workspace", "CYCLE.md"),
      "# 사이클\n\n## 열린 사이클\n\n- `probe-1` — 프로브\n\n## 닫힌 사이클\n");
    return dir;
  };
  const closes = (openCount) => {
    const dir = mkFixture(openCount);
    try { return /\[cycle\/CLOSE\]/.test(runStopIn(dir)); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  };

  const fired = closes(CAP);          // 상한에 닿으면 닫는다고 알려야
  const quiet = closes(CAP - 1);      // 하나 모자라면 안 알려야
  ok("K", `훅 배선     보류를 상한(${CAP})까지 심으면 훅이 사이클 종료를 알리고, ${CAP - 1}건이면 안 알린다`,
     fired === true && quiet === false && !stopBroken,
     stopBroken
       ? `Stop 훅이 아예 못 돈다 — ${stopBroken}  (배선 이전 문제다. \`node --check gates/graph-stop.mjs\` 로 확인)`
       : `${CAP}건=${fired} / ${CAP - 1}건=${quiet}` + (fired === false ? " — 훅이 상한을 안 본다(패치 미적용)" : ""));
}

let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.id} ${r.what}${r.pass ? "" : `  → ${r.note}`}`);
  if (!r.pass) failed++;
}
console.log(`\ncheck-cycle-policy: ${results.length - failed}/${results.length} 통과` +
  (libApplied ? "" : "  (gates/lib/cycle-policy.mjs 미적용 — A·B 가 그 신호다)"));
process.exit(failed > 0 ? 1 : 0);
