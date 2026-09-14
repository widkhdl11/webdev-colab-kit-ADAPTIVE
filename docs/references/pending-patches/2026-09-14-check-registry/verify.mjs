#!/usr/bin/env node
// 이 패치가 붙었는지, 붙어서 실제로 막는지 판정한다.
//
// 적용 전에는 2·3 이 실패하고, 적용 후에는 넷 다 통과해야 한다.
// 코드를 안 읽어도 이 출력만으로 판정할 수 있게 만든 것이 목적이다.
//
// 돌리는 법:  node docs/references/pending-patches/2026-09-14-check-registry/verify.mjs
// 걸리는 시간: 게이트 전체 실행을 두 번 하므로 1분 안팎.
//
// --simulate 를 붙이면 gates/run-gates.mjs 대신 이 폴더의 run-gates.patched.mjs 를 돌린다.
// **붙이기 전에 붙은 뒤의 판정을 미리 볼 수 있다** — run-gates 는 ROOT 를 process.cwd() 로
// 잡으므로, 레포 뿌리에서 부르면 패치본이 제자리에 있는 것과 똑같이 돈다.

import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, cpSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..", "..");
const PROBE = join(ROOT, "scripts", "check-__probe__.mjs");
const SIMULATE = process.argv.includes("--simulate");
const GATES = SIMULATE ? join(HERE, "run-gates.patched.mjs") : join(ROOT, "gates", "run-gates.mjs");
console.log(SIMULATE ? "※ --simulate: 패치본을 돌린다 (붙은 뒤의 판정 미리보기)\n" : "※ 지금 붙어 있는 gates/run-gates.mjs 를 돌린다\n");

let bad = 0;
const ok = (pass, label, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) bad += 1;
};

// --simulate 는 패치본을 제 폴더에서 돌린다. run-gates 는 ./lib/read-spec.mjs 를 자기 파일
// 옆에서 찾으므로, 그 폴더에 gates/lib 사본을 잠깐 둬야 돈다. 끝나면 지운다.
const SIM_LIB = join(HERE, "lib");
if (SIMULATE) {
  mkdirSync(SIM_LIB, { recursive: true });
  cpSync(join(ROOT, "gates", "lib"), SIM_LIB, { recursive: true });
}

function runGates() {
  const r = spawnSync(process.execPath, [GATES], {
    cwd: ROOT,
    encoding: "utf-8",
    timeout: 300_000,
  });
  const out = (r.stdout ?? "") + "\n" + (r.stderr ?? "");
  // 게이트가 끝까지 못 갔으면 "위반이 없다"와 겉이 같아진다 — 그 둘을 갈라 놓는다.
  const reached = /게이트 (실패|통과)/.test(out);
  const crash = reached ? "" : (out.split("\n").find((l) => /Error|ERR_/.test(l)) || "끝까지 못 갔다").trim();
  return { out, reached, crash };
}

try {
  // ① 검사기 자신의 프로브 — 심은 위반이 전부 잡히는가.
  //    이게 안 돌면 아래 판정이 "위반 0건"인지 "검사가 안 돈 것"인지 구별되지 않는다.
  const p = spawnSync(process.execPath, [join(ROOT, "scripts", "check-registry.mjs"), "--probe"], {
    cwd: ROOT,
    encoding: "utf-8",
  });
  ok(p.status === 0, "검사기 프로브 — 심은 위반 여덟이 전부 잡히고 멀쩡한 둘은 안 잡힌다", p.status === 0 ? "" : "node scripts/check-registry.mjs --probe 로 직접 본다");

  // ② 배선 — run-gates 가 등록부를 부르는가. (소스 대조. 약한 항목이라 ③ 이 본체다)
  const src = existsSync(GATES) ? readFileSync(GATES, "utf-8") : "";
  ok(
    src.includes("check-registry.mjs") && src.includes('"--changed"'),
    `배선 — ${SIMULATE ? "패치본" : "gates/run-gates.mjs"} 이 check-registry.mjs 를 --changed 로 부른다`,
    src.includes("check-registry.mjs") ? "" : "패치가 아직 안 붙었다",
  );

  // ③ 심은 위반 — 역할을 안 적은 검사를 scripts/ 에 하나 두고 게이트를 돌린다.
  //    게이트가 그걸 실패로 올려야 한다. 이게 이 패치의 본체다.
  writeFileSync(PROBE, "#!/usr/bin/env node\n// 역할 선언이 없는 검사 (verify 가 심었다)\n");
  const withProbe = runGates();
  ok(
    withProbe.reached && withProbe.out.includes("[registry/NO-ROLE]") && withProbe.out.includes("check-__probe__.mjs"),
    "심은 위반 — 역할 없는 검사를 게이트가 실패로 올린다",
    !withProbe.reached ? `게이트가 끝까지 못 갔다: ${withProbe.crash}` : withProbe.out.includes("[registry/") ? "" : "게이트는 끝까지 갔는데 registry 줄이 없다 — 패치가 안 붙었다",
  );

  // ④ 과차단 없음 — 심은 것을 치우면 그 줄이 사라진다.
  rmSync(PROBE, { force: true });
  const clean = runGates();
  let leftover = clean.out.split("\n").filter((l) => l.trim().startsWith("[registry/"));
  // --simulate 에서는 하나가 남는 것이 정상이다. 등록부는 **진짜** gates/run-gates.mjs 를 읽어
  // 호출처를 세는데, 패치를 아직 안 붙였으니 check-registry 자신이 UNWIRED 로 잡힌다.
  // 실제로 붙이면 그 줄이 사라진다 — 이 항목의 최종 판정은 붙인 뒤 --simulate 없이 다시 돌려서 본다.
  const selfUnwired = (l) => l.includes("[registry/UNWIRED]") && l.includes("check-registry.mjs");
  const expectedInSim = SIMULATE && leftover.length === 1 && selfUnwired(leftover[0]);
  if (expectedInSim) leftover = [];
  ok(
    clean.reached && leftover.length === 0,
    "과차단 없음 — 심은 것을 치우면 registry 실패가 사라진다",
    !clean.reached
      ? `게이트가 끝까지 못 갔다: ${clean.crash}`
      : expectedInSim
        ? "패치를 아직 안 붙였으니 check-registry 자신만 UNWIRED 로 남는다 (붙이면 사라진다)"
        : leftover.slice(0, 2).join(" / "),
  );
} finally {
  rmSync(PROBE, { force: true });
  if (SIMULATE) rmSync(SIM_LIB, { recursive: true, force: true });
}

console.log(bad === 0 ? "\n네 항목 통과." : `\n${bad}건 실패.`);
process.exit(bad === 0 ? 0 : 1);
