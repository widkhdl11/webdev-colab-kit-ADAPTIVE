// 변이 전체를 한 바퀴 돌린다. 변이마다: 심는다 → 통합 테스트를 돌린다 →
// **빨간불이 났는지** 확인한다 → 복구한다.
//
// 초록불이 나오면 그 변이는 아무 테스트도 붙들고 있지 않다는 뜻이라 실패로 보고한다.
// "위반 0건"이라는 보고와 검사가 아예 안 돈 것은 겉이 같기 때문에, 이 도구가 필요하다.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const NAMES = spawnSync(process.execPath, [join(HERE, "mutate.mjs"), "--list"], {
  encoding: "utf-8",
  cwd: ROOT,
})
  .stdout.trim()
  .split("\n")
  .map((l) => l.trim().split(/\s+/)[0])
  .filter(Boolean);

const only = process.argv.slice(2);
const targets = only.length > 0 ? only : NAMES;

const results = [];

for (const name of targets) {
  spawnSync(process.execPath, [join(HERE, "mutate.mjs"), name], { cwd: ROOT, stdio: "inherit" });

  const run = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["vitest", "run", "--config", "vitest.integration.config.mts", "--reporter=dot"],
    { cwd: ROOT, encoding: "utf-8", env: process.env },
  );
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const failed = run.status !== 0;
  const m = /Tests\s+(?:(\d+) failed[^\n]*)?/.exec(output);
  results.push({ name, failed, detail: m?.[1] ? `${m[1]}개 실패` : failed ? "실패" : "전부 통과" });

  spawnSync(process.execPath, [join(HERE, "mutate.mjs"), "--restore"], { cwd: ROOT, stdio: "inherit" });
}

console.log("\n════ 변이 검증 결과 ════");
let escaped = 0;
for (const r of results) {
  const verdict = r.failed ? "빨간불 ✔" : "초록불 ✘ (아무도 안 붙들고 있다)";
  if (!r.failed) escaped += 1;
  console.log(`${r.name.padEnd(26)} ${verdict}  ${r.detail}`);
}
console.log(`\n변이 ${results.length}건 중 잡힌 것 ${results.length - escaped}건, 빠져나간 것 ${escaped}건`);
process.exit(escaped > 0 ? 1 : 0);
