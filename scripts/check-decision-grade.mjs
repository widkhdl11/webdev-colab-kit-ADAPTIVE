#!/usr/bin/env node
// @check-role: on-change
// @check-guards: gates/lib/cycle-policy.mjs
//
// check-decision-grade.mjs — 결정 등급표가 코드 한 자리에 있고, 살림 판단이 자동 결정
// 쪽에 들어 있는지 검사한다.
//
// 무엇을 푸는가:
//   등급 기준이 `docs/references/decision-layer.md` 산문에만 있었다. 산문은 읽는 사람마다
//   경계가 달라지고, 어긋나도 아무 데도 안 걸린다. 실제로 커밋을 언제 끊을지·push 할지 같은
//   살림 판단이 매번 사용자에게 올라갔다 — 되돌리는 비용이 거의 0인 것들인데도.
//
//   그래서 등급표를 `gates/lib/cycle-policy.mjs` 로 옮긴다. 종료·승격 판정이 이미 사는 자리고,
//   게이트·훅·검사가 전부 같은 값을 본다.
//
// 이 검사가 판정하는 것:
//   A1 등급표와 판정 함수가 있다                                  ← 패치 전 실패
//   A2 살림 판단 일곱이 자동 결정 쪽에 있다                        ← 패치 전 실패
//   A3 되돌리기 비싼 영역이 올림 쪽에 있다                         ← 패치 전 실패
//   A4 모르는 영역은 올림 쪽으로 떨어진다                          ← 패치 전 실패
//   S1 프로브  살림 판단 하나를 빼면 A2 가 잡는다. 되돌리면 통과   ← 패치 전후 통과
//   S2 프로브  같은 영역을 양쪽에 심으면 잡는다. 되돌리면 통과     ← 패치 전후 통과
//   S3 프로브  모르는 영역을 자동 결정으로 떨어뜨리면 잡는다        ← 패치 전후 통과
//   B  문서 대조  decision-layer.md 가 이 표를 정본으로 가리킨다   ← 패치 전 통과(문서 먼저 고쳤다)
//
// **S1~S3 가 이 파일의 핵심이다.** "위반 0건"이라는 보고와 "검사가 아예 안 돌았다"는 겉이 같다.
// 위반을 일부러 심어서 잡히는 것을 보지 않으면 둘이 구별되지 않는다. 심는 대상은 판정 함수
// `auditGrades` 에 넘기는 표 자체다 — 실제 파일은 건드리지 않는다.
//
// 사용: node scripts/check-decision-grade.mjs
// 파일을 만들지도 고치지도 않는다.

import { existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── 판정 기준. 패치가 코드에 넣는 것과 같은 목록을 여기 둔다(패치 전에도 S* 를 돌리기 위해).

/** 살림 판단 — 되돌리는 비용이 거의 0이라 묻지 않고 진행하는 영역. */
export const HOUSEKEEPING = [
  "commit-split",       // 커밋을 언제 끊고 어떻게 나눌지
  "push",               // 원격에 올리기
  "archive-cleanup",    // 아카이브와 폴더 정리
  "file-place-name",    // 파일을 어디에 어떤 이름으로 둘지
  "wording",            // 문구
  "check-composition",  // 검사 항목을 어떻게 구성할지
  "impl-within-deps",   // 이미 들어와 있는 의존성 안에서의 구현 선택
];

/** 되돌리기 비싼 영역 — 사람에게 올린다(올린다고 실행이 멈추지는 않는다). */
export const MUST_ESCALATE = [
  "data-model",
  "auth-method",
  "new-dependency",
  "external-service",
  "sealed-invariant",
  "cost",
  "visual-direction",
  "human-approval",
  "history-rewrite",
  "unreadable-rule",
];

/**
 * 등급표 하나를 판정한다. **모듈이 아니라 표를 받는다** — 위반을 심은 사본으로 그대로 돌리기
 * 위해서다. 반환은 사람이 읽는 문제 목록이고, 비어 있으면 통과다.
 *
 *   grades  { "auto-decide": [{id,…}], "escalate": [{id,…}] }
 *   gradeOf 영역 이름 하나를 받아 { grade, known } 을 돌려주는 함수
 */
export function auditGrades(grades, gradeOf) {
  const problems = [];
  const ids = (k) => (Array.isArray(grades?.[k]) ? grades[k] : []).map((a) => a?.id ?? a);
  const auto = ids("auto-decide");
  const esc = ids("escalate");

  for (const h of HOUSEKEEPING)
    if (!auto.includes(h)) problems.push(`살림 판단 '${h}' 이 자동 결정 쪽에 없다`);
  for (const e of MUST_ESCALATE)
    if (!esc.includes(e)) problems.push(`'${e}' 이 올림 쪽에 없다`);
  for (const id of auto)
    if (esc.includes(id)) problems.push(`'${id}' 이 두 등급에 다 있다 — 어느 쪽인지 정해지지 않는다`);

  if (typeof gradeOf === "function") {
    const unknown = gradeOf("이-영역은-표에-없다");
    if (unknown?.grade !== "escalate")
      problems.push(`모르는 영역이 '${unknown?.grade}' 로 떨어진다 — 올림 쪽이어야 한다`);
    if (unknown?.known !== false)
      problems.push("모르는 영역이 아는 것으로 표시된다 — 표에 없는 것과 있는 것이 구별되지 않는다");
    const known = gradeOf(HOUSEKEEPING[0]);
    if (known?.grade !== "auto-decide" || known?.known !== true)
      problems.push(`표에 있는 영역 '${HOUSEKEEPING[0]}' 을 못 읽는다`);
  } else {
    problems.push("판정 함수(gradeOf)가 없다");
  }
  return problems;
}

// ── 검사 ──────────────────────────────────────────────────────────────────
const results = [];
const ok = (id, what, pass, note = "") => results.push({ id, what, pass, note });

let mod = null;
try { mod = await import(new URL("../gates/lib/cycle-policy.mjs", import.meta.url)); } catch { /* A1 에서 드러난다 */ }

const hasTable = mod != null && mod.DECISION_GRADES != null && typeof mod.gradeOf === "function";
ok("A1", "등급표      cycle-policy.mjs 가 DECISION_GRADES 와 gradeOf 를 내놓는다", hasTable,
   "패치 미적용 — 등급 기준이 아직 문서 산문에만 있다");

const real = hasTable ? auditGrades(mod.DECISION_GRADES, mod.gradeOf) : ["패치 미적용"];
const only = (re) => real.filter((p) => re.test(p));
ok("A2", `살림 판단   일곱이 자동 결정 쪽에 있다 (${HOUSEKEEPING.join(", ")})`,
   hasTable && only(/살림 판단/).length === 0, only(/살림 판단/).join(" / ") || "패치 미적용");
ok("A3", "올림 영역   되돌리기 비싼 열이 올림 쪽에 있다",
   hasTable && only(/올림 쪽에 없다/).length === 0, only(/올림 쪽에 없다/).join(" / ") || "패치 미적용");
ok("A4", "실패 방향   모르는 영역은 올림 쪽으로 떨어진다",
   hasTable && only(/모르는 영역|못 읽는다/).length === 0, only(/모르는 영역|못 읽는다/).join(" / ") || "패치 미적용");

// ── 심어서 확인 ───────────────────────────────────────────────────────────
// 성한 표 하나를 만들어 두고, 거기에 위반을 심었다 지운다.
const sound = () => ({
  "auto-decide": HOUSEKEEPING.map((id) => ({ id })),
  escalate: MUST_ESCALATE.map((id) => ({ id })),
});
const soundGradeOf = (table) => (area) => {
  for (const [grade, list] of Object.entries(table))
    if (list.some((a) => a.id === area)) return { grade, known: true, area };
  return { grade: "escalate", known: false, area };
};

{
  const t = sound();
  const clean = auditGrades(t, soundGradeOf(t));
  t["auto-decide"] = t["auto-decide"].filter((a) => a.id !== "push");   // 심는다
  const planted = auditGrades(t, soundGradeOf(t));
  t["auto-decide"].push({ id: "push" });                                // 되돌린다
  const restored = auditGrades(t, soundGradeOf(t));
  ok("S1", "프로브      살림 판단 하나를 빼면 잡는다. 되돌리면 다시 통과한다",
     clean.length === 0 && planted.some((p) => /push/.test(p)) && restored.length === 0,
     `성한표 ${clean.length}건 / 심은뒤 ${planted.length}건 / 되돌린뒤 ${restored.length}건`);
}
{
  const t = sound();
  t.escalate.push({ id: "push" });                                      // 양쪽에 심는다
  const planted = auditGrades(t, soundGradeOf(t));
  t.escalate = t.escalate.filter((a) => a.id !== "push");
  const restored = auditGrades(t, soundGradeOf(t));
  ok("S2", "프로브      같은 영역이 두 등급에 다 있으면 잡는다. 되돌리면 통과한다",
     planted.some((p) => /두 등급에 다 있다/.test(p)) && restored.length === 0,
     `심은뒤 ${planted.length}건 / 되돌린뒤 ${restored.length}건`);
}
{
  const t = sound();
  const bad = (area) => {
    const r = soundGradeOf(t)(area);
    return r.known ? r : { grade: "auto-decide", known: false, area };  // 실패 방향을 뒤집어 심는다
  };
  const planted = auditGrades(t, bad);
  const restored = auditGrades(t, soundGradeOf(t));
  ok("S3", "프로브      모르는 영역을 자동 결정으로 떨어뜨리면 잡는다. 되돌리면 통과한다",
     planted.some((p) => /모르는 영역/.test(p)) && restored.length === 0,
     `심은뒤 ${planted.length}건 / 되돌린뒤 ${restored.length}건`);
}

// B — 문서가 코드를 정본으로 가리킨다
{
  const p = join(ROOT, "docs", "references", "decision-layer.md");
  const txt = existsSync(p) ? readFileSync(p, "utf-8") : "";
  ok("B", "문서 대조   decision-layer.md 가 DECISION_GRADES 를 정본으로 가리킨다",
     /DECISION_GRADES/.test(txt) && /cycle-policy\.mjs/.test(txt),
     "문서에 정본 표시가 없다 — 산문과 코드가 갈라진다");
}

let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.id} ${r.what}${r.pass ? "" : `  → ${r.note}`}`);
  if (!r.pass) failed++;
}
const applied = results.filter((r) => r.id.startsWith("A")).every((r) => r.pass);
console.log(`\ncheck-decision-grade: ${results.length - failed}/${results.length} 통과` +
            (applied ? "" : "  (A* 실패 = 패치 미적용. S* 는 이 스크립트가 들고 있는 판정 함수로 돈 결과다)"));
process.exit(failed > 0 ? 1 : 0);
