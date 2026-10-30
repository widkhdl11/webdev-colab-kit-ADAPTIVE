#!/usr/bin/env node
// @check-role: standing
//
// check-inv-citations.mjs — 스펙의 INV 를 고치면, 그 INV 번호를 인용하는 다른 문서의 파일:줄을 알린다.
//
// 왜 있나: 한 스펙의 불변식을 고쳐도 그 번호를 가져다 쓴 다른 스펙·화면 명세는 아무 신호를 내지 않는다.
//   2026-10-30 알림 스펙을 고칠 때 처리할 일 스펙(INV-J5)·계정 설정 스펙(INV-A11)을 손으로 찾았다.
//   인용이 그대로 맞는 경우가 많아서 **막지 않고 알리기만 한다** — 판정은 사람이 한다.
//
// 무엇을 보나:
//   - projects/<이름>/docs/specs/*.md 의 커밋 안 된 변경(HEAD 와 비교, 새 파일 포함)에서 더하거나 지운 줄이 속한 INV.
//     속한 INV = 그 줄에서 위로 올라가 처음 만나는 정의 앵커(줄 맨 앞 「- INV-…:」, docs-contract 2절). 제목(#)을 만나면 멈춘다.
//     본문을 고칠 때 번호는 앵커 줄에만 있고 고친 줄에는 없어서다. 그 줄에 직접 적힌 INV 번호(시나리오의 「(INV-J1)」 등)도 더한다.
//     맨 위 「#   2026-.. 이력」 주석 줄은 뺀다 — 과거 변경을 나열할 뿐이다.
//   - 같은 프로젝트의 docs/specs·docs/ux 아래 다른 .md 파일에서 그 번호가 나오는 줄.
//   - 출력 줄은 「⚠ [inv-cite/…]」로 시작한다. 게이트는 이 줄만 옮겨 적고 실패로 치지 않는다.
//
// 쓰는 법:
//   node scripts/check-inv-citations.mjs            지금 작업 트리의 스펙 변경으로 본다(종료 코드는 늘 0)
//   node scripts/check-inv-citations.mjs --probe    임시 레포에 인용을 심어 잡히는지, 인용이 없으면 조용한지 본다
//   node scripts/check-inv-citations.mjs --wired    실제 게이트가 이 경고를 옮겨 적는지 본다(게이트 패치 확인용)
//   node scripts/check-inv-citations.mjs --root <경로>   다른 폴더를 대상으로(프로브·게이트가 쓴다)

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const rootArg = argv.indexOf("--root");
const ROOT = resolve(rootArg >= 0 ? argv[rootArg + 1] : join(dirname(fileURLToPath(import.meta.url)), ".."));
const MAX_LINES = 20;
const INV = /\bINV-[A-Z]+\d+[a-z]?\b/g;

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
}

function listMd(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...listMd(full));
    else if (e.name.endsWith(".md")) out.push(full);
  }
  return out;
}

const ANCHOR = /^- (INV-[A-Z]+\d+[a-z]?):/;

/** 줄 번호(1부터)마다 그 줄이 속한 정의 앵커의 INV — 제목 줄(#)에서 끊는다. */
function enclosingInvs(lines) {
  const out = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(ANCHOR);
    if (m) current = m[1];
    else if (/^#/.test(line)) current = null;
    out.push(current);
  }
  return out;
}

/** 프로젝트마다 INV → 그 INV 가 바뀐 스펙 파일들 */
function changedInvs() {
  const byProject = new Map();
  const add = (path, inv) => {
    const m = path.match(/^projects\/([^/]+)\/docs\/specs\/[^/]+\.md$/);
    if (!m) return;
    if (!byProject.has(m[1])) byProject.set(m[1], new Map());
    const files = byProject.get(m[1]);
    if (!files.has(inv)) files.set(inv, new Set());
    files.get(inv).add(path);
  };
  /** 바뀐 줄 하나 — 이력 주석이 아니면 그 줄의 INV 번호와 속한 앵커 INV 를 더한다. */
  const take = (path, text, owner) => {
    if (/^#\s/.test(text)) return;
    for (const inv of text.match(INV) ?? []) add(path, inv);
    if (owner) add(path, owner);
  };
  let diff = "";
  try {
    diff = git(["diff", "HEAD", "--no-color", "--unified=0", "--", "projects/*/docs/specs/*.md"]);
  } catch {
    return byProject; // git 이 아니거나 HEAD 가 없다 — 알릴 것 없음
  }
  let oldPath = null;
  let newPath = null;
  let oldOwners = [];
  let newOwners = [];
  let oldLine = 0;
  let newLine = 0;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("--- ")) {
      oldPath = line === "--- /dev/null" ? null : line.slice(6);
      let text = "";
      try {
        if (oldPath) text = git(["show", `HEAD:${oldPath}`]);
      } catch {}
      oldOwners = enclosingInvs(text.split(/\r?\n/));
    } else if (line.startsWith("+++ ")) {
      newPath = line === "+++ /dev/null" ? null : line.slice(6);
      newOwners = newPath && existsSync(join(ROOT, newPath)) ? enclosingInvs(readFileSync(join(ROOT, newPath), "utf8").split(/\r?\n/)) : [];
    } else if (line.startsWith("@@")) {
      const h = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (h) {
        oldLine = Number(h[1]);
        newLine = Number(h[2]);
      }
    } else if (line.startsWith("-") && oldPath) {
      take(oldPath, line.slice(1), oldOwners[oldLine - 1]);
      oldLine += 1;
    } else if (line.startsWith("+") && newPath) {
      take(newPath, line.slice(1), newOwners[newLine - 1]);
      newLine += 1;
    }
  }
  const untracked = git(["ls-files", "--others", "--exclude-standard", "--", "projects/*/docs/specs/*.md"]);
  for (const path of untracked.split(/\r?\n/).filter(Boolean)) {
    const lines = readFileSync(join(ROOT, path), "utf8").split(/\r?\n/);
    const owners = enclosingInvs(lines);
    lines.forEach((text, i) => take(path, text, owners[i]));
  }
  return byProject;
}

function findCitations() {
  const notes = [];
  for (const [project, invs] of changedInvs()) {
    const docs = join(ROOT, "projects", project, "docs");
    const files = [...listMd(join(docs, "specs")), ...listMd(join(docs, "ux"))];
    for (const file of files) {
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      // 파일·INV 마다 한 줄로 묶는다 — 한 파일이 같은 번호를 열 번 쓰면 열 줄이 되어 정작 다른 파일이 잘린다.
      const hits = new Map();
      lines.forEach((text, i) => {
        if (/^#\s/.test(text)) return; // 이력 주석 줄 — 그 파일의 과거 변경 목록이지 지금의 인용이 아니다
        for (const inv of new Set(text.match(INV) ?? [])) {
          const sources = invs.get(inv);
          if (!sources || sources.has(rel)) continue;
          if (!hits.has(inv)) hits.set(inv, []);
          hits.get(inv).push(i + 1);
        }
      });
      for (const [inv, at] of hits) {
        const shown = at.length > 6 ? `${at.slice(0, 6).join(",")} 외 ${at.length - 6}` : at.join(",");
        notes.push(`⚠ [inv-cite/CITED] ${rel}:${shown} — ${inv} 를 인용한다(바뀐 곳: ${[...invs.get(inv)].map((s) => s.split("/").pop()).join(", ")}). 바뀐 내용과 맞는지 본다`);
      }
    }
  }
  return notes;
}

function report(notes) {
  for (const n of notes.slice(0, MAX_LINES)) console.log(n);
  if (notes.length > MAX_LINES) console.log(`⚠ [inv-cite/MORE] 그 밖에 ${notes.length - MAX_LINES}줄 — 'node scripts/check-inv-citations.mjs' 로 전부 본다`);
}

// ── 프로브: 임시 레포에 스펙 둘을 만들고, 한쪽 INV 를 고쳐 다른 쪽 인용이 잡히는지 본다.
function probe() {
  const dir = mkdtempSync(join(tmpdir(), "inv-cite-probe-"));
  const run = (args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  const write = (p, t) => {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), t);
  };
  const check = () =>
    spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--root", dir], { encoding: "utf8" }).stdout ?? "";
  const results = [];
  try {
    run(["init", "-q"]);
    run(["config", "user.email", "probe@example.com"]);
    run(["config", "user.name", "probe"]);
    // 정의 앵커는 「- INV-…:」 줄 하나, 고치는 것은 그 아래 이어지는 줄 — 실제 스펙이 이 모양이다.
    write("projects/p/docs/specs/a.md", "# a\n\n- INV-A1: 승인 기한은\n  168시간이다.\n");
    write("projects/p/docs/specs/b.md", "# b\n\n순서는 INV-A1 의 기한을 따른다.\n");
    write("projects/p/docs/ux/pages/c.md", "# c\n\n화면 문구는 INV-A1 기준.\n");
    write("projects/p/docs/specs/d.md", "# d\n\nINV-Z9 만 인용한다.\n");
    run(["add", "."]);
    run(["commit", "-q", "-m", "seed"]);

    results.push(["변경이 없으면 조용하다", check().trim() === ""]);

    write("projects/p/docs/specs/a.md", "# a\n\n- INV-A1: 승인 기한은\n  720시간이다.\n");
    const out = check();
    results.push(["다른 스펙의 인용을 잡는다", out.includes("projects/p/docs/specs/b.md:3 ")]);
    results.push(["화면 명세의 인용을 잡는다", out.includes("projects/p/docs/ux/pages/c.md:3 ")]);
    results.push(["바뀐 파일 자신은 알리지 않는다", !out.includes("specs/a.md:")]);
    results.push(["다른 번호만 인용한 파일은 알리지 않는다", !out.includes("specs/d.md")]);

    run(["checkout", "-q", "--", "."]);
    write("projects/p/docs/specs/a.md", "# a\n#   2026-10-30 INV-A1 고침(이력 줄)\n\n- INV-A1: 승인 기한은\n  168시간이다.\n");
    results.push(["이력 주석 줄만 바뀌면 알리지 않는다", check().trim() === ""]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  let failed = 0;
  for (const [label, ok] of results) {
    console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
    if (!ok) failed += 1;
  }
  console.log(failed === 0 ? `프로브 통과 (${results.length}개)` : `프로브 실패 ${failed}/${results.length}`);
  process.exit(failed === 0 ? 0 : 1);
}

// ── 배선 확인: 실제 게이트(gates/run-gates.mjs --quick)가 이 경고를 옮겨 적는지 본다.
//   임시 레포에 스펙 둘을 심고 한쪽을 고친 뒤, 그 레포를 작업 위치로 게이트를 돌린다.
//   게이트 패치 전에는 경고 줄이 없어 실패하고, 패치 뒤에는 있어 통과한다.
//   경고가 실패 목록(「게이트 실패 N건」 아래)에 섞이면 그것도 실패 — 막지 않는다는 약속을 본다.
function wired() {
  const gate = join(ROOT, "gates", "run-gates.mjs");
  if (!existsSync(gate)) {
    console.log("FAIL gates/run-gates.mjs 가 없다");
    process.exit(1);
  }
  const dir = mkdtempSync(join(tmpdir(), "inv-cite-wired-"));
  const run = (args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  const write = (p, t) => {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), t);
  };
  let out = "";
  try {
    run(["init", "-q"]);
    run(["config", "user.email", "probe@example.com"]);
    run(["config", "user.name", "probe"]);
    write("projects/p/src/shared/x.ts", "export const x = 1;\n");
    write("projects/p/docs/specs/a.md", "# a\n\n- INV-A1: 승인 기한은\n  168시간이다.\n");
    write("projects/p/docs/specs/b.md", "# b\n\n순서는 INV-A1 의 기한을 따른다.\n");
    run(["add", "."]);
    run(["commit", "-q", "-m", "seed"]);
    write("projects/p/docs/specs/a.md", "# a\n\n- INV-A1: 승인 기한은\n  720시간이다.\n");
    const r = spawnSync(process.execPath, [gate, "--quick"], { cwd: dir, encoding: "utf8" });
    out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const failBlock = out.slice(Math.max(0, out.indexOf("게이트 실패")));
  const results = [
    ["게이트가 인용 경고를 띄운다", out.includes("[inv-cite/CITED] projects/p/docs/specs/b.md:3 ")],
    ["경고가 실패 목록에 섞이지 않는다", !out.includes("게이트 실패") || !failBlock.includes("[inv-cite/")],
  ];
  let failed = 0;
  for (const [label, ok] of results) {
    console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
    if (!ok) failed += 1;
  }
  console.log(failed === 0 ? "배선 확인 통과" : `배선 확인 실패 ${failed}/${results.length} — 게이트 패치가 아직 안 붙었으면 이것이 정상이다`);
  process.exit(failed === 0 ? 0 : 1);
}

if (argv.includes("--probe")) probe();
else if (argv.includes("--wired")) wired();
else report(findCitations());
