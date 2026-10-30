#!/usr/bin/env node
// 바뀐 규칙과 관련된 통합 시험 파일 고르기 — 통합 시험 전체(1시간 반)를 돌리지 않고 옛 규칙을 기대하는 시험을 찾는다.
//
// 기준(base)부터 지금 작업 트리까지 바뀐 것에서 세 가지 단서를 뽑아 tests/integration 에서 찾는다.
//   1. DB 함수: supabase/migrations 에서 새로 만들거나 다시 만든 함수 이름.
//      시험이 함수 이름을 직접 안 쓰고 결제·주문 행을 넣어 트리거로 부르는 일이 많아서 두 단계를 더 본다 —
//      그 함수를 본문에서 바로 부르는 다른 함수(한 단계), 그 함수들이 트리거로 걸린 표.
//   2. 스펙 INV 번호: docs/specs/*.md 에서 더하거나 지운 줄에 나오는 INV 번호.
//   1b. API 경로: src/app/api/**/route.ts 가 바뀌면 그 주소를 쓰는 시험.
//   3. 문구: src/ 와 마이그레이션에서 지운 줄의 한글 문자열(4글자 이상) — 옛 문구를 기대하는 시험을 찾는다.
//
// 사용: node scripts/related-tests.mjs [--base <git 기준>] [--run] [--quiet]
//   --base 를 안 주면 origin/main 과의 공통 조상. 커밋 안 된 변경과 새 파일도 넣는다.
//   --head <git 기준> 을 주면 base..head 만 본다(작업 트리·새 파일 제외).
//   --run 이면 고른 파일만 통합 시험으로 돌린다. 고른 파일이 없으면 0 으로 끝난다.
//   숫자(168시간 같은 기한 값)는 단서로 쓰지 않는다 — 시험 곳곳에 같은 숫자가 있어 고르는 의미가 없다.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = join(projectRoot, "tests", "integration");
const migrationsDir = join(projectRoot, "supabase", "migrations");

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

function git(args) {
  return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

// ---------- 바뀐 줄 모으기 ----------

const base = option("--base") ?? git(["merge-base", "origin/main", "HEAD"]).trim();
// --head 를 주면 base..head 커밋 사이만 본다(지난 변경으로 이 스크립트를 시험할 때). 안 주면 지금 작업 트리까지.
const head = option("--head");

/** 경로(프로젝트 기준) → { added: string[], removed: string[] } */
function collectChanges() {
  const changes = new Map();
  const entry = (path) => {
    if (!changes.has(path)) changes.set(path, { added: [], removed: [] });
    return changes.get(path);
  };
  const diff = git(["diff", "--no-color", "--unified=0", "--relative", base, ...(head ? [head] : []), "--", "supabase", "docs/specs", "src"]);
  let current = null;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ ")) {
      current = line === "+++ /dev/null" ? null : line.slice(6);
      continue;
    }
    if (line.startsWith("--- ")) {
      if (line !== "--- /dev/null") current = line.slice(6);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+")) entry(current).added.push(line.slice(1));
    else if (line.startsWith("-")) entry(current).removed.push(line.slice(1));
  }
  // git diff 는 추적하지 않는 새 파일을 안 보여 준다 — 새 마이그레이션·새 스펙은 통째로 더한 것으로 본다.
  if (head) return changes;
  const untracked = git(["ls-files", "--others", "--exclude-standard", "--", "supabase/migrations", "docs/specs", "src"]);
  for (const path of untracked.split(/\r?\n/).filter(Boolean)) {
    entry(path).added.push(...readFileSync(join(projectRoot, path), "utf8").split(/\r?\n/));
  }
  return changes;
}

// ---------- 1. DB 함수 ----------

// 부르는 함수는 한 단계만 따라간다 — 세 단계로 하면 orders 처럼 거의 모든 시험이 쓰는 표의 트리거까지 닿아 118 개 중 67 개를 골랐다(2026-10-30).
const CALLER_DEPTH = 1;

const FUNCTION_DEF = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.|pii\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;

function changedFunctions(changes) {
  const names = new Set();
  for (const [path, { added }] of changes) {
    // manual/ 은 운영에 사람이 적용하는 SQL 이지만 같은 함수를 다시 만든다(2026-10-15 create_account 를 여기서만 바꿨다).
    if (!/^supabase\/(migrations|manual)\//.test(path)) continue;
    for (const m of added.join("\n").matchAll(FUNCTION_DEF)) names.add(m[1].toLowerCase());
  }
  return names;
}

/** 마이그레이션 전체에서 함수마다 마지막 정의의 본문, 함수마다 걸린 트리거의 표 */
function readSchema() {
  const bodies = new Map();
  const triggerTables = new Map();
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8").replace(/--[^\n]*/g, "");
    const defs = [...sql.matchAll(FUNCTION_DEF)];
    defs.forEach((m, i) => {
      const end = i + 1 < defs.length ? defs[i + 1].index : sql.length;
      bodies.set(m[1].toLowerCase(), sql.slice(m.index + m[0].length, end).toLowerCase());
    });
    const flat = sql.replace(/\s+/g, " ").toLowerCase();
    const trigger = /create (?:or replace )?(?:constraint )?trigger [a-z0-9_"]+ (?:before|after|instead of) [a-z ,]+? on (?:public\.|pii\.)?"?([a-z0-9_]+)"? .*?execute (?:function|procedure) (?:public\.|pii\.)?"?([a-z0-9_]+)"?/g;
    for (const m of flat.matchAll(trigger)) {
      if (!triggerTables.has(m[2])) triggerTables.set(m[2], new Set());
      triggerTables.get(m[2]).add(m[1]);
    }
  }
  return { bodies, triggerTables };
}

/** 바뀐 함수 → 그것을 바로 부르는 함수 → 그 모두가 트리거로 걸린 표 */
function expandFunctions(changed, { bodies, triggerTables }) {
  const reached = new Map([...changed].map((n) => [n, "바뀐 함수"]));
  let frontier = [...changed];
  for (let depth = 1; depth <= CALLER_DEPTH && frontier.length > 0; depth++) {
    const next = [];
    for (const [caller, body] of bodies) {
      if (reached.has(caller)) continue;
      const via = frontier.find((callee) => new RegExp(`\\b${callee}\\s*\\(`).test(body));
      if (via) {
        reached.set(caller, `${via} 를 부름`);
        next.push(caller);
      }
    }
    frontier = next;
  }
  const tables = new Map();
  for (const name of reached.keys()) {
    for (const table of triggerTables.get(name) ?? []) {
      if (!tables.has(table)) tables.set(table, `트리거 ${name}`);
    }
  }
  return { functions: reached, tables };
}

// ---------- 1b. API 경로 ----------

/** src/app/api/<경로>/route.ts → 주소. [id] 같은 칸은 그 앞까지만 쓴다. */
function routeUrl(path) {
  const m = path.match(/^src\/app\/(?:\([^)]+\)\/)*api\/(.+)\/route\.tsx?$/);
  if (!m) return null;
  const segments = [];
  for (const seg of m[1].split("/")) {
    if (seg.startsWith("[")) break;
    if (!seg.startsWith("(")) segments.push(seg);
  }
  return `/api/${segments.join("/")}`;
}

function listRouteFiles(dir = join(projectRoot, "src", "app")) {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) out.push(...listRouteFiles(full));
    else if (/^route\.tsx?$/.test(name.name)) out.push(relative(projectRoot, full).replace(/\\/g, "/"));
  }
  return out;
}

/**
 * 바뀐 API 주소. route.ts 가 바뀐 것과, 바뀐 src 파일의 슬라이스(@/features/signup 등)를 가져다 쓰는 route.ts.
 * 2026-10-15: /api/signup 의 route.ts 는 그대로였고 그것이 쓰는 입력 형식이 닉네임을 필수로 바꿔 metrics-routes 가 깨졌다.
 */
function changedRoutes(changes) {
  const routes = new Map();
  const slices = new Set();
  for (const path of changes.keys()) {
    const url = routeUrl(path);
    if (url) {
      routes.set(url, "경로 파일");
      continue;
    }
    const m = path.match(/^src\/(entities|features|widgets|shared)\/([^/]+)\//);
    if (m && !/\.test\.[tj]sx?$/.test(path)) slices.add(`@/${m[1]}/${m[2]}`);
  }
  if (slices.size === 0) return { routes, commonSlices: new Set() };
  const sources = listRouteFiles()
    .map((file) => [routeUrl(file), readFileSync(join(projectRoot, file), "utf8")])
    .filter(([url]) => url);
  const importsSlice = (source, slice) => new RegExp(`from\\s+["']${escapeRegExp(slice)}(?:["'/])`).test(source);
  // 경로 절반 넘게 쓰는 슬라이스(@/shared/api/supabase·@/entities/session 등)는 고르는 근거가 못 된다 — 표와 같은 규칙.
  const commonSlices = new Set([...slices].filter((slice) => sources.filter(([, src]) => importsSlice(src, slice)).length * 2 > sources.length));
  for (const [url, source] of sources) {
    if (routes.has(url)) continue;
    const slice = [...slices].find((s) => !commonSlices.has(s) && importsSlice(source, s));
    if (slice) routes.set(url, `${slice} 를 씀`);
  }
  return { routes, commonSlices };
}

// ---------- 2. 스펙 INV 번호 ----------

function changedInvs(changes) {
  const invs = new Set();
  for (const [path, { added, removed }] of changes) {
    if (!path.startsWith("docs/specs/")) continue;
    // 맨 위 「#   2026-.. 이력」 주석 줄은 뺀다 — 과거에 바뀐 INV 를 나열할 뿐 이번 변경이 아니다.
    for (const line of [...added, ...removed]) {
      if (/^#\s/.test(line)) continue;
      for (const m of line.matchAll(/\bINV-[A-Z]+\d+[a-z]?\b/g)) invs.add(m[0]);
    }
  }
  return invs;
}

// ---------- 3. 지운 문구 ----------

const HANGUL = /[가-힣]/;

function removedPhrases(changes) {
  const phrases = new Set();
  for (const [path, { removed }] of changes) {
    const isSource = path.startsWith("src/") && !/\.test\.[tj]sx?$/.test(path);
    const isMigration = path.startsWith("supabase/migrations/");
    if (!isSource && !isMigration) continue;
    for (const line of removed) {
      const code = line.replace(/\/\/.*$/, "").replace(/--.*$/, "");
      for (const m of code.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1|>([^<>{}]+)</g)) {
        const text = (m[2] ?? m[3] ?? "").trim();
        if (!HANGUL.test(text)) continue;
        // 템플릿의 ${...} 를 경계로 나눠, 시험 본문에 그대로 나올 만한 조각만 쓴다.
        for (const piece of text.split(/\$\{[^}]*\}|%s|\\n/)) {
          const p = piece.trim();
          if ((p.match(/[가-힣]/g) ?? []).length >= 4) phrases.add(p);
        }
      }
    }
  }
  return phrases;
}

// ---------- 찾기 ----------

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 시험 파일 절반 넘게 쓰는 표 — 고르는 근거가 못 되므로 이름만 알리고 고르지 않는다(사인오프 전체 실행이 본다). */
function commonTables(tables, texts) {
  const common = new Set();
  for (const table of tables.keys()) {
    const pattern = new RegExp(`\\b${table}\\b`);
    const users = texts.filter(([, lower]) => pattern.test(lower)).length;
    if (users * 2 > texts.length) common.add(table);
  }
  return common;
}

function findTests({ functions, tables, routes, invs, phrases }, texts) {
  const hits = new Map();
  const hit = (file, reason) => {
    if (!hits.has(file)) hits.set(file, []);
    hits.get(file).push(reason);
  };
  for (const [file, lower, text] of texts) {
    for (const [name, why] of functions) {
      if (new RegExp(`\\b${name}\\b`).test(lower)) hit(file, `함수 ${name}${why === "바뀐 함수" ? "" : ` (${why})`}`);
    }
    for (const [table, why] of tables) {
      if (new RegExp(`\\b${table}\\b`).test(lower)) hit(file, `표 ${table} (${why})`);
    }
    for (const [route, why] of routes) {
      // /api/me 가 /api/meta 에 걸리지 않게 뒤에 글자가 이어지면 뺀다. /api/me/x 는 걸린다.
      if (new RegExp(`${escapeRegExp(route)}(?![a-z0-9_-])`).test(text)) hit(file, `API ${route}${why === "경로 파일" ? "" : ` (${why})`}`);
    }
    for (const inv of invs) {
      if (new RegExp(`\\b${escapeRegExp(inv)}\\b`).test(text)) hit(file, `스펙 ${inv}`);
    }
    for (const phrase of phrases) {
      if (text.includes(phrase)) hit(file, `지운 문구 「${phrase}」`);
    }
  }
  return hits;
}

// ---------- 실행 ----------

const changes = collectChanges();
const schema = readSchema();
const { functions, tables } = expandFunctions(changedFunctions(changes), schema);
const { routes, commonSlices } = changedRoutes(changes);
const invs = changedInvs(changes);
const phrases = removedPhrases(changes);
const texts = readdirSync(testsDir)
  .filter((f) => f.endsWith(".test.ts"))
  .sort()
  .map((f) => {
    const text = readFileSync(join(testsDir, f), "utf8");
    return [f, text.toLowerCase(), text];
  });
const common = commonTables(tables, texts);
for (const table of common) tables.delete(table);
const hits = findTests({ functions, tables, routes, invs, phrases }, texts);

const quiet = flag("--quiet");
console.log(`기준: ${git(["rev-parse", "--short", base]).trim()}${head ? `..${git(["rev-parse", "--short", head]).trim()}` : " → 작업 트리"} · 바뀐 함수(부르는 함수 포함) ${functions.size} · 트리거 표 ${tables.size} · API ${routes.size} · INV ${invs.size} · 지운 문구 ${phrases.size}`);
if (!quiet) {
  if (functions.size) console.log(`  함수: ${[...functions.keys()].join(", ")}`);
  if (tables.size) console.log(`  표: ${[...tables.keys()].join(", ")}`);
  if (routes.size) console.log(`  API: ${[...routes.keys()].join(", ")}`);
  if (invs.size) console.log(`  INV: ${[...invs].join(", ")}`);
  if (phrases.size) console.log(`  문구: ${[...phrases].map((p) => `「${p}」`).join(" ")}`);
}
if (common.size) {
  console.log(`  고르지 않은 표(시험 절반 넘게 씀 — 사인오프 전체 실행이 본다): ${[...common].join(", ")}`);
}
if (commonSlices.size) {
  console.log(`  API 를 고르는 데 쓰지 않은 슬라이스(경로 절반 넘게 씀): ${[...commonSlices].join(", ")}`);
}
console.log(`고른 시험 파일 ${hits.size}개 / 전체 ${texts.length}개`);
for (const [file, reasons] of hits) {
  const shown = quiet ? reasons.slice(0, 2) : reasons;
  const more = reasons.length - shown.length;
  console.log(`  tests/integration/${file} — ${shown.join(" · ")}${more > 0 ? ` 외 ${more}` : ""}`);
}

if (flag("--run")) {
  if (hits.size === 0) process.exit(0);
  const targets = [...hits.keys()].map((f) => relative(projectRoot, join(testsDir, f)).replace(/\\/g, "/"));
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  if (!existsSync(join(projectRoot, "node_modules"))) throw new Error("node_modules 가 없다 — npm install 먼저");
  const result = spawnSync(npx, ["vitest", "run", "--config", "vitest.integration.config.mts", ...targets], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  process.exit(result.status ?? 1);
}
