#!/usr/bin/env node
// @check-role: on-change
// @check-guards: gates/spec-coverage.mjs
//
// check-inv-anchor.mjs — spec-coverage 가 "정의한 불변식"만 요구하는지 검사한다.
//
// 왜 필요한가: 지금 gates/spec-coverage.mjs 는 스펙 파일 **전체**에서 `INV-` 로 시작하는 글자를
// 전부 찾아 요구로 센다. 그래서 다른 스펙을 가리키는 문장 한 줄
// ("badge-keywords.md 의 INV-B1 이 …")만 써도 그 INV 의 테스트를 요구한다.
// 실측: signal2 스펙 5개에서 75개를 세는데 실제 정의는 60개다 — 15개가 유령이다.
//
// 이 패치는 보호 파일(gates/spec-coverage.mjs) 한 개를 사용자가 직접 붙인다.
// 붙었는지를 코드를 안 읽고도 판정할 수 있게, 아래 넷을 **실제로 게이트를 돌려서** 본다.
//
//   A 인용 면제   다른 스펙의 INV 를 본문에서 인용만 하면 테스트를 요구하지 않는다   ← 붙기 전 실패
//   B 귀속        정의한 파일에 요구가 붙는다 (인용한 파일이 아니라)                 ← 붙기 전 실패
//   C 요구 유지   정의했는데 테스트가 없으면 여전히 막는다 (느슨해지지 않았나)       ← 붙기 전후 통과
//   D 통과 경로   정의한 INV 를 테스트가 참조하면 통과한다                            ← 붙기 전후 통과
//
// C·D 가 있는 이유: 이 패치는 게이트를 **느슨하게** 만드는 변경이다. 느슨한 쪽으로 틀리면
// 놓친 것이 소리를 내지 않으므로, 막아야 할 것을 여전히 막는지 같이 본다.
//
// 전부 임시 디렉터리에서 돈다 — 이 레포의 파일은 하나도 건드리지 않는다.
//
// 사용:
//   node scripts/check-inv-anchor.mjs
//       → 지금 레포에 붙어 있는 판정기를 검사한다 (붙이기 전 2/4, 붙인 뒤 4/4)
//   node scripts/check-inv-anchor.mjs --gate <파일>
//       → 그 파일을 spec-coverage.mjs 자리에 끼워 검사한다. **붙이기 전에 후보 패치를 확인**할 때.
//         레포의 보호 파일은 읽기만 하고 건드리지 않는다.
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

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
function makeKit() {
  const dir = mkdtempSync(join(tmpdir(), "inv-anchor-probe-"));
  const g = join(dir, "gates");
  cpSync(join(ROOT, "gates"), g, { recursive: true });
  // --gate 를 주면 후보 판정기를 그 자리에 끼운다 (임시 사본 안에서만).
  if (CANDIDATE) copyFileSync(CANDIDATE, join(g, "spec-coverage.mjs"));
  const p = join(dir, "projects", "probe");
  mkdirSync(join(p, "docs", "specs"), { recursive: true });
  mkdirSync(join(p, "src"), { recursive: true });
  return { dir, p };
}

// approved 스펙 한 장. body 는 frontmatter 아래 본문.
function writeSpec(p, name, body) {
  writeFileSync(
    join(p, "docs", "specs", name),
    `---\nfeature: ${name}\nstatus: approved\nsurfaces: []\n---\n${body}\n`,
  );
}

function runSpecCoverage(dir) {
  const r = spawnSync("node", [join(dir, "gates", "spec-coverage.mjs")], {
    cwd: dir,
    encoding: "utf-8",
  });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

// 에러 줄에서 요구된 INV 목록을 뽑는다.
const missingInvs = (out) => [...out.matchAll(/—\s*(INV-[A-Z0-9]+)를/g)].map((m) => m[1]);

// ── A. 인용은 요구를 만들지 않는다 ────────────────────────────────
{
  const { dir, p } = makeKit();
  try {
    // 이 스펙은 INV-A1 하나만 정의하고, INV-Z9 는 남의 것이라고 말할 뿐이다.
    writeSpec(
      p,
      "own.md",
      [
        "# own",
        "",
        "## 불변식",
        "",
        "- INV-A1: 값은 저장하지 않고 조회 시 계산한다. (강제 위치: 서버)",
        "  위반 시: 저장값이 낡는다.",
        "",
        "> 옛 조항 INV-Z9 는 other.md 로 옮겼다 — 고칠 일이 있으면 그쪽을 고친다.",
      ].join("\n"),
    );
    // INV-A1 은 테스트가 있다. 그러니 남는 요구가 있다면 그건 인용한 INV-Z9 뿐이다.
    writeFileSync(join(p, "src", "a.test.ts"), 'it("INV-A1: 조회 시 계산", () => {});\n');

    const { status, out } = runSpecCoverage(dir);
    const asked = missingInvs(out);
    if (status === 0) {
      ok("A 인용 면제", "인용뿐인 INV-Z9 는 테스트를 요구하지 않는다");
    } else {
      no(
        "A 인용 면제",
        `인용만 한 ${asked.join(", ") || "INV"} 의 테스트를 요구한다 (종료 ${status}) — ` +
          "패치가 아직 안 붙었다. gates/spec-coverage.mjs 의 정의 앵커 정규식을 확인하라",
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── B. 요구는 정의한 파일에 붙는다 ────────────────────────────────
{
  const { dir, p } = makeKit();
  try {
    // a-def.md 가 정의하고, z-cite.md 가 인용한다. 파일 이름은 z 가 뒤에 오도록 지었다 —
    // 지금 구현은 Map 에 나중 파일이 덮어써서 **인용한 쪽**을 원인으로 지목한다.
    writeSpec(
      p,
      "a-def.md",
      ["# def", "", "- INV-A1: 값은 저장하지 않는다. (강제 위치: 서버)"].join("\n"),
    );
    writeSpec(
      p,
      "z-cite.md",
      ["# cite", "", "이 화면은 a-def.md 의 INV-A1 을 따른다. 여기서 다시 정하지 않는다."].join("\n"),
    );

    const { status, out } = runSpecCoverage(dir);
    if (status !== 2) {
      no("B 귀속", `테스트가 없는데 통과했다 (종료 ${status}) — C 와 함께 확인하라`);
    } else if (/a-def\.md/.test(out) && !/z-cite\.md/.test(out)) {
      ok("B 귀속", "요구가 정의한 a-def.md 에 붙는다");
    } else {
      no(
        "B 귀속",
        "요구가 인용한 z-cite.md 쪽에 붙었다 — 어느 파일을 고쳐야 하는지 메시지가 " +
          "틀린 곳을 가리킨다. 패치가 아직 안 붙었다",
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── C. 정의했는데 테스트가 없으면 여전히 막는다 ───────────────────
{
  const { dir, p } = makeKit();
  try {
    writeSpec(
      p,
      "own.md",
      ["# own", "", "- INV-A1: 값은 저장하지 않는다. (강제 위치: 서버)"].join("\n"),
    );
    // 테스트 파일 없음.
    const { status, out } = runSpecCoverage(dir);
    if (status === 2 && missingInvs(out).includes("INV-A1")) {
      ok("C 요구 유지", "정의한 INV-A1 의 테스트가 없으면 막는다");
    } else {
      no(
        "C 요구 유지",
        `정의한 INV-A1 을 요구하지 않는다 (종료 ${status}) — ` +
          "정의 앵커 정규식이 실제 스펙 형식(`- INV-X: …`)을 못 잡는다. 게이트가 통째로 무력해졌다",
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── D. 테스트가 참조하면 통과한다 ─────────────────────────────────
{
  const { dir, p } = makeKit();
  try {
    writeSpec(
      p,
      "own.md",
      ["# own", "", "- INV-A1: 값은 저장하지 않는다. (강제 위치: 서버)"].join("\n"),
    );
    writeFileSync(join(p, "src", "a.test.ts"), 'it("INV-A1: 저장하지 않는다", () => {});\n');
    const { status, out } = runSpecCoverage(dir);
    if (status === 0) ok("D 통과 경로", "테스트가 INV-A1 을 참조하면 통과한다");
    else no("D 통과 경로", `테스트가 있는데 막힌다 (종료 ${status}): ${out.trim().split("\n")[0]}`);
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
console.log(`\ncheck-inv-anchor: ${results.length - failed}/${results.length} 통과`);
if (failed > 0) {
  console.error("\n실패가 남았다. 위 메시지가 무엇이 빠졌는지 말해 준다.");
  process.exit(1);
}
