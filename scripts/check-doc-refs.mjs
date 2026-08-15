#!/usr/bin/env node
// check-doc-refs.mjs — 문서에 박힌 줄 참조가 어떤 코드를 가리키는지 보여준다.
//
// 왜 필요한가 (2026-08-16): 문서의 `파일#Lnn` 참조 148개가 코드와 어긋나 있었다.
// risk-surface 블록이 커지면서 그 뒤가 200줄 넘게 밀렸는데 아무 신호도 없었다 —
// 게이트는 projects/*/src 를 보지 문서 링크를 보지 않는다.
// 링크를 눌러 엉뚱한 코드를 보면 문서가 틀린 게 아니라 코드가 그런 줄 안다.
//
// 같은 세션 안에서 재발도 확인됐다: 참조 58개를 고친 뒤 게이트 파일에 7줄을 넣자
// 그중 24개가 다시 밀렸다. 게이트·그래프를 고칠 때마다 기계적으로 재발한다.
//
// **자동 판정은 하지 않는다.** "이 문장이 이 코드를 가리키는가"는 의미 판단이라
// 기계가 못 한다. 기계가 확실히 아는 것만 실패로 잡는다:
//   - 파일 범위를 벗어난 줄 번호
//   - 빈 줄이나 닫는 괄호만 가리키는 참조 (밀렸다는 거의 확실한 신호)
// 나머지는 `--all` 로 전부 찍어 사람이 대조한다.
//
// 게이트로는 만들지 않는다 — 문서 링크 하나 때문에 작업이 막히는 건 비용이 더 크다.
//
// 사용:
//   node scripts/check-doc-refs.mjs              # 의심스러운 것만 (실패 시 exit 2)
//   node scripts/check-doc-refs.mjs --all        # 전부 찍기 (사람이 대조)
//   node scripts/check-doc-refs.mjs --file gates/run-gates.mjs   # 특정 파일을 가리키는 것만
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const ROOT = process.cwd();
const ALL = process.argv.includes("--all");
const only = (() => {
  const i = process.argv.indexOf("--file");
  return i >= 0 ? process.argv[i + 1]?.split("\\").join("/") : null;
})();

function walk(dir) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (p.endsWith(".md")) out.push(p);
  }
  return out;
}

const cache = new Map();
function linesOf(absPath) {
  if (!cache.has(absPath)) {
    try {
      cache.set(absPath, readFileSync(absPath, "utf-8").split("\n"));
    } catch {
      cache.set(absPath, null);
    }
  }
  return cache.get(absPath);
}

// [텍스트](상대경로#L12-L34) 형태. 앵커가 있는 링크만 본다.
const LINK = /\]\(([^)#\s]+)#L(\d+)(?:-L(\d+))?\)/g;
const isBlank = (s) => s.trim() === "";
const isBareBracket = (s) => /^[\s}\)\],;]*$/.test(s) && !isBlank(s);

const rows = [];
for (const doc of walk("docs")) {
  const src = readFileSync(doc, "utf-8").split("\n");
  src.forEach((line, i) => {
    for (const m of line.matchAll(LINK)) {
      const target = resolve(dirname(doc), m[1]);
      const rel = relative(ROOT, target).split("\\").join("/");
      if (only && rel !== only) continue;
      if (!existsSync(target)) {
        rows.push({ doc, docLine: i + 1, rel, ref: m[0], kind: "없는 파일", detail: rel });
        continue;
      }
      const lines = linesOf(target);
      if (!lines) continue;
      const s = Number(m[2]);
      const e = m[3] ? Number(m[3]) : null;
      const ref = e ? `L${s}-L${e}` : `L${s}`;
      if (s > lines.length || (e && e > lines.length)) {
        rows.push({ doc, docLine: i + 1, rel, ref, kind: "범위 밖", detail: `파일은 ${lines.length}줄` });
        continue;
      }
      const head = lines[s - 1] ?? "";
      const kind = isBlank(head) ? "빈 줄" : isBareBracket(head) ? "닫는 괄호만" : "ok";
      rows.push({ doc, docLine: i + 1, rel, ref, kind, detail: head.trim().slice(0, 70) });
    }
  });
}

const bad = rows.filter((r) => r.kind !== "ok");
const show = ALL ? rows : bad;

for (const r of show) {
  const tag = r.kind === "ok" ? " " : "✗";
  console.log(`${tag} ${r.doc}:${r.docLine} → ${r.rel} ${r.ref}`);
  console.log(`    ${r.kind === "ok" ? "" : `[${r.kind}] `}${r.detail}`);
}

const byFile = new Map();
for (const r of rows) byFile.set(r.rel, (byFile.get(r.rel) ?? 0) + 1);
const top = [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 6);

console.log(
  `\n참조 ${rows.length}개 검사 · 의심 ${bad.length}건` +
    (ALL ? "" : bad.length ? "" : " (전부 보려면 --all)"),
);
if (ALL || bad.length === 0)
  console.log(`  많이 가리키는 파일: ${top.map(([f, n]) => `${f}(${n})`).join(" · ")}`);
if (bad.length)
  console.log(
    `\n의심 = 기계가 확신하는 것만이다(범위 밖·빈 줄·닫는 괄호). 나머지가 맞는지는 --all 로 직접 대조해야 한다.`,
  );
process.exit(bad.length ? 2 : 0);
