#!/usr/bin/env node
// check-handover-rehearsal.mjs — v3.2 의 완료 기준을 실제로 리허설한다.
//
// 완료 상태: **이전 = projects/<이름>/docs/ 복사 + docs/references/docs-contract.md 전달.**
//            workspace/ 는 통째로 버려도 프로젝트 지식이 소실되지 않는다.
//
// 말로 확인할 수 있는 것이 아니라서 실제로 복사해 본다. 임시 디렉터리에 docs/ 와 계약
// 문서만 넣고, 하네스 없이 아래 셋을 본다.
//
//   R1 하네스 참조 0건   복사본 안에 게이트·훅·workspace 를 가리키는 문장이 없다
//   R2 상태 복원         계약 문서만 보고 각 스펙의 status·surfaces 를 읽어 원본과 일치한다
//   R3 자립               복사본이 workspace/ 의 어떤 파일도 필요로 하지 않는다
//
// R1·R2 는 "잡을 것이 있는지"를 먼저 확인한다 — 대상이 0건인데 통과하면 검사가 아니라
// 아무것도 안 한 것이다(check-read-spec 의 S 검사와 같은 이유).
//
// 사용: node scripts/check-handover-rehearsal.mjs [--keep]

import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KEEP = process.argv.includes("--keep");

// 계약 문서에 등재된 어휘. 이전받는 쪽은 이 문서만 읽고 아래를 알 수 있어야 한다.
const STATUS_VOCAB = ["draft", "approved", "parked"];
const SURFACE_VOCAB = ["auth", "payment", "authz", "concurrency"];
const HARNESS_REFS = [
  { re: /\bgates\//, what: "게이트 경로" },
  { re: /\b(run-gates|graph-stop|spec-coverage|propagate|graph)\.mjs\b/, what: "게이트 파일명" },
  { re: /\b(run-gates|graph-stop|spec-coverage)\b/, what: "게이트 이름" },
  { re: /\b(BEFORE_UI|NO_INNERHTML|risk-surface)\b/, what: "게이트 규칙 이름" },
  { re: /(^|[\s(`"'])\.claude\//, what: "하네스 설정 경로" },
  { re: /\bworkspace\//, what: "과정 기록 경로" },
  { re: /^[ \t]*basis:/, what: "사인오프 해시 필드" },
];

function walk(p, out = []) {
  if (!existsSync(p)) return out;
  for (const n of readdirSync(p)) {
    const f = join(p, n);
    if (statSync(f).isDirectory()) walk(f, out);
    else out.push(f);
  }
  return out;
}
function textFiles(dir) {
  return walk(dir).filter((f) => /\.(md|html|css|txt|json|ya?ml)$/i.test(f));
}

// 이전받는 쪽의 파서 — 계약 문서에 적힌 것만 보고 짠 것이다.
// 게이트 코드를 import 하지 않는 것이 요점이다: 하네스 없이 읽히는지를 보는 검사다.
function readByContract(src) {
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return { status: "draft", surfaces: [] };
  const t = fm[1];
  const field = (k) => {
    const m = t.match(new RegExp(`^[ \\t]*${k}:[ \\t]*(.*)$`, "m"));
    return m ? m[1].split("#")[0].trim() : null;
  };
  const rawStatus = field("status") ?? "";
  const status = STATUS_VOCAB.includes(rawStatus) ? rawStatus : "draft";
  const raw = field("surfaces");
  let tokens = [];
  if (raw !== null) {
    const br = raw.match(/^\[([^\]]*)\]/);
    if (br) tokens = br[1].split(",");
    else if (raw && !raw.startsWith("#")) tokens = raw.split(",");
    else {
      const rest = t.slice(t.indexOf("surfaces:")).split("\n").slice(1);
      for (const line of rest) {
        const li = line.match(/^[ \t]*-[ \t]*([A-Za-z-]+)/);
        if (!li) break;
        tokens.push(li[1]);
      }
    }
  }
  const surfaces = tokens.map((x) => x.trim().replace(/['"]/g, "")).filter((x) => SURFACE_VOCAB.includes(x));
  return { status, surfaces };
}

const results = [];
const ok = (id, name, pass, why = "") => results.push({ id, name, pass, why });

const projects = readdirSync(join(ROOT, "projects")).filter((p) =>
  existsSync(join(ROOT, "projects", p, "docs")),
);

const dir = mkdtempSync(join(tmpdir(), "handover-"));
for (const p of projects) {
  mkdirSync(join(dir, p), { recursive: true });
  cpSync(join(ROOT, "projects", p, "docs"), join(dir, p, "docs"), { recursive: true });
}
cpSync(join(ROOT, "docs", "references", "docs-contract.md"), join(dir, "docs-contract.md"));

// ── R1: 하네스 참조 ───────────────────────────────────────────────────────────
{
  const found = [];
  for (const f of textFiles(dir)) {
    if (f.endsWith("docs-contract.md")) continue;  // 계약 문서는 하네스를 설명하는 문서다
    readFileSync(f, "utf-8").split("\n").forEach((line, i) => {
      for (const { re, what } of HARNESS_REFS)
        if (re.test(line)) { found.push(`${relative(dir, f)}:${i + 1} — ${what}`); break; }
    });
  }
  ok("R1", `하네스 참조 0건 (검사한 파일 ${textFiles(dir).length}개)`, found.length === 0,
    found.length ? `${found.length}건:\n     ${found.join("\n     ")}` : "");
}

// ── R2: 상태 복원 ─────────────────────────────────────────────────────────────
{
  const rows = [];
  for (const p of projects) {
    const specDir = join(dir, p, "docs", "specs");
    if (!existsSync(specDir)) continue;
    for (const f of readdirSync(specDir).filter((n) => n.endsWith(".md"))) {
      const copied = readByContract(readFileSync(join(specDir, f), "utf-8"));
      const origin = readByContract(readFileSync(join(ROOT, "projects", p, "docs", "specs", f), "utf-8"));
      rows.push({
        name: `${p}/${f.replace(/\.md$/, "")}`,
        ...copied,
        same: copied.status === origin.status && `${copied.surfaces}` === `${origin.surfaces}`,
      });
    }
  }
  const bad = rows.filter((r) => !r.same);
  // 잡을 것이 있는지 먼저 본다 — 스펙이 0개면 이 검사는 아무것도 확인하지 않은 것이다.
  ok("R2", `상태 복원 (스펙 ${rows.length}건)`, rows.length > 0 && bad.length === 0,
    rows.length === 0 ? "복사본에 스펙이 없다 — 검사가 아무것도 안 봤다" :
    bad.length ? `${bad.length}건 불일치` : "");
  for (const r of rows) console.log(`     ${r.same ? "·" : "≠"} ${r.name.padEnd(28)} ${r.status.padEnd(9)} [${r.surfaces.join(",")}]`);
}

// ── R3: 자립 ─────────────────────────────────────────────────────────────────
{
  const needs = [];
  for (const f of textFiles(dir)) {
    if (f.endsWith("docs-contract.md")) continue;
    const src = readFileSync(f, "utf-8");
    for (const m of src.matchAll(/(?:\.\.\/)*(?:workspace|\.claude|gates|scripts)\/[\w./-]+/g))
      needs.push(`${relative(dir, f)} → ${m[0]}`);
  }
  ok("R3", "자립  복사본이 킷·workspace 파일을 가리키지 않는다", needs.length === 0,
    needs.length ? `${needs.length}건:\n     ${needs.join("\n     ")}` : "");
}

if (KEEP) console.log(`\n리허설 복사본: ${dir}`);
else rmSync(dir, { recursive: true, force: true });

console.log();
let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.id} ${r.name}${r.why ? `  — ${r.why}` : ""}`);
  if (!r.pass) failed++;
}
console.log(`\ncheck-handover-rehearsal: ${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 2 : 0);
