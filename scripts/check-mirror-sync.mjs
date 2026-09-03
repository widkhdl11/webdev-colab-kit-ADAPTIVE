#!/usr/bin/env node
// check-mirror-sync.mjs — 킷 규칙 문서의 두 벌이 어긋났는지 검사한다.
//
// 무엇을 지키는 검사인가:
//   이 레포는 같은 규칙을 두 벌로 들고 있다 — Claude 쪽(CLAUDE.md · .claude/skills/)과
//   Codex 쪽(AGENTS.md · .agents/skills/). 한쪽만 고치면 다른 쪽 에이전트는 **옛 규칙으로
//   계속 돈다.** 게이트가 안 보는 층이라 실패가 소리를 내지 않는다.
//   실제로 2026-09-03 측정에서 AGENTS.md 가 6줄, spec 스킬이 18줄, retro 스킬이 7줄
//   뒤처져 있었다 — Codex 쪽은 폐기된 `docs/specs/planned/` 관례를 아직 가르치고 있었다.
//
// 단순 diff 로는 안 된다. 두 벌에는 **의도된 치환**이 있다(CLAUDE.md↔AGENTS.md,
// .claude↔.Codex). 그래서 치환을 걷어낸 뒤에 비교한다. 사전에 없는 차이가 곧 어긋남이다.
//
// 각도가 다른 검사 둘을 둔다(v3.2 교훈 ④ — 그물 하나는 그 그물이 못 보는 방향으로 샌다):
//   ① 내용 대조   치환을 정규화한 뒤 줄 단위로 비교한다 → 한쪽만 고친 것을 잡는다
//   ② 치환 누락   미러 쪽에 원본 표기(CLAUDE.md · .claude)가 그대로 남았는지 본다
//                 → ① 은 내용이 같으면 통과시키므로 치환을 빠뜨린 것은 ① 로 안 잡힌다
//
// 검사 항목:
//   S1 프로브   심은 어긋남을 ① 이 잡는다. 지우면 다시 통과한다      ← 고치기 전에도 통과(검사 자체의 검사)
//   S2 프로브   심은 치환 누락을 ② 가 잡는다. 지우면 다시 통과한다   ← 고치기 전에도 통과(검사 자체의 검사)
//   A  오탐 없음  치환만 다른 쌍은 어긋남이 아니다
//   B  짝 검사    한쪽에만 있는 스킬 폴더를 잡는다
//   C  현행       이 레포의 두 벌이 지금 어긋나 있지 않다             ← 고치기 전 실패 / 고친 뒤 통과
//
// **S1·S2 가 이 파일의 핵심이다.** "어긋남 0건"이라는 보고와 "검사가 아예 안 돌았다"는
// 겉으로 같다. 위반을 일부러 심어 잡히는 것을 보지 않으면 둘을 구분할 수 없다.
//
// 사용: node scripts/check-mirror-sync.mjs
// 프로브는 전부 임시 디렉터리에서 돈다 — 이 레포의 파일은 하나도 건드리지 않는다.
// C 항목만 이 레포를 읽는다(읽기만 한다).

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── 의도된 치환 사전. 미러(Codex) 쪽 표기 → 정본(Claude) 쪽 표기.
//    여기 없는 차이는 전부 어긋남으로 신고한다. 사전을 늘리면 그만큼 눈감는 것이므로,
//    새 항목을 넣을 때는 "왜 이 둘이 같은 뜻인가"를 주석으로 남긴다.
const SUBS = [
  { canon: "CLAUDE.md", mirror: "AGENTS.md" },   // 규칙 문서의 이름 자체
  { canon: ".claude", mirror: ".Codex" },        // 하네스 설정 폴더 이름
];

/** 미러 쪽 텍스트를 정본 표기로 되돌린다. */
export function normalizeMirror(text) {
  let out = text;
  for (const { canon, mirror } of SUBS) out = out.split(mirror).join(canon);
  return out;
}

const lines = (t) => t.replace(/\r\n/g, "\n").replace(/\s+$/, "").split("\n");

/**
 * ① 내용 대조 — 치환을 걷어낸 뒤 비교.
 *
 * 줄 번호를 나란히 놓고 비교하면 **삽입 하나에 뒤가 전부 밀려서** 한 블록 누락이
 * 수십 건으로 불어난다. 그러면 무엇이 실제로 빠졌는지 안 보이고, 안 보이는 보고는
 * 사람이 읽지 않는다. 그래서 최장 공통 부분수열로 실제 추가·삭제만 뽑는다.
 *
 * 반환: { kind: "정본에만" | "미러에만", line, text } 목록.
 */
export function contentDiff(canonText, mirrorText) {
  const a = lines(canonText);
  const b = lines(normalizeMirror(mirrorText));

  // LCS 길이표. 두 파일 다 수백 줄이라 표를 통째로 들고 있어도 된다.
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);

  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (L[i + 1][j] >= L[i][j + 1]) out.push({ kind: "정본에만", line: i + 1, text: a[i++] });
    else out.push({ kind: "미러에만", line: j + 1, text: b[j++] });
  }
  while (i < n) out.push({ kind: "정본에만", line: i + 1, text: a[i++] });
  while (j < m) out.push({ kind: "미러에만", line: j + 1, text: b[j++] });

  // 빈 줄만 어긋난 것은 대조 대상이 아니다 — 내용이 아니라 여백이다.
  return out.filter((d) => d.text.trim() !== "");
}

/**
 * ② 치환 누락 — 미러 쪽에 정본 표기가 그대로 남았나.
 * ① 은 내용이 같으면 통과시키므로 이 방향은 ① 로 잡히지 않는다.
 */
export function missedSubs(mirrorText) {
  const out = [];
  lines(mirrorText).forEach((line, i) => {
    for (const { canon } of SUBS) {
      if (!line.includes(canon)) continue;
      out.push({ line: i + 1, what: canon, text: line.trim().slice(0, 80) });
    }
  });
  return out;
}

/** 대조할 쌍 목록. 짝이 없는 쪽도 함께 돌려준다. */
export function pairsIn(root) {
  const pairs = [{ name: "CLAUDE.md", canon: join(root, "CLAUDE.md"), mirror: join(root, "AGENTS.md") }];
  const orphans = [];
  const canonSkills = join(root, ".claude", "skills");
  const mirrorSkills = join(root, ".agents", "skills");
  const listed = (p) => (existsSync(p) ? readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : []);
  const a = listed(canonSkills);
  const b = listed(mirrorSkills);
  for (const name of a) {
    if (b.includes(name)) pairs.push({ name: `skills/${name}`, canon: join(canonSkills, name, "SKILL.md"), mirror: join(mirrorSkills, name, "SKILL.md") });
    else orphans.push(`.claude/skills/${name} 은 있는데 .agents/skills/${name} 이 없다`);
  }
  for (const name of b) if (!a.includes(name)) orphans.push(`.agents/skills/${name} 은 있는데 .claude/skills/${name} 이 없다`);
  return { pairs, orphans };
}

/** 레포 하나를 통째로 판정한다. 반환: 사람이 읽는 실패 줄 목록(빈 배열이면 통과). */
export function checkRepo(root) {
  const errors = [];
  const { pairs, orphans } = pairsIn(root);
  for (const o of orphans) errors.push(`[mirror/ORPHAN] ${o}`);

  for (const { name, canon, mirror } of pairs) {
    if (!existsSync(canon)) { errors.push(`[mirror/MISSING] ${name} — 정본이 없다`); continue; }
    if (!existsSync(mirror)) { errors.push(`[mirror/MISSING] ${name} — 미러가 없다`); continue; }
    const canonText = readFileSync(canon, "utf-8");
    const mirrorText = readFileSync(mirror, "utf-8");

    for (const d of contentDiff(canonText, mirrorText))
      errors.push(`[mirror/DRIFT] ${name} — ${d.kind} 있는 줄(${d.line}): ${d.text.trim().slice(0, 100)}`);

    for (const m of missedSubs(mirrorText))
      errors.push(`[mirror/UNSUBSTITUTED] ${name}:${m.line} — 미러 쪽에 '${m.what}' 가 그대로 남았다: ${m.text}`);
  }
  return errors;
}

// ────────────────────────────────────────────────────────────────────────
// 프로브 — 검사가 실제로 그 경로를 밟는지 본다
// ────────────────────────────────────────────────────────────────────────

/** 어긋남이 없는 최소 레포를 임시로 만든다. */
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "mirror-sync-"));
  const canonBody = [
    "# CLAUDE.md — 규칙",
    "",
    "- 보호 파일(.claude/hooks)은 사용자가 직접 적용한다",
    "- 규칙 둘째 줄",
    "",
  ].join("\n");
  // 미러는 치환만 다르다 — 어긋남이 아니어야 한다.
  const mirrorBody = canonBody.split("CLAUDE.md").join("AGENTS.md").split(".claude").join(".Codex");
  writeFileSync(join(dir, "CLAUDE.md"), canonBody);
  writeFileSync(join(dir, "AGENTS.md"), mirrorBody);
  for (const [base, name] of [[".claude", "wrap-up"], [".agents", "wrap-up"]]) {
    mkdirSync(join(dir, base, "skills", name), { recursive: true });
    writeFileSync(join(dir, base, "skills", name, "SKILL.md"), base === ".claude" ? canonBody : mirrorBody);
  }
  return dir;
}

const results = [];
const ok = (id, what, pass, note = "") => results.push({ id, what, pass, note });

{
  // A — 치환만 다른 두 벌은 어긋남이 아니다
  const dir = fixture();
  const errs = checkRepo(dir);
  ok("A", "오탐 없음  치환만 다른 쌍은 통과한다", errs.length === 0, errs[0] ?? "");

  // S1 — 내용 어긋남을 심으면 ① 이 잡는다. 지우면 다시 통과한다
  const mirrorPath = join(dir, "AGENTS.md");
  const before = readFileSync(mirrorPath, "utf-8");
  writeFileSync(mirrorPath, before.replace("- 규칙 둘째 줄", "- 규칙 둘째 줄이 여기서 바뀌었다"));
  const planted = checkRepo(dir).filter((e) => e.includes("[mirror/DRIFT]"));
  writeFileSync(mirrorPath, before);
  const cleared = checkRepo(dir);
  // 줄 하나를 **바꾸면** 신고가 둘 나온다 — 정본에만 있는 옛 줄 + 미러에만 있는 새 줄.
  // 그게 맞는 동작이다. 둘을 하나로 묶으면 "어느 쪽이 뒤처졌나"가 사라진다.
  ok("S1", "프로브    심은 어긋남을 잡고, 지우면 다시 통과한다", planted.length === 2 && cleared.length === 0,
     planted.length !== 2 ? `심은 어긋남 검출 ${planted.length}건(교체 1줄 = 2건이어야 한다)` : `지운 뒤 ${cleared.length}건 남음`);

  // S2 — 치환 누락을 심으면 ② 가 잡는다. ① 은 이걸 못 잡는다는 것도 같이 본다
  writeFileSync(mirrorPath, before.replace(".Codex/hooks", ".claude/hooks"));
  const all = checkRepo(dir);
  const missed = all.filter((e) => e.includes("[mirror/UNSUBSTITUTED]"));
  const drift = all.filter((e) => e.includes("[mirror/DRIFT]"));
  writeFileSync(mirrorPath, before);
  const cleared2 = checkRepo(dir);
  ok("S2", "프로브    심은 치환 누락을 ② 가 잡는다(① 은 못 잡는다)",
     missed.length === 1 && drift.length === 0 && cleared2.length === 0,
     `치환누락 ${missed.length}건(1이어야) · 내용차이 ${drift.length}건(0이어야) · 지운 뒤 ${cleared2.length}건`);

  // B — 한쪽에만 있는 스킬 폴더
  mkdirSync(join(dir, ".claude", "skills", "only-here"), { recursive: true });
  writeFileSync(join(dir, ".claude", "skills", "only-here", "SKILL.md"), "x\n");
  const orphan = checkRepo(dir).filter((e) => e.includes("[mirror/ORPHAN]"));
  ok("B", "짝 검사    한쪽에만 있는 스킬 폴더를 잡는다", orphan.length === 1, `${orphan.length}건`);

  rmSync(dir, { recursive: true, force: true });
}

{
  // C — 이 레포의 현재 상태
  const errs = checkRepo(ROOT);
  ok("C", "현행       이 레포의 두 벌이 어긋나 있지 않다", errs.length === 0, `${errs.length}건`);
  if (errs.length > 0) {
    console.error("\n현행 어긋남:");
    for (const e of errs.slice(0, 40)) console.error(`  ${e}`);
    if (errs.length > 40) console.error(`  … 그리고 ${errs.length - 40}건 더`);
    console.error("");
  }
}

let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.id} ${r.what}${r.pass ? "" : `  → ${r.note}`}`);
  if (!r.pass) failed++;
}
console.log(`\ncheck-mirror-sync: ${results.length - failed}/${results.length} 통과`);
process.exit(failed > 0 ? 1 : 0);
