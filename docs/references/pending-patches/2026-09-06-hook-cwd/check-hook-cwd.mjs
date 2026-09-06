// 훅이 **어느 폴더에서 불려도** 실제로 도는지 본다.
//
// 왜 필요한가: settings.json 의 훅이 전부 `node <상대경로>` 로 적혀 있다. 세션의 작업 폴더가
// projects/<이름> 으로 옮겨가면 그 경로가 없어서 Node 가 MODULE_NOT_FOUND 로 죽는다.
// 훅 실패는 non-blocking 이라 도구는 그대로 실행되고, **막아야 할 것을 아무것도 안 막은 채
// 조용히 지나간다.** 편집마다 도는 게이트와 턴 끝의 Stop 훅도 같은 모양이다.
//
// 사용: node <이 파일>                    (레포 루트에서 — 지금 적용된 설정을 본다)
//       node <이 파일> <settings.json>   (적용 전에 후보 파일을 미리 검사한다)
//
// 검사는 세 겹이다.
//   ① 훅 파일이 그 폴더에서 보이는가  — 전부(7개)
//   ② 훅이 실제로 도는가              — 부작용 없는 PreToolUse 셋만 실행해서 종료코드 0
//   ③ 훅이 판정하는가                 — **일부러 심은 위반**에 종료코드 2
// ③이 없으면 "훅이 죽어서 아무것도 안 막는 상태"와 "훅이 돌면서 통과시킨 상태"가 겉이 같다.

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";

const ROOT = process.cwd();
if (!existsSync(join(ROOT, ".claude", "settings.json"))) {
  console.error("레포 루트에서 실행해야 한다 (.claude/settings.json 이 안 보인다)");
  process.exit(1);
}

// 훅이 실제로 불리는 자리를 흉내 낸다: 세션 작업 폴더가 프로젝트 안으로 옮겨간 상태.
const CWD = join(ROOT, "projects", "study-mate");
if (!existsSync(CWD)) {
  console.error(`흉내 낼 폴더가 없다: ${CWD}`);
  process.exit(1);
}

// settings.json 에 적힌 명령을 그대로 읽어 쓴다 — 여기 명령을 다시 적으면
// 설정이 바뀌어도 이 검사는 옛 명령을 계속 통과시킨다.
const SETTINGS = process.argv[2] ?? join(ROOT, ".claude", "settings.json");
console.log(`검사할 설정: ${SETTINGS}`);
const settings = JSON.parse(readFileSync(SETTINGS, "utf-8"));
const all = []; // { event, command }
for (const [event, groups] of Object.entries(settings.hooks ?? {}))
  for (const g of groups)
    for (const h of g.hooks ?? []) if (h.type === "command") all.push({ event, command: h.command });

/** `node "…/x.mjs" --flag` 에서 스크립트 경로만 꺼낸다. 따옴표와 환경변수를 푼다. */
function scriptPathOf(command, cwd) {
  const m = command.match(/node\s+("([^"]+)"|'([^']+)'|(\S+))/);
  if (!m) return null;
  let p = m[2] ?? m[3] ?? m[4];
  p = p.replace(/\$\{?CLAUDE_PROJECT_DIR\}?/g, ROOT).replace(/%CLAUDE_PROJECT_DIR%/g, ROOT);
  return isAbsolute(p) ? p : join(cwd, p);
}

/** 훅 하나를 CWD 에서 실행하고 종료코드를 준다. */
function run(command, payload) {
  const r = spawnSync(command, {
    cwd: CWD,
    input: JSON.stringify(payload),
    shell: true,
    encoding: "utf-8",
    // 훅 실행 환경을 흉내 낸다. **이 값을 하네스가 실제로 주는지는 이 검사가 증명하지
    // 못한다** — 그것만은 적용 뒤에 사람이 한 번 확인해야 한다(패치 문서에 방법이 있다).
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  });
  return { code: r.status, err: (r.stderr ?? "").trim() };
}

const BENIGN = { tool_name: "Bash", tool_input: { command: "echo 안녕" } };

// 일부러 심는 위반. 훅마다 하나씩 — 그 훅이 **판정까지 하는지** 보는 것이 목적이다.
const VIOLATIONS = [
  { what: "보호 파일 편집", payload: { tool_name: "Write", tool_input: { file_path: join(ROOT, "gates", "run-gates.mjs") } } },
  { what: "rm -rf", payload: { tool_name: "Bash", tool_input: { command: "rm -rf /tmp/아무거나" } } },
  { what: "환경변수 덤프", payload: { tool_name: "Bash", tool_input: { command: "printenv" } } },
];

// 실행해도 부작용이 없는 것만 돌린다. 게이트와 Stop 훅은 파일을 쓰므로 존재만 본다.
const SAFE_TO_RUN = /protect-secrets|protect-files|block-danger/;

let failed = 0;
const line = (ok, text) => {
  console.log(`${ok ? "  ✔" : "  ✘"} ${text}`);
  if (!ok) failed += 1;
};

console.log(`훅 ${all.length}개를 ${CWD} 에서 부른다\n`);

console.log("① 훅 파일이 그 폴더에서 보이는가 (전부)");
for (const { event, command } of all) {
  const p = scriptPathOf(command, CWD);
  line(p !== null && existsSync(p), `${event.padEnd(12)} ${command}`);
}

const runnable = all.filter((h) => SAFE_TO_RUN.test(h.command)).map((h) => h.command);

console.log("\n② 훅이 실제로 도는가 (부작용 없는 것만 · 무해한 입력 → 종료코드 0)");
for (const c of runnable) {
  const { code, err } = run(c, BENIGN);
  line(code === 0, `${c}  →  종료코드 ${code}${code === 0 ? "" : "  " + err.split("\n")[0]}`);
}

console.log("\n③ 훅이 판정하는가 (일부러 심은 위반 → 어느 훅이든 종료코드 2)");
for (const v of VIOLATIONS) {
  const codes = runnable.map((c) => run(c, v.payload).code);
  line(codes.includes(2), `${v.what}  →  종료코드 [${codes.join(", ")}]  (2 가 하나는 있어야 한다)`);
}

console.log(
  failed === 0
    ? "\n통과 — 프로젝트 폴더에서도 훅이 보이고, 돌고, 위반을 실제로 막는다."
    : `\n실패 ${failed}건 — 그 폴더에서 훅이 안 돈다(또는 판정을 못 한다).`,
);
process.exit(failed === 0 ? 0 : 1);
