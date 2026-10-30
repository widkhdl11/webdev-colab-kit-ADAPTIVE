#!/usr/bin/env node
// find-old-values.mjs — 규칙 값을 바꾼 뒤, 지운 값이 아직 남아 있는 자리를 찾는다(.claude/rules/rule-change.md 의 1·2단계).
//
// 왜 있나: 같은 규칙이 SQL·시험 기대값·스펙 문장·화면 문구에 따로 적혀 있어, 한 곳을 고치면 나머지는
//   아무 신호 없이 옛 규칙으로 남는다(fankkuk 2026-10-15 닉네임 · 10-21 기한 168→720시간 · 10-30 알림 묶음).
//
// 무엇을 하나:
//   1. 기준(--base, 기본 HEAD)부터 작업 트리까지 바뀐 스펙(docs/specs)·마이그레이션(supabase) 줄에서 **지운 값**을 뽑는다.
//      값 = 숫자+단위(168시간·30일·10분·1,400원·5번 …)와 「」 안 용어(20자 이하).
//      같은 변경에서 다시 쓴 값(지우고 같은 값을 더한 것)은 바뀐 값이 아니라 뺀다. 이력 주석 줄(「#   2026-…」)도 뺀다.
//   2. 그 값을 프로젝트의 지금 자리 — docs/specs·docs/ux·docs/copy·src·tests — 에서 찾아 파일:줄로 보여 준다.
//      supabase/migrations 는 찾지 않는다. 지난 마이그레이션의 옛 값은 이력이라 남는 게 맞다.
//   **고르지 않는다.** 168 이 다른 규칙에도 나오므로, 찾은 자리마다 고칠지 그대로 둘지는 사람이 정한다.
//
// 사용: node scripts/find-old-values.mjs [--project <이름>] [--base <git 기준>] [--head <git 기준>]
//   --project 를 안 주면 루트 ACTIVE 가 가리키는 프로젝트. --head 를 주면 base..head 커밋 사이만 본다.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const option = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const project = option("--project") ?? readFileSync(join(ROOT, "ACTIVE"), "utf8").trim();
const projectDir = join(ROOT, "projects", project);
const base = option("--base") ?? "HEAD";
const head = option("--head");
const SEARCH_DIRS = ["docs/specs", "docs/ux", "docs/copy", "src", "tests"];
const MAX_HITS_PER_VALUE = 12;

function git(args) {
  return execFileSync("git", args, { cwd: projectDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

// ---------- 1. 지운 값 ----------

const UNIT = "(?:시간|일|분|초|원|개|건|번|자|회|차례|%)";
const NUMBER_VALUE = new RegExp(`\\d[\\d,]*(?:\\.\\d+)?\\s?${UNIT}`, "g");
const TERM_VALUE = /「([^」]{1,20})」/g;

// SQL·코드는 영어 단위를 쓴다(interval '168 hours'). 같은 값으로 읽어 한국어 단위로 적는다.
const ENGLISH_UNIT = { hour: "시간", hours: "시간", day: "일", days: "일", minute: "분", minutes: "분", mins: "분", second: "초", seconds: "초" };
const ENGLISH_VALUE = /(?<![\w.])(\d+)\s?(hours?|days?|minutes?|mins|seconds?)\b/gi;

function valuesIn(line) {
  if (/^#\s/.test(line)) return [];
  const out = [];
  for (const m of line.matchAll(NUMBER_VALUE)) out.push(m[0].replace(/\s/g, ""));
  for (const m of line.matchAll(ENGLISH_VALUE)) out.push(`${m[1]}${ENGLISH_UNIT[m[2].toLowerCase()]}`);
  for (const m of line.matchAll(TERM_VALUE)) out.push(`「${m[1]}」`);
  return out;
}

function removedValues() {
  const range = head ? [base, head] : [base];
  const diff = git(["diff", "--no-color", "--unified=0", "--relative", ...range, "--", "docs/specs", "supabase"]);
  const removed = new Map(); // 값 → 지운 자리(파일)
  const added = new Set();
  let current = null;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("--- ")) current = line === "--- /dev/null" ? null : line.slice(6);
    else if (line.startsWith("+++ ")) continue;
    else if (line.startsWith("-") && current) {
      for (const v of valuesIn(line.slice(1))) {
        if (!removed.has(v)) removed.set(v, new Set());
        removed.get(v).add(current);
      }
    } else if (line.startsWith("+")) for (const v of valuesIn(line.slice(1))) added.add(v);
  }
  for (const v of added) removed.delete(v); // 지우고 다시 쓴 값은 바뀐 값이 아니다
  for (const [v, where] of replacedFunctionValues()) {
    if (!removed.has(v)) removed.set(v, new Set());
    for (const w of where) removed.get(v).add(w);
  }
  return removed;
}

const FUNCTION_DEF = /create\s+(?:or\s+replace\s+)?function\s+(?:[a-z_]+\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;

/** 마이그레이션 한 파일 → 함수 이름 → 본문(다음 정의까지) */
function functionBodies(sql) {
  const out = new Map();
  const text = sql.replace(/--[^\n]*/g, "");
  const defs = [...text.matchAll(FUNCTION_DEF)];
  defs.forEach((m, i) => out.set(m[1].toLowerCase(), text.slice(m.index, i + 1 < defs.length ? defs[i + 1].index : text.length)));
  return out;
}

/**
 * 마이그레이션은 옛 파일을 고치지 않고 새 파일에서 함수를 다시 만든다 — 옛 값은 「지운 줄」이 아니라 앞 정의의 본문에 있다.
 * 이번 변경에서 다시 만든 함수마다 바로 앞 정의와 본문을 비교해, 앞에만 있던 값을 지운 값으로 본다.
 * (2026-10-30: 이것 없이 10-21 기한 정리 커밋으로 돌리면 지운 값 0개였다.)
 */
function replacedFunctionValues() {
  const dir = "supabase/migrations";
  if (!existsSync(join(projectDir, dir))) return new Map();
  const range = head ? [base, head] : [base];
  const changed = new Set(
    git(["diff", "--name-only", "--relative", ...range, "--", dir]).split(/\r?\n/).filter(Boolean),
  );
  if (!head) for (const f of git(["ls-files", "--others", "--exclude-standard", "--", dir]).split(/\r?\n/).filter(Boolean)) changed.add(f);
  const read = (path) => (head ? git(["show", `${head}:./${path}`]) : readFileSync(join(projectDir, path), "utf8"));
  const names = (head ? git(["ls-tree", "--name-only", head, `${dir}/`]).split(/\r?\n/).map((n) => n.split("/").pop()).join("\n") : readdirSync(join(projectDir, dir)).join("\n"))
    .split(/\r?\n/)
    .filter((n) => n.endsWith(".sql"))
    .sort();
  const out = new Map();
  const latest = new Map(); // 함수 → 지금까지 본 마지막 본문(바뀌지 않은 파일에서)
  for (const name of names) {
    const path = `${dir}/${name}`;
    let bodies;
    try {
      bodies = functionBodies(read(path));
    } catch {
      continue;
    }
    if (changed.has(path)) {
      for (const [fn, body] of bodies) {
        const before = latest.get(fn);
        if (!before) continue;
        const now = new Set(valuesIn(body.replace(/\n/g, " ")));
        for (const v of new Set(valuesIn(before.replace(/\n/g, " ")))) {
          if (now.has(v)) continue;
          if (!out.has(v)) out.set(v, new Set());
          out.get(v).add(`${fn}()`);
        }
      }
    } else {
      for (const [fn, body] of bodies) latest.set(fn, body);
    }
  }
  return out;
}

// ---------- 2. 남은 자리 ----------

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(full));
    else if (/\.(md|ts|tsx|mjs|js|sql|json)$/.test(e.name)) out.push(full);
  }
  return out;
}

/** 숫자 값은 앞뒤가 숫자가 아닐 때만 — 「68시간」이 「168시간」에 걸리지 않게. 「168 시간」처럼 띄어 쓴 것도 잡는다. */
function matcher(value) {
  if (value.startsWith("「")) return (text) => text.includes(value) || text.includes(value.slice(1, -1));
  const m = value.match(/^([\d,.]+)(.+)$/);
  // 「168시간」은 「168 hours」·「168 hour」로도 찾는다 — SQL·시험 코드가 영어 단위를 쓴다.
  const english = Object.entries(ENGLISH_UNIT).filter(([, ko]) => ko === m[2]).map(([en]) => en);
  const unit = [m[2].replace(/[%]/g, "\\$&"), ...english].join("|");
  const pattern = new RegExp(`(?<![\\d,.])${m[1].replace(/[.,]/g, "\\$&")}\\s?(?:${unit})(?![a-z])`, "i");
  return (text) => pattern.test(text);
}

const values = removedValues();
const range = head ? `${base}..${head}` : `${base} → 작업 트리`;
console.log(`옛 값 찾기 — ${project} · ${range} · 지운 값 ${values.size}개`);
if (values.size === 0) {
  console.log("  지운 값이 없다(스펙·마이그레이션에서 숫자+단위나 「」 용어를 지운 줄이 없다).");
  process.exit(0);
}
const files = SEARCH_DIRS.flatMap((d) => listFiles(join(projectDir, d)));
const texts = files.map((f) => [relative(projectDir, f).replace(/\\/g, "/"), readFileSync(f, "utf8").split(/\r?\n/)]);
// 같은 숫자가 다른 규칙에도 쓰여 남은 자리가 수백 곳이 될 수 있다(10-21 커밋의 168시간 = 216곳 — 승인 기한 7일도 168시간이다).
// 그래서 값을 지운 함수의 이름을 같이 쓰는 파일을 「먼저 볼 곳」으로 줄까지 보여 주고, 나머지는 파일별 개수만 적는다.
for (const [value, from] of values) {
  const test = matcher(value);
  const fnNames = [...from].filter((f) => f.endsWith("()")).map((f) => f.slice(0, -2));
  const first = [];
  const rest = new Map(); // 파일 → 곳 수
  let total = 0;
  for (const [rel, lines] of texts) {
    const related = fnNames.some((fn) => lines.some((l) => l.includes(fn)));
    lines.forEach((line, i) => {
      if (/^#\s/.test(line) && rel.startsWith("docs/specs/")) return; // 스펙 이력 주석
      if (!test(line)) return;
      total += 1;
      if (related) first.push(`${rel}:${i + 1}`);
      else rest.set(rel, (rest.get(rel) ?? 0) + 1);
    });
  }
  console.log(`- ${value} (지운 곳: ${[...from].map((f) => f.split("/").pop()).join(", ")}) — 남은 자리 ${total}`);
  if (first.length) {
    console.log(`  먼저 볼 곳(값을 지운 함수도 쓰는 파일) ${first.length}곳:`);
    for (const h of first.slice(0, MAX_HITS_PER_VALUE)) console.log(`    ${h}`);
    if (first.length > MAX_HITS_PER_VALUE) console.log(`    그 밖에 ${first.length - MAX_HITS_PER_VALUE}곳`);
  }
  if (rest.size) {
    const files = [...rest].sort((a, b) => b[1] - a[1]);
    const shown = files.slice(0, MAX_HITS_PER_VALUE).map(([f, n]) => `${f} ${n}`).join(" · ");
    console.log(`  그 밖의 파일 ${files.length}개: ${shown}${files.length > MAX_HITS_PER_VALUE ? ` 외 ${files.length - MAX_HITS_PER_VALUE}개` : ""}`);
  }
}
console.log("찾은 자리마다 고치거나, 그대로 두는 이유가 있으면 두고, 지금 못 고치면 BACKLOG 에 올린다.");
