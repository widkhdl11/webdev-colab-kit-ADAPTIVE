#!/usr/bin/env node
// check-foreign-gate-errors.mjs — 활성 프로젝트가 아닌 곳의 실패가 턴을 어떻게 다루는지 검사한다.
//
// 무엇을 지키는 검사인가:
//   `run-gates` 는 `workspace/PENDING.md` 가 있는 **모든 프로젝트**의 보류를 실패로 신고한다.
//   `graph-stop` 의 에러 파서는 **활성 프로젝트 경로가 아닌 줄을 건너뛴다**. 그래서 실패는
//   있는데 파싱 결과가 0건이 되고, 차단 판정이 "못 파싱했으면 막는다"로 떨어진다. 보류를
//   턴 차단에서 낮춰 주는 규칙은 파싱된 카테고리에만 적용되므로 닿지 못한다.
//   결과: 다른 프로젝트의 보류 하나가 **모든 턴을 막고**, 푸는 길이 사람의 답변뿐인데
//   그 답을 받으려면 턴이 끝나야 한다. 2026-09-04 study-mate 들여오기에서 실제로 났다.
//
//   A 현행     다른 프로젝트의 보류만 남으면 턴이 끝난다(exit 0)          ← 붙기 전 실패
//   B 과통과 X 다른 프로젝트의 진짜 위반은 여전히 막는다(exit 2)          ← 붙기 전후 통과
//   C 회귀 X   활성 프로젝트의 보류는 지금처럼 낮춰진다(exit 0)           ← 붙기 전후 통과
//   D 패치 확인 패치를 적용한 사본에서는 A 가 통과한다                     ← 붙기 전에도 통과
//
// **D 가 이 파일의 핵심이다.** 보호 파일이라 사용자가 붙이기 전에는 A 를 통과시킬 수 없는데,
// 그러면 "패치가 실제로 고치는지"를 아무도 확인하지 못한 채 붙이게 된다. D 는 패치를 적용한
// 사본을 임시 폴더에 만들어 거기서 A 와 같은 판정을 돌린다. A 가 실패하고 D 가 통과하면
// "지금은 막히고, 이 패치를 붙이면 안 막힌다"가 코드를 안 읽어도 판정된다.
//
// **B 가 A 와 각도가 다르다.** 이 패치는 차단을 **푸는** 변경이라 실패 방향이 과통과다.
// A 만 보면 "전부 통과시키는" 고장난 패치도 초록불이다.
//
// 검사하지 않는 것 — 밝혀 둔다:
//   "에러를 하나도 못 파싱했을 때는 막는다"(모르면 막는 쪽)는 분기는 픽스처로 만들 수 없다.
//   `run-gates` 가 exit 2 를 내면서 대괄호 줄을 하나도 안 내는 상태를 만들 방법이 없다.
//   그 분기는 패치가 건드리지 않는다 — 바뀌는 것은 "낮출 수 있는 것만 남았을 때"뿐이다.
//
// 전부 임시 디렉터리에서 돈다 — 이 레포의 파일은 하나도 건드리지 않는다.
//
// 사용: node scripts/check-foreign-gate-errors.mjs

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const ok = (id, name, pass, why = "") => results.push({ id, name, pass, why });

// ── 패치 — 이 문자열 쌍이 패치 문서의 내용과 같은 것이다 ──────────────────────
// D 가 사본에 적용하고, 현행 판정은 진짜 파일을 그대로 돌린다.
const PATCH = [
  {
    find: `function parseGateErrors(text) {`,
    replace: `// 다른 프로젝트에서 난 에러. 이 그래프의 판정(release · n/a 취소 · qa 안내)에는 쓰지 않는다 —
// 6단계 차단 판정에만 쓴다. 안 쓰면 "실패는 있는데 파싱 0건"이 되어 낮춤 규칙이 닿지 못하고,
// 사람의 결정으로만 풀리는 보류가 턴을 영영 막는다(2026-09-04 study-mate 들여오기에서 실제로 났다).
function parseForeignErrors(text) {
  const out = [];
  for (const line of text.split("\\n")) {
    const m = line.match(/^\\[([a-z-]+)\\/[^\\]]+\\]\\s+(.+)$/);
    if (!m) continue;
    const p = m[2].split(" — ")[0].split(" ")[0].split("\\\\").join("/");
    const pm = p.match(/^projects\\/([^/:]+)/);
    if (pm && pm[1] !== active) out.push({ cat: m[1], project: pm[1] });
  }
  return out;
}

function parseGateErrors(text) {`,
  },
  {
    find: `const gateErrors = parseGateErrors(gateOut);`,
    replace: `const gateErrors = parseGateErrors(gateOut);
const foreignErrors = parseForeignErrors(gateOut);`,
  },
  {
    find: `  for (const e of gateErrors) if (!byCat.has(e.cat)) byCat.set(e.cat, downgradeReason(e.cat));`,
    replace: `  for (const e of gateErrors) if (!byCat.has(e.cat)) byCat.set(e.cat, downgradeReason(e.cat));
  // 다른 프로젝트의 에러: GATE_KIND 에 있는 카테고리만 낮춘다. 거기 있다는 것은 "그래프가 처방한
  // 상태에서 비롯된 실패"라는 뜻이고, 그 판정은 **그 프로젝트의** 노드 상태로 해야 하는데 이
  // 그래프는 활성 프로젝트 것이라 판정할 근거가 없다. 목록에 없는 카테고리(fsd·security·tsc·
  // test·risk-surface)는 아무 데서나 나는 위반이라 지금처럼 어디서 나든 막는다.
  for (const e of foreignErrors) {
    if (byCat.has(e.cat)) continue;
    byCat.set(e.cat, GATE_KIND[e.cat]
      ? \`\${e.project} 의 그래프 상태에서 비롯된 실패다 — 이 그래프의 노드 상태로는 판정할 수 없고, 푸는 것도 그 프로젝트에서 한다\`
      : null);
  }`,
  },
  {
    find: `  if (gateErrors.length === 0 || blocking.length > 0) {`,
    replace: `  if ((gateErrors.length === 0 && foreignErrors.length === 0) || blocking.length > 0) {`,
  },
];

function applyPatch(src) {
  let out = src;
  for (const { find, replace } of PATCH) {
    if (!out.includes(find)) return { ok: false, at: find.split("\n")[0].slice(0, 50) };
    out = out.replace(find, replace);
  }
  return { ok: true, src: out };
}

// ── 픽스처: 킷을 복사한 최소 레포 ────────────────────────────────────────────
//   graph-stop 은 cwd 를 ROOT 로 잡고 거기서 run-gates 를 spawn 하므로 킷이 픽스처 안에 있어야 한다.
const PENDING_MD = `# 보류\n\n## 열린 항목\n\n- **P1 · 사람 결정 대기**\n  blocks: spec\n\n## 닫힌 항목\n`;

// **활성 프로젝트는 산출물 폴더를 갖지 않는다.** 이게 재현의 핵심이다 — 활성 프로젝트에서
// 에러가 하나라도 나면 파싱 결과가 0건이 아니게 되어 "파싱 불가" 분기에 안 걸리고 버그가
// 재현되지 않는다. 실제로 났을 때도 활성 프로젝트는 게이트를 다 통과하고 있었다.
function fixture({ pendingIn, plantViolation = false }) {
  const dir = mkdtempSync(join(tmpdir(), "foreign-gate-"));
  cpSync(join(ROOT, "gates"), join(dir, "gates"), { recursive: true });
  cpSync(join(ROOT, "graph.mjs"), join(dir, "graph.mjs"));
  writeFileSync(join(dir, "ACTIVE"), "home");
  for (const name of ["home", "other"])
    mkdirSync(join(dir, "projects", name, "workspace"), { recursive: true });
  mkdirSync(join(dir, "projects", "other", "src", "shared"), { recursive: true });
  writeFileSync(join(dir, "projects", "other", "src", "shared", "x.ts"), "export const x = 1;\n");
  mkdirSync(join(dir, "projects", "home", "docs"), { recursive: true });
  writeFileSync(join(dir, "projects", "home", "docs", "PRODUCT.md"), "# 프로브 제품\n\n한 줄.\n");
  writeFileSync(join(dir, "projects", pendingIn, "workspace", "PENDING.md"), PENDING_MD);
  if (plantViolation)
    writeFileSync(join(dir, "projects", "other", "src", "shared", "bad.ts"), "export const run = (s: string) => eval(s);\n");
  return dir;
}

// graph-stop 을 픽스처에서 돌린다. patched=true 면 패치를 적용한 사본으로 돌린다.
function runStop({ pendingIn, plantViolation = false, patched = false }) {
  const dir = fixture({ pendingIn, plantViolation });
  try {
    if (patched) {
      const src = readFileSync(join(dir, "gates", "graph-stop.mjs"), "utf-8");
      const res = applyPatch(src);
      if (!res.ok) return { code: null, out: "", patchFailedAt: res.at };
      writeFileSync(join(dir, "gates", "graph-stop.mjs"), res.src);
    }
    const r = spawnSync(process.execPath, [join(dir, "gates", "graph-stop.mjs")], {
      cwd: dir, encoding: "utf-8",
    });
    const out = (r.stdout ?? "") + "\n" + (r.stderr ?? "");
    const syntax = out.match(/^\s*(\w*(?:Syntax|Reference|Type)Error: .+)$/m);
    return { code: r.status, out, broken: syntax?.[1] ?? null };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── 현행 판정 ────────────────────────────────────────────────────────────────
const alreadyPatched = readFileSync(join(ROOT, "gates", "graph-stop.mjs"), "utf-8").includes("parseForeignErrors");

const a = runStop({ pendingIn: "other" });
ok("A", "현행     다른 프로젝트의 보류만 남으면 턴이 끝난다", a.code === 0,
  a.broken ? `Stop 훅이 아예 못 돈다 — ${a.broken}` :
  a.code !== 0 ? `exit ${a.code} — 막혔다. 활성 프로젝트의 에러가 0건이라 파싱 결과가 비었고, ` +
    `차단 판정이 "못 파싱했으면 막는다"로 떨어졌다(패치 미적용). D 가 통과하면 이 패치가 그것을 푼다` : "");

const b = runStop({ pendingIn: "other", plantViolation: true });
ok("B", "과통과 X 다른 프로젝트의 진짜 위반은 여전히 막는다", b.code === 2,
  b.code !== 2 ? `exit ${b.code} — 막아야 하는데 통과시켰다` : "");

const c = runStop({ pendingIn: "home" });
ok("C", "회귀 X   활성 프로젝트의 보류는 지금처럼 낮춰진다", c.code === 0,
  c.code !== 0 ? `exit ${c.code} — 원래 통과하던 것이 막혔다` : "");

// ── D: 패치를 적용한 사본에서 A 가 통과하는가 ───────────────────────────────
if (alreadyPatched) {
  ok("D", "패치 확인 이미 적용돼 있다(사본 대조 생략)", a.code === 0,
    a.code === 0 ? "" : "적용된 것으로 보이는데 A 가 실패한다 — 패치가 반쯤 붙었을 수 있다");
} else {
  const d = runStop({ pendingIn: "other", patched: true });
  const dv = runStop({ pendingIn: "other", plantViolation: true, patched: true });
  ok("D", "패치 확인 패치를 적용한 사본에서는 A 가 통과하고, 진짜 위반은 그대로 막는다",
    d.code === 0 && dv.code === 2,
    d.patchFailedAt ? `패치가 안 붙는다 — 못 찾은 자리: "${d.patchFailedAt}…"` :
    d.broken ? `패치한 사본이 못 돈다 — ${d.broken}` :
    `보류만=exit ${d.code}(0 이어야) / 위반 있음=exit ${dv.code}(2 여야)`);
}

console.log();
let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.id} ${r.name}${r.why ? `  — ${r.why}` : ""}`);
  if (!r.pass) failed++;
}
console.log(`\ncheck-foreign-gate-errors: ${results.length - failed}/${results.length} 통과` +
  (alreadyPatched ? "" : "  (패치 미적용 — A 가 그 신호이고, D 가 붙이면 풀린다는 근거다)"));
process.exit(failed ? 2 : 0);
