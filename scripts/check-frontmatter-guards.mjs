#!/usr/bin/env node
// @check-role: on-change
// @check-guards: gates/run-gates.mjs
//
// check-frontmatter-guards.mjs — run-gates 가 (1) 프론트매터의 중복 키와
// (2) 다른 프로젝트에서 복사돼 온 사인오프 마커를 거부하는지 검사한다.
//
// 왜 필요한가 — 두 가지가 조용히 지나간다.
//
// ① 중복 키: 게이트는 프론트매터를 정규식 한 줄로 읽는데, 같은 키가 두 번 나오면
//    어느 줄을 읽는지가 키마다 다르다. status 는 `^\s*status:\s*approved\b` 를 test 하므로
//    **한 줄이라도** approved 면 승인으로 읽고(draft 가 위에 있어도), surfaces 는 match 라
//    **첫 줄만** 읽는다. 2026-08-31 에 실제로 났다 — ingestion-ranking.md 아래쪽의
//    `surfaces: [concurrency]` 를 위에 넣은 `surfaces: []` 가 덮었고 아무 신호도 없었다.
//
// ② 외래 마커: workspace/review.md 는 "이 프로젝트의 이 코드를 리뷰했다"는 기록인데
//    파일 안에 어느 프로젝트인지가 없다. 2026-08-31 에 다른 프로젝트의 review.md
//    (status: passed · basis · reviewers, 720줄)와 deploy.md 가 signal2 로 통째로 복사돼 왔다.
//    basis 불일치가 막긴 했지만 basis 는 graph-stop 이 화면에 찍어주는 값이라 베끼면 통과한다.
//
// 이 패치는 보호 파일(gates/run-gates.mjs)을 사용자가 직접 붙인다.
// 붙었는지를 코드를 안 읽고도 판정할 수 있게, 아래 다섯을 **실제로 게이트를 돌려서** 본다.
//
//   A 중복 키 감지   같은 키가 두 줄이면 막는다                          ← 붙기 전 실패
//   B 외래 마커 감지 project 가 다른 프로젝트를 가리키면 막는다          ← 붙기 전 실패
//   C 귀속 미기재    project 줄이 아예 없는 마커도 막는다                ← 붙기 전 실패
//   D 과차단 없음    중복 없는 정상 스펙·design-rules 는 그냥 통과한다   ← 붙기 전후 통과
//   E 자기 마커      project 가 이 프로젝트면 통과한다                   ← 붙기 전후 통과
//
// D·E 가 있는 이유: 이 패치는 게이트를 **조이는** 변경이라 과차단이 실패 방향이다.
// 멀쩡한 파일까지 막으면 매 턴 걸려서 우회(파일 지우기)가 값싸진다.
//
// 전부 임시 디렉터리에서 돈다 — 이 레포의 파일은 하나도 건드리지 않는다.
//
// 사용:
//   node scripts/check-frontmatter-guards.mjs
//       → 지금 레포에 붙어 있는 게이트를 검사한다 (붙이기 전 2/5, 붙인 뒤 5/5)
//   node scripts/check-frontmatter-guards.mjs --gate <파일>
//       → 그 파일을 run-gates.mjs 자리에 끼워 검사한다. **붙이기 전에 후보를 확인**할 때.
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

// ── 격리 실행 준비 ────────────────────────────────────────────────
// projects/probe/ 하나만 둔다. src 가 있어야 게이트가 skip 하지 않는다.
function makeKit() {
  const dir = mkdtempSync(join(tmpdir(), "fm-guards-probe-"));
  const g = join(dir, "gates");
  cpSync(join(ROOT, "gates"), g, { recursive: true });
  if (CANDIDATE) copyFileSync(CANDIDATE, join(g, "run-gates.mjs"));
  const p = join(dir, "projects", "probe");
  mkdirSync(join(p, "docs", "specs"), { recursive: true });
  mkdirSync(join(p, "docs", "design"), { recursive: true });
  mkdirSync(join(p, "workspace"), { recursive: true });
  mkdirSync(join(p, "src", "shared"), { recursive: true });
  writeFileSync(join(p, "src", "shared", "noop.ts"), "export const noop = () => {};\n");
  return { dir, p };
}

// --quick: tsc·test·spec-coverage 를 빼고 판정만 본다. 이 검사들은 그 밖에 있어야 편집 즉시 걸린다.
function runGates(dir) {
  const r = spawnSync("node", [join(dir, "gates", "run-gates.mjs"), "--quick"], {
    cwd: dir,
    encoding: "utf-8",
  });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

const spec = (statusLine, extra = "") =>
  `---\nfeature: probe\n${statusLine}\n${extra}---\n\n# probe\n\n- INV-A1: 아무것도 하지 않는다. (강제 위치: 서버)\n`;

// ── A. 같은 키가 두 줄이면 막는다 ─────────────────────────────────
{
  const { dir, p } = makeKit();
  try {
    // 2026-08-31 에 실제로 있던 모양: 빈 선언이 위에, 진짜 선언이 아래에.
    writeFileSync(
      join(p, "docs", "specs", "dup.md"),
      spec("status: parked", "surfaces: []\nsurfaces: [concurrency]\n"),
    );
    const { status, out } = runGates(dir);
    if (status === 2 && /frontmatter\/DUPLICATE_KEY/.test(out) && /surfaces/.test(out)) {
      ok("A 중복 키 감지", "surfaces 두 줄을 막는다");
    } else {
      no(
        "A 중복 키 감지",
        `surfaces 가 두 줄인데 통과했다 (종료 ${status}) — 게이트는 위의 surfaces: [] 만 읽고 ` +
          "아래 [concurrency] 를 버린다. 패치가 아직 안 붙었다",
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── B. 다른 프로젝트의 사인오프 마커를 막는다 ─────────────────────
{
  const { dir, p } = makeKit();
  try {
    writeFileSync(
      join(p, "workspace", "review.md"),
      "---\nproject: other-project\nstatus: passed\nbasis: b853ea0606f5\nreviewers: [security-reviewer]\n---\n\n리뷰 결과.\n",
    );
    const { status, out } = runGates(dir);
    if (status === 2 && /signoff\/FOREIGN_MARKER/.test(out) && /other-project/.test(out)) {
      ok("B 외래 마커 감지", "project: other-project 마커를 probe 에서 막는다");
    } else {
      no(
        "B 외래 마커 감지",
        `다른 프로젝트의 사인오프가 그대로 통과했다 (종료 ${status}) — 패치가 아직 안 붙었다`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── C. project 줄이 없는 마커도 막는다 ────────────────────────────
{
  const { dir, p } = makeKit();
  try {
    // 지금 레포의 마커 형식이 이것이다. 도입하면 기존 마커도 한 줄을 추가해야 한다 —
    // 그 비용이 여기서 눈에 보여야 한다.
    writeFileSync(
      join(p, "workspace", "deploy.md"),
      "---\nstatus: deployed\nbasis: b853ea0606f5\n---\n\n배포 기록.\n",
    );
    const { status, out } = runGates(dir);
    if (status === 2 && /signoff\/FOREIGN_MARKER/.test(out)) {
      ok("C 귀속 미기재", "project 줄이 없는 마커를 막는다");
    } else {
      no(
        "C 귀속 미기재",
        `귀속이 안 적힌 마커가 통과했다 (종료 ${status}) — 적혀 있지 않으면 복사된 것과 구별할 수 없다`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── D. 정상 파일은 그냥 통과한다 (과차단 없음) ────────────────────
{
  const { dir, p } = makeKit();
  try {
    writeFileSync(join(p, "docs", "specs", "clean.md"), spec("status: parked", "surfaces: [concurrency]\n"));
    writeFileSync(join(p, "docs", "specs", "_TEMPLATE.md"), spec("status: draft"));
    writeFileSync(
      join(p, "docs", "design", "design-rules.md"),
      "---\nstatus: approved\n---\n\n# 시각 기준\n",
    );
    const { status, out } = runGates(dir);
    if (status === 0) ok("D 과차단 없음", "중복 없는 스펙·design-rules 는 통과한다");
    else no("D 과차단 없음", `멀쩡한 파일이 막혔다 (종료 ${status}): ${out.trim().split("\n").slice(-3).join(" / ")}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── E. 자기 프로젝트 마커는 통과한다 ──────────────────────────────
{
  const { dir, p } = makeKit();
  try {
    writeFileSync(
      join(p, "workspace", "review.md"),
      "---\nproject: probe\nstatus: passed\nbasis: b853ea0606f5\nreviewers: [code-reviewer]\n---\n\n리뷰 결과.\n",
    );
    const { status, out } = runGates(dir);
    if (status === 0) ok("E 자기 마커", "project: probe 마커는 통과한다");
    else no("E 자기 마커", `제 프로젝트 마커가 막혔다 (종료 ${status}): ${out.trim().split("\n").slice(-3).join(" / ")}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── 보고 ─────────────────────────────────────────────────────────
let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.name}  ${r.detail}`);
  if (!r.pass) failed++;
}
console.log(`\ncheck-frontmatter-guards: ${results.length - failed}/${results.length} 통과`);
if (failed > 0) {
  console.error("\n실패가 남았다. 위 메시지가 무엇이 빠졌는지 말해 준다.");
  process.exit(1);
}
