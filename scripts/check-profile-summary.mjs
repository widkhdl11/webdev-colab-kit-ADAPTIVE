#!/usr/bin/env node
// @check-role: on-change
// @check-guards: gates/run-gates.mjs
//
// check-profile-summary.mjs — 게이트 통과 요약 줄이 프로젝트별 스택 판정을 찍는지 검사한다.
//
// 왜 필요한가: 게이트는 스택마다 규칙이 갈리는 자리에서 `isNextProject()`(next.config.* 존재)로
// 판정하고 분기한다 — design/BEFORE_UI 가 src/app/**/page.* 를 화면으로 볼지가 여기서 갈린다.
// 그런데 그 판정 결과는 아무 데도 안 찍혀서, 잘못 판정해도 조용히 지나간다.
// 2026-08-31 에 scaffold.mjs 에 두 번째 판정 지점(`resolveProfile()`)이 생기면서 근거가
// 갈라졌다(scaffold 는 docs/tech-stack.md 의 architectures 링크를 1순위로 본다).
// 두 판정을 하나로 합치는 것은 백로그에 남기고, 여기서는 **가정을 매 실행마다 보이게**만 한다.
//
// 이 패치는 보호 파일(gates/run-gates.mjs)을 사용자가 직접 붙인다.
//
//   F 프로파일 표시  통과 줄에 `<이름>=nextjs-fsd|vite-fsd` 가 프로젝트마다 찍힌다  ← 붙기 전 실패
//   G 기존 정보 보존 파일 수·프로젝트 수·quick 표기가 그대로 남아 있다             ← 붙기 전후 통과
//
// G 가 있는 이유: 요약 줄은 "무엇을 돌렸는지"를 말하는 자리다(2026-08-16 회고).
// 프로파일을 넣으면서 그 정보를 밀어내면 안 돈 검사와 통과한 검사의 구별이 다시 사라진다.
//
// 전부 임시 디렉터리에서 돈다 — 이 레포의 파일은 하나도 건드리지 않는다.
//
// 사용:
//   node scripts/check-profile-summary.mjs
//   node scripts/check-profile-summary.mjs --gate <파일>   # 붙이기 전에 후보를 확인할 때
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const gi = process.argv.indexOf("--gate");
const CANDIDATE = gi >= 0 ? resolve(process.argv[gi + 1] ?? "") : null;
if (gi >= 0 && !CANDIDATE) {
  console.error("--gate 뒤에 파일 경로가 필요하다");
  process.exit(1);
}

const results = [];
const ok = (name, detail = "") => results.push({ pass: true, name, detail });
const no = (name, detail) => results.push({ pass: false, name, detail });

// Next 하나(next.config.ts 있음) + Vite 하나(없음). 판정이 갈리는 최소 구성이다.
function makeKit() {
  const dir = mkdtempSync(join(tmpdir(), "profile-summary-probe-"));
  const g = join(dir, "gates");
  cpSync(join(ROOT, "gates"), g, { recursive: true });
  if (CANDIDATE) copyFileSync(CANDIDATE, join(g, "run-gates.mjs"));
  for (const [name, isNext] of [["probe-next", true], ["probe-vite", false]]) {
    const p = join(dir, "projects", name);
    mkdirSync(join(p, "src", "shared"), { recursive: true });
    writeFileSync(join(p, "src", "shared", "noop.ts"), "export const noop = () => {};\n");
    if (isNext) writeFileSync(join(p, "next.config.ts"), "export default {};\n");
  }
  return dir;
}

function runGates(dir) {
  const r = spawnSync("node", [join(dir, "gates", "run-gates.mjs"), "--quick"], {
    cwd: dir,
    encoding: "utf-8",
  });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

const dir = makeKit();
let summary = "";
try {
  const { status, out } = runGates(dir);
  summary = out.split("\n").find((l) => l.startsWith("게이트 통과")) ?? "";
  if (status !== 0 || !summary) {
    console.error(`게이트가 통과하지 않아 요약 줄을 못 봤다 (종료 ${status}):\n${out.trim()}`);
    process.exit(1);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`요약 줄: ${summary}`);

// ── F. 프로젝트마다 프로파일이 찍힌다 ─────────────────────────────
if (/probe-next=nextjs-fsd/.test(summary) && /probe-vite=vite-fsd/.test(summary)) {
  ok("F 프로파일 표시", "probe-next=nextjs-fsd · probe-vite=vite-fsd");
} else {
  no(
    "F 프로파일 표시",
    "요약 줄에 프로젝트별 스택 판정이 없다 — 게이트가 무엇을 가정하고 돌았는지 안 보인다. 패치가 아직 안 붙었다",
  );
}

// ── G. 원래 있던 정보가 그대로 남아 있다 ──────────────────────────
{
  const missing = [
    [/\d+개 파일/, "파일 수"],
    [/2개 프로젝트/, "프로젝트 수"],
    [/quick/, "quick 표기(무엇을 안 돌렸는지)"],
  ].filter(([re]) => !re.test(summary)).map(([, label]) => label);
  if (missing.length === 0) ok("G 기존 정보 보존", "파일 수·프로젝트 수·quick 표기가 그대로다");
  else no("G 기존 정보 보존", `요약에서 사라졌다: ${missing.join(", ")} — 검사 범위를 숨기면 안 돌린 것과 구별이 안 된다`);
}

let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.name}  ${r.detail}`);
  if (!r.pass) failed++;
}
console.log(`\ncheck-profile-summary: ${results.length - failed}/${results.length} 통과`);
if (failed > 0) {
  console.error("\n실패가 남았다. 위 메시지가 무엇이 빠졌는지 말해 준다.");
  process.exit(1);
}
