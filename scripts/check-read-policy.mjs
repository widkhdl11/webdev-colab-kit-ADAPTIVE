#!/usr/bin/env node
// @check-role: on-change
// @check-guards: gates/lib/read-policy.mjs
//
// check-read-policy.mjs — 결정 규칙 frontmatter 를 읽는 자리가 gates/lib/read-policy.mjs
// 하나로 모였는지, 그리고 그 실패 방향이 계약대로인지 검사한다.
//
// 무엇을 지키는 검사인가:
//   결정 규칙은 "사람에게 안 묻고 결정할 때의 근거"다. 그래서 못 읽는 규칙의 처리가
//   스펙과 다르다 — 스펙은 "모르면 승인 안 된 것으로 본다"가 항상 방벽을 닫는 쪽이지만,
//   정책은 **버리면 근거 없이 결정하고 살리면 틀린 근거로 결정한다.** 둘 다 나쁘다.
//
//     그래서 둘을 묶는다: 못 읽는 규칙은 버리고, 그 scope 의 결정은 사람에게 올린다.
//
//   이 한 줄이 어긋나면 auto-decide 가 근거 없이 도는데, 그건 아무 신호도 내지 않는다.
//   규약(docs/references/docs-contract.md 7절)과 코드가 같은지를 여기서 본다.
//
// 이 패치는 보호 파일(gates/lib/)을 사용자가 직접 붙인다.
// 붙었는지를 코드를 안 읽고도 판정할 수 있게, 아래를 실제로 돌려서 본다.
//
//   A lib 존재    gates/lib/read-policy.mjs 가 import 된다              ← 붙기 전 실패
//   S 프로브      어휘 밖 status 를 심으면 버려지고 scope 가 올라간다   ← 붙기 전후 통과
//                 (지우면 다시 읽힌다 — 검사가 실제로 그 경로를 밟는다는 근거)
//   B id 불일치   파일명과 다른 id 는 버려지고 그 scope 가 올라간다     ← 붙기 전후 통과
//   C scope 오타  모르는 scope 값만 버리고 나머지 값은 산다             ← 붙기 전후 통과
//   D scope 전멸  남은 scope 가 없으면 규칙 자체가 버려진다             ← 붙기 전후 통과
//   E fm 없음     버리되 올릴 자리가 없다(어느 scope 인지 모른다)       ← 붙기 전후 통과
//   F 중복 키     어느 줄을 읽었는지 모르므로 버리고 올린다             ← 붙기 전후 통과
//   G 본문 무파싱 본문에 status/scope 줄이 있어도 판정이 안 바뀐다      ← 붙기 전후 통과
//   H 현행       이 레포의 규칙 파일이 전부 읽힌다                      ← 붙기 전후 통과
//
// **S 와 G 가 각도가 다른 두 그물이다.** S 는 "잘못된 값을 잡나"를 보고, G 는 "잡지 말아야 할
// 것을 안 잡나"를 본다. 본문 파싱은 신고를 늘리지 않고 **조용히 판정을 바꾸므로**, S 만으로는
// 본문이 새어 들어온 것을 영영 모른다.
//
// 사용: node scripts/check-read-policy.mjs
// 파일을 만들지 않는다 — 전부 문자열로 돌린다.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIB = join(ROOT, "gates", "lib", "read-policy.mjs");

// ── 판정 기준. docs-contract.md 7절과 같은 값이어야 한다.
const POLICY_STATUS = ["confirmed", "provisional"];
const POLICY_SCOPES = ["ui", "data-model", "api", "copy", "harness"];

// ── 신 파서: 붙었으면 그걸 쓰고, 없으면 같은 로직의 사본을 쓴다.
//    사본이 있어야 패치가 붙기 전에도 B~H 를 돌릴 수 있다(A 만 실패한다).
let readPolicyText;
let libScopes = null;          // lib 이 실제로 들고 있는 어휘. I 가 계약 문서와 이것을 대조한다.
let libApplied = false;
if (existsSync(LIB)) {
  try {
    const mod = await import(new URL("../gates/lib/read-policy.mjs", import.meta.url));
    readPolicyText = mod.readPolicyText;
    libScopes = mod.POLICY_SCOPES ?? null;
    libApplied = typeof readPolicyText === "function";
  } catch { /* 사본으로 떨어진다 */ }
}
if (!libApplied) readPolicyText = copyOfReadPolicyText;

// ── 사본 (패치 문서의 gates/lib/read-policy.mjs 와 같은 로직) ──────────────
function frontmatterText(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}
function fmField(fmText, key) {
  const m = fmText.match(new RegExp(`^[ \\t]*${key}:[ \\t]*(.*)$`, "m"));
  return m ? m[1].split("#")[0].trim() : null;
}
function fmList(fmText, key) {
  const m = fmText.match(new RegExp(`^[ \\t]*${key}:[ \\t]*(.*)$`, "m"));
  if (!m) return null;
  const clean = (s) => s.split(",").map((x) => x.trim().replace(/['"]/g, "")).filter(Boolean);
  const inline = m[1].trim();
  const br = inline.match(/^\[([^\]]*)\]/);
  if (br) return clean(br[1]);
  if (inline && !inline.startsWith("#")) return clean(inline.split("#")[0]);
  const rest = fmText.slice(fmText.indexOf(m[0]) + m[0].length).split("\n").slice(1);
  const out = [];
  for (const line of rest) {
    const li = line.match(/^[ \t]*-[ \t]*([A-Za-z][\w-]*)/);
    if (!li) break;
    out.push(li[1]);
  }
  return out;
}
function dupKeys(fmText) {
  const seen = new Map();
  for (const line of fmText.split("\n")) {
    const m = line.match(/^[ \t]*([A-Za-z_][\w-]*):/);
    if (m) seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([k]) => k);
}
function copyOfReadPolicyText(src, slug = "") {
  const problems = [];
  const drop = (why, escalate) => ({
    id: slug, scope: [], status: null, lastApplied: "", body: "",
    dropped: true, escalate, problems: [...problems, why],
  });
  const fmText = frontmatterText(src);
  if (fmText === null) return drop("frontmatter 가 없다 → 버린다(어느 scope 인지 알 수 없어 올릴 자리도 없다)", []);

  const scope = [];
  for (const t of fmList(fmText, "scope") ?? []) {
    if (POLICY_SCOPES.includes(t)) scope.push(t);
    else problems.push(`scope 값 '${t}' 은 등재된 어휘가 아니다 → 그 값만 버린다`);
  }

  const dups = dupKeys(fmText);
  if (dups.length > 0) return drop(`같은 키가 두 번 있다(${dups.join("·")}) → 어느 줄을 읽었는지 모르므로 버리고 올린다`, scope);

  const id = fmField(fmText, "id") ?? "";
  if (slug !== "" && id !== slug) return drop(`id '${id}' 가 파일명 '${slug}' 과 다르다 → 버리고 올린다`, scope);

  const status = fmField(fmText, "status") ?? "";
  if (!POLICY_STATUS.includes(status)) return drop(`status 값 '${status}' 은 등재된 어휘가 아니다 → 버리고 올린다`, scope);

  if (scope.length === 0) return drop("남은 scope 가 없다 → 버린다", []);

  const end = src.indexOf("\n---", src.indexOf("---") + 3);
  const body = end === -1 ? "" : src.slice(src.indexOf("\n", end + 1) + 1);
  return {
    id, scope, status,
    lastApplied: fmField(fmText, "last_applied") ?? "",
    body, dropped: false, escalate: [], problems,
  };
}

// ── 검사 ──────────────────────────────────────────────────────────────────
const results = [];
const ok = (id, what, pass, note = "") => results.push({ id, what, pass, note });

const RULE = (over = {}) => {
  const f = { id: "sample-rule", scope: "[api, ui]", status: "confirmed", last_applied: "", ...over };
  return `---\nid: ${f.id}\nscope: ${f.scope}\nstatus: ${f.status}\nlast_applied: ${f.last_applied}\n---\n\n규칙 본문 한 줄.\n`;
};

ok("A", "lib 존재     gates/lib/read-policy.mjs 가 import 된다", libApplied,
   "아직 안 붙었다 — 아래 B~H 는 이 스크립트의 사본으로 돈 결과다");

{
  // S — 어휘 밖 status 를 심으면 버려지고 scope 가 올라간다. 지우면 다시 읽힌다.
  const bad = readPolicyText(RULE({ status: "approved" }), "sample-rule");
  const good = readPolicyText(RULE(), "sample-rule");
  ok("S", "프로브       어휘 밖 status 는 버려지고 scope 가 올라간다(지우면 다시 읽힌다)",
     bad.dropped === true && bad.escalate.join() === "api,ui" && good.dropped === false && good.scope.join() === "api,ui",
     `심었을 때 dropped=${bad.dropped} escalate=[${bad.escalate}] / 지웠을 때 dropped=${good.dropped} scope=[${good.scope}]`);
}

{
  const r = readPolicyText(RULE({ id: "other-name" }), "sample-rule");
  ok("B", "id 불일치    파일명과 다른 id 는 버려지고 그 scope 가 올라간다",
     r.dropped === true && r.escalate.join() === "api,ui", `dropped=${r.dropped} escalate=[${r.escalate}]`);
}

{
  const r = readPolicyText(RULE({ scope: "[api, nonsense]" }), "sample-rule");
  ok("C", "scope 오타   모르는 값만 버리고 나머지는 산다",
     r.dropped === false && r.scope.join() === "api" && r.problems.length === 1,
     `dropped=${r.dropped} scope=[${r.scope}] 경고 ${r.problems.length}건`);
}

{
  const r = readPolicyText(RULE({ scope: "[nonsense]" }), "sample-rule");
  ok("D", "scope 전멸   남은 scope 가 없으면 규칙 자체가 버려진다",
     r.dropped === true && r.escalate.length === 0, `dropped=${r.dropped} escalate=[${r.escalate}]`);
}

{
  const r = readPolicyText("frontmatter 가 없는 파일이다.\n", "sample-rule");
  ok("E", "fm 없음      버리되 올릴 자리가 없다",
     r.dropped === true && r.escalate.length === 0, `dropped=${r.dropped} escalate=[${r.escalate}]`);
}

{
  const src = `---\nid: sample-rule\nscope: [api]\nstatus: confirmed\nstatus: provisional\nlast_applied:\n---\n\n본문.\n`;
  const r = readPolicyText(src, "sample-rule");
  ok("F", "중복 키      어느 줄을 읽었는지 모르므로 버리고 올린다",
     r.dropped === true && r.escalate.join() === "api", `dropped=${r.dropped} escalate=[${r.escalate}]`);
}

{
  // G — 본문에 frontmatter 처럼 생긴 줄이 있어도 판정이 안 바뀐다.
  //     이 방향은 신고를 늘리지 않고 조용히 판정만 바꾸므로 S 로는 절대 안 잡힌다.
  const src = `---\nid: sample-rule\nscope: [api]\nstatus: confirmed\nlast_applied:\n---\n\n` +
              `본문에서 예시를 든다:\nstatus: nonsense\nscope: [완전히-다른-값]\nid: 엉뚱한-이름\n`;
  const r = readPolicyText(src, "sample-rule");
  ok("G", "본문 무파싱  본문의 status/scope/id 줄이 판정을 바꾸지 않는다",
     r.dropped === false && r.status === "confirmed" && r.scope.join() === "api" && r.id === "sample-rule",
     `dropped=${r.dropped} status=${r.status} scope=[${r.scope}] id=${r.id}`);
}

{
  // H — 이 레포의 실물
  const dirs = [join(ROOT, "docs", "references", "policy")];
  const projects = join(ROOT, "projects");
  if (existsSync(projects))
    for (const d of readdirSync(projects, { withFileTypes: true }).filter((x) => x.isDirectory()))
      dirs.push(join(projects, d.name, "docs", "policy"));

  const bad = [];
  let n = 0;
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".md") && x !== "README.md")) {
      n++;
      const slug = f.replace(/\.md$/, "");
      const r = readPolicyText(readFileSync(join(dir, f), "utf-8"), slug);
      if (r.dropped) bad.push(`${slug}: ${r.problems.at(-1)}`);
    }
  }
  ok("H", `현행         이 레포의 규칙 파일 ${n}개가 전부 읽힌다`, bad.length === 0, bad.join(" / "));
}

// ── I: 계약 문서와 코드의 scope 어휘가 같은가.
//    어휘는 세 자리에 산다 — 계약 문서 7절, gates/lib/read-policy.mjs, 이 검사의 사본.
//    셋이 갈라지면 "등재는 했는데 코드는 모르는 값"이 조용히 생기고, 그 값을 쓴 규칙은
//    버려진다(버려지면 그 scope 의 결정이 사람에게 올라간다 — 아무도 이유를 모른 채).
{
  const doc = readFileSync(join(ROOT, "docs", "references", "docs-contract.md"), "utf-8").split("\r\n").join("\n");
  const sec = doc.split("### `scope` 어휘")[1] ?? "";
  const listed = [];
  for (const line of sec.split("\n")) {
    if (/^###?\s/.test(line)) break;                       // 다음 절에서 멈춘다
    const m = line.match(/^\|\s*`([a-z-]+)`\s*\|/);
    if (m) listed.push(m[1]);
  }
  // **사본이 아니라 lib 이 실제로 들고 있는 어휘와 대조한다.** 사본과 비교하면 lib 이
  // 옛 어휘를 들고 있어도 초록불이 뜬다 — 그러면 이 항목이 지키려는 것을 못 지킨다.
  const code = libScopes ?? POLICY_SCOPES;
  const same = listed.length > 0 &&
    listed.length === code.length && listed.every((v) => code.includes(v));
  ok("I", `어휘 대조    계약 문서 7절과 ${libScopes ? "lib" : "사본"}의 scope 목록이 같다 (${listed.join("·") || "표를 못 읽음"})`,
     same, `문서=[${listed}] 코드=[${code}]`);
}

let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.id} ${r.what}${r.pass ? "" : `  → ${r.note}`}`);
  if (!r.pass) failed++;
}
console.log(`\ncheck-read-policy: ${results.length - failed}/${results.length} 통과` +
            (libApplied ? "" : "  (A 실패 = 패치 미적용. 나머지는 사본으로 돈 결과다)"));
process.exit(failed > 0 ? 1 : 0);
