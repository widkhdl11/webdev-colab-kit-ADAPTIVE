#!/usr/bin/env node
// check-docs.mjs — 문서의 인용 링크를 기계로 검사한다 (§R2).
//
// 왜 있나: 1차 아키텍처 문서는 인용 203건이 렌더러에서 전부 깨졌다. 원인은 단순하다 —
// 링크를 레포 루트 기준으로 썼는데 렌더러는 문서 파일 위치 기준으로 해석한다.
// 예: docs/stages/01-x.md 안의 `(scripts/briefing.mjs)` → docs/stages/scripts/briefing.mjs (없음)
// 그래서 이 검사기는 "렌더러가 하는 그대로" 문서 디렉터리 기준으로 resolve 한 뒤 존재를 본다.
//
// 검사 항목
//   ① 대상 파일이 실제로 존재하는가 (문서 위치 기준 상대경로로 해석)
//   ② #L<n> 앵커의 줄 번호가 대상 파일의 줄 수 안에 있는가
//   ③ 레포 루트 기준으로는 맞지만 문서 위치 기준으로는 깨지는가 (= 1차와 같은 사고)
//
// 대상: 마크다운 링크 [텍스트](대상) 와 인용 태그 [CONFIRMED: 경로:줄]
//
// 사용법:  node scripts/check-docs.mjs [경로...]      (기본 docs/v2)
//          종료 코드 0 = 전부 통과, 1 = 실패 있음

import { readFileSync, readdirSync, existsSync, statSync, lstatSync } from "node:fs";
import { join, relative, dirname, resolve, sep, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => relative(ROOT, p).split(sep).join("/");
const targets = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const roots = (targets.length ? targets : ["docs/v2"]).map((t) => (isAbsolute(t) ? t : join(ROOT, t)));

function collect(p) {
  if (!existsSync(p)) return [];
  if (lstatSync(p).isFile()) return p.endsWith(".md") ? [p] : [];
  return readdirSync(p).flatMap((e) => collect(join(p, e)));
}
const docs = [...new Set(roots.flatMap(collect))].sort();

const lineTotal = (file) => {
  const t = readFileSync(file, "utf-8").replace(/^﻿/, "");
  const n = t.split(/\r?\n/).length;
  return /\r?\n$/.test(t) ? n - 1 : n;
};

// [텍스트](대상 "제목") — 대상만 취한다
const MD_LINK = /\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
// [CONFIRMED: 경로:123] / [CONFIRMED: 경로#L123]
const CITE_TAG = /\[CONFIRMED:\s*([^\]\s]+?)(?::(\d+)|#L(\d+))?\s*\]/g;

const failures = [];
let linkCount = 0;

for (const doc of docs) {
  const text = readFileSync(doc, "utf-8").replace(/^﻿/, "");
  const lines = text.split(/\r?\n/);
  // 코드 펜스 안은 예시일 수 있으므로 검사 대상에서 뺀다
  let fenced = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const lineNo = i + 1;

    const found = [];
    for (const m of line.matchAll(MD_LINK)) found.push({ raw: m[1], kind: "link" });
    for (const m of line.matchAll(CITE_TAG))
      found.push({ raw: m[1] + (m[2] ? `#L${m[2]}` : m[3] ? `#L${m[3]}` : ""), kind: "cite" });

    for (const { raw, kind } of found) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("#") || raw.startsWith("//")) continue; // URL·앵커전용
      linkCount++;
      const [pathPart, anchor = ""] = raw.split("#");
      if (!pathPart) continue;
      const fail = (rule, detail, hint) =>
        failures.push({ doc: rel(doc), line: lineNo, target: raw, kind, rule, detail, hint });

      // ① 렌더러 해석: 문서 파일 위치 기준
      const asRendered = resolve(dirname(doc), pathPart);
      if (!existsSync(asRendered)) {
        // ③ 루트 기준으로는 맞는가? 맞다면 1차와 똑같은 사고다 — 고칠 경로를 알려준다
        const asRoot = resolve(ROOT, pathPart);
        const hint = existsSync(asRoot)
          ? `루트 기준으론 존재함 → 문서 기준 상대경로로: ${relative(dirname(doc), asRoot).split(sep).join("/")}`
          : null;
        fail(
          hint ? "R2-3 루트기준표기" : "R2-1 대상없음",
          `문서 위치 기준 해석 = ${rel(asRendered)} (없음)`,
          hint
        );
        continue;
      }
      if (statSync(asRendered).isDirectory()) continue;

      // ② 줄 번호 범위
      const m = anchor.match(/^L?(\d+)(?:-L?(\d+))?$/);
      if (m) {
        const total = lineTotal(asRendered);
        const from = Number(m[1]);
        const to = m[2] ? Number(m[2]) : from;
        if (from < 1 || to > total || from > to)
          fail("R2-2 줄번호범위", `${rel(asRendered)} 는 ${total}줄인데 앵커는 ${from}${m[2] ? "-" + to : ""}`);
      }
    }
  });
}

const byRule = failures.reduce((a, f) => ((a[f.rule] = (a[f.rule] ?? 0) + 1), a), {});
console.log(`check-docs: ${docs.length} files, ${linkCount} links checked`);
if (failures.length === 0) {
  console.log("PASS — 0 failed");
  process.exit(0);
}
console.log(`FAIL — ${failures.length} failed  (${Object.entries(byRule).map(([k, v]) => `${k}=${v}`).join(" ")})\n`);
for (const f of failures) {
  console.log(`  ${f.doc}:${f.line}  [${f.rule}]  ${f.target}`);
  console.log(`      ${f.detail}`);
  if (f.hint) console.log(`      ↳ ${f.hint}`);
}
process.exit(1);
