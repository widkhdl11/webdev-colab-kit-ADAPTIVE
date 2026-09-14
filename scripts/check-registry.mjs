#!/usr/bin/env node
// @check-role: standing
//
// check-registry.mjs — 검사 스크립트 각자가 "나는 언제 도는 검사인가"를 선언했는지,
// 그 선언과 실제 배선이 맞는지 본다.
//
// 왜 있나:
//   2026-09-14 에 scripts/check-*.mjs 스물아홉 개의 호출처를 전부 훑었더니, 게이트가
//   매번 부르는 것은 다섯이었다(client-server-import·cycle-policy·exempt-expiry·
//   hooks·mirror-sync). 나머지 스물넷은 사람이 손으로 쳐야만 돈다.
//
//   스물넷이 전부 죽은 코드라는 뜻은 아니다 — 일부는 패치가 듣는지 증명하려고 쓴 도구고,
//   일부는 매 턴 지켜야 하는데 아무도 안 부르는 것이다. **문제는 파일만 봐서 둘을
//   구분할 수 없다는 것이다.** 그래서 "검사를 만들었다"는 기록(LESSONS.md 열다섯 군데)이
//   "그 검사가 지금도 돈다"처럼 읽힌다. 이 레포가 이미 두 번 겪은 모양이다 —
//   훅이 죽어 있던 2026-08-16, 하네스가 통째로 꺼져 있던 2026-09-06.
//
// 역할 어휘 넷 — 파일 상단 주석에 한 줄로 선언한다:
//   // @check-role: standing    게이트·훅·스킬 중 한 곳이 매번 부른다. 부르는 곳이 없으면 실패
//   // @check-role: on-change   지키는 하네스 파일이 바뀐 턴에만 돈다. @check-guards 필수
//   // @check-role: manual      사람이 필요할 때 부르는 도구·보고서. @check-why-manual 필수
//   // @check-role: pending     상시로 올려야 하는데 아직 배선 안 됨. @check-backlog 필수
//
//   standing 이 아닌 역할은 전부 **자기를 정당화하는 줄을 하나 더** 요구한다.
//   안 그러면 역할 이름이 "안 돌아도 되는 이유" 자리를 공짜로 메운다.
//
// pending 은 게이트를 막지 않고 건수만 알린다. 스물넷을 하루에 다 배선할 수 없고,
// 전부 오류로 띄우면 상수가 된 경고가 되어 아무도 안 보게 된다. 대신 미뤘다는 사실이
// 백로그 항목과 묶여 기계에 남는다.
//
// 쓰는 법:
//   node scripts/check-registry.mjs              선언·배선 대조 (기본)
//   node scripts/check-registry.mjs --changed    거기에 더해, 바뀐 하네스 파일을 지키는
//                                                on-change 검사를 실제로 돌린다
//   node scripts/check-registry.mjs --probe      위반을 일부러 심어 잡히는지 확인한다
//   node scripts/check-registry.mjs --root <경로>  다른 폴더를 대상으로 (프로브가 쓴다)

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const SELF = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
const rootFlag = argv.indexOf("--root");
const ROOT = rootFlag >= 0 ? resolve(argv[rootFlag + 1]) : resolve(dirname(SELF), "..");
const PROBE = argv.includes("--probe");

// ── 재귀를 끊는 자리.
//    on-change 검사 여럿은 픽스처 레포를 만들어 그 안에서 run-gates 를 돌린다. 픽스처가 킷을
//    통째로 복사하면 그 run-gates 가 다시 이 등록부를 부르고, 등록부가 또 on-change 검사를
//    돌린다 — 게이트→검사→게이트로 서로를 부르며 끝나지 않는다.
//    (2026-09-14 실측: 이 빗장 없이 verify 를 돌렸더니 6분이 지나도 안 끝났다.
//     mirror-sync 가 `--repo-only` 로 같은 함정을 피한 것과 같은 부류다.)
//    그래서 아래로 내려간 프로세스에서는 --changed 를 **선언 대조만**으로 낮춘다.
const NESTED = process.env.HARNESS_CHECK_NESTED === "1";
const WITH_CHANGED = argv.includes("--changed") && !NESTED;

const ROLES = ["standing", "on-change", "manual", "pending"];

// 호출처로 인정하는 자리. 문서는 여기 없다 — 문서에 이름이 적혀 있는 것과
// 기계가 부르는 것은 다르고, 그 둘을 섞으면 이 검사가 스스로를 무효로 만든다.
const CALLER_DIRS = [["gates"], ["gates", "lib"], ["scripts"], [".claude"], [".claude", "hooks"]];
const CALLER_TREES = [[".claude", "skills"], [".agents", "skills"]];

function readIfExists(p) {
  try {
    return readFileSync(p, "utf-8");
  } catch {
    return "";
  }
}

function collectCallerFiles() {
  const out = [];
  for (const seg of CALLER_DIRS) {
    const dir = join(ROOT, ...seg);
    if (!existsSync(dir)) continue;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      if (/\.(mjs|js|json)$/.test(e.name)) out.push(join(dir, e.name));
    }
  }
  const rootGraph = join(ROOT, "graph.mjs");
  if (existsSync(rootGraph)) out.push(rootGraph);
  for (const seg of CALLER_TREES) {
    const dir = join(ROOT, ...seg);
    if (!existsSync(dir)) continue;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const skill = join(dir, e.name, "SKILL.md");
      if (existsSync(skill)) out.push(skill);
    }
  }
  return out;
}

// 헤더에서 선언을 뽑는다. 파일 앞 60줄만 본다 — 본문 문자열 안의 같은 글자를
// 선언으로 오인하지 않기 위해서다.
function parseDecl(src) {
  const head = src.split("\n").slice(0, 60);
  const pick = (key) => {
    for (const line of head) {
      const m = line.match(new RegExp(`^\\s*//\\s*@${key}:\\s*(.+?)\\s*$`));
      if (m) return m[1];
    }
    return null;
  };
  return {
    role: pick("check-role"),
    guards: (pick("check-guards") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    whyManual: pick("check-why-manual"),
    backlog: pick("check-backlog"),
  };
}

function changedFiles() {
  const r = spawnSync("git", ["status", "--porcelain=v1"], { cwd: ROOT, encoding: "utf-8" });
  if (r.status !== 0) return null;
  return (r.stdout || "")
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter(Boolean)
    .map((p) => p.replace(/^"|"$/g, "").split(" -> ").pop())
    .map((p) => p.split("\\").join("/"));
}

function audit() {
  const scriptsDir = join(ROOT, "scripts");
  const errors = [];
  const pendings = [];
  const byRole = { standing: 0, "on-change": 0, manual: 0, pending: 0 };
  // 검사 스크립트가 없는 폴더에서는 판정할 것이 없다 — 조용히 통과한다.
  // (픽스처 레포에서 게이트가 돌 때 여기 걸리면, 이 등록부가 남의 검사를 깨뜨린다)
  if (!existsSync(scriptsDir)) return { errors: [], pendings, byRole, entries: [] };

  const files = readdirSync(scriptsDir)
    .filter((n) => /^check-.*\.mjs$/.test(n))
    .sort();
  const callerFiles = collectCallerFiles();
  const callerText = new Map();
  for (const cf of callerFiles) callerText.set(cf, readIfExists(cf));
  const backlogText = readIfExists(join(ROOT, "docs", "references", "harness-backlog.md"));

  const entries = [];
  for (const name of files) {
    const path = join(scriptsDir, name);
    const d = parseDecl(readFileSync(path, "utf-8"));
    const callers = callerFiles.filter((cf) => cf !== path && (callerText.get(cf) || "").includes(name));
    entries.push({ name, ...d, callers });

    if (!d.role) {
      errors.push(
        `[registry/NO-ROLE] scripts/${name} — 역할 선언이 없다. 이 검사가 매번 도는 것인지 한 번 쓰는 도구인지 파일만 봐서는 모른다 ('// @check-role: ${ROLES.join("|")}' 한 줄을 단다)`,
      );
      continue;
    }
    if (!ROLES.includes(d.role)) {
      errors.push(`[registry/BAD-ROLE] scripts/${name} — 모르는 역할 '${d.role}' (쓸 수 있는 값: ${ROLES.join(", ")})`);
      continue;
    }
    byRole[d.role] += 1;

    if (d.role === "standing" && callers.length === 0) {
      errors.push(
        `[registry/UNWIRED] scripts/${name} — standing 이라고 선언했는데 부르는 곳이 없다. 매번 돈다고 적힌 검사가 실제로는 사람이 쳐야만 돈다`,
      );
    }
    if (d.role === "on-change") {
      if (d.guards.length === 0) {
        errors.push(
          `[registry/NO-GUARDS] scripts/${name} — on-change 는 무엇이 바뀔 때 도는지 적어야 한다 ('// @check-guards: gates/run-gates.mjs')`,
        );
      } else {
        for (const g of d.guards) {
          if (g.startsWith("../")) continue; // 레포 밖은 여기서 판정하지 않는다
          if (!existsSync(join(ROOT, g))) {
            errors.push(`[registry/DEAD-GUARD] scripts/${name} — 지킨다고 적힌 ${g} 가 없다. 대상이 사라졌으면 이 검사도 낡은 것이다`);
          }
        }
      }
    }
    if (d.role === "manual" && !d.whyManual) {
      errors.push(`[registry/NO-WHY] scripts/${name} — manual 은 게이트에 안 올리는 이유를 적어야 한다 ('// @check-why-manual: <한 줄>')`);
    }
    if (d.role === "pending") {
      if (!d.backlog) {
        errors.push(
          `[registry/NO-BACKLOG] scripts/${name} — pending 은 근거가 될 백로그 항목을 가리켜야 한다 ('// @check-backlog: <항목 제목 조각>')`,
        );
      } else if (!backlogText.includes(d.backlog)) {
        errors.push(
          `[registry/LOST-BACKLOG] scripts/${name} — 가리킨 백로그 항목 '${d.backlog}' 가 docs/references/harness-backlog.md 에 없다. 미룬 이유가 어디에도 안 남아 있다`,
        );
      } else {
        pendings.push(`${name} — ${d.backlog}`);
      }
    }
  }
  return { errors, pendings, byRole, entries };
}

// ── 프로브: 위반을 일부러 심어 잡히는지 본다.
//    "위반 0건"이라는 보고와 검사가 아예 안 돈 것은 겉이 같다(2026-09-02).
function probe() {
  const dir = join(tmpdir(), `registry-probe-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "gates"), { recursive: true });
  mkdirSync(join(dir, "docs", "references"), { recursive: true });
  writeFileSync(join(dir, "gates", "run-gates.mjs"), "// 빈 게이트 — 아무 검사도 안 부른다\n");
  writeFileSync(join(dir, "docs", "references", "harness-backlog.md"), "# 백로그\n- [ ] 실제로 있는 항목\n");

  const cases = [
    ["check-norole.mjs", "#!/usr/bin/env node\n// 역할을 안 적은 검사\n", "registry/NO-ROLE"],
    ["check-badrole.mjs", "#!/usr/bin/env node\n// @check-role: 아무거나\n", "registry/BAD-ROLE"],
    ["check-unwired.mjs", "#!/usr/bin/env node\n// @check-role: standing\n", "registry/UNWIRED"],
    ["check-noguards.mjs", "#!/usr/bin/env node\n// @check-role: on-change\n", "registry/NO-GUARDS"],
    [
      "check-deadguard.mjs",
      "#!/usr/bin/env node\n// @check-role: on-change\n// @check-guards: gates/sarajin.mjs\n",
      "registry/DEAD-GUARD",
    ],
    ["check-nowhy.mjs", "#!/usr/bin/env node\n// @check-role: manual\n", "registry/NO-WHY"],
    ["check-nobacklog.mjs", "#!/usr/bin/env node\n// @check-role: pending\n", "registry/NO-BACKLOG"],
    [
      "check-lostbacklog.mjs",
      "#!/usr/bin/env node\n// @check-role: pending\n// @check-backlog: 없는 항목\n",
      "registry/LOST-BACKLOG",
    ],
  ];
  for (const [name, body] of cases) writeFileSync(join(dir, "scripts", name), body);
  // 통과해야 하는 것도 같이 심는다 — 전부 빨간불인 검사는 아무것도 판정하지 않는다.
  writeFileSync(
    join(dir, "scripts", "check-ok-manual.mjs"),
    "#!/usr/bin/env node\n// @check-role: manual\n// @check-why-manual: 판정이 아니라 목록을 보여주는 도구다\n",
  );
  writeFileSync(
    join(dir, "scripts", "check-ok-pending.mjs"),
    "#!/usr/bin/env node\n// @check-role: pending\n// @check-backlog: 실제로 있는 항목\n",
  );

  const r = spawnSync(process.execPath, [SELF, "--root", dir], { encoding: "utf-8" });
  const out = (r.stdout ?? "") + "\n" + (r.stderr ?? "");
  let bad = 0;
  for (const [name, , code] of cases) {
    const caught = out.includes(code) && out.includes(name);
    console.log(`${caught ? "✓" : "✗"} 심은 위반 ${code} — ${caught ? "잡혔다" : "안 잡혔다"} (${name})`);
    if (!caught) bad += 1;
  }
  for (const ok of ["check-ok-manual.mjs", "check-ok-pending.mjs"]) {
    const flagged = out.split("\n").some((l) => l.includes(ok) && l.includes("[registry/"));
    console.log(`${flagged ? "✗" : "✓"} 멀쩡한 ${ok} — ${flagged ? "잘못 잡혔다" : "안 잡혔다"}`);
    if (flagged) bad += 1;
  }
  // 재귀 빗장도 같이 본다 — 빗장이 풀리면 게이트가 끝나지 않는데, 그 증상은 "느리다"로만 보인다.
  // 위반을 심은 폴더는 실패로 끝나서 요약 줄까지 못 간다 — 빗장만 보려고 깨끗한 폴더를 따로 쓴다.
  const clean = join(tmpdir(), `registry-probe-clean-${process.pid}`);
  rmSync(clean, { recursive: true, force: true });
  mkdirSync(join(clean, "scripts"), { recursive: true });
  const runSummary = (env) =>
    (spawnSync(process.execPath, [SELF, "--root", clean, "--changed"], { encoding: "utf-8", env: { ...process.env, ...env } })
      .stdout ?? "");
  const plain = runSummary({ HARNESS_CHECK_NESTED: "" });
  const nested = runSummary({ HARNESS_CHECK_NESTED: "1" });
  const guardOk = plain.includes("바뀐 파일로 돌린 on-change") && !nested.includes("바뀐 파일로 돌린 on-change");
  console.log(`${guardOk ? "✓" : "✗"} 재귀 빗장 — HARNESS_CHECK_NESTED=1 이면 --changed 가 선언 대조까지만 한다`);
  if (!guardOk) bad += 1;

  rmSync(dir, { recursive: true, force: true });
  rmSync(clean, { recursive: true, force: true });
  console.log(bad === 0 ? "\n프로브 통과 — 심은 위반이 전부 잡히고 멀쩡한 것은 안 잡힌다." : `\n프로브 실패 ${bad}건.`);
  process.exit(bad === 0 ? 0 : 1);
}

if (PROBE) probe();

const { errors, pendings, byRole, entries } = audit();

// ── --changed: 바뀐 하네스 파일을 지키는 on-change 검사를 실제로 돌린다.
const ranOnChange = [];
if (WITH_CHANGED) {
  const changed = changedFiles();
  if (changed === null) {
    console.error("⚠ [registry/SKIP-CHANGED] git 을 못 불러서 바뀐 파일을 모른다 — on-change 검사는 안 돌린다.");
  } else {
    for (const e of entries) {
      if (e.role !== "on-change") continue;
      if (!e.guards.some((g) => changed.includes(g))) continue;
      const r = spawnSync(process.execPath, [join(ROOT, "scripts", e.name)], {
        cwd: ROOT,
        encoding: "utf-8",
        // 이 아래로 내려가는 게이트는 등록부를 선언 대조까지만 돌린다 (위 NESTED 설명 참고).
        env: { ...process.env, HARNESS_CHECK_NESTED: "1" },
        timeout: 180_000,
      });
      ranOnChange.push(e.name);
      if (r.status !== 0) {
        const lines = ((r.stdout ?? "") + "\n" + (r.stderr ?? ""))
          .split("\n")
          .filter((l) => l.includes("✗"))
          .map((l) => l.trim());
        if (lines.length) for (const l of lines.slice(0, 5)) errors.push(`[registry/ON-CHANGE] ${e.name}: ${l.replace(/^✗\s*/, "")}`);
        else errors.push(`[registry/ON-CHANGE] ${e.name} 이 실패했다 — 'node scripts/${e.name}' 로 직접 본다`);
      }
    }
  }
}

if (pendings.length) {
  console.error(`▦ 배선 대기 ${pendings.length}건 (상시로 올려야 하는데 아직 아무도 안 부른다):`);
  for (const p of pendings) console.error(`  · ${p}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `검사 등록부 통과 (standing ${byRole.standing} · on-change ${byRole["on-change"]} · manual ${byRole.manual} · pending ${byRole.pending}` +
    (WITH_CHANGED ? ` · 바뀐 파일로 돌린 on-change ${ranOnChange.length}건${ranOnChange.length ? `: ${ranOnChange.join(", ")}` : ""}` : "") +
    ")",
);
