#!/usr/bin/env node
// remap-doc-refs.mjs — 코드 파일을 고쳐서 밀린 문서의 줄 참조(`#L12-L34`)를 옮긴다.
//
// 왜 있나: 게이트·그래프를 고칠 때마다 그 파일을 가리키던 참조가 기계적으로 밀린다.
// 2026-08-16(138개) · 2026-08-17(재발) · 2026-08-30(84개) — 세 번 다 손으로 옮겼다.
// `check-doc-refs` 는 밀렸다는 걸 알려주지도 못한다(확신하는 것만 잡는다: 범위 밖·빈 줄·닫는 괄호).
//
// **줄 번호 산술을 하지 않는다.** 옛 판본(git HEAD)에서 그 줄의 *내용*을 꺼내
// 새 파일에서 같은 내용을 찾는다. 앞뒤 문맥을 넓혀 가며 유일한 자리를 찾고,
// 못 찾으면(= 그 블록을 고쳐 썼거나 애초에 엉뚱한 데를 가리키고 있었다) 사람에게 넘긴다.
// 산술로 옮기면 '고쳐 쓴 블록 안을 가리키던 참조'가 조용히 엉뚱한 줄에 안착한다.
//
// 전제: **문서에 적힌 줄 번호가 기준 판본(기본 HEAD)의 그 파일과 맞아야 한다.**
//       중간에 그 파일을 고치고 재매핑을 건너뛴 채 커밋했다면 HEAD 는 기준이 아니다 —
//       마지막으로 참조가 맞았던 커밋을 `--base` 로 준다. 안 그러면 틀어진 번호를 기준으로
//       옮겨서 오차를 그대로 실어 나른다(2026-08-30 실측: CLAUDE.md 3줄을 넣고 안 돌린 채 커밋했다).
//
// 사용:
//   node scripts/remap-doc-refs.mjs gates/graph-stop.mjs            # 미리보기(안 고침)
//   node scripts/remap-doc-refs.mjs --write gates/graph-stop.mjs gates/run-gates.mjs
//   node scripts/remap-doc-refs.mjs --base 9702d28 --write CLAUDE.md   # 기준 판본을 지정
//
// 끝나고 `node scripts/check-doc-refs.mjs` 로 총계가 그대로인지 대조한다.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative, resolve, dirname } from "node:path";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const baseIdx = argv.indexOf("--base");
const BASE = baseIdx >= 0 ? argv[baseIdx + 1] : "HEAD";   // 문서의 줄 번호가 맞았던 마지막 판본
const TARGETS = argv
  .filter((a, i) => !a.startsWith("--") && !(baseIdx >= 0 && i === baseIdx + 1))   // --base 의 값은 대상이 아니다
  .map((t) => t.split("\\").join("/"));

if (TARGETS.length === 0) {
  console.error("사용: node scripts/remap-doc-refs.mjs [--base <커밋>] [--write] <코드파일...>");
  console.error("  예: node scripts/remap-doc-refs.mjs --write gates/graph-stop.mjs gates/run-gates.mjs");
  process.exit(1);
}

function walkMd(dir) {
  let out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walkMd(p));
    else if (p.endsWith(".md")) out.push(p);
  }
  return out;
}

// 옛 줄 → 새 줄. 내용이 같고 **앞뒤 문맥까지 같은** 자리를 찾는다.
// 문맥을 1줄부터 16줄까지 넓히며 후보가 하나로 좁혀지는 지점을 쓴다 — `}` 처럼 흔한 줄도 이렇게 갈린다.
function buildMap(oldLines, newLines) {
  const map = new Map();
  const ctxAt = (arr, i, r) => arr.slice(Math.max(0, i - r), i + r + 1).join("\n");
  for (let i = 0; i < oldLines.length; i++) {
    for (const r of [1, 2, 4, 8, 16]) {
      const want = ctxAt(oldLines, i, r);
      const hits = [];
      for (let j = 0; j < newLines.length; j++) if (ctxAt(newLines, j, r) === want) hits.push(j);
      if (hits.length === 1) { map.set(i + 1, hits[0] + 1); break; }
      if (hits.length === 0) break;   // 내용이 아예 없어졌다 → 고쳐 쓴 블록 안. 사람이 본다
    }
  }
  return map;
}

// 기준 판본을 먼저 밝힌다 — 이걸 잘못 잡으면 틀어진 번호를 기준으로 옮겨 오차를 실어 나른다.
{
  const sha = spawnSync("git", ["rev-parse", "--short", BASE], { cwd: ROOT, encoding: "utf-8" });
  console.log(
    `기준 판본: ${BASE}${sha.status === 0 ? ` (${sha.stdout.trim()})` : ""} — ` +
      `문서의 줄 번호가 이 판본과 안 맞으면 --base 로 맞는 커밋을 준다.`,
  );
}

const maps = new Map();
for (const t of TARGETS) {
  if (!existsSync(join(ROOT, t))) { console.error(`✗ 없는 파일: ${t}`); process.exit(1); }
  const g = spawnSync("git", ["show", `${BASE}:${t}`], { cwd: ROOT, encoding: "utf-8", maxBuffer: 1 << 24 });
  if (g.status !== 0) {
    console.error(`✗ git show ${BASE}:${t} 실패 — 추적되지 않은 파일이거나 이미 커밋 후다.`);
    process.exit(1);
  }
  // git 은 LF, Windows 작업본은 CRLF 가 섞인다 — 줄 끝을 맞춰야 내용 대조가 된다.
  const split = (s) => s.split("\n").map((l) => l.replace(/\r$/, ""));
  const oldLines = split(g.stdout);
  const newLines = split(readFileSync(join(ROOT, t), "utf-8"));
  if (oldLines.length === newLines.length && oldLines.join("\n") === newLines.join("\n")) {
    console.log(`● ${t}: ${BASE} 와 같다 — 옮길 것이 없다`);
    continue;
  }
  maps.set(t, buildMap(oldLines, newLines));
  console.log(`● ${t}: 옛 ${oldLines.length}줄 → 새 ${newLines.length}줄 · 대응 찾은 줄 ${maps.get(t).size}개`);
}
if (maps.size === 0) process.exit(0);

const LINK = /(\]\()([^)#\s]+)(#L)(\d+)(?:(-L)(\d+))?(\))/g;
let changed = 0;
const unresolved = [];
for (const doc of walkMd(join(ROOT, "docs"))) {
  const src = readFileSync(doc, "utf-8");
  let touched = false;
  const out = src.replace(LINK, (whole, a, path, b, s, dash, e, close) => {
    const rel = relative(ROOT, resolve(dirname(doc), path)).split("\\").join("/");
    const map = maps.get(rel);
    if (!map) return whole;
    const ns = map.get(Number(s));
    const ne = e ? map.get(Number(e)) : null;
    if (!ns || (e && !ne)) {
      unresolved.push(`${relative(ROOT, doc).split("\\").join("/")} → ${rel}#L${s}${e ? `-L${e}` : ""}`);
      return whole;
    }
    if (String(ns) === s && (!e || String(ne) === e)) return whole;
    touched = true;
    changed++;
    return `${a}${path}${b}${ns}${e ? `${dash}${ne}` : ""}${close}`;
  });
  if (touched && WRITE) writeFileSync(doc, out);
}

console.log(`\n${WRITE ? "옮김" : "옮길 것"} ${changed}개 · 대응 못 찾음 ${unresolved.length}개`);
for (const u of unresolved) console.log(`  ? ${u}`);
if (unresolved.length) {
  console.log(
    `\n못 찾은 것은 손으로 본다. 대개 둘 중 하나다 — 고쳐 쓴 블록 안을 가리켰거나,\n` +
      `**애초에 그 문장과 상관없는 코드를 가리키고 있었다**(2026-08-30 에 8개 전부 후자였다).\n` +
      `후자면 줄을 옮기지 말고 문장이 실제로 말하는 코드로 다시 겨눈다.`,
  );
}
if (!WRITE && changed > 0) console.log(`\n실제로 고치려면 --write 를 붙인다.`);
