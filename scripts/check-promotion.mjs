#!/usr/bin/env node
// check-promotion.mjs — 승격 루프가 계약대로 도는지 검사한다.
//
// 무엇을 지키는 검사인가:
//   "같은 판단이 2회 반복되면 규칙이 된다"가 문장으로만 있으면 세는 사람이 매번 달라진다.
//   그리고 승격은 되돌리기 비싼 방향이다 — 잘못 승격된 규칙은 **그 뒤 모든 결정의 근거**가
//   되는데, 승격이 한 사이클 늦는 것은 그냥 한 사이클 늦는 것이다.
//   그래서 실패 방향은 언제나 **승격하지 않는 쪽**이어야 한다.
//
//   자동 승격이 절대 일어나면 안 되는 자리가 둘 있다 — escalate 범주와 시각 정체성.
//   시각은 프로젝트마다 달라야 하는데 규칙은 본성상 수렴시키기 때문이다.
//
// 검사 항목:
//   S1 프로브    2회면 승격 판정이 뜨고, 1회로 줄이면 안 뜬다 (양방향)
//   S2 프로브    no-auto 가 있으면 2회여도 승격하지 않고, 지우면 승격한다 (양방향)
//   A  어휘 밖   scope 가 어휘 밖이면 승격하지 않는다
//   B  seen 없음 seen 이 비면 승격하지 않는다
//   C  구역      `## 후보` 밖의 항목은 세지 않는다
//   D  중복 제거 같은 사이클이 두 번 적혀도 1회로 센다
//   E  형식      승격된 규칙이 정책 규칙 형식(provisional)으로 나온다
//   F  현행      이 레포의 후보 대장이 파싱되고, 승격 대상이 판정된다
//
// **S1 과 S2 가 각도가 다른 두 그물이다.** S1 은 "셀 것을 제대로 세나", S2 는 "세고도
// 멈춰야 할 때 멈추나". S1 만 있으면 시각 정체성이 2회 쌓였을 때 조용히 규칙이 된다.
//
// 사용: node scripts/check-promotion.mjs
// 파일을 만들지 않는다 — 전부 문자열로 돌린다. F 만 이 레포를 읽는다(읽기만 한다).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 정책 규칙과 같은 어휘. 정본은 docs/references/docs-contract.md 7절.
const POLICY_SCOPES = ["ui", "data-model", "api", "copy"];
const PROMOTE_AT = 2;   // 1회짜리는 승격하지 않는다 — 우연일 수 있다.

/**
 * 후보 대장 읽기. `## 후보` 아래의 항목만 세고, 줄 맨 앞 scope/seen/no-auto 만 읽는다.
 * 나머지 본문은 파싱하지 않는다.
 */
export function readCandidatesText(src) {
  const items = [];
  let inSection = false, cur = null;
  const flush = () => { if (cur) items.push(cur); cur = null; };
  for (const raw of src.replace(/\r\n/g, "\n").split("\n")) {
    const h = raw.match(/^##\s+(.*)$/);
    // "승격하지 않기로 판정한 것" 도 `후보` 를 포함하지 않으므로 정확히 갈린다.
    if (h) { flush(); inSection = h[1].trim() === "후보"; continue; }
    if (!inSection) continue;
    const t = raw.match(/^-\s+\*\*(.+?)\*\*/);
    if (t) { flush(); cur = { title: t[1].trim(), scope: "", seen: [], noAuto: "" }; continue; }
    if (!cur) continue;
    const s = raw.match(/^[ \t]*scope:[ \t]*(.*)$/);
    if (s) { cur.scope = s[1].trim(); continue; }
    const n = raw.match(/^[ \t]*no-auto:[ \t]*(.*)$/);
    if (n) { cur.noAuto = n[1].trim(); continue; }
    const v = raw.match(/^[ \t]*seen:[ \t]*(.*)$/);
    // 같은 사이클이 두 번 적혀도 1회다 — 한 사이클 안의 반복은 "두 번 나온 유형"이 아니다.
    if (v) cur.seen = [...new Set(v[1].split(",").map((x) => x.trim()).filter(Boolean))];
  }
  flush();
  return items;
}

/**
 * 승격 판정. 실패 방향은 언제나 **승격하지 않는 쪽**이다.
 * 잘못 승격된 규칙은 그 뒤 모든 결정의 근거가 되지만, 늦는 것은 그냥 늦는 것이다.
 */
export function promotionVerdict(c) {
  if (c.noAuto !== "") return { promote: false, why: `자동 승격 제외 — ${c.noAuto}` };
  if (c.seen.length === 0) return { promote: false, why: "seen 이 비어 있다 — 몇 번 나왔는지 알 수 없다" };
  if (c.seen.length < PROMOTE_AT) return { promote: false, why: `${c.seen.length}회 — ${PROMOTE_AT}회부터 승격한다` };
  if (!POLICY_SCOPES.includes(c.scope)) return { promote: false, why: `scope '${c.scope}' 은 등재된 어휘가 아니다 — 승격할 자리를 모른다` };
  return { promote: true, why: `${c.seen.length}회 도달` };
}

/** 승격되면 만들어질 규칙 파일. status 는 언제나 provisional 로 시작한다. */
export function ruleFileFor(c, cycleId) {
  const id = c.title.replace(/[^0-9A-Za-z가-힣]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return `---\nid: ${id}\nscope: [${c.scope}]\nstatus: provisional\nlast_applied: ${cycleId}\n---\n\n${c.title}\n`;
}

// ── 검사 ──────────────────────────────────────────────────────────────────
const results = [];
const ok = (id, what, pass, note = "") => results.push({ id, what, pass, note });

const LEDGER = (body) => `# 대장\n\n## 후보\n\n${body}\n\n## 승격하지 않기로 판정한 것\n\n(없음)\n`;
const ITEM = (o = {}) => {
  const f = { title: "샘플 후보", scope: "api", seen: "c1, c2", noAuto: null, ...o };
  return `- **${f.title}**\n  scope: ${f.scope}\n  seen: ${f.seen}\n` +
         (f.noAuto ? `  no-auto: ${f.noAuto}\n` : "") + `  원문: 산문.\n`;
};
const one = (body) => readCandidatesText(LEDGER(body))[0];

{
  const two = promotionVerdict(one(ITEM({ seen: "c1, c2" })));
  const oneSeen = promotionVerdict(one(ITEM({ seen: "c1" })));
  ok("S1", "프로브      2회면 승격, 1회로 줄이면 승격 안 함 (양방향)",
     two.promote === true && oneSeen.promote === false,
     `2회=${two.promote}(${two.why}) / 1회=${oneSeen.promote}(${oneSeen.why})`);
}

{
  const blocked = promotionVerdict(one(ITEM({ seen: "c1, c2", noAuto: "시각 정체성" })));
  const freed = promotionVerdict(one(ITEM({ seen: "c1, c2" })));
  ok("S2", "프로브      no-auto 가 있으면 2회여도 승격 안 함, 지우면 승격 (양방향)",
     blocked.promote === false && freed.promote === true,
     `no-auto 있음=${blocked.promote}(${blocked.why}) / 없음=${freed.promote}`);
}

{
  const r = promotionVerdict(one(ITEM({ scope: "레이아웃-느낌" })));
  ok("A", "어휘 밖    scope 가 어휘 밖이면 승격하지 않는다", r.promote === false, r.why);
}

{
  const r = promotionVerdict(one(ITEM({ seen: "" })));
  ok("B", "seen 없음  seen 이 비면 승격하지 않는다", r.promote === false, r.why);
}

{
  // `## 승격하지 않기로 판정한 것` 아래 항목은 후보가 아니다.
  const src = `# 대장\n\n## 후보\n\n${ITEM({ title: "안쪽" })}\n## 승격하지 않기로 판정한 것\n\n${ITEM({ title: "바깥" })}`;
  const items = readCandidatesText(src);
  ok("C", "구역       `## 후보` 밖의 항목은 세지 않는다",
     items.length === 1 && items[0].title === "안쪽", `${items.length}건: ${items.map((i) => i.title).join("·")}`);
}

{
  const c = one(ITEM({ seen: "c1, c1" }));
  const r = promotionVerdict(c);
  ok("D", "중복 제거  같은 사이클이 두 번 적혀도 1회로 센다",
     c.seen.length === 1 && r.promote === false, `seen=[${c.seen}] → ${r.why}`);
}

{
  const f = ruleFileFor(one(ITEM({ title: "원본 정보를 보존한다", scope: "data-model" })), "signal2-20260903-1");
  ok("E", "형식       승격된 규칙이 provisional 로 시작한다",
     /^---\n/.test(f) && /\nstatus: provisional\n/.test(f) && /\nscope: \[data-model\]\n/.test(f),
     f.split("\n").slice(0, 6).join(" / "));
}

{
  const active = existsSync(join(ROOT, "ACTIVE")) ? readFileSync(join(ROOT, "ACTIVE"), "utf-8").trim() : "";
  const p = join(ROOT, "projects", active, "workspace", "DECISION_CANDIDATES.md");
  if (!existsSync(p)) ok("F", "현행       후보 대장이 파싱된다", false, "DECISION_CANDIDATES.md 를 못 찾았다");
  else {
    const items = readCandidatesText(readFileSync(p, "utf-8"));
    const verdicts = items.map((c) => [c.title, promotionVerdict(c)]);
    const ready = verdicts.filter(([, v]) => v.promote);
    // 대장이 비어 있으면 통과가 아니라 실패다 — 잡을 것이 없는데 통과하면 검사가 아니다.
    ok("F", `현행       후보 ${items.length}건이 파싱되고 승격 대상 ${ready.length}건으로 판정된다`,
       items.length > 0 && items.every((c) => c.scope !== "" && c.seen.length > 0),
       items.filter((c) => c.scope === "" || c.seen.length === 0).map((c) => c.title).join(" / "));
    for (const [t, v] of verdicts) console.log(`   · ${t} — ${v.promote ? "승격" : "보류"}: ${v.why}`);
  }
}

let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.id} ${r.what}${r.pass ? "" : `  → ${r.note}`}`);
  if (!r.pass) failed++;
}
console.log(`\ncheck-promotion: ${results.length - failed}/${results.length} 통과`);
process.exit(failed > 0 ? 1 : 0);
