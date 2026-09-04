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
//   D  게이트 배선 심은 어긋남을 run-gates 전체 실행이 신고한다      ← 편입 패치 전 실패
//
// **S1·S2 가 이 파일의 핵심이다.** "어긋남 0건"이라는 보고와 "검사가 아예 안 돌았다"는
// 겉으로 같다. 위반을 일부러 심어 잡히는 것을 보지 않으면 둘을 구분할 수 없다.
//
// 사용: node scripts/check-mirror-sync.mjs
// 프로브는 전부 임시 디렉터리에서 돈다 — 이 레포의 파일은 하나도 건드리지 않는다.
// (D 도 그렇다. 진짜 AGENTS.md 를 심었다 되돌리게 짰다가 중간에 끊기면 손상이 남는 것을 겪었다)
// C 항목만 이 레포를 읽는다(읽기만 한다).

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

// ── 게이트에서 부르는 경로 (`--repo-only`) ─────────────────────────────
// 이 레포의 두 벌만 대조하고 끝낸다. 프로브를 안 돌리는 이유가 둘이다.
//
//   ① **프로브 D 가 run-gates 를 부른다.** 게이트가 프로브까지 돌리면 게이트→검사→게이트로
//      서로를 부르며 끝나지 않는다. 실제로 패치를 사본에 붙여 돌려 보고 나서야 드러났다
//      (2026-09-04). 배선 프로브를 넣는 순간 검사와 게이트는 서로를 부를 수 있게 된다.
//   ② 게이트가 알아야 하는 것은 "지금 두 벌이 어긋났나"뿐이다. 검사기 자신이 건강한가는
//      다른 질문이고, 그건 사람이 이 스크립트를 직접 돌릴 때 본다.
if (process.argv.includes("--repo-only")) {
  const errs = checkRepo(ROOT);
  for (const e of errs) console.error(e);
  console.log(`check-mirror-sync --repo-only: 어긋남 ${errs.length}건`);
  process.exit(errs.length > 0 ? 1 : 0);
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

// ── D: 게이트 배선 — 어긋남을 심으면 run-gates 가 신고하는가.
//    S1·S2·C 는 "판정이 옳은가"를 보고, D 는 "그 판정을 게이트가 부르는가"를 본다.
//    판정이 맞아도 아무도 안 부르면 손으로 돌릴 때만 도는 검사다 — 수동 도구는 아무도 안 알려준다.
//    (2026-09-04 교훈: 판정이 옳은가와 그 판정이 불리는가는 다른 질문이다)
//
//    **이 레포의 파일을 건드리지 않는다.** 처음에는 진짜 AGENTS.md 에 한 줄 심었다 되돌리게
//    짰는데, run-gates 가 두 번 도는 15초 동안 창을 닫거나 Ctrl+C 를 누르면 finally 가 안 돌아
//    그 줄이 그대로 남았다. 그다음 실행은 더럽혀진 파일을 '원본'으로 읽어서 **복원 성공이라고
//    보고하면서 손상을 보존했다** — 2026-09-04 에 실제로 그렇게 됐고, 붙기 전에도 붙은 뒤에도
//    4/6 이 나와 패치가 안 붙은 것처럼 보였다.
//    그래서 게이트를 임시 레포에서 돌린다. run-gates 는 ROOT 를 cwd 로 잡으므로,
//    cwd 만 픽스처로 주면 그 안의 CLAUDE.md·AGENTS.md·scripts/ 를 본다.
{
  const realGate = join(ROOT, "gates", "run-gates.mjs");
  const selfPath = fileURLToPath(import.meta.url);
  const dir = fixture();
  mkdirSync(join(dir, "scripts"), { recursive: true });
  copyFileSync(selfPath, join(dir, "scripts", "check-mirror-sync.mjs"));
  // run-gates 는 projects/<이름>/src 가 없으면 '검사 대상 없음'으로 보고 **일찍 끝난다.**
  // 그러면 두 벌 대조 블록까지 아예 도달하지 않아, 배선이 있어도 없는 것처럼 보인다.
  // (2026-09-04: 이걸 안 넣어서 D 가 붙은 뒤에도 false 를 냈다)
  mkdirSync(join(dir, "projects", "probe", "src", "shared"), { recursive: true });
  writeFileSync(join(dir, "projects", "probe", "src", "shared", "x.ts"), "export const x = 1;\n");

  const runIn = (extra = []) => {
    const r = spawnSync(process.execPath, [realGate, ...extra], { cwd: dir, encoding: "utf-8" });
    return /\[mirror\/DRIFT\]/.test((r.stdout ?? "") + "\n" + (r.stderr ?? ""));
  };
  const mirrorPath = join(dir, "AGENTS.md");
  const pristine = readFileSync(mirrorPath, "utf-8");

  const clean = runIn();                                        // 어긋남 없음 → 신고 없어야
  writeFileSync(mirrorPath, pristine + "\n미러에만 있는 줄.\n");
  const caught = runIn();                                       // 어긋남 있음 → 신고해야
  const quiet = runIn(["--quick"]);                             // 편집 훅 경로에서는 안 돌아야
  rmSync(dir, { recursive: true, force: true });

  ok("D", "게이트 배선  심은 어긋남을 run-gates 가 신고하고, 없으면·--quick 이면 안 한다",
     caught === true && clean === false && quiet === false,
     `현행=${clean} / 심었을 때=${caught} / --quick=${quiet}` +
       (caught === false ? " — 게이트에 배선이 안 됐다(패치 미적용)" : ""));
}

let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.id} ${r.what}${r.pass ? "" : `  → ${r.note}`}`);
  if (!r.pass) failed++;
}
console.log(`\ncheck-mirror-sync: ${results.length - failed}/${results.length} 통과`);
process.exit(failed > 0 ? 1 : 0);
