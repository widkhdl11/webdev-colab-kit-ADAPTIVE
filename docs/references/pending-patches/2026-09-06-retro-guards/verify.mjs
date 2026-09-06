#!/usr/bin/env node
// 이 패치의 판정기. **코드를 안 읽어도 적용 여부를 가를 수 있어야 한다.**
//
//   node docs/references/pending-patches/2026-09-06-retro-guards/verify.mjs
//
// 적용 전에는 실패하고 적용 후에는 통과한다. 그리고 **위반을 일부러 심어 잡히는 것까지** 본다 —
// 「위반 0건」이라는 보고와 검사가 아예 안 돈 것은 겉이 같기 때문이다.
//
// 종료 코드: 0 = 둘 다 적용되고 성하다 · 1 = 하나 이상 미적용/고장

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const rows = [];
const say = (ok, name, detail) => rows.push({ ok, name, detail });

const GATE_DIR = "gates";
const SPEC_GATE = join(GATE_DIR, "spec-coverage.mjs");
const RUN_GATE = join(GATE_DIR, "run-gates.mjs");
const CHECKER = join("scripts", "check-hooks.mjs");

const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf-8") : "");
const run = (rel, args = [], cwd = ROOT) =>
  spawnSync(process.execPath, [join(ROOT, rel), ...args], { cwd, encoding: "utf-8" });

// ═══ A. 시나리오 ID 유일성 ════════════════════════════════════════════════
{
  const applied = read(SPEC_GATE).includes("DUP_SCENARIO");
  say(applied, "A1 · 패치가 적용됐다", applied ? "" : `${SPEC_GATE} 에 DUP_SCENARIO 검사가 없다 — 미적용`);

  if (applied) {
    // A2 — 지금 저장소는 중복이 없으니 통과해야 한다.
    const r = run(SPEC_GATE);
    const dup = ((r.stdout ?? "") + (r.stderr ?? "")).includes("DUP_SCENARIO");
    say(!dup, "A2 · 지금 저장소는 통과한다", dup ? "중복을 신고했다 — 스펙을 먼저 고친다" : "중복 0건");

    // A3 — **위반을 일부러 심는다.** 승인된 스펙의 시나리오 줄 하나를 그대로 한 번 더 붙이고,
    //      게이트가 그 번호를 이름으로 대며 종료 코드 2 로 죽는지 본다. 끝나면 원상복구한다.
    const target = join("projects", "study-mate", "docs", "specs", "write-authorization.md");
    const p = join(ROOT, target);
    if (!existsSync(p)) {
      say(false, "A3 · 심은 위반을 잡는다", `${target} 이 없다 — 다른 승인 스펙으로 바꿔 확인한다`);
    } else {
      const original = readFileSync(p, "utf-8");
      try {
        const NL = original.includes("\r\n") ? "\r\n" : "\n";
        const line = original.split(/\r?\n/).find((l) => /^\s*-\s+S\d/.test(l));
        if (!line) throw new Error("시나리오 줄을 못 찾았다");
        writeFileSync(p, original.trimEnd() + NL + line + NL);
        const r2 = run(SPEC_GATE);
        const out = (r2.stdout ?? "") + (r2.stderr ?? "");
        const id = /^\s*-\s+(S\d+[A-Za-z0-9-]*)/.exec(line)?.[1] ?? "";
        const caught = r2.status === 2 && out.includes("DUP_SCENARIO") && out.includes(id);
        say(
          caught,
          "A3 · 심은 위반을 잡는다",
          caught ? `${id} 를 이름으로 대며 종료 코드 2` : `종료 코드 ${r2.status} — 통과시켰다`,
        );
      } catch (e) {
        say(false, "A3 · 심은 위반을 잡는다", `프로브가 죽었다: ${String(e.message).slice(0, 60)}`);
      } finally {
        writeFileSync(p, original);
      }
    }
  }
}

// ═══ B. 훅 배선을 게이트로 올린다 ═════════════════════════════════════════
{
  const applied = read(RUN_GATE).includes("hooks/WIRING");
  say(applied, "B1 · 패치가 적용됐다", applied ? "" : `${RUN_GATE} 에 hooks/WIRING 배선이 없다 — 미적용`);

  // B2 — 검사기가 --wiring-only 를 아는가. 패치 B 가 그 모드로 부르므로, 검사기가 낡았으면
  //      게이트가 훅 프로세스를 오십 개 띄우거나 죽는다.
  const hasMode = read(CHECKER).includes("--wiring-only");
  say(hasMode, "B2 · 검사기가 --wiring-only 를 안다", hasMode ? "" : `${CHECKER} 가 낡았다`);

  if (hasMode) {
    const r = run(CHECKER, ["--wiring-only"]);
    say(r.status === 0, "B3 · 지금 훅 배선이 성하다", r.status === 0 ? "" : `종료 코드 ${r.status}`);

    // B4 — **위반을 일부러 심는다.** 상대 경로 훅이 든 가짜 저장소를 만들어 검사기를 거기서
    //      돌린다. 진짜 settings.json 은 안 건드린다(보호 파일이다).
    const tmp = join(ROOT, ".verify-hooks-probe");
    try {
      mkdirSync(join(tmp, ".claude", "hooks"), { recursive: true });
      for (const n of ["protect-files.mjs", "block-danger.mjs", "protect-secrets.mjs"])
        writeFileSync(join(tmp, ".claude", "hooks", n), "// probe\n");
      writeFileSync(
        join(tmp, ".claude", "settings.json"),
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                matcher: "Edit|Write|MultiEdit|Bash|PowerShell",
                hooks: [{ type: "command", command: "node .claude/hooks/protect-files.mjs" }],
              },
            ],
          },
        }),
      );
      const r2 = run(CHECKER, ["--wiring-only"], tmp);
      const out = (r2.stdout ?? "") + (r2.stderr ?? "");
      const caught = r2.status !== 0 && out.includes("작업 폴더와 무관하게");
      say(
        caught,
        "B4 · 심은 위반(상대 경로 훅)을 잡는다",
        caught ? "실패로 신고했다" : `종료 코드 ${r2.status} — 통과시켰다`,
      );
    } catch (e) {
      say(false, "B4 · 심은 위반(상대 경로 훅)을 잡는다", `프로브가 죽었다: ${String(e.message).slice(0, 60)}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

// ═══ 결과 ═════════════════════════════════════════════════════════════════
console.log("");
for (const r of rows) console.log(`  ${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const failed = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} 통과`);
if (failed.length) {
  console.log("\n적용 방법: 이 폴더의 *.patched.mjs 를 같은 이름의 판정 파일로 덮어쓴다.");
  console.log("  spec-coverage.patched.mjs → " + SPEC_GATE);
  console.log("  run-gates.patched.mjs     → " + RUN_GATE);
}
process.exit(failed.length ? 1 : 0);
