// 변이 전체를 한 바퀴 돌린다. 변이마다: 심는다 → 통합 테스트를 돌린다 →
// **그 불변식을 이름에 담은 테스트가 빨간불이 났는지** 본다 → 복구하고 지문을 대조한다.
//
// 예전 판정은 `종료 코드 ≠ 0` 하나였다. 그래서 뒷정리(afterAll 의 cleanupUsers)가 던지기만
// 해도 아무도 안 붙들고 있는 변이가 「잡혔다」로 보고됐다 — 이 도구가 막으려던 착시가 도구
// 자신에게 생긴 것이다. 지금은 네 가지를 따로 본다:
//
//   ① 변이를 심기 전 기준선이 초록인가 — 아니면 그 뒤의 어떤 판정도 의미가 없다
//   ② 실패한 테스트가 있는가, 그리고 그 **이름이 이 변이가 가리키는 INV 를 담는가**
//   ③ 테스트는 전부 통과했는데 종료 코드가 0이 아닌가 — 훅·뒷정리 실패이지 판정이 아니다
//   ④ 복구 뒤 강제 장치의 지문이 변이 전과 같은가 — 아니면 다음 변이의 판정이 오염된다

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, sep } from "node:path";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
// 경로를 슬래시로 눕힌다 — 역슬래시가 든 인자는 npx 껍데기를 지나며 뭉개져서
// 결과 파일이 조용히 안 만들어진다(그러면 판정이 통째로 "판정 불가"가 된다).
const WORK = mkdtempSync(join(tmpdir(), "study-mate-mutation-")).split(sep).join("/");

const node = (args, opts = {}) =>
  spawnSync(process.execPath, [join(HERE, "mutate.mjs"), ...args], { cwd: ROOT, ...opts });

function mutations() {
  const r = node(["--list-json"], { encoding: "utf-8" });
  if (r.status !== 0) {
    console.error(`변이 목록을 못 읽었다:\n${r.stderr ?? ""}`);
    process.exit(1);
  }
  return JSON.parse(r.stdout);
}

function fingerprint() {
  const r = node(["--fingerprint"], { encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(`지문을 못 읽었다 — 로컬 데이터베이스가 떠 있는지 확인한다.\n${r.stderr ?? ""}`);
    process.exit(1);
  }
  return r.stdout;
}

/**
 * 통합 테스트를 한 번 돌리고 **기계가 읽는 결과**를 준다.
 *
 * 화면 출력에서 정규식으로 숫자를 긁지 않는다 — 뒷정리 실패 메시지와 테스트 실패 메시지가
 * 같은 stdout 에 섞여 나오고, 그 섞임이 원래 판정을 오염시킨 원인이었다.
 */
function runSuite(tag) {
  const out = join(WORK, `${tag}.json`);
  // vitest 를 `npx.cmd` 로 부르지 않는다 — 이 Node 는 `.cmd` 를 spawn 하면 EINVAL 로
  // 거절하고, 그때 status 는 null 이 된다. 예전 판정(`status !== 0`)에서 null 은 참이라
  // **테스트가 한 번도 안 돈 채로 변이 전부가 「빨간불 ✔」로 보고됐다.**
  // 진입점을 직접 부르면 껍데기도 없고 status 도 진짜 결과다.
  const run = spawnSync(
    process.execPath,
    [
      join(ROOT, "node_modules", "vitest", "vitest.mjs"),
      "run",
      "--config",
      "vitest.integration.config.mts",
      "--reporter=json",
      `--outputFile=${out}`,
    ],
    { cwd: ROOT, encoding: "utf-8", env: process.env, maxBuffer: 64 * 1024 * 1024 },
  );

  // 실행 자체가 실패한 것을 판정으로 읽지 않는다. 이것이 이 도구가 조용히 거짓말한 자리다.
  if (run.error || run.status === null) {
    return {
      ok: false,
      reason: `테스트를 실행하지 못했다 (${run.error?.code ?? "status=null"}) — 판정이 아니다`,
      status: run.status,
      failed: [],
      hookErrors: [],
      total: 0,
    };
  }

  if (!existsSync(out)) {
    return { ok: false, reason: "결과 파일이 안 나왔다", status: run.status, failed: [], hookErrors: [], total: 0 };
  }
  let report;
  try {
    report = JSON.parse(readFileSync(out, "utf-8"));
  } catch (e) {
    return { ok: false, reason: `결과 파일을 못 읽었다 (${e.message})`, status: run.status, failed: [], hookErrors: [], total: 0 };
  }

  const failed = [];
  // 훅·뒷정리 실패는 테스트 실패가 아니다. 파일 수준으로만 나타나므로 따로 담는다 —
  // 이 둘을 한 덩어리로 세는 것이 예전 판정이 틀린 이유였다.
  const hookErrors = [];
  for (const file of report.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      if (a.status === "failed") failed.push(a.fullName);
    }
    if (file.status === "failed" && !(file.assertionResults ?? []).some((a) => a.status === "failed")) {
      hookErrors.push((file.message ?? "이유 없음").split("\n")[0]);
    }
  }
  return { ok: true, status: run.status, failed, hookErrors, total: report.numTotalTests ?? 0 };
}

// 인자부터 본다. 오타 하나를 알아내는 데 통합 스위트 한 바퀴를 쓰지 않는다 —
// 목록 읽기는 즉시 끝나는 일이다.
const ALL = mutations();
const only = process.argv.slice(2);
const targets = only.length > 0 ? ALL.filter((m) => only.includes(m.name)) : ALL;

const unknown = only.filter((n) => !ALL.some((m) => m.name === n));
if (unknown.length > 0) {
  console.error(`모르는 변이: ${unknown.join(", ")}`);
  process.exit(1);
}

// ── ① 기준선 ────────────────────────────────────────────────────────────
console.log("기준선 확인 중 — 변이 없이 통합 테스트를 한 번 돌린다.");
// 앞선 실행이 복구 실패로 멈췄으면 데이터베이스에 변이가 심긴 채 남는다. 그 상태에서 지문을
// 뜨면 **망가진 것이 기준선이 되고 이후 모든 복구가 「일치」로 나온다** — 그리고 그때 안
// 잡히는 것이 정확히 이 도구가 찾으려는 것(빠져나간 변이)이다. 그래서 복구부터 돌리고 뜬다.
const preRestore = node(["--restore"], { encoding: "utf-8" });
if (preRestore.status !== 0) {
  console.error(`기준선을 만들기 전 복구가 실패했다:\n${preRestore.stderr ?? ""}`);
  process.exit(1);
}
const baseFp = fingerprint();
const base = runSuite("baseline");

if (!base.ok) {
  console.error(`기준선을 판정할 수 없다: ${base.reason}`);
  process.exit(1);
}
if (base.failed.length > 0) {
  console.error(
    `기준선이 이미 빨간불이다 (${base.failed.length}건). 변이 판정은 여기서 의미가 없다 —\n` +
      `무엇이 빨간불인지 모르는 채로 "변이가 잡혔다"를 읽게 된다.\n` +
      base.failed.map((n) => `  · ${n}`).join("\n"),
  );
  process.exit(1);
}
if (base.status !== 0) {
  console.error(
    `기준선의 테스트는 ${base.total}건 전부 통과했는데 종료 코드가 ${base.status} 다 — 훅이나 뒷정리가 던졌다.\n` +
      base.hookErrors.map((m) => `  · ${m}`).join("\n") +
      "\n이 상태로는 변이의 빨간불과 뒷정리의 빨간불을 가를 수 없다. 먼저 그것부터 고친다.",
  );
  process.exit(1);
}
if (base.total === 0) {
  console.error(
    "기준선에서 테스트가 0건 돌았다. 「전부 통과」와 「아무것도 안 돌았다」는 겉이 같다 —" +
      "\n  이 도구가 고치려던 착시와 같은 모양이라 여기서 멈춘다.",
  );
  process.exit(1);
}
console.log(`기준선 초록 (${base.total}건 통과)\n`);

// ── ②③④ 변이 한 바퀴 ───────────────────────────────────────────────────

const results = [];
let aborted = null;
let abortReason = "";

for (const m of targets) {
  console.log(`── ${m.name} (${m.inv}) 심는 중`);
  const seed = node([m.name], { stdio: "inherit" });
  if (seed.status !== 0) {
    // 「심지 못했다」와 「일부 심겼다」는 겉이 같다. 여기서도 복구·지문을 거치지 않으면
    // 다음 변이가 오염된 데이터베이스에서 판정된다. 복구 명령이 죽은 것과 안 되돌아온 것도 가른다.
    const undoneSeed = node(["--restore", m.name], { stdio: "inherit" });
    if (undoneSeed.status !== 0 || fingerprint() !== baseFp) {
      abortReason =
        undoneSeed.status !== 0 ? "심다 실패했고 복구 명령도 죽었다" : "심다 실패했고 되돌아오지도 않았다";
      results.push({ ...m, verdict: "판정 불가", detail: abortReason });
      aborted = m.name;
      break;
    }
    results.push({ ...m, verdict: "판정 불가", detail: "변이를 심지 못했다" });
    continue;
  }

  // **변이가 실제로 무언가를 무력화했는가.** 오류 없이 돌았지만 아무것도 안 바꾼 변이는
  // (정책 이름 오타로 drop 이 헛돌거나, 같은 본문으로 다시 만드는 경우) 「초록불 — 아무도
  // 안 붙들고 있다」로 보고된다. 그 둘은 겉이 같은데 고칠 곳이 정반대다. 실제로 한 번 겪었다
  // — z8-chatpart-columns 는 테스트가 없어서가 아니라 무력화를 못 해서 빠져나갔다.
  // 예전에는 파일 변이를 여기서 제외했다 — 지문이 데이터베이스만 봤기 때문이다. 지금은
  // 지문에 소스 파일 해시가 붙어 있어(mutate.mjs --fingerprint) 파일 변이도 그대로 잡힌다.
  // 제외한 채로 두면 사실상 아무것도 안 바꾸는 파일 변이가 「초록불 — 아무도 안 붙들고 있다」로
  // 보고된다.
  const changedNothing = fingerprint() === baseFp;

  // 무력화가 안 된 변이에 스위트를 다 돌리는 것은 순수한 낭비다 — 결과를 안 본다.
  const r = changedNothing
    ? { ok: true, status: 0, failed: [], hookErrors: [], total: 0 }
    : runSuite(m.name);

  // 복구가 먼저다. 판정을 계산하다 죽어도 데이터베이스는 원래대로여야 한다.
  const undone = node(["--restore", m.name], { stdio: "inherit" });
  const afterFp = fingerprint();
  // 복구 명령 자체가 죽은 것과 되돌아오지 않은 것을 가른다 — 원인과 증상이 어긋나면
  // 화면에 「지문이 다르다」만 남고 무엇을 고쳐야 하는지가 안 보인다.
  const restored = undone.status === 0 && afterFp === baseFp;
  const restoreDied = undone.status !== 0;

  if (changedNothing) {
    results.push({
      ...m,
      verdict: "판정 불가",
      detail: "변이가 강제 장치를 하나도 안 바꿨다 — 붙들 대상이 없으니 초록불이 당연하다",
    });
  } else if (!r.ok) {
    results.push({ ...m, verdict: "판정 불가", detail: r.reason });
  } else if (r.failed.length === 0 && r.status !== 0) {
    // ③ 여기가 예전에 「빨간불 ✔」로 잘못 읽히던 자리다.
    results.push({
      ...m,
      verdict: "판정 불가",
      detail:
        `테스트는 전부 통과했는데 종료 코드가 ${r.status} — 훅·뒷정리 실패이지 변이를 잡은 게 아니다` +
        (r.hookErrors.length > 0 ? ` (${r.hookErrors[0]})` : ""),
    });
  } else if (r.failed.length === 0) {
    results.push({ ...m, verdict: "초록불", detail: "아무도 안 붙들고 있다" });
  } else {
    // 이름표는 INV ID 이거나 자유로운 tag 다. 정규식 메타문자를 그대로 넣으면 터지고,
    // 숫자로 끝나는 ID(INV-Z1)는 뒷자리 경계가 없으면 INV-Z10 을 잘못 문다.
    const invPattern = [...m.inv].map((c) => ("\\^$.*+?()[]{}|/".includes(c) ? "\\" + c : c)).join("");
    const pattern = /[0-9]$/.test(m.inv) ? invPattern + "(?![0-9])" : invPattern;
    const re = new RegExp(pattern); // 실패 건수만큼 다시 만들지 않는다
    const named = r.failed.filter((n) => re.test(n));
    if (named.length > 0) {
      results.push({ ...m, verdict: "빨간불", detail: `${m.inv} 를 담은 테스트 ${named.length}건이 잡았다` });
    } else {
      // ② 빨간불이지만 이 변이와 무관한 자리일 수 있다. 「잡혔다」로 세지 않는다.
      results.push({
        ...m,
        verdict: "엉뚱한 빨간불",
        detail: `실패 ${r.failed.length}건인데 ${m.inv} 를 담은 것이 없다 — 첫 건: ${r.failed[0]}`,
      });
    }
  }

  if (!restored) {
    // ④ 여기서 멈추지 않으면 뒤따르는 변이는 전부 망가진 데이터베이스 위에서 판정된다.
    abortReason = restoreDied ? "복구 명령이 죽었다" : "복구했는데 지문이 변이 전과 다르다";
    aborted = m.name;
    break;
  }
}

// ── 보고 ────────────────────────────────────────────────────────────────
const MARK = { 빨간불: "✔", 초록불: "✘", "엉뚱한 빨간불": "✘", "판정 불가": "?" };

console.log("\n════ 변이 검증 결과 ════");
for (const r of results) {
  console.log(`${r.name.padEnd(26)} ${MARK[r.verdict]} ${r.verdict.padEnd(7)} ${r.detail}`);
}

const caught = results.filter((r) => r.verdict === "빨간불").length;
const escaped = results.filter((r) => r.verdict === "초록불").length;
const misread = results.filter((r) => r.verdict === "엉뚱한 빨간불").length;
const unjudged = results.filter((r) => r.verdict === "판정 불가").length;

console.log(
  `\n변이 ${results.length}건 — 잡힌 것 ${caught} · 빠져나간 것 ${escaped} · ` +
    `엉뚱한 빨간불 ${misread} · 판정 불가 ${unjudged}`,
);
if (targets.length > results.length) {
  console.log(`돌리지 않은 변이 ${targets.length - results.length}건 (복구 실패로 멈췄다)`);
}
if (aborted) {
  console.error(
    `${abortReason}: ${aborted}\n` +
      "  이 뒤의 변이는 오염된 데이터베이스에서 판정되므로 멈췄다. 변이의 undo 를 mutate.mjs 에 적거나 고친다.",
  );
}

// 변이가 0건이면 성공이 아니다. 「전부 잡혔다(0/0)」와 「아무것도 안 돌았다」는 겉이 같다.
if (results.length === 0) {
  console.error("판정한 변이가 0건이다 — 목록이 비었거나 필터가 전부 걸러 냈다.");
  process.exit(1);
}
process.exit(caught === results.length && !aborted ? 0 : 1);
